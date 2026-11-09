/**
 * ClaimController.ts
 * MiseFlow AR v7, Stage 2 (Plan D1 / S2, decisions D-008 and D-012): "Claim your kitchen".
 *
 * The cook pinches four real spots in order: left burner, right burner, board, plate (a fifth WARM spot only on
 * demand via requestWarmSpot()). A flush 12 cm reticle follows the pointing ray's hit on real geometry; pinch
 * RELEASE confirms. When the 4th spot is accepted the kitchen root is posed on the counter (local +X from the left
 * burner toward the plate, origin = centroid of the spots, y = surface height), shown again, and Station_BurnerL /
 * Station_BurnerR / Station_Board / Station_Plate are built directly under KitchenAnchorRoot with a flush ring each.
 *
 * Surface hit (D-008 / D-012 c), in order:
 *   (a) the active SIK interactor ray, through DeviceTracking.raycastWorldMesh;
 *   (b) a downward cast from the interactor start point (the pinch point; the simulator's puppet-hand ray is
 *       horizontal), also through raycastWorldMesh (hands only: a mouse start point sits at the camera);
 *   (c) device only, "feel unproven": the latest WorldQuery hit-test answer for the same ray;
 *   (d) the Lens-provided virtual counter plane at the last good surface height (default: P0 height).
 * On device, mesh hits classified TrackedMeshFaceClassification.Table are preferred ("feel unproven").
 * A WorldQuery HitTestSession runs on every platform because the simulator only populates the world mesh while one
 * is active (measured in Stage 2: 0 mesh results without it, table hits with it).
 *
 * Platform branching only through global.deviceInfoSystem.isEditor(). Sessions and SIK subscriptions start in
 * OnStartEvent (interactor onTriggerStart / onTriggerEnd: the free-space gesture pattern, so the Preview mouse,
 * the LEAF puppet hand and a real pinch all work). Key C calls begin() in the editor.
 *
 * Self-contained, no @input (runtime-created components keep the first-compiled defaults): created by
 * MiseFlowSpatialUI.ensureHeroComponents right after KitchenAnchorRoot.ensure().
 */
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { InteractorInputType } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {
  ClaimedStationInfo,
  ClaimSurfaceMode,
  MiseFlowEventBus,
  StationRole,
} from "./MiseFlowEventBus";
import { KitchenAnchorRoot } from "./KitchenAnchorRoot";
import { HeadPoseBillboard } from "./HeadPoseBillboard";
import { makeEmissiveMaterial } from "./StationPropsBuilder";
import { buildAnnulusMesh, createWorldLabel, tint } from "./DAGCounterConduit";

const TAG = "[ClaimController]";
const DEG = Math.PI / 180;

// Geometry (cm)
const RING_R_OUT = 6.0; // 12 cm ring
const RING_R_IN = 5.55;
const RING_STEPS = 40; // 80 tris
const RING_LIFT = 0.3; // above the surface, along the normal
const CHEVRON_R = 7.3;
const DOT_R = 0.42;
const DOT_SPACING = 1.25;
const DOT_Z = 3.6; // near (cook) side inside the ring
const CAPTION_Y = 2.4; // caption stands inside the ring
const CAPTION_SIZE = 48; // about 1.0 cm cap height (createWorldLabel: size 34 ~ 1.0 cm line)
const CAPTION_W = 10.6;
const CAPTION_H = 3.6;

// Validation
const MAX_TILT_DEG = 15;
const MIN_SPACING_CM = 18;
const MAX_SPREAD_CM = 120;
const UNDO_WINDOW_S = 3;
const UNDO_RADIUS_CM = RING_R_OUT + 0.5;
const RAY_LEN_CM = 400;
const DOWN_LEN_CM = 80;
const MESSAGE_S = 1.6;

// Light colours only (additive display: no fill below 25% luminance)
const SILVER: [number, number, number] = [0.86, 0.9, 1.0];
const GOLD: [number, number, number] = [1.0, 0.76, 0.28];
const CYAN: [number, number, number] = [0.22, 0.86, 0.98];
const EMERALD: [number, number, number] = [0.24, 0.95, 0.62];
const CORAL: [number, number, number] = [1.0, 0.42, 0.38];
const AMBER: [number, number, number] = [1.0, 0.62, 0.16];

export const CLAIM_ROLES: StationRole[] = ["BURNER_L", "BURNER_R", "BOARD", "PLATE"];

interface RoleInfo {
  name: string;
  prompt: string;
  color: [number, number, number];
}

const ROLE_INFO: { [k: string]: RoleInfo } = {
  BURNER_L: { name: "Station_BurnerL", prompt: "Pinch on your left burner", color: GOLD },
  BURNER_R: { name: "Station_BurnerR", prompt: "Pinch on your right burner", color: GOLD },
  BOARD: { name: "Station_Board", prompt: "Pinch on your board", color: CYAN },
  PLATE: { name: "Station_Plate", prompt: "Pinch where you plate", color: SILVER },
  WARM: { name: "Station_Warm", prompt: "Pinch on a warm spot", color: AMBER },
};

export interface ClaimRecord {
  role: StationRole;
  position: vec3; // world
  normal: vec3; // world, unit
  time: number;
  surface: ClaimSurfaceMode;
}

interface SurfaceHit {
  position: vec3;
  normal: vec3;
  mode: ClaimSurfaceMode;
  table: boolean;
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

function alive(o: any): boolean {
  return !!o && !isNull(o);
}

function fmt(v: vec3): string {
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

function tiltDeg(n: vec3): number {
  const u = n.normalize();
  return Math.acos(Math.max(-1, Math.min(1, u.y))) / DEG;
}

function childByName(parent: SceneObject, name: string): SceneObject | null {
  const n = parent.getChildrenCount();
  for (let i = 0; i < n; i++) {
    const c = parent.getChild(i);
    if (c.name === name) return c;
  }
  return null;
}

function findCameraInScene(): Camera | null {
  const walk = (o: SceneObject): Camera | null => {
    const c = o.getComponent("Component.Camera") as Camera;
    if (c && o.enabled && c.type === Camera.Type.Perspective) return c;
    for (let i = 0; i < o.getChildrenCount(); i++) {
      const r = walk(o.getChild(i));
      if (r) return r;
    }
    return null;
  };
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const c = walk(global.scene.getRootObject(i));
    if (c) return c;
  }
  return null;
}

/** Flat V chevron in the XZ plane, pointing toward -Z (4 tris). */
function buildChevronMesh(w: number, len: number, thick: number): RenderMesh {
  const b = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
    { name: "texture0", components: 2 },
    { name: "color", components: 4 },
  ]);
  b.topology = MeshTopology.Triangles;
  b.indexType = MeshIndexType.UInt16;
  const v = (x: number, z: number): number[] => [x, 0, z, 0, 1, 0, 0, 0, 1, 1, 1, 1];
  const tip = -len / 2;
  const back = len / 2;
  // left arm (tip -> back-left), right arm (tip -> back-right)
  b.appendVerticesInterleaved([
    ...v(0, tip), ...v(0, tip + thick), ...v(-w / 2, back), ...v(-w / 2 + thick, back),
    ...v(0, tip), ...v(0, tip + thick), ...v(w / 2, back), ...v(w / 2 - thick, back),
  ]);
  // Both windings (the chevron is seen from above only, but keep it two-sided-safe).
  b.appendIndices([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7]);
  b.updateMesh();
  return b.getMesh();
}

@component
export class ClaimController extends BaseScriptComponent {
  static readonly OBJECT_NAME = "ClaimController";
  static readonly RETICLE_NAME = "ClaimReticle";
  static readonly MARKS_NAME = "ClaimMarks";

  private static instance: ClaimController | null = null;
  private static ringMesh: RenderMesh | null = null;
  private static roleMats: { [k: string]: Material } = {};

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private editor: boolean = isEditorRuntime();

  // claim state
  private claiming: boolean = false;
  private warmOnly: boolean = false;
  private queue: StationRole[] = [];
  private claims: ClaimRecord[] = [];
  private marks: SceneObject[] = [];
  private lastSurfaceY: number = KitchenAnchorRoot.DEFAULT_POS.y;
  private surfaceMode: ClaimSurfaceMode = "PLANE";
  private currentHit: SurfaceHit | null = null;
  private message: string = "";
  private messageUntil: number = -1;

  // input
  private interactors: any[] = [];
  private unsubs: (() => void)[] = [];
  private pressInteractor: any = null;
  private pressHit: SurfaceHit | null = null;
  private pressTime: number = -1;
  private lastHitByInteractor: Map<any, SurfaceHit> = new Map();
  private subscribeTries: number = 0;
  private started: boolean = false;
  private handsBound: boolean = false;

  // world sensing
  private deviceTracking: DeviceTracking | null = null;
  private camTr: Transform | null = null;
  private wqSession: HitTestSession | null = null; // device only
  private wqHit: SurfaceHit | null = null;
  private wqHitTime: number = -1;

  // reticle
  private reticle: SceneObject | null = null;
  private ringObj: SceneObject | null = null;
  private ringMat: Material | null = null;
  private chevrons: SceneObject[] = [];
  private chevronMat: Material | null = null;
  private dots: SceneObject[] = [];
  private dotMats: Material[] = [];
  private captionRoot: SceneObject | null = null;
  private caption: Text | null = null;

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): ClaimController | null {
    const c = ClaimController.instance;
    return c && alive(c) && alive(c.getSceneObject()) ? c : null;
  }

  /** Creates (idempotent) the scene-root "ClaimController" object plus this component. */
  public static ensure(): ClaimController {
    const existing = ClaimController.getInstance();
    if (existing) return existing;
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i);
      if (o.name !== ClaimController.OBJECT_NAME) continue;
      const comp = o.getComponent(ClaimController.getTypeName()) as ClaimController;
      if (comp) {
        ClaimController.instance = comp;
        return comp;
      }
    }
    const obj = global.scene.createSceneObject(ClaimController.OBJECT_NAME);
    const comp = obj.createComponent(ClaimController.getTypeName()) as ClaimController;
    if (!ClaimController.instance) ClaimController.instance = comp;
    return ClaimController.instance!;
  }

  /** Scene-object name for a role (Station_BurnerL, Station_BurnerR, Station_Board, Station_Plate, Station_Warm). */
  public static stationName(role: StationRole): string {
    return ROLE_INFO[role].name;
  }

  /** The Station_* object for a role under KitchenAnchorRoot, or null. */
  public static findStation(role: StationRole): SceneObject | null {
    const k = KitchenAnchorRoot.getInstance();
    return k ? childByName(k.getRoot(), ROLE_INFO[role].name) : null;
  }

  /**
   * Creates (or reuses) Station_<role> directly under KitchenAnchorRoot with a flush 12 cm ring (child
   * "<name>_Ring", lifted 0.3 cm along the local up). Pose not set here (see placeStationWorld / buildStation).
   */
  public static ensureStationObject(role: StationRole): SceneObject | null {
    const k = KitchenAnchorRoot.getInstance();
    if (!k) return null;
    const root = k.getRoot();
    const name = ROLE_INFO[role].name;
    let o = childByName(root, name);
    if (o) return o;
    o = global.scene.createSceneObject(name);
    o.setParent(root);
    const ring = global.scene.createSceneObject(`${name}_Ring`);
    ring.setParent(o);
    ring.getTransform().setLocalPosition(new vec3(0, RING_LIFT, 0));
    const rmv = ring.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = ClaimController.getRingMesh();
    rmv.mainMaterial = ClaimController.getRoleMaterial(role);
    return o;
  }

  /** Station at a world surface point, oriented to the world normal and the kitchen yaw. */
  public static buildStation(role: StationRole, worldPos: vec3, worldNormal: vec3): SceneObject | null {
    const k = KitchenAnchorRoot.getInstance();
    const o = ClaimController.ensureStationObject(role);
    if (!k || !o) return null;
    const t = o.getTransform();
    const rootRot = k.getRoot().getTransform().getWorldRotation();
    const tilt = quat.rotationFromTo(vec3.up(), worldNormal.normalize());
    t.setWorldPosition(worldPos);
    t.setWorldRotation(tilt.multiply(rootRot));
    t.setLocalScale(vec3.one());
    return o;
  }

  /** Station from a stored local transform (kitchen frame); used by KitchenPersistence. */
  public static placeStationLocal(role: StationRole, local: mat4): SceneObject | null {
    const o = ClaimController.ensureStationObject(role);
    if (!o) return null;
    o.getTransform().setLocalTransform(local);
    return o;
  }

  /** Destroys every Station_* under KitchenAnchorRoot (runtime objects only). */
  public static clearStations(): void {
    const k = KitchenAnchorRoot.getInstance();
    if (!k) return;
    const root = k.getRoot();
    for (const r of ["BURNER_L", "BURNER_R", "BOARD", "PLATE", "WARM"]) {
      const o = childByName(root, ROLE_INFO[r].name);
      if (o) o.destroy();
    }
  }

  private static getRingMesh(): RenderMesh {
    if (!ClaimController.ringMesh) ClaimController.ringMesh = buildAnnulusMesh(RING_R_IN, RING_R_OUT, RING_STEPS);
    return ClaimController.ringMesh;
  }

  /**
   * Emissive light material for flush surface marks. Depth test off: a ring 0.3 cm above the sensed surface must
   * not be hidden by the real surface's own unevenness (in the Preview the rendered room top sits about 1.5 cm above
   * its world mesh, measured in Stage 2, and would otherwise clip the rings).
   */
  public static flushMaterial(c: [number, number, number], k: number): Material {
    const m = makeEmissiveMaterial(c[0], c[1], c[2], k);
    try {
      m.mainPass.depthTest = false;
      m.mainPass.depthWrite = false;
    } catch (e) {
      // keep the default depth state
    }
    return m;
  }

  private static getRoleMaterial(role: StationRole): Material {
    let m = ClaimController.roleMats[role];
    if (!m || isNull(m)) {
      const c = ROLE_INFO[role].color;
      m = ClaimController.flushMaterial(c, 1.0);
      ClaimController.roleMats[role] = m;
    }
    return m;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    if (!ClaimController.getInstance()) ClaimController.instance = this;
    this.buildReticle();

    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());

    // Editor-only development shortcut (key C = begin), like the other key handlers.
    this.createEvent("KeyPressEvent").bind((ev: KeyPressEvent) => {
      if (!this.editor) return;
      const key: any = (ev as any).key;
      const ks = key !== undefined && key !== null ? String(key) : "";
      if ((typeof Keys !== "undefined" && key === Keys.C) || ks === "C" || ks === "c" || ks === "Key_C") {
        print(`${TAG} key C: begin()`);
        this.begin();
      }    });

    this.createEvent("OnDestroyEvent").bind(() => {
      for (const u of this.unsubs) {
        try {
          u();
        } catch (e) {
          // ignore
        }
      }
      this.unsubs = [];
      try {
        if (this.wqSession) this.wqSession.stop();
      } catch (e) {
        // ignore
      }
      if (ClaimController.instance === this) ClaimController.instance = null;
    });
  }

  private onStart(): void {
    this.started = true;
    this.findCamera();
    this.setupWorldMesh();
    // Measured in Stage 2: the simulator only populates the world mesh (raycastWorldMesh returns 0 results)
    // while a WorldQuery HitTestSession is running, so the session runs everywhere; its own answers are used
    // on device only.
    this.startWorldQuerySession();
    this.subscribeInteractors();
  }

  private findCamera(): void {
    let cam: Camera | null = null;
    try {
      cam = WorldCameraFinderProvider.getInstance().getComponent();
    } catch (e) {
      cam = null;
    }
    if (!cam) cam = findCameraInScene();
    if (!cam) {
      print(`${TAG} no camera found: surface casts disabled, virtual plane only`);
      return;
    }
    this.camTr = cam.getSceneObject().getTransform();
    try {
      this.deviceTracking = cam.getSceneObject().getComponent("Component.DeviceTracking") as DeviceTracking;
    } catch (e) {
      this.deviceTracking = null;
    }
  }

  /** As the Stage 0 probe did: world meshes (and classification) on, accepted at runtime in the simulator. */
  private setupWorldMesh(): void {
    const dt: any = this.deviceTracking;
    if (!dt) {
      print(`${TAG} camera has no DeviceTracking: world-mesh casts disabled, virtual plane only`);
      return;
    }
    try {
      const wo = dt.worldOptions;
      wo.enableWorldMeshesTracking = true;
      wo.enableWorldMeshesClassificationTracking = true;
      print(`${TAG} world mesh tracking on (meshes=${wo.enableWorldMeshesTracking} classification=${wo.enableWorldMeshesClassificationTracking}) editor=${this.editor}`);
    } catch (e) {
      print(`${TAG} worldOptions error: ${e}`);
    }
  }

  /**
   * WorldQuery hit-test session, started in OnStartEvent on every platform: in the simulator raycastWorldMesh only
   * returns results while such a session runs (measured, Stage 2). Its own hit answers are an extra attempt on
   * device only (unreliable in the simulator, D-008; feel unproven on device).
   */
  private startWorldQuerySession(): void {
    try {
      const wq = require("LensStudio:WorldQueryModule") as WorldQueryModule;
      if (!wq) return;
      const opt = HitTestSessionOptions.create();
      opt.filter = true;
      this.wqSession = wq.createHitTestSessionWithOptions(opt);
      this.wqSession.start();
      print(`${TAG} WorldQuery session started (keeps the world mesh populated; its answers are used on device only)`);
    } catch (e) {
      this.wqSession = null;
      print(`${TAG} WorldQuery unavailable: ${e}`);
    }
  }

  /**
   * Free-space gesture. Non-hand interactors (the Preview mouse, the phone): the interactor's own trigger events
   * (fire with or without a target). Hands: SIK's hand pinch events (TrackedHand.onPinchDown / onPinchUp), with the
   * hand interactor supplying the ray and pinch point. Measured in Stage 2: a free-space puppet pinch
   * (PreviewInteractTool Pinch at a world position) drives the hand PinchDetector but leaves the hand interactor's
   * trigger at None, so interactor triggers alone never confirm a hand claim.
   */
  private subscribeInteractors(): void {
    let list: any[] = [];
    try {
      list = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All) as any[];
    } catch (e) {
      list = [];
    }
    if (!this.handsBound) this.bindHands();
    for (const it of list) {
      if (!it || this.interactors.indexOf(it) >= 0) continue;
      this.interactors.push(it);
      if ((it.inputType & InteractorInputType.BothHands) !== 0) continue; // hands: pinch events (bindHands)
      const u1 = it.onTriggerStart.add(() => this.onTriggerStart(it));
      const u2 = it.onTriggerEnd.add(() => this.onTriggerEnd(it));
      const u3 = it.onTriggerCanceled.add(() => {
        if (this.pressInteractor === it) {
          this.pressInteractor = null;
          this.pressHit = null;
        }
      });
      for (const u of [u1, u2, u3]) if (typeof u === "function") this.unsubs.push(u);
    }
    if (this.subscribeTries === 0 || list.length > 0) {
      print(`${TAG} subscribed to ${this.interactors.length} SIK interactor(s)`);
    }
    this.subscribeTries++;
  }

  private bindHands(): void {
    for (const side of ["left", "right"]) {
      try {
        const hand: any = SIK.HandInputData.getHand(side as any);
        if (!hand) continue;
        const handInteractor = (): any => {
          try {
            const t = side === "left" ? InteractorInputType.LeftHand : InteractorInputType.RightHand;
            const l = SIK.InteractionManager.getInteractorsByType(t) as any[];
            return l.length > 0 ? l[0] : null;
          } catch (e) {
            return null;
          }
        };
        const u1 = hand.onPinchDown.add(() => {
          const it = handInteractor();
          if (it) this.onTriggerStart(it);
        });
        const u2 = hand.onPinchUp.add(() => {
          const it = handInteractor();
          if (it) this.onTriggerEnd(it);
        });
        const u3 = hand.onPinchCancel.add(() => {
          const it = handInteractor();
          if (it && this.pressInteractor === it) {
            this.pressInteractor = null;
            this.pressHit = null;
          }
        });
        for (const u of [u1, u2, u3]) if (typeof u === "function") this.unsubs.push(u);
        this.handsBound = true;
      } catch (e) {
        print(`${TAG} hand ${side} pinch events unavailable: ${e}`);
      }
    }
  }

  // ───────────────────────── public API ─────────────────────────

  public isClaiming(): boolean {
    return this.claiming;
  }

  public getClaims(): ClaimRecord[] {
    return this.claims.map((c) => ({ role: c.role, position: c.position, normal: c.normal, time: c.time, surface: c.surface }));
  }

  /** Surface used by the last hit or accepted claim: 'MESH' (world mesh / WorldQuery) or 'PLANE' (virtual counter). */
  public getSurfaceMode(): ClaimSurfaceMode {
    return this.surfaceMode;
  }

  /** The role the next accepted spot will take, or null when not claiming. */
  public getNextRole(): StationRole | null {
    return this.claiming && this.claims.length < this.queue.length ? this.queue[this.claims.length] : null;
  }

  /**
   * Starts a claim pass: hides the kitchen content (KitchenAnchorRoot.setContentHidden, StationsRoot scale untouched)
   * and shows the reticle. Refused while the Cook stage or Auto Cook holds the kitchen pose.
   */
  public begin(): boolean {
    if (this.claiming) return true;
    const kitchen = KitchenAnchorRoot.ensure();
    if (kitchen.isPoseLocked()) {
      print(`${TAG} begin() refused: kitchen pose locked (Cook stage or Auto Cook)`);
      return false;
    }
    if (!kitchen.setContentHidden(true)) return false;
    this.warmOnly = false;
    this.queue = CLAIM_ROLES.slice();
    this.claims = [];
    this.clearMarks();
    this.claiming = true;
    this.pressInteractor = null;
    this.pressHit = null;
    this.message = "";
    this.setReticleVisible(true);
    print(`${TAG} begin: claim ${this.queue.join(", ")}`);
    this.emitState("BEGIN");
    return true;
  }

  /** Abandons the pass: marks removed, kitchen shown again at its previous pose (Station_* kept). */
  public cancel(): void {
    if (!this.claiming) return;
    this.claiming = false;
    this.claims = [];
    this.clearMarks();
    this.setReticleVisible(false);
    if (!this.warmOnly) {
      const k = KitchenAnchorRoot.getInstance();
      if (k) k.setContentHidden(false);
    }
    this.warmOnly = false;
    print(`${TAG} cancel`);
    this.emitState("CANCEL");
  }

  /** Removes the last accepted spot of the current pass. */
  public undoLast(): boolean {
    if (!this.claiming || this.claims.length === 0) return false;
    const c = this.claims.pop()!;
    const m = this.marks.pop();
    if (m && alive(m)) m.destroy();
    this.flash("Undone.");
    print(`${TAG} undo ${c.role}`);
    this.bus.emit("STATION_UNCLAIMED", { role: c.role, remaining: this.claims.length });
    this.emitState("UNDO");
    return true;
  }

  /**
   * Offers the fifth WARM spot. During a pass it is appended after PLATE; after a completed claim it starts a
   * warm-only pass (the kitchen stays visible).
   */
  public requestWarmSpot(): boolean {
    if (this.claiming) {
      if (this.queue.indexOf("WARM") < 0) this.queue.push("WARM");
      this.emitState("WARM");
      return true;
    }
    if (!ClaimController.findStation("PLATE")) {
      print(`${TAG} requestWarmSpot: no claimed kitchen yet`);
      return false;
    }
    this.warmOnly = true;
    this.queue = ["WARM"];
    this.claims = [];
    this.clearMarks();
    this.claiming = true;
    this.pressInteractor = null;
    this.setReticleVisible(true);
    this.emitState("WARM");
    return true;
  }

  /**
   * Deterministic claim (scenarios, palette, quickClaim). Starts a pass if none is running. The role must be the
   * next one in order. Validation as for a pinch. Returns true when accepted.
   */
  public claimAt(role: StationRole, worldPos: vec3, normal: vec3, surface?: ClaimSurfaceMode): boolean {
    if (!this.claiming && !this.begin()) return false;
    const next = this.getNextRole();
    if (role !== next) {
      print(`${TAG} claimAt(${role}) refused: next role is ${next}`);
      return false;
    }
    const n = normal.length > 1e-6 ? normal.normalize() : vec3.up();
    const reason = this.validate(worldPos, n);
    if (reason !== "") {
      this.flash(reason);
      print(`${TAG} claimAt(${role}) rejected: ${reason} at ${fmt(worldPos)}`);
      return false;
    }
    const mode: ClaimSurfaceMode = surface || this.surfaceMode;
    const rec: ClaimRecord = { role, position: new vec3(worldPos.x, worldPos.y, worldPos.z), normal: n, time: getTime(), surface: mode };
    this.claims.push(rec);
    this.marks.push(this.buildMark(rec));
    this.lastSurfaceY = worldPos.y;
    this.surfaceMode = mode;
    print(`${TAG} claimed ${role} at ${fmt(worldPos)} n ${fmt(n)} tilt ${tiltDeg(n).toFixed(1)} deg surface ${mode}`);
    this.bus.emit("STATION_CLAIMED", {
      role,
      position: rec.position,
      normal: n,
      index: this.claims.length - 1,
      total: this.queue.length,
      surface: mode,
    });
    if (this.claims.length >= this.queue.length) {
      this.complete();
    } else {
      this.emitState("CLAIM");
    }
    return true;
  }

  /**
   * LEAF / dev: a hand pinch at a world point, without the SIK hand. Same surface pipeline as a real hand pinch
   * (downward mesh cast from the pinch point, normal averaging, flatness check, then the virtual counter plane
   * as the last resort) and the same validation (claimAt). Starts a pass if none is running. Returns true when accepted.
   */
  public claimFromPinchPoint(role: StationRole, pinchWorldPos: vec3): boolean {
    if (!this.claiming && !this.begin()) return false;
    const hit = this.downCastFromPinch(pinchWorldPos) || this.planeCast(pinchWorldPos, null, true);
    if (!hit) {
      this.flash("Look at your counter.");
      print(`${TAG} pinch point ${fmt(pinchWorldPos)} with no surface`);
      return false;
    }
    return this.claimAt(role, hit.position, hit.normal, hit.mode);
  }

  /**
   * Dev / palette / LEAF fallback: claims every remaining spot under the view centre (20 cm apart along the camera's
   * ground-projected right axis). Returns the number of spots accepted.
   */
  public quickClaim(): number {
    if (!this.claiming && !this.begin()) return 0;
    const cam = this.camTr;
    let centre: SurfaceHit | null = null;
    let right = new vec3(1, 0, 0);
    if (cam) {
      const p = cam.getWorldPosition();
      const fwd = cam.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)).normalize();
      const r = cam.getWorldRotation().multiplyVec3(vec3.right());
      if (r.x * r.x + r.z * r.z > 1e-6) right = new vec3(r.x, 0, r.z).normalize();
      centre = this.meshCast(p, p.add(fwd.uniformScale(RAY_LEN_CM))) || this.planeCast(p, fwd, false);
    }
    if (!centre) {
      const base = KitchenAnchorRoot.DEFAULT_POS;
      centre = { position: new vec3(base.x, this.lastSurfaceY, base.z), normal: vec3.up(), mode: "PLANE", table: false };
    }
    const offsets = [-30, -10, 10, 30, 50];
    let accepted = 0;
    for (let guard = 0; guard < 6 && this.claiming; guard++) {
      const role = this.getNextRole();
      if (!role) break;
      const i = this.claims.length;
      const p0 = centre.position.add(right.uniformScale(offsets[Math.min(i, offsets.length - 1)]));
      const down = this.meshCast(p0.add(new vec3(0, 20, 0)), p0.add(new vec3(0, -40, 0)));
      const hit = down && tiltDeg(down.normal) <= MAX_TILT_DEG ? down : { position: p0, normal: centre.normal, mode: centre.mode, table: false };
      if (!this.claimAt(role, hit.position, hit.normal, hit.mode)) break;
      accepted++;
    }
    return accepted;
  }

  // ───────────────────────── input ─────────────────────────

  private onTriggerStart(it: any): void {
    if (!this.claiming) return;
    this.pressInteractor = it;
    this.pressTime = getTime();
    this.pressHit = this.castFromInteractor(it);
    const last = this.claims.length > 0 ? this.claims[this.claims.length - 1] : null;
    print(
      `${TAG} pinch down (input ${it.inputType}) hit ${this.pressHit ? fmt(this.pressHit.position) + " " + this.pressHit.mode : "none"}` +
        (last ? ` (${(this.pressTime - last.time).toFixed(2)} s after ${last.role})` : "")
    );
  }

  private onTriggerEnd(it: any): void {
    if (!this.claiming) return;
    // Only a press that started during this pass confirms (the pinch that opened the pass is ignored).
    if (this.pressInteractor !== it) {
      print(`${TAG} pinch up ignored (input ${it.inputType}: no pinch down during this pass)`);
      return;
    }
    // Hands: the spot where the pinch closed (the pinch point drifts 2 to 3 cm while the fingers open, measured in
    // the Preview). Mouse / phone: the spot under the ray at release (what the reticle showed).
    let isHand = false;
    try {
      isHand = (it.inputType & InteractorInputType.BothHands) !== 0;
    } catch (e) {
      isHand = false;
    }
    let hit = isHand && this.pressHit ? this.pressHit : this.castFromInteractor(it);
    if (!hit) hit = this.lastHitByInteractor.get(it) || this.pressHit;
    this.pressInteractor = null;
    this.pressHit = null;
    this.confirm(hit);
    this.pressTime = -1;
  }

  private confirm(hit: SurfaceHit | null): void {
    if (!hit) {
      this.flash("Look at your counter.");
      print(`${TAG} pinch with no surface`);
      return;
    }
    const last = this.claims.length > 0 ? this.claims[this.claims.length - 1] : null;
    // Undo: the pinch on the last ring STARTED within 3 s of that ring being placed.
    const t = this.pressTime >= 0 ? this.pressTime : getTime();
    if (last && t - last.time <= UNDO_WINDOW_S && hit.position.distance(last.position) <= UNDO_RADIUS_CM) {
      this.undoLast();
      return;
    }
    const role = this.getNextRole();
    if (role) this.claimAt(role, hit.position, hit.normal, hit.mode);
  }

  // ───────────────────────── surface casts ─────────────────────────

  private castFromInteractor(it: any): SurfaceHit | null {
    let sp: vec3 | null = null;
    let ep: vec3 | null = null;
    let dir: vec3 | null = null;
    let isHand = false;
    try {
      if (!it || !it.isActive()) return null;
      sp = it.startPoint;
      ep = it.endPoint;
      dir = it.direction;
      isHand = (it.inputType & InteractorInputType.BothHands) !== 0;
    } catch (e) {
      return null;
    }
    if (!sp) return null;
    // A hand that is not in front of the eyes (the simulator parks its idle puppet hand behind the camera) does
    // not point at anything.
    if (isHand && this.camTr) {
      const cp = this.camTr.getWorldPosition();
      const fwd = this.camTr.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
      const rel = sp.sub(cp);
      if (rel.dot(fwd) < 5 || rel.length > 250) return null;
    }
    if ((!dir || dir.length < 1e-6) && ep) dir = ep.sub(sp); // the simulator hand reports a zero direction
    const d = dir && dir.length > 1e-6 ? dir.normalize() : null;
    let hit: SurfaceHit | null = null;
    // (a) the pointing ray
    let rayHit = d ? this.meshCast(sp, sp.add(d.uniformScale(RAY_LEN_CM))) : null;
    if (rayHit) rayHit = this.smoothed(rayHit);
    if (rayHit && tiltDeg(rayHit.normal) <= MAX_TILT_DEG) hit = rayHit;
    // (b) straight down from the pinch point (hands only)
    if (!hit && isHand) hit = this.downCastFromPinch(sp);
    // (c) device only, feel unproven: WorldQuery answer for this ray
    if (!hit && !this.editor && d) hit = this.worldQueryCast(sp, sp.add(d.uniformScale(RAY_LEN_CM)));
    // tilted mesh hit (shown as "Find a flat spot.")
    if (!hit && rayHit) hit = rayHit;
    // (d) virtual counter plane
    if (!hit) hit = this.planeCast(sp, d, isHand);
    if (hit) this.lastHitByInteractor.set(it, hit);
    return hit;
  }

  /** Straight down from a pinch point: mesh cast, normal averaging (smoothed), flatness check. Null when not flat. */
  private downCastFromPinch(sp: vec3): SurfaceHit | null {
    let downHit = this.meshCast(sp.add(new vec3(0, 3, 0)), sp.add(new vec3(0, -DOWN_LEN_CM, 0)));
    if (downHit) downHit = this.smoothed(downHit);
    return downHit && tiltDeg(downHit.normal) <= MAX_TILT_DEG ? downHit : null;
  }

  private meshCast(from: vec3, to: vec3): SurfaceHit | null {
    const dt = this.deviceTracking;
    if (!dt) return null;
    let res: TrackedMeshHitTestResult[] | null = null;
    try {
      res = dt.raycastWorldMesh(from, to);
    } catch (e) {
      return null;
    }
    if (!res || res.length === 0) return null;
    let best: TrackedMeshHitTestResult | null = null;
    let bestD = Number.MAX_VALUE;
    let bestTable: TrackedMeshHitTestResult | null = null;
    let bestTableD = Number.MAX_VALUE;
    for (const r of res) {
      const dd = r.position.distance(from);
      if (dd < bestD) {
        bestD = dd;
        best = r;
      }
      let cls = -1;
      try {
        cls = r.classification;
      } catch (e) {
        cls = -1;
      }
      if (cls === TrackedMeshFaceClassification.Table && dd < bestTableD) {
        bestTableD = dd;
        bestTable = r;
      }
    }
    // Device: prefer Table-classified faces (feel unproven). Editor: nearest hit (the simulator classifies the
    // coffee table as Table anyway, probe cls=4).
    const pick = !this.editor && bestTable ? bestTable : best;
    if (!pick) return null;
    const n = pick.normal.length > 1e-6 ? pick.normal.normalize() : vec3.up();
    return { position: pick.position, normal: n, mode: "MESH", table: pick === bestTable };
  }

  /**
   * Coarse meshes (the simulator's coffee table has single faces tilted past 15 deg on a flat top, measured in
   * Stage 2): when the hit face is tilted, the normal is re-estimated as the mean of five vertical samples (the
   * hit and +-3 cm in x and z). The position stays the hit point; a genuinely tilted surface stays tilted.
   */
  private smoothed(h: SurfaceHit): SurfaceHit {
    if (tiltDeg(h.normal) <= MAX_TILT_DEG) return h;
    const p = h.position;
    let sum = vec3.zero();
    let n = 0;
    for (const o of [new vec3(0, 0, 0), new vec3(3, 0, 0), new vec3(-3, 0, 0), new vec3(0, 0, 3), new vec3(0, 0, -3)]) {
      const q = p.add(o);
      const v = this.meshCast(q.add(new vec3(0, 5, 0)), q.add(new vec3(0, -5, 0)));
      if (!v) continue;
      sum = sum.add(v.normal);
      n++;
    }
    if (n < 3 || sum.length < 1e-6) return h;
    return { position: p, normal: sum.normalize(), mode: h.mode, table: h.table };
  }

  /** Device only, feel unproven: fire-and-forget hit test; returns the latest answer if it is fresh. */
  private worldQueryCast(from: vec3, to: vec3): SurfaceHit | null {
    const s = this.wqSession;
    if (!s) return null;
    try {
      s.hitTest(from, to, (r: WorldQueryHitTestResult) => {
        if (!r) return;
        const n = r.normal.length > 1e-6 ? r.normal.normalize() : vec3.up();
        this.wqHit = { position: r.position, normal: n, mode: "MESH", table: false };
        this.wqHitTime = getTime();
      });
    } catch (e) {
      // ignore
    }
    const fresh = this.wqHit && getTime() - this.wqHitTime < 0.5 ? this.wqHit : null;
    return fresh && tiltDeg(fresh.normal) <= MAX_TILT_DEG ? fresh : null;
  }

  /** The Lens-provided counter plane at the last good surface height. */
  private planeCast(from: vec3, dir: vec3 | null, isHand: boolean): SurfaceHit | null {
    const y = this.lastSurfaceY;
    if (dir && dir.y < -0.05) {
      const t = (y - from.y) / dir.y;
      if (t > 0 && t < RAY_LEN_CM) {
        return { position: from.add(dir.uniformScale(t)), normal: vec3.up(), mode: "PLANE", table: false };
      }
    }
    if (isHand && from.y > y && from.y - y < DOWN_LEN_CM) {
      return { position: new vec3(from.x, y, from.z), normal: vec3.up(), mode: "PLANE", table: false };
    }
    return null;
  }

  /** "" when acceptable, else the caption to show. */
  private validate(pos: vec3, normal: vec3): string {
    if (tiltDeg(normal) > MAX_TILT_DEG) return "Find a flat spot.";
    const others: vec3[] = this.claims.map((c) => c.position);
    if (this.warmOnly) {
      for (const r of CLAIM_ROLES) {
        const o = ClaimController.findStation(r);
        if (o) others.push(o.getTransform().getWorldPosition());
      }
    }
    for (const o of others) {
      const d = o.distance(pos);
      if (d < MIN_SPACING_CM) return "Too close. Move apart.";
      if (d > MAX_SPREAD_CM) return "Keep spots closer.";
    }
    return "";
  }

  // ───────────────────────── completion ─────────────────────────

  private complete(): void {
    const kitchen = KitchenAnchorRoot.ensure();
    const byRole = (r: StationRole) => this.claims.find((c) => c.role === r) || null;
    this.claiming = false;
    this.setReticleVisible(false);

    if (!this.warmOnly) {
      const L = byRole("BURNER_L");
      const P = byRole("PLATE");
      if (!L || !P) {
        print(`${TAG} complete: missing burner or plate, pass abandoned`);
        this.claims = [];
        this.clearMarks();
        kitchen.setContentHidden(false);
        this.emitState("CANCEL");
        return;
      }
      let nx = 0;
      let ny = 0;
      let nz = 0;
      const core = this.claims.filter((c) => c.role !== "WARM");
      for (const c of core) {
        nx += c.normal.x;
        ny += c.normal.y;
        nz += c.normal.z;
      }
      const n = new vec3(nx, ny, nz).normalize();
      kitchen.setContentHidden(false);
      const ok = kitchen.setPoseFromClaims(core.map((c) => c.position), L.position, P.position, n, "CLAIM");
      if (!ok) print(`${TAG} complete: kitchen pose refused, kitchen left at its previous pose`);
      ClaimController.clearStations();
    }

    const stations: ClaimedStationInfo[] = [];
    for (const c of this.claims) {
      const o = ClaimController.buildStation(c.role, c.position, c.normal);
      if (!o) continue;
      const w = o.getTransform().getWorldPosition();
      stations.push({
        role: c.role,
        name: o.name,
        position: w,
        localPosition: o.getTransform().getLocalPosition(),
        normal: c.normal,
      });
    }
    this.clearMarks();
    const pose = kitchen.getPose();
    print(
      `${TAG} kitchen claimed: root ${fmt(pose.position)} yaw ${(this.yawDeg(pose.rotation)).toFixed(1)} deg; ` +
        stations.map((s) => `${s.name} world ${fmt(s.position)} local ${fmt(s.localPosition)}`).join("; ")
    );
    const warmOnly = this.warmOnly;
    this.warmOnly = false;
    this.emitState("COMPLETE");
    this.bus.emit("KITCHEN_CLAIMED", {
      stations,
      rootPosition: pose.position,
      rootRotation: pose.rotation,
      surface: this.surfaceMode,
      warmOnly,
    });
    this.claims = [];
  }

  private yawDeg(q: quat): number {
    const x = q.multiplyVec3(vec3.right());
    return Math.atan2(-x.z, x.x) / DEG;
  }

  // ───────────────────────── per frame ─────────────────────────

  private onUpdate(): void {
    if (this.started && this.interactors.length === 0 && this.subscribeTries < 300) this.subscribeInteractors();
    if (!this.claiming || !this.reticle) return;

    // Pointing source: the pressing interactor, else a targeting one, else any active one; else the gaze ray.
    let hit: SurfaceHit | null = null;
    let it: any = this.pressInteractor;
    if (!it) {
      try {
        const t = SIK.InteractionManager.getTargetingInteractors() as any[];
        it = t.find((x) => x && x.isActive()) || null;
      } catch (e) {
        it = null;
      }
    }
    if (!it) it = this.interactors.find((x) => x && x.isActive && x.isActive() && x.startPoint) || null;
    if (it) hit = this.castFromInteractor(it);
    // Gaze fallback for the reticle only (a resting hand far from the counter gives no hit; confirm never uses it).
    if (!hit && !this.pressInteractor && this.camTr) {
      const p = this.camTr.getWorldPosition();
      const fwd = this.camTr.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)).normalize();
      hit = this.meshCast(p, p.add(fwd.uniformScale(RAY_LEN_CM))) || this.planeCast(p, fwd, false);
    }
    this.currentHit = hit;
    if (hit) this.surfaceMode = hit.mode;
    this.updateReticle(hit);
  }

  // ───────────────────────── reticle ─────────────────────────

  private buildReticle(): void {
    const root = global.scene.createSceneObject(ClaimController.RETICLE_NAME);
    this.reticle = root;

    const ring = global.scene.createSceneObject("ClaimReticle_Ring");
    ring.setParent(root);
    const rmv = ring.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = ClaimController.getRingMesh();
    this.ringMat = ClaimController.flushMaterial(SILVER, 1.0);
    rmv.mainMaterial = this.ringMat;
    this.ringObj = ring;

    const chevMesh = buildChevronMesh(1.6, 1.0, 0.32);
    this.chevronMat = ClaimController.flushMaterial(GOLD, 1.0);
    for (let i = 0; i < 3; i++) {
      const c = global.scene.createSceneObject(`ClaimReticle_Chevron_${i}`);
      c.setParent(ring);
      const a = (i / 3) * Math.PI * 2 + Math.PI; // first chevron on the far side
      c.getTransform().setLocalPosition(new vec3(Math.sin(a) * CHEVRON_R, 0, Math.cos(a) * CHEVRON_R));
      c.getTransform().setLocalRotation(quat.angleAxis(a, vec3.up())); // -Z tip -> points to the centre
      const r = c.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      r.mesh = chevMesh;
      r.mainMaterial = this.chevronMat;
      this.chevrons.push(c);
    }

    const dotMesh = buildAnnulusMesh(0.06, DOT_R, 8);
    for (let i = 0; i < 5; i++) {
      const d = global.scene.createSceneObject(`ClaimReticle_Dot_${i}`);
      d.setParent(ring);
      const r = d.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      r.mesh = dotMesh;
      const m = ClaimController.flushMaterial(SILVER, 0.6);
      r.mainMaterial = m;
      this.dots.push(d);
      this.dotMats.push(m);
    }

    const label = createWorldLabel(root, "ClaimReticle_Caption", "", CAPTION_SIZE, new vec4(0.97, 0.98, 1.0, 1.0), CAPTION_W, CAPTION_H);
    label.root.getTransform().setLocalPosition(new vec3(0, CAPTION_Y, 0));
    label.text.horizontalOverflow = HorizontalOverflow.Wrap;
    label.text.depthTest = false;
    this.captionRoot = label.root;
    this.caption = label.text;
    HeadPoseBillboard.register(label.root); // yaw-billboarded caption; the ring itself stays flush

    root.enabled = false;
  }

  private setReticleVisible(v: boolean): void {
    if (this.reticle) this.reticle.enabled = v;
  }

  private flash(text: string): void {
    this.message = text;
    this.messageUntil = getTime() + MESSAGE_S;
  }

  private updateReticle(hit: SurfaceHit | null): void {
    const root = this.reticle!;
    const now = getTime();
    let invalid = "";
    let undoHover = false;
    if (hit) {
      invalid = this.validate(hit.position, hit.normal);
      const last = this.claims.length > 0 ? this.claims[this.claims.length - 1] : null;
      if (last && now - last.time <= UNDO_WINDOW_S && hit.position.distance(last.position) <= UNDO_RADIUS_CM) {
        undoHover = true;
        invalid = "";
      }
    }

    const camPos = this.camTr ? this.camTr.getWorldPosition() : HeadPoseBillboard.cameraWorldPos();
    if (hit) {
      root.getTransform().setWorldPosition(hit.position);
      root.getTransform().setWorldRotation(quat.quatIdentity());
      // Ring flush to the normal; yawed so the progress dots sit on the cook's side. Never billboarded.
      const n = hit.normal;
      const tilt = quat.rotationFromTo(vec3.up(), n);
      const toCam = camPos.sub(hit.position);
      const yaw = toCam.x * toCam.x + toCam.z * toCam.z > 1e-6 ? Math.atan2(toCam.x, toCam.z) : 0;
      const rt = this.ringObj!.getTransform();
      rt.setLocalRotation(tilt.multiply(quat.angleAxis(yaw, vec3.up())));
      rt.setLocalPosition(n.uniformScale(RING_LIFT));
      this.ringObj!.enabled = true;
    } else {
      // No surface: caption floats 70 cm ahead, a little low; no ring.
      let p = camPos.add(new vec3(0, -25, -70));
      if (this.camTr) {
        const f = this.camTr.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
        const flat = f.x * f.x + f.z * f.z > 1e-6 ? new vec3(f.x, 0, f.z).normalize() : new vec3(0, 0, -1);
        p = camPos.add(flat.uniformScale(70)).add(new vec3(0, -25, 0));
      }
      root.getTransform().setWorldPosition(p);
      this.ringObj!.enabled = false;
    }

    // Colours (light only)
    const pulse = 0.82 + 0.18 * Math.sin(now * 2 * Math.PI);
    if (this.ringMat) tint(this.ringMat, invalid !== "" ? CORAL : undoHover ? AMBER : SILVER, 1.0);
    if (this.chevronMat) tint(this.chevronMat, invalid !== "" ? CORAL : GOLD, pulse);
    for (let i = 0; i < this.chevrons.length; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI;
      const r = CHEVRON_R - 0.5 * (0.5 + 0.5 * Math.sin(now * 4));
      this.chevrons[i].getTransform().setLocalPosition(new vec3(Math.sin(a) * r, 0, Math.cos(a) * r));
    }

    // Progress dots (one per spot in this pass)
    const total = this.queue.length;
    const x0 = -((total - 1) * DOT_SPACING) / 2;
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];
      const on = i < total;
      if (d.enabled !== on) d.enabled = on;
      if (!on) continue;
      d.getTransform().setLocalPosition(new vec3(x0 + i * DOT_SPACING, 0.02, DOT_Z));
      if (i < this.claims.length) tint(this.dotMats[i], EMERALD, 1.0);
      else if (i === this.claims.length) tint(this.dotMats[i], GOLD, pulse);
      else tint(this.dotMats[i], SILVER, 0.55);
    }

    // Caption
    let text = "";
    if (now < this.messageUntil && this.message !== "") text = this.message;
    else if (!hit) text = "Look at your counter.";
    else if (invalid !== "") text = invalid;
    else if (undoHover) text = "Pinch again to undo";
    else {
      const role = this.getNextRole();
      text = role ? ROLE_INFO[role].prompt : "";
    }
    if (this.caption && this.caption.text !== text) this.caption.text = text;
    if (this.caption) {
      const warn = text === "Find a flat spot." || text === "Look at your counter." || text.indexOf("Too close") === 0 || text.indexOf("Keep spots") === 0;
      const c = warn ? CORAL : [0.97, 0.98, 1.0];
      this.caption.textFill.color = new vec4(c[0], c[1], c[2], 1.0);
    }
  }

  private buildMark(c: ClaimRecord): SceneObject {
    let parent: SceneObject | null = null;
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i);
      if (o.name === ClaimController.MARKS_NAME) parent = o;
    }
    if (!parent) parent = global.scene.createSceneObject(ClaimController.MARKS_NAME);
    const o = global.scene.createSceneObject(`ClaimMark_${c.role}`);
    o.setParent(parent);
    const t = o.getTransform();
    t.setWorldPosition(c.position.add(c.normal.uniformScale(RING_LIFT)));
    t.setWorldRotation(quat.rotationFromTo(vec3.up(), c.normal));
    const r = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    r.mesh = ClaimController.getRingMesh();
    r.mainMaterial = ClaimController.getRoleMaterial(c.role);
    return o;
  }

  private clearMarks(): void {
    for (const m of this.marks) if (alive(m)) m.destroy();
    this.marks = [];
  }

  private emitState(reason: "BEGIN" | "CLAIM" | "UNDO" | "CANCEL" | "COMPLETE" | "WARM"): void {
    this.bus.emit("CLAIM_STATE_CHANGED", {
      claiming: this.claiming,
      nextRole: this.getNextRole(),
      claimed: this.claims.length,
      total: this.queue.length,
      reason,
    });
  }
}
