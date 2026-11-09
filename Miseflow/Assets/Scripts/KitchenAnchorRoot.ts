/**
 * KitchenAnchorRoot.ts
 * MiseFlow AR v7, Stage 1 (Plan S1): the scene-root object that owns the kitchen frame.
 *
 * Kitchen frame: units cm, the counter plane is local y = 0, +X runs along the counter edge (skillet / left burner
 * side toward the board / plate side), +Z points toward the cook. The root is always gravity aligned (yaw only) and
 * never scaled (DishStudio scale-hides StationsRoot only; many motion kits read world scale).
 *
 * Order of operations (docs/v7/notes/stage1-audit.md section 2):
 *   1. MiseFlowSpatialUI.ensureHeroComponents calls KitchenAnchorRoot.ensure() first: creates the scene-root object
 *      "KitchenAnchorRoot" at P0 (0,-17.73,-76) and this component. No re-parenting during awake.
 *   2. StationPropsBuilder (OnStart) calls KitchenAnchorRoot.placeStationsRoot(StationsRoot): writes local
 *      (0,0.23,0) when already adopted, else the legacy (0,-17.5,-76). Correct in either order.
 *   3. This component's FIRST UpdateEvent adopts StationsRoot (setParent + local (0,0.23,0), identity, local scale
 *      kept), logs the measured world position and emits KITCHEN_ROOT_READY. At P0 the world pose is unchanged.
 *   4. CookStage.enter calls adoptCookStage(CookStageRoot): the Cook bench sits beside StationsRoot (not inside it)
 *      with StationsRoot's local pose, so it follows setPose.
 *
 * Built in code, no @input: runtime-created components keep the first-compiled @input defaults, so tunables are
 * plain fields. Components that read the kitchen frame in onAwake / OnStart must use DEFAULT_POS math or wait for
 * KITCHEN_ROOT_READY (adoption is one frame late).
 */
import {
  MiseFlowEventBus,
  MiseFlowEventType,
  SlabMode as BusSlabMode,
  KitchenPoseSource as BusKitchenPoseSource,
} from "./MiseFlowEventBus";

export type SlabMode = BusSlabMode;
export type KitchenPoseSource = BusKitchenPoseSource;

const RAD2DEG = 180 / Math.PI;

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

function findInScene(name: string): SceneObject | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const f = findByName(global.scene.getRootObject(i), name);
    if (f) return f;
  }
  return null;
}

function findRootObject(name: string): SceneObject | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const o = global.scene.getRootObject(i);
    if (o.name === name) return o;
  }
  return null;
}

function alive(o: any): boolean {
  return !!o && !isNull(o);
}

function fmt(v: vec3): string {
  return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}

function isEditorRuntime(): boolean {
  try {
    const sys: any = (global as any).deviceInfoSystem;
    if (sys && typeof sys.isEditor === "function") return !!sys.isEditor();
  } catch (e) {
    // fall through
  }
  return true; // unknown: treat as editor (keeps the slab visible)
}

/** Yaw (radians, about +Y) of a rotation, from its forward axis projected on the ground plane. */
function yawOf(rot: quat): number {
  const f = rot.multiplyVec3(vec3.forward());
  if (f.x * f.x + f.z * f.z > 1e-6) return Math.atan2(f.x, f.z);
  const r = rot.multiplyVec3(vec3.right()); // forward is vertical: fall back to the right axis
  return Math.atan2(-r.z, r.x);
}

/** Angle (degrees) between a rotation's up axis and world up. */
function tiltDegOf(rot: quat): number {
  const u = rot.multiplyVec3(vec3.up());
  return Math.acos(Math.max(-1, Math.min(1, u.y))) * RAD2DEG;
}

interface SlabEntry {
  rmv: RenderMeshVisual;
  orig: Material;
  faint: Material | null;
  swapped: boolean; // mainMaterial currently replaced by `faint`
  hiddenByUs: boolean; // rmv.enabled was turned off by HIDDEN
}

@component
export class KitchenAnchorRoot extends BaseScriptComponent {
  static readonly ROOT_NAME = "KitchenAnchorRoot";
  static readonly STATIONS_NAME = "StationsRoot";
  /** P0: reproduces today's StationsRoot world pose (0,-17.5,-76) exactly. */
  static readonly DEFAULT_POS = new vec3(0, -17.73, -76);
  /** StationsRoot local position under the root: slab top (StationsRoot y -0.23) lands on kitchen y = 0. */
  static readonly STATIONS_LOCAL = new vec3(0, 0.23, 0);
  /** Legacy StationsRoot local position when it is still a scene root (pre-adoption, or no kitchen root). */
  static readonly LEGACY_STATIONS_POS = new vec3(0, -17.5, -76);
  /** Objects whose RenderMeshVisual follows the slab mode. */
  static readonly SLAB_NAMES = ["KitchenCountertopSurface", "Cook_Bench"];
  /** Legacy layout reference points in the kitchen frame (StationPropsBuilder SKILLET_POS / PLATE_POS, y = 0). */
  static readonly LEGACY_LEFT_BURNER_K = new vec3(-11.2, 0, -1.5);
  static readonly LEGACY_PLATE_K = new vec3(0, 0, 4.5);
  /** Stage 2: setContentHidden(true) parks the root this far from its pose (out of view, scale untouched). */
  static readonly PARK_OFFSET = new vec3(0, -10000, 0);

  private static instance: KitchenAnchorRoot | null = null;

  // Tunables (plain fields, see header)
  /** setPose / setPoseFromCounter refuse a rotation or normal tilted more than this from gravity. */
  public maxTiltDeg: number = 15;
  /** FAINT: base colour rgb multiplier (additive display: dimmer reads as more transparent). */
  public faintRgbScale: number = 0.4;
  /** FAINT: base colour alpha, only written when the pass blends. */
  public faintAlpha: number = 0.35;
  /** Frames to keep looking for StationsRoot before giving up on adoption. */
  public adoptRetryFrames: number = 120;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private updateEvent: SceneEvent | null = null;
  private adoptFrames: number = 0;
  private adopted: boolean = false;
  private stationsRoot: SceneObject | null = null;
  private cookRoot: SceneObject | null = null;
  private autoCookRunning: boolean = false;
  private poseSource: KitchenPoseSource = "DEFAULT";
  private slabMode: SlabMode = isEditorRuntime() ? "SOLID" : "HIDDEN";
  private slabEntries: SlabEntry[] = [];
  private contentHidden: boolean = false;
  private parkedPose: { position: vec3; rotation: quat } | null = null;

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): KitchenAnchorRoot | null {
    const k = KitchenAnchorRoot.instance;
    return k && alive(k) && alive(k.getSceneObject()) ? k : null;
  }

  /** Creates (idempotent) the scene-root "KitchenAnchorRoot" at P0 plus this component. Never re-parents. */
  public static ensure(): KitchenAnchorRoot {
    const existing = KitchenAnchorRoot.getInstance();
    if (existing) return existing;
    let obj = findRootObject(KitchenAnchorRoot.ROOT_NAME);
    if (!obj) {
      obj = global.scene.createSceneObject(KitchenAnchorRoot.ROOT_NAME);
      const t = obj.getTransform();
      t.setWorldPosition(KitchenAnchorRoot.DEFAULT_POS);
      t.setWorldRotation(quat.quatIdentity());
      t.setLocalScale(vec3.one());
    }
    let comp = obj.getComponent(KitchenAnchorRoot.getTypeName()) as KitchenAnchorRoot;
    if (!comp) comp = obj.createComponent(KitchenAnchorRoot.getTypeName()) as KitchenAnchorRoot;
    KitchenAnchorRoot.instance = comp;
    return comp;
  }

  /**
   * StationPropsBuilder's OnStart placement of StationsRoot. Under KitchenAnchorRoot: local (0,0.23,0), identity.
   * Otherwise the legacy local (0,-17.5,-76) (scene root, or no kitchen root at all).
   */
  public static placeStationsRoot(stations: SceneObject): void {
    const t = stations.getTransform();
    const p = stations.getParent();
    if (p && p.name === KitchenAnchorRoot.ROOT_NAME) {
      t.setLocalPosition(KitchenAnchorRoot.STATIONS_LOCAL);
      t.setLocalRotation(quat.quatIdentity());
    } else {
      t.setLocalPosition(KitchenAnchorRoot.LEGACY_STATIONS_POS);
    }
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    if (!KitchenAnchorRoot.getInstance()) KitchenAnchorRoot.instance = this;
    // Bus listeners only (no SIK / hand subscriptions here).
    this.listen("AUTO_COOK_STATE", (d?: any) => {
      this.autoCookRunning = !!(d && d.running);
    });
    this.listen("COOK_LOAD_PROGRESS", () => this.applySlabMode()); // bench is rebuilt per plan
    this.listen("COOK_WORLD_READY", () => this.applySlabMode());

    // Adoption happens in the FIRST UpdateEvent: after every OnStart, outside the root-iteration phase.
    this.updateEvent = this.createEvent("UpdateEvent");
    this.updateEvent.bind(() => this.onFirstUpdates());

    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (KitchenAnchorRoot.instance === this) KitchenAnchorRoot.instance = null;
    });
  }

  private onFirstUpdates(): void {
    this.adoptFrames++;
    let done = false;
    try {
      done = this.ensureAdopted();
    } catch (e) {
      print(`[KitchenAnchorRoot] adoption error: ${e}`);
      done = true;
    }
    if (!done && this.adoptFrames >= this.adoptRetryFrames) {
      print(`[KitchenAnchorRoot] StationsRoot not found after ${this.adoptFrames} frames; adoption skipped`);
      done = true;
    }
    if (done && this.updateEvent) this.updateEvent.enabled = false;
  }

  // ───────────────────────── adoption ─────────────────────────

  public getRoot(): SceneObject {
    return this.getSceneObject();
  }

  public isAdopted(): boolean {
    return this.adopted && alive(this.stationsRoot);
  }

  /** Re-parents StationsRoot under this root (idempotent). Returns true once StationsRoot is under the root. */
  public ensureAdopted(): boolean {
    const root = this.getSceneObject();
    const stations = alive(this.stationsRoot) ? this.stationsRoot! : findInScene(KitchenAnchorRoot.STATIONS_NAME);
    if (!stations) return false;
    this.stationsRoot = stations;
    const parent = stations.getParent();
    if (parent && parent.name === KitchenAnchorRoot.ROOT_NAME) {
      this.adopted = true;
      return true;
    }
    const t = stations.getTransform();
    const keepScale = t.getLocalScale(); // DishStudio may have saved / changed it
    stations.setParent(root);
    t.setLocalPosition(KitchenAnchorRoot.STATIONS_LOCAL);
    t.setLocalRotation(quat.quatIdentity());
    t.setLocalScale(keepScale);
    this.adopted = true;

    const w = t.getWorldPosition();
    const expected = this.kitchenToWorld(KitchenAnchorRoot.STATIONS_LOCAL);
    const err = w.distance(expected);
    const rootW = root.getTransform().getWorldPosition();
    print(
      `[KitchenAnchorRoot] adopted StationsRoot: world ${fmt(w)} expected ${fmt(expected)} err ${err.toFixed(4)} cm; ` +
        `root ${fmt(rootW)} scale ${root.getTransform().getWorldScale().x.toFixed(3)} slab ${this.slabMode}`
    );
    if (err > 0.01) print(`[KitchenAnchorRoot] WARNING: StationsRoot world position off by ${err.toFixed(4)} cm`);

    this.applySlabMode();
    this.bus.emit("KITCHEN_ROOT_READY", {
      rootName: KitchenAnchorRoot.ROOT_NAME,
      adopted: [KitchenAnchorRoot.STATIONS_NAME],
    });
    return true;
  }

  /** CookStage.enter: parent the Cook bench root beside StationsRoot with StationsRoot's local pose. */
  public adoptCookStage(stageRoot: SceneObject): void {
    const t = stageRoot.getTransform();
    stageRoot.setParent(this.getSceneObject());
    const pose = this.stationsLocalPose();
    t.setLocalPosition(pose.pos);
    t.setLocalRotation(pose.rot);
    t.setLocalScale(vec3.one());
    this.cookRoot = stageRoot;
  }

  /** StationsRoot local pose under the root ((0,0.23,0), identity unless adopted with something else). */
  public stationsLocalPose(): { pos: vec3; rot: quat } {
    if (this.isAdopted()) {
      const t = this.stationsRoot!.getTransform();
      return { pos: t.getLocalPosition(), rot: t.getLocalRotation() };
    }
    return { pos: KitchenAnchorRoot.STATIONS_LOCAL, rot: quat.quatIdentity() };
  }

  // ───────────────────────── pose ─────────────────────────

  public getPose(): { position: vec3; rotation: quat } {
    const t = this.getSceneObject().getTransform();
    return { position: t.getWorldPosition(), rotation: t.getWorldRotation() };
  }

  public getPoseSource(): KitchenPoseSource {
    return this.poseSource;
  }

  /** True while the Cook bench (adopted CookStageRoot) exists or Auto Cook runs: world caches would go stale. */
  public isPoseLocked(): boolean {
    return alive(this.cookRoot) || this.autoCookRunning;
  }

  /**
   * Moves the kitchen. Pitch and roll are stripped (yaw only); scale stays 1. Refused (false + log) while the Cook
   * stage is active or Auto Cook runs, or when the rotation is tilted more than maxTiltDeg.
   */
  public setPose(position: vec3, rotation: quat, source: KitchenPoseSource = "LEAF"): boolean {
    if (this.isPoseLocked()) {
      print(`[KitchenAnchorRoot] setPose(${source}) refused: ${alive(this.cookRoot) ? "Cook stage active" : "Auto Cook running"}`);
      return false;
    }
    const tilt = tiltDegOf(rotation);
    if (tilt > this.maxTiltDeg) {
      print(`[KitchenAnchorRoot] setPose(${source}) refused: tilt ${tilt.toFixed(1)} deg > ${this.maxTiltDeg}`);
      return false;
    }
    const yawRot = quat.angleAxis(yawOf(rotation), vec3.up());
    const t = this.getSceneObject().getTransform();
    if (this.contentHidden) {
      // Stage 2: while parked, the new pose is the one restored by setContentHidden(false).
      this.parkedPose = { position: new vec3(position.x, position.y, position.z), rotation: yawRot };
      t.setWorldPosition(position.add(KitchenAnchorRoot.PARK_OFFSET));
    } else {
      t.setWorldPosition(position);
    }
    t.setWorldRotation(yawRot);
    t.setLocalScale(vec3.one());
    this.poseSource = source;
    const p = this.contentHidden && this.parkedPose ? this.parkedPose.position : t.getWorldPosition();
    this.bus.emit("KITCHEN_POSE_CHANGED", { position: p, rotation: t.getWorldRotation(), source });
    return true;
  }

  /**
   * Stage 2 (Plan S1 frame, D-012): pose from the claimed spots. Local +X runs from the left burner toward the
   * plate (ground-projected), the origin is the centroid of all claimed points on the surface, y = mean surface
   * height. Unlike setPoseFromCounter this does not map the legacy layout points; the legacy dish-01 miniature
   * keeps its relative layout around the kitchen origin (D-012 d).
   */
  public setPoseFromClaims(points: vec3[], leftBurnerW: vec3, plateW: vec3, normalW: vec3, source: KitchenPoseSource = "CLAIM"): boolean {
    if (!points || points.length === 0) return false;
    const n = normalW.normalize();
    const tilt = Math.acos(Math.max(-1, Math.min(1, n.y))) * RAD2DEG;
    if (tilt > this.maxTiltDeg) {
      print(`[KitchenAnchorRoot] setPoseFromClaims(${source}) refused: normal tilt ${tilt.toFixed(1)} deg`);
      return false;
    }
    const d = plateW.sub(leftBurnerW);
    if (d.x * d.x + d.z * d.z < 1) {
      print(`[KitchenAnchorRoot] setPoseFromClaims(${source}) refused: burner and plate closer than 1 cm`);
      return false;
    }
    // quat.angleAxis(yaw, up) maps +X to (cos yaw, 0, -sin yaw).
    const yaw = Math.atan2(-d.z, d.x);
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const k = 1 / points.length;
    return this.setPose(new vec3(cx * k, cy * k, cz * k), quat.angleAxis(yaw, vec3.up()), source);
  }

  /** True while setContentHidden(true) has parked the kitchen (claiming). */
  public isContentHidden(): boolean {
    return this.contentHidden;
  }

  /**
   * Stage 2: hides / shows everything under KitchenAnchorRoot WITHOUT touching StationsRoot's local scale (DishStudio
   * owns it) and without disabling any object (scripts, DAG timers and state keep running). Hiding parks the root
   * PARK_OFFSET (100 m) below its pose, out of every view; world scale stays 1. Showing restores the pose (or the
   * pose given to setPose while parked). Refused while the pose is locked (Cook stage / Auto Cook), like setPose.
   */
  public setContentHidden(hidden: boolean): boolean {
    if (hidden === this.contentHidden) return true;
    const t = this.getSceneObject().getTransform();
    if (hidden) {
      if (this.isPoseLocked()) {
        print(`[KitchenAnchorRoot] setContentHidden(true) refused: ${alive(this.cookRoot) ? "Cook stage active" : "Auto Cook running"}`);
        return false;
      }
      this.parkedPose = { position: t.getWorldPosition(), rotation: t.getWorldRotation() };
      t.setWorldPosition(this.parkedPose.position.add(KitchenAnchorRoot.PARK_OFFSET));
      this.contentHidden = true;
    } else {
      const p = this.parkedPose;
      this.contentHidden = false;
      this.parkedPose = null;
      if (p) {
        t.setWorldPosition(p.position);
        t.setWorldRotation(p.rotation);
      }
    }
    print(`[KitchenAnchorRoot] content ${hidden ? "hidden (parked)" : "shown"} at ${fmt(this.getPose().position)}`);
    this.bus.emit("KITCHEN_CONTENT_HIDDEN", { hidden });
    return true;
  }

  /**
   * Stage 2 helper: pose from two claimed counter points and the hit normal. Maps the legacy left burner and plate
   * (LEGACY_LEFT_BURNER_K / LEGACY_PLATE_K) onto the measured points (yaw from the burner->plate vector, origin from
   * the midpoints), so the legacy layout lands where it was claimed. The frame convention is an owner decision
   * (audit section 7); this keeps the legacy content un-yawed relative to the claim.
   */
  public setPoseFromCounter(leftBurnerW: vec3, plateW: vec3, normalW: vec3, source: KitchenPoseSource = "CLAIM"): boolean {
    const n = normalW.normalize();
    const tilt = Math.acos(Math.max(-1, Math.min(1, n.y))) * RAD2DEG;
    if (tilt > this.maxTiltDeg) {
      print(`[KitchenAnchorRoot] setPoseFromCounter(${source}) refused: normal tilt ${tilt.toFixed(1)} deg`);
      return false;
    }
    const dW = plateW.sub(leftBurnerW);
    if (dW.x * dW.x + dW.z * dW.z < 1) {
      print(`[KitchenAnchorRoot] setPoseFromCounter(${source}) refused: points closer than 1 cm`);
      return false;
    }
    const dK = KitchenAnchorRoot.LEGACY_PLATE_K.sub(KitchenAnchorRoot.LEGACY_LEFT_BURNER_K);
    const yaw = Math.atan2(dW.x, dW.z) - Math.atan2(dK.x, dK.z);
    const rot = quat.angleAxis(yaw, vec3.up());
    const midW = leftBurnerW.add(plateW).uniformScale(0.5);
    const midK = KitchenAnchorRoot.LEGACY_LEFT_BURNER_K.add(KitchenAnchorRoot.LEGACY_PLATE_K).uniformScale(0.5);
    const pos = midW.sub(rot.multiplyVec3(midK));
    return this.setPose(pos, rot, source);
  }

  /** Back to P0 ("DEFAULT"). Separate from Btn_Reset (Reset never moves the kitchen). */
  public resetPose(): boolean {
    return this.setPose(KitchenAnchorRoot.DEFAULT_POS, quat.quatIdentity(), "DEFAULT");
  }

  // ───────────────────────── conversions ─────────────────────────

  public worldToKitchen(p: vec3): vec3 {
    return this.getSceneObject().getTransform().getInvertedWorldTransform().multiplyPoint(p);
  }

  public kitchenToWorld(p: vec3): vec3 {
    return this.getSceneObject().getTransform().getWorldTransform().multiplyPoint(p);
  }

  public worldDirToKitchen(d: vec3): vec3 {
    return this.getSceneObject().getTransform().getWorldRotation().invert().multiplyVec3(d);
  }

  public kitchenDirToWorld(d: vec3): vec3 {
    return this.getSceneObject().getTransform().getWorldRotation().multiplyVec3(d);
  }

  /** World rotation for a yaw (radians, about kitchen +Y) defined in the kitchen frame. */
  public kitchenYawToWorld(yawRad: number): quat {
    return this.getSceneObject().getTransform().getWorldRotation().multiply(quat.angleAxis(yawRad, vec3.up()));
  }

  // ───────────────────────── slab ─────────────────────────

  public getSlabMode(): SlabMode {
    return this.slabMode;
  }

  /** SOLID (as authored), FAINT (cloned + dimmed), HIDDEN (RMV off, object kept). Default: editor SOLID, device HIDDEN. */
  public setSlabMode(m: SlabMode): void {
    const changed = m !== this.slabMode;
    this.slabMode = m;
    this.applySlabMode();
    if (changed) this.bus.emit("KITCHEN_SLAB_MODE_CHANGED", { mode: m });
  }

  /** Re-applies the slab mode to KitchenCountertopSurface and the current Cook_Bench (if any). */
  public applySlabMode(): void {
    this.slabEntries = this.slabEntries.filter((e) => alive(e.rmv));
    const root = this.getSceneObject();
    for (const name of KitchenAnchorRoot.SLAB_NAMES) {
      const obj = findByName(root, name) || findInScene(name);
      if (!obj) continue;
      const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (!rmv) continue;
      let entry: SlabEntry | null = null;
      for (const e of this.slabEntries) if (e.rmv.isSame(rmv)) entry = e;
      if (!entry) {
        if (this.slabMode === "SOLID") continue; // never touched: nothing to restore
        entry = { rmv, orig: rmv.mainMaterial, faint: null, swapped: false, hiddenByUs: false };
        this.slabEntries.push(entry);
      }
      try {
        this.applyTo(entry);
      } catch (e) {
        print(`[KitchenAnchorRoot] slab ${name} ${this.slabMode} error: ${e}`);
      }
    }
  }

  private applyTo(e: SlabEntry): void {
    const rmv = e.rmv;
    if (this.slabMode === "HIDDEN") {
      if (rmv.enabled) {
        rmv.enabled = false;
        e.hiddenByUs = true;
      }
      return;
    }
    if (e.hiddenByUs) {
      rmv.enabled = true;
      e.hiddenByUs = false;
    }
    if (this.slabMode === "FAINT") {
      if (!e.faint) e.faint = this.makeFaint(e.orig);
      if (!e.swapped) {
        rmv.mainMaterial = e.faint;
        e.swapped = true;
      }
    } else if (e.swapped) {
      rmv.mainMaterial = e.orig; // SOLID: restore the shared original
      e.swapped = false;
    }
  }

  /** Clone first (MAT_SLAB / hwMat("slab") may be shared), then dim. */
  private makeFaint(orig: Material): Material {
    const m = orig.clone();
    const pass: any = m.mainPass;
    const c = pass.baseColor as vec4;
    if (c) {
      const k = this.faintRgbScale;
      const blends = pass.blendMode !== undefined && pass.blendMode !== BlendMode.Disabled;
      pass.baseColor = new vec4(c.x * k, c.y * k, c.z * k, blends ? this.faintAlpha : c.w);
    }
    return m;
  }

  // ───────────────────────── helpers ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[KitchenAnchorRoot] ${ev} handler error: ${e}`);
      }
    };
    this.bus.on(ev, safe);
    this.handlers.push({ ev, cb: safe });
  }
}
