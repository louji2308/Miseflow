/**
 * KitchenPersistence.ts
 * MiseFlow AR v7, Stage 2 (Plan D2 / S3, decision D-012 b): kitchen memory.
 *
 * API: remember(role, worldTransform), recall(): Promise<StationPose[]>, forget().
 * One component, two implementations behind global.deviceInfoSystem.isEditor():
 *   - Editor: global.persistentStorageSystem.store (GeneralDataStore putString / getString / has / remove), shown with
 *     the label "Preview memory stand-in. On SPECS this uses Spatial Anchors." when a kitchen is remembered or recalled.
 *   - Device (feel unproven): AnchorModule.openSession({ area: "kitchen" }), AnchorSession.createWorldAnchor(mat4) +
 *     saveAnchor(anchor, { scope: Private }) per claim; on launch resolveAnchor(id) and an AnchorComponent (on a
 *     scene-root tracker object) drives the kitchen pose; the Station_* rings are shown only while the anchor tracks.
 *     The store keeps the anchor ids and the last-known matrices on device too.
 *
 * Boot (after KITCHEN_ROOT_READY, i.e. after StationsRoot adoption): if poses exist they are applied (kitchen root pose
 * + Station_* from their kitchen-local transforms), KITCHEN_RECALLED is emitted and no claim UI appears. If none and
 * not editor, ClaimController.begin(). With an EMPTY store (every LEAF regression run) nothing happens at all.
 *
 * Self-contained, no @input; created by MiseFlowSpatialUI.ensureHeroComponents.
 */
import {
  KitchenClaimedPayload,
  MiseFlowEventBus,
  StationPose,
  StationRole,
} from "./MiseFlowEventBus";
import { KitchenAnchorRoot } from "./KitchenAnchorRoot";
import { ClaimController } from "./ClaimController";
import { HeadPoseBillboard } from "./HeadPoseBillboard";
import { createWorldLabel } from "./DAGCounterConduit";

const TAG = "[KitchenPersistence]";
const STORE_KEY = "miseflow.kitchen.v1";
const AREA = "kitchen";
const LABEL_TEXT = "Preview memory stand-in. On SPECS this uses Spatial Anchors.";
const LABEL_SECONDS = 4.0;
const LABEL_SIZE = 26; // about 0.7 cm caption
const BOOT_FALLBACK_FRAMES = 150;
const RECLAIM_AFTER_S = 15; // device: anchors not tracking by then -> "Kitchen not recognised. Reclaim?"

type PoseRole = StationRole | "KITCHEN";

interface StoredEntry {
  role: PoseRole;
  m: number[]; // world transform, 16 numbers, column-major
  anchorId?: string;
}

interface StoredKitchen {
  v: number;
  savedAt: number;
  entries: StoredEntry[];
}

function isEditorRuntime(): boolean {
  try {
    const sys: any = (global as any).deviceInfoSystem;
    if (sys && typeof sys.isEditor === "function") return !!sys.isEditor();
  } catch (e) {
    // fall through
  }
  return true;
}

function matToArray(m: mat4): number[] {
  const c = [m.column0, m.column1, m.column2, m.column3];
  const out: number[] = [];
  for (const v of c) out.push(v.x, v.y, v.z, v.w);
  return out;
}

function arrayToMat(a: number[]): mat4 {
  const m = new mat4();
  m.column0 = new vec4(a[0], a[1], a[2], a[3]);
  m.column1 = new vec4(a[4], a[5], a[6], a[7]);
  m.column2 = new vec4(a[8], a[9], a[10], a[11]);
  m.column3 = new vec4(a[12], a[13], a[14], a[15]);
  return m;
}

function positionOf(m: mat4): vec3 {
  return new vec3(m.column3.x, m.column3.y, m.column3.z);
}

/** Rotation of a (rigid, unit-scale) transform; robust to either quat.lookAt forward convention. */
function rotationOf(m: mat4): quat {
  const f = new vec3(m.column2.x, m.column2.y, m.column2.z).normalize();
  const u = new vec3(m.column1.x, m.column1.y, m.column1.z).normalize();
  let q = quat.lookAt(f, u);
  if (q.multiplyVec3(vec3.forward()).dot(f) < 0.99) q = quat.lookAt(f.uniformScale(-1), u);
  return q;
}

/** Yaw (radians, about +Y) of a transform from its local +X axis: angleAxis(yaw, up) maps +X to (cos, 0, -sin). */
function yawOf(m: mat4): number {
  return Math.atan2(-m.column0.z, m.column0.x);
}

function fmt(v: vec3): string {
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

@component
export class KitchenPersistence extends BaseScriptComponent {
  static readonly OBJECT_NAME = "KitchenPersistence";
  private static instance: KitchenPersistence | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private editor: boolean = isEditorRuntime();
  private entries: StoredEntry[] = [];
  private booted: boolean = false;
  private bootFrames: number = 0;
  private bootEvent: SceneEvent | null = null;
  private handlers: { ev: any; cb: (d?: any) => void }[] = [];

  // label
  private labelRoot: SceneObject | null = null;
  private labelUntil: number = -1;

  // device (feel unproven)
  private sessionPromise: Promise<any> | null = null;
  private trackers: SceneObject[] = [];
  private trackingSince: number = -1;
  private recallStartedAt: number = -1;
  private reclaimIssued: boolean = false;

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): KitchenPersistence | null {
    const k = KitchenPersistence.instance;
    return k && !isNull(k) && !isNull(k.getSceneObject()) ? k : null;
  }

  public static ensure(): KitchenPersistence {
    const existing = KitchenPersistence.getInstance();
    if (existing) return existing;
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i);
      if (o.name !== KitchenPersistence.OBJECT_NAME) continue;
      const comp = o.getComponent(KitchenPersistence.getTypeName()) as KitchenPersistence;
      if (comp) {
        KitchenPersistence.instance = comp;
        return comp;
      }
    }
    const obj = global.scene.createSceneObject(KitchenPersistence.OBJECT_NAME);
    const comp = obj.createComponent(KitchenPersistence.getTypeName()) as KitchenPersistence;
    if (!KitchenPersistence.instance) KitchenPersistence.instance = comp;
    return KitchenPersistence.instance!;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    if (!KitchenPersistence.getInstance()) KitchenPersistence.instance = this;    this.entries = this.readStore();
    this.listen("KITCHEN_CLAIMED", (d?: any) => this.onKitchenClaimed(d as KitchenClaimedPayload));
    this.listen("KITCHEN_ROOT_READY", () => this.boot("KITCHEN_ROOT_READY"));

    this.createEvent("OnStartEvent").bind(() => {
      if (!this.editor) this.openSession(); // device only, feel unproven
      const k = KitchenAnchorRoot.getInstance();
      if (k && k.isAdopted()) this.boot("OnStart");
    });
    this.bootEvent = this.createEvent("UpdateEvent");
    this.bootEvent.bind(() => this.onUpdate());

    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (KitchenPersistence.instance === this) KitchenPersistence.instance = null;
    });
  }

  private onUpdate(): void {
    if (!this.booted) {
      this.bootFrames++;
      if (this.bootFrames >= BOOT_FALLBACK_FRAMES) this.boot("fallback");
    }
    if (this.labelRoot && !isNull(this.labelRoot) && this.labelRoot.enabled && getTime() > this.labelUntil) this.labelRoot.enabled = false;
    if (!this.editor) this.deviceWatchdog();
  }

  // ───────────────────────── public API ─────────────────────────

  /** Remembers one pose (world transform). role "KITCHEN" is the KitchenAnchorRoot pose. Writes the store. */
  public remember(role: StationRole | "KITCHEN", worldTransform: mat4): void {
    const arr = matToArray(worldTransform);
    const existing = this.entries.find((e) => e.role === role);
    if (existing) {
      existing.m = arr;
      existing.anchorId = undefined;
    } else {
      this.entries.push({ role, m: arr });
    }
    this.writeStore();
    if (!this.editor) this.saveAnchor(role, worldTransform); // feel unproven
  }

  /** The remembered poses (empty when nothing is stored). Editor: persistent storage. Device: same store + anchor ids. */
  public recall(): Promise<StationPose[]> {
    return Promise.resolve(this.toPoses(this.readStore()));
  }

  /** Clears the memory (store key; device: the "kitchen" anchor area). Does not move the kitchen. */
  public forget(): void {
    this.entries = [];
    try {
      const store = global.persistentStorageSystem.store;
      if (store.has(STORE_KEY)) store.remove(STORE_KEY);
    } catch (e) {
      print(`${TAG} forget: store error ${e}`);
    }
    if (!this.editor && this.sessionPromise) {
      this.sessionPromise
        .then((s: any) => (s ? s.clearArea() : null))
        .catch((e: any) => print(`${TAG} clearArea error (feel unproven): ${e}`));
    }
    for (const t of this.trackers) if (t && !isNull(t)) t.destroy();
    this.trackers = [];
    print(`${TAG} forget: kitchen memory cleared`);
    this.bus.emit("KITCHEN_FORGOTTEN", { source: this.editor ? "STORAGE" : "ANCHORS" });
  }

  /** True when a kitchen is stored. */
  public hasMemory(): boolean {
    return this.readStore().some((e) => e.role === "KITCHEN");
  }

  // ───────────────────────── boot / recall ─────────────────────────

  /** Runs the same boot recall path the lens runs at start again (LEAF relaunch simulation). Store untouched. */
  public rebootRecall(): void {
    this.booted = false;
    this.boot("relaunch");
  }

  private boot(why: string): void {
    if (this.booted) return;
    this.booted = true;
    const stored = this.readStore();
    this.entries = stored;
    if (stored.length > 0 && stored.some((e) => e.role === "KITCHEN")) {
      print(`${TAG} boot (${why}): remembered kitchen found (${stored.length} poses)`);
      const poses = this.toPoses(stored);
      this.applyPoses(poses, this.editor ? "STORAGE" : "ANCHORS");
      if (!this.editor) this.resolveAnchors(stored); // feel unproven
      return;
    }
    if (!this.editor) {
      print(`${TAG} boot: no remembered kitchen on device, starting the claim`);
      ClaimController.ensure().begin();
    }
    // Editor with an empty store: nothing happens (LEAF regression runs).
  }

  /** Applies remembered poses: kitchen root (yaw only), then each Station_* from its kitchen-local transform. */
  private applyPoses(poses: StationPose[], source: "STORAGE" | "ANCHORS"): boolean {
    const kitchen = KitchenAnchorRoot.ensure();
    const kPose = poses.find((p) => p.role === "KITCHEN");
    if (!kPose) return false;
    const oldRootInv = kPose.transform.inverse();
    const ok = kitchen.setPose(kPose.position, quat.angleAxis(yawOf(kPose.transform), vec3.up()), "RECALL");
    if (!ok) {
      print(`${TAG} recall: kitchen pose refused`);
      return false;
    }
    let maxErr = 0;
    const parts: string[] = [];
    for (const p of poses) {
      if (p.role === "KITCHEN") continue;
      const local = oldRootInv.mult(p.transform);
      const o = ClaimController.placeStationLocal(p.role as StationRole, local);
      if (!o) continue;
      if (!this.editor) o.enabled = false; // device: shown only while the anchor tracks
      const w = o.getTransform().getWorldPosition();
      const err = w.distance(p.position);
      maxErr = Math.max(maxErr, err);
      parts.push(`${o.name} ${fmt(w)} err ${err.toFixed(3)} cm`);
    }
    const rootErr = kitchen.getPose().position.distance(kPose.position);
    print(`${TAG} recalled kitchen: root ${fmt(kitchen.getPose().position)} err ${rootErr.toFixed(3)} cm; ${parts.join("; ")}; max station err ${maxErr.toFixed(3)} cm`);
    this.bus.emit("KITCHEN_RECALLED", { stations: poses, source });
    if (this.editor) this.showLabel();
    return true;
  }

  private onKitchenClaimed(d: KitchenClaimedPayload): void {
    const kitchen = KitchenAnchorRoot.getInstance();
    if (!kitchen || !d) return;
    if (!d.warmOnly) {
      // A fresh claim replaces the whole memory.
      this.entries = [];
      if (!this.editor && this.sessionPromise) {
        this.sessionPromise.then((s: any) => (s ? s.clearArea() : null)).catch(() => {});
      }
      this.remember("KITCHEN", kitchen.getRoot().getTransform().getWorldTransform());
    }
    for (const s of d.stations) {
      const o = ClaimController.findStation(s.role);
      if (o) this.remember(s.role, o.getTransform().getWorldTransform());
    }
    print(`${TAG} remembered kitchen (${this.entries.length} poses, ${this.editor ? "persistent storage stand-in" : "spatial anchors"})`);
    if (this.editor) this.showLabel();
  }

  // ───────────────────────── store ─────────────────────────

  private readStore(): StoredEntry[] {
    try {
      const store = global.persistentStorageSystem.store;
      if (!store || !store.has(STORE_KEY)) return [];
      const raw = store.getString(STORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as StoredKitchen;
      if (!parsed || !Array.isArray(parsed.entries)) return [];
      return parsed.entries.filter((e) => e && typeof e.role === "string" && Array.isArray(e.m) && e.m.length === 16);
    } catch (e) {
      print(`${TAG} store read error: ${e}`);
      return [];
    }
  }

  private writeStore(): void {
    try {
      const data: StoredKitchen = { v: 1, savedAt: Date.now(), entries: this.entries };
      global.persistentStorageSystem.store.putString(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      print(`${TAG} store write error: ${e}`);
    }
  }

  private toPoses(entries: StoredEntry[]): StationPose[] {
    return entries.map((e) => {
      const m = arrayToMat(e.m);
      return { role: e.role, position: positionOf(m), rotation: rotationOf(m), transform: m, anchorId: e.anchorId };
    });
  }

  // ───────────────────────── label ─────────────────────────

  private showLabel(): void {
    const kitchen = KitchenAnchorRoot.getInstance();
    if (!kitchen) return;
    if (!this.labelRoot || isNull(this.labelRoot)) {
      const label = createWorldLabel(kitchen.getRoot(), "KitchenMemoryLabel", LABEL_TEXT, LABEL_SIZE, new vec4(0.86, 0.9, 1.0, 1.0), 34, 1.4);
      label.text.depthTest = false;
      this.labelRoot = label.root;
      HeadPoseBillboard.register(label.root);
    }
    this.labelRoot.getTransform().setLocalPosition(new vec3(0, 16, 0));
    this.labelRoot.enabled = true;
    this.labelUntil = getTime() + LABEL_SECONDS;
  }

  // ───────────────────────── device: Spatial Anchors (feel unproven) ─────────────────────────

  private openSession(): Promise<any> {
    if (this.sessionPromise) return this.sessionPromise;
    try {
      const mod: any = require("LensStudio:AnchorModule");
      const opts = new AnchorModule.AnchorSessionOptions();
      opts.area = AREA;
      this.sessionPromise = (mod as AnchorModule).openSession(opts).catch((e: any) => {
        print(`${TAG} AnchorModule.openSession failed (feel unproven): ${e}`);
        return null;
      });
    } catch (e) {
      print(`${TAG} AnchorModule unavailable (feel unproven): ${e}`);
      this.sessionPromise = Promise.resolve(null);
    }
    return this.sessionPromise;
  }

  private saveAnchor(role: PoseRole, worldTransform: mat4): void {
    this.openSession()
      .then((s: AnchorModule.AnchorSession | null) => {
        if (!s) return;
        return s.createWorldAnchor(worldTransform).then((anchor: AnchorModule.WorldAnchor) => {
          const so = new AnchorModule.SaveOptions();
          so.scope = AnchorModule.AnchorScope.Private;
          return s.saveAnchor(anchor, so).then(() => {
            const e = this.entries.find((x) => x.role === role);
            if (e) {
              e.anchorId = anchor.id;
              this.writeStore();
            }
            print(`${TAG} anchor saved for ${role} (area ${AREA})`);
          });
        });
      })
      .catch((e: any) => print(`${TAG} anchor save failed for ${role} (feel unproven): ${e}`));
  }

  /** Resolves the KITCHEN anchor; an AnchorComponent on a tracker drives the kitchen pose and gates ring visibility. */
  private resolveAnchors(entries: StoredEntry[]): void {
    const k = entries.find((e) => e.role === "KITCHEN");
    this.recallStartedAt = getTime();
    if (!k || !k.anchorId) {
      print(`${TAG} no kitchen anchor id stored (feel unproven)`);
      return;
    }
    const id = k.anchorId;
    const stored = entries.slice();
    this.openSession()
      .then((s: AnchorModule.AnchorSession | null) => (s ? s.resolveAnchor(id) : null))
      .then((anchor: AnchorModule.Anchor | null) => {
        if (!anchor) return;
        const tracker = global.scene.createSceneObject("KitchenAnchorTracker");
        this.trackers.push(tracker);
        const comp = tracker.createComponent("Component.AnchorComponent") as AnchorComponent;
        comp.anchor = anchor;
        comp.onStateChanged.add((state: AnchorModule.AnchorTrackingState) => this.onAnchorState(tracker, state, stored));
      })
      .catch((e: any) => print(`${TAG} resolveAnchor failed (feel unproven): ${e}`));
  }

  private onAnchorState(tracker: SceneObject, state: AnchorModule.AnchorTrackingState, stored: StoredEntry[]): void {
    const good = state === AnchorModule.AnchorTrackingState.Tracking || state === AnchorModule.AnchorTrackingState.Ready;
    if (good) {
      if (this.trackingSince < 0) this.trackingSince = getTime();
      // Re-pose the kitchen from the tracked anchor, keep each station's stored kitchen-local transform.
      const m = tracker.getTransform().getWorldTransform();
      const poses = this.toPoses(stored);
      const kp = poses.find((p) => p.role === "KITCHEN");
      if (kp) {
        kp.transform = m;
        kp.position = positionOf(m);
        kp.rotation = rotationOf(m);
        const rel = this.toPoses(stored); // stations relative to the stored kitchen
        const oldInv = arrayToMat(stored.find((e) => e.role === "KITCHEN")!.m).inverse();
        const kitchen = KitchenAnchorRoot.ensure();
        if (kitchen.setPose(kp.position, quat.angleAxis(yawOf(m), vec3.up()), "RECALL")) {
          for (const p of rel) {
            if (p.role === "KITCHEN") continue;
            const o = ClaimController.placeStationLocal(p.role as StationRole, oldInv.mult(p.transform));
            if (o) o.enabled = true;
          }
        }
      }
    } else {
      for (const r of ["BURNER_L", "BURNER_R", "BOARD", "PLATE", "WARM"]) {
        const o = ClaimController.findStation(r as StationRole);
        if (o) o.enabled = false;
      }
    }
  }

  private deviceWatchdog(): void {
    if (this.reclaimIssued || this.recallStartedAt < 0 || this.trackingSince >= 0) return;
    if (getTime() - this.recallStartedAt < RECLAIM_AFTER_S) return;
    this.reclaimIssued = true;
    print(`${TAG} Kitchen not recognised. Reclaim? (anchors did not track in ${RECLAIM_AFTER_S} s; starting the claim)`);
    ClaimController.ensure().begin();
  }

  private listen(ev: any, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`${TAG} ${ev} handler error: ${e}`);
      }
    };
    this.bus.on(ev, safe);
    this.handlers.push({ ev, cb: safe });
  }
}
