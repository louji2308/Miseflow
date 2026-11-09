/**
 * ScheduleRail.ts
 * MiseFlow AR v7, Stage 5 (tasks 5.1-5.5): the physical schedule rail, the hero feature.
 *
 * Every DAG task is a puck sliding along a lane of a "pass rail" (the ticket rail of a kitchen pass): a trough with
 * four lanes (BURNER_L sear, BURNER_R sauce, BOARD prep, PLATE plating) standing at the front edge of the counter and
 * leaning back 60 deg so the cook reads it face-on from the recording pose. Puck length = task duration x scale, puck
 * x-start = scheduled start x scale (ScheduleModel through ChoreographyDAG.getScheduleResult). Lateness (injected
 * drift or the cook clock running past plan) grows a puck; downstream pucks are pulled later by their DAG targets and
 * by cross-lane tethers; the sear puck is PINNED (static body: nothing pushes it) and a HEAT_GUARD hold fence in the
 * sauce lane turns the first push against the pinned sear into a HEAT_GUARD event, a coral ring and a "hold" hint.
 *
 * Frame: the rail root is a child of KitchenAnchorRoot at kitchen-local (-RAIL_LEN/2, 0, BASE_Z) rotated TILT_DEG
 * about +X. Rail-local: +X along the rail (time), +Y out of the board face (toward the cook's eye), +Z down the slope
 * toward the base lip. Row centres sit at negative z (up the board). Kitchen-local positions for LEAF come from
 * KitchenAnchorRoot.worldToKitchen.
 *
 * Why tilted (deviation from the flat trough of docs/v7/notes/stage5-rail-design.md 3.3): the FOV budget band is
 * kitchen z -10..10 and the slab front edge is z 10.5 with the plate prop at z 4.5, so a flat 22 cm deep trough in
 * front of the stations cannot fit; a 60 deg board 11.6 cm deep occupies kitchen z 4.5..10.3 and y 0..10 and is far
 * more readable from the -30 deg recording pitch than a foreshortened flat trough.
 *
 * Backends (same object names and API):
 *   PHYSICS   the rail root carries its own Physics.WorldComponent with a runtime WorldSettingsAsset (simulationRate
 *             240, absoluteSpeedLimit 100 cm/s, zero gravity): pucks are dynamic BodyComponents driven by velocity
 *             (nothing writes a dynamic body's transform), the pinned sear and the fence are static colliders, the
 *             HEAT_GUARD contact is a real onCollisionEnter on the sauce puck.
 *   KINEMATIC chosen automatically when the physics smoke test fails (bodies do not move / fly off) or forced through
 *             forceBackend(): the same spring law integrated in script, contacts computed analytically per lane.
 *
 * Self-contained, no @input; created by MiseFlowSpatialUI.ensureHeroComponents (ScheduleRail.ensure()).
 */
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { KitchenAnchorRoot } from "./KitchenAnchorRoot";
import { ChoreographyDAG } from "./ChoreographyDAG";
import { RailLane, ScheduledTask, ScheduleResult, secPerCmFor, PLAN_SPAN_CM } from "./ScheduleModel";
import { MeshAcc, makePbrMaterial, makeEmissiveMaterial } from "./StationPropsBuilder";
import { KIT, kitText } from "./StudioCardKit";

const TAG = "[Rail]";

export type RailBackend = "PHYSICS" | "KINEMATIC";

// ───────────────────────── geometry (rail-local cm) ─────────────────────────
export const RAIL_LEN_CM = 48; // kitchen x -24..24 (FOV band is 50 cm wide)
export const TILT_DEG = 60; // board leans back 60 deg from the counter
export const BASE_Z_CM = 9.6; // kitchen-local z of the base lip (plate rim ends at 9.0; the bottom-row labels must stay inside the FOV band z <= 10)
const ROW_PITCH = 2.8;
const LANE_W = 2.4;
const LIP_T = 0.4;
const LIP_H = 0.9;
const FLOOR_T = 0.6;
const PUCK_W = 2.0;
const PUCK_H = 1.0;
const PUCK_HOVER_Y = 0.15 + PUCK_H / 2; // 0.65
const PUCK_GAP = 0.2; // dependency gap at the right end
const PUCK_MIN_LEN = 4.0;
const HOLD_TOL_SEC = 3.0; // fence stands this far past the pinned end
/** Lane order from the base (bottom row, nearest the cook) up the board. */
const LANE_ORDER: RailLane[] = ["PLATE", "BOARD", "BURNER_R", "BURNER_L"];
const BOARD_DEPTH = LANE_ORDER.length * ROW_PITCH + LIP_T; // 11.6

// ───────────────────────── drive law ─────────────────────────
const K_SPRING = 12; // 1/s
const V_MAX = 40; // cm/s
const A_MAX = 400; // cm/s^2
const SMOKE_SEC = 1.0;
const SMOKE_MIN_PROGRESS_CM = 1.0;
const EJECT_CM = 3.0;
const READBACK_DEAD_CM = 0.5;
const READBACK_DEAD_SEC = 0.25;
const SETTLED_EX_CM = 0.1;
const SETTLED_VX = 0.5;
const MESH_REBUILD_CM = 0.1;

const SHORT_TITLE = 14;

// ───────────────────────── helpers ─────────────────────────
function alive(o: any): boolean {
  return !!o && !isNull(o);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function laneZ(lane: RailLane): number {
  const i = Math.max(0, LANE_ORDER.indexOf(lane));
  return -(LIP_T + LANE_W / 2 + i * ROW_PITCH); // -1.6, -4.4, -7.2, -10.0
}

function laneTint(lane: RailLane): vec3 {
  switch (lane) {
    case "BOARD":
      return new vec3(0.18, 0.86, 0.96); // cyan prep
    case "BURNER_L":
      return new vec3(1.0, 0.62, 0.2); // amber sear
    case "BURNER_R":
      return new vec3(0.95, 0.78, 0.3); // gold sauce
    default:
      return new vec3(0.78, 0.8, 0.84); // silver plate
  }
}

function shortTitle(s: string): string {
  const t = (s || "").trim();
  return t.length > SHORT_TITLE ? t.substring(0, SHORT_TITLE - 1).trim() + "." : t;
}

interface Puck {
  id: string;
  lane: RailLane;
  obj: SceneObject;
  visual: SceneObject;
  rmv: RenderMeshVisual;
  label: Text;
  lock: SceneObject | null;
  body: BodyComponent | null; // PHYSICS backend only
  isStatic: boolean;
  lengthCm: number; // visual / collider length
  targetXStart: number;
  // kinematic state (rail-local)
  kx: number;
  ky: number;
  kz: number;
  vx: number;
  // read-back dead zone
  offSince: number;
  // physics smoke test
  spawnX: number;
}

interface Tether {
  u: string;
  d: string;
  obj: SceneObject;
  rmv: RenderMeshVisual;
  lastKey: string;
  amber: boolean;
}

@component
export class ScheduleRail extends BaseScriptComponent {
  static readonly ROOT_NAME = "ScheduleRail";
  static readonly TROUGH_NAME = "RailTrough";
  static readonly FENCE_NAME = "RailHeatGuardFence";
  static readonly RING_NAME = "RailHeatGuardRing";
  static readonly HEAT_GUARD_HINT = "Lower to hold";
  /** Physics debug wireframes (keep OFF for gate screenshots). */
  static DEBUG_DRAW = false;

  private static instance: ScheduleRail | null = null;
  private static preferredBackend: RailBackend = "PHYSICS";

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private backend: RailBackend = "PHYSICS";
  private backendReason: string = "default";
  private world: WorldComponent | null = null;
  private built: boolean = false;
  private rebuildPending: boolean = true;
  private buildKey: string = "";
  private buildTime: number = 0;
  private smokeDone: boolean = false;
  private driveFrames: number = 0;

  private secPerCm: number = 3;
  private pucks: Puck[] = [];
  private tethers: Tether[] = [];
  private trough: SceneObject | null = null;
  private fence: SceneObject | null = null;
  private fenceCollider: ColliderComponent | null = null;
  private fenceX: number = -1; // left face, rail-local; -1 = no fence
  private fenceArmed: boolean = false;
  private fenceRmv: RenderMeshVisual | null = null;
  private ring: SceneObject | null = null;
  private heatGuardActive: boolean = false;
  private heatGuardCount: number = 0;
  private lastHeatGuard: any = null;
  private pinnedId: string | null = null;
  private pinnedEndX: number = 0;
  private railTris: number = 0;
  private puckTris: number = 0;
  private lastReadbackAt: number = -10;
  private lastTetherBuild: number = 0;
  private handlingEvent: boolean = false;
  private lastSchedule: ScheduleResult | null = null;

  // materials (shared)
  private matFloor: Material = makePbrMaterial(0.16, 0.18, 0.22, 0.3, 0.45);
  private matLip: Material = makePbrMaterial(0.42, 0.45, 0.5, 0.35, 0.4);
  private matTetherSilver: Material = makeEmissiveMaterial(0.7, 0.74, 0.8, 0.5);
  private matTetherAmber: Material = makeEmissiveMaterial(1.0, 0.62, 0.2, 1.0);
  private matFenceIdle: Material = makeEmissiveMaterial(0.55, 0.22, 0.2, 0.35);
  private matFenceHot: Material = makeEmissiveMaterial(1.0, 0.3, 0.28, 1.0);
  private matRing: Material = makeEmissiveMaterial(1.0, 0.33, 0.3, 1.0);
  private matLock: Material = makeEmissiveMaterial(1.0, 0.9, 0.7, 0.8);
  private puckMats: { [lane: string]: Material } = {};

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): ScheduleRail | null {
    const r = ScheduleRail.instance;
    return r && alive(r) && alive(r.getSceneObject()) ? r : null;
  }

  /** Creates (idempotent) "ScheduleRail" under KitchenAnchorRoot with this component. */
  public static ensure(): ScheduleRail {
    const existing = ScheduleRail.getInstance();
    if (existing) return existing;
    const kitchen = KitchenAnchorRoot.ensure();
    const kroot = kitchen.getRoot();
    let obj: SceneObject | null = null;
    for (let i = 0; i < kroot.getChildrenCount(); i++) {
      const c = kroot.getChild(i);
      if (c.name === ScheduleRail.ROOT_NAME) obj = c;
    }
    if (!obj) {
      obj = global.scene.createSceneObject(ScheduleRail.ROOT_NAME);
      obj.setParent(kroot);
    }
    const t = obj.getTransform();
    t.setLocalPosition(new vec3(-RAIL_LEN_CM / 2, 0, BASE_Z_CM));
    t.setLocalRotation(quat.angleAxis((TILT_DEG * Math.PI) / 180, new vec3(1, 0, 0)));
    t.setLocalScale(vec3.one());
    let comp = obj.getComponent(ScheduleRail.getTypeName()) as ScheduleRail;
    if (!comp) comp = obj.createComponent(ScheduleRail.getTypeName()) as ScheduleRail;
    ScheduleRail.instance = comp;
    return comp;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    ScheduleRail.instance = this;
    this.backend = ScheduleRail.preferredBackend;
    const root = this.getSceneObject();
    if (!root.getComponent("Component.Canvas")) root.createComponent("Component.Canvas"); // world-space text host
    this.setupWorld();
    this.createEvent("OnStartEvent").bind(() => this.bindEvents());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  /** PHYSICS: the rail gets its own physics world (the root world has the Ground-Is-Zero floor at world y = 0). */
  private setupWorld(): void {
    if (this.backend !== "PHYSICS") return;
    try {
      const root = this.getSceneObject();
      let w = root.getComponent("Physics.WorldComponent") as WorldComponent;
      if (!w) w = root.createComponent("Physics.WorldComponent") as WorldComponent;
      const ws = Physics.WorldSettingsAsset.create();
      ws.gravity = new vec3(0, 0, 0);
      ws.simulationRate = 240;
      ws.absoluteSpeedLimit = 100;
      ws.relativeSpeedLimit = 0.2;
      w.worldSettings = ws;
      w.updateOrder = 1;
      this.world = w;
      print(`${TAG} physics world ready: rate 240, speed limit 100 cm/s, zero gravity`);
    } catch (e) {
      this.switchBackend("KINEMATIC", `world setup failed: ${e}`);
    }
  }

  private bindEvents(): void {
    const rebuild = () => {
      this.rebuildPending = true;
    };
    this.bus.on("RESET_REQUESTED", rebuild);
    this.bus.on("DISH_BLUEPRINT_APPLIED", rebuild);
    this.bus.on("DISH_REVEALED", rebuild);
    this.bus.on("KITCHEN_POSE_CHANGED", rebuild);
    this.bus.on("KITCHEN_CLAIMED", rebuild);
    this.bus.on("KITCHEN_RECALLED", rebuild);
    this.bus.on("KITCHEN_CONTENT_HIDDEN", rebuild);
    const release = () => this.releaseHeatGuard();
    this.bus.on("HOLD_CONFIRMED", release);
    this.bus.on("ALERT_RESOLVED", (d?: any) => {
      if (d && d.stationId === "SKILLET") this.releaseHeatGuard();
    });
  }

  // ───────────────────────── public API (LEAF) ─────────────────────────

  public isBuilt(): boolean {
    return this.built;
  }

  public getBackend(): RailBackend {
    return this.backend;
  }

  public getBackendReason(): string {
    return this.backendReason;
  }

  /** Test hook: forces a backend and rebuilds. */
  public forceBackend(b: RailBackend): void {
    ScheduleRail.preferredBackend = b;
    this.switchBackend(b, "forced");
  }

  public getRailLengthCm(): number {
    return RAIL_LEN_CM;
  }

  public getSecondsPerCm(): number {
    return this.secPerCm;
  }

  public getPuckCount(): number {
    return this.pucks.length;
  }

  public getPuckIds(): string[] {
    return this.pucks.map((p) => p.id);
  }

  /** Visual / collider length (duration x scale minus the 0.2 cm gap, at least 4 cm). -1 when unknown. */
  public getPuckLengthCm(taskId: string): number {
    const p = this.puck(taskId);
    return p ? p.lengthCm : -1;
  }

  /** Nominal length for a duration (what rail-forms compares against). */
  public nominalLengthCm(durationSec: number): number {
    return Math.max(PUCK_MIN_LEN, durationSec / this.secPerCm) - PUCK_GAP;
  }

  /** Kitchen-local position (cm) of the puck centre, or null. */
  public getPuckPositionCm(taskId: string): vec3 | null {
    const p = this.puck(taskId);
    const k = KitchenAnchorRoot.getInstance();
    if (!p || !k) return null;
    return k.worldToKitchen(p.obj.getTransform().getWorldPosition());
  }

  /** Rail-local x (cm along the rail, time axis) of the puck's left edge (its scheduled start). */
  public getPuckXStartCm(taskId: string): number {
    const p = this.puck(taskId);
    if (!p) return -1;
    return this.railLocal(p).x - p.lengthCm / 2;
  }

  /** Where the DAG wants the puck's left edge (rail-local cm). */
  public getPuckTargetXStartCm(taskId: string): number {
    const p = this.puck(taskId);
    return p ? p.targetXStart : -1;
  }

  public isPuckStatic(taskId: string): boolean {
    const p = this.puck(taskId);
    return !!p && p.isStatic;
  }

  /** DAG planned (scheduled) start in seconds. */
  public getPlannedStart(taskId: string): number {
    const dag = ChoreographyDAG.getInstance();
    return dag ? dag.getScheduledStart(taskId) : -1;
  }

  public getHeatGuardActive(): boolean {
    return this.heatGuardActive;
  }

  public getHeatGuardHint(): string {
    return ScheduleRail.HEAT_GUARD_HINT;
  }

  public getHeatGuardCount(): number {
    return this.heatGuardCount;
  }

  public getLastHeatGuard(): any {
    return this.lastHeatGuard;
  }

  /** Rail-local x of the hold fence's left face (-1 when there is no fence). */
  public getFenceXCm(): number {
    return this.fenceX;
  }

  /** Dynamic physics bodies alive in the rail world (0 under KINEMATIC). */
  public getLiveBodyCount(): number {
    let n = 0;
    for (const p of this.pucks) if (p.body && alive(p.body) && p.body.dynamic) n++;
    return n;
  }

  public getTriangleCount(): { rail: number; puckMax: number; total: number } {
    return { rail: this.railTris, puckMax: this.puckTris, total: this.railTris + this.puckTris * this.pucks.length };
  }

  /** Every puck within 0.1 cm of its target and slower than 0.5 cm/s. */
  public isSettled(): boolean {
    if (!this.built) return false;
    for (const p of this.pucks) {
      if (p.isStatic) continue;
      const x = this.railLocal(p).x - p.lengthCm / 2;
      if (Math.abs(x - p.targetXStart) > SETTLED_EX_CM) return false;
      if (Math.abs(this.measuredVx(p)) > SETTLED_VX) return false;
    }
    return true;
  }

  /** Test hook: moves the DAG cook clock forward deterministically (begins the cook if needed). */
  public advanceClock(seconds: number): void {
    const dag = ChoreographyDAG.getInstance();
    if (dag) dag.advanceCookClock(seconds);
  }

  /** Test hook: begins the cook on the DAG clock. */
  public beginCook(): void {
    const dag = ChoreographyDAG.getInstance();
    if (dag) dag.beginCook("RAIL");
  }

  // ───────────────────────── build ─────────────────────────

  private puck(id: string): Puck | null {
    for (const p of this.pucks) if (p.id === id && alive(p.obj)) return p;
    return null;
  }

  private switchBackend(b: RailBackend, reason: string): void {
    if (this.backend === b && this.built) return;
    this.backend = b;
    this.backendReason = reason;
    print(`${TAG} backend ${b} (${reason})`);
    if (b === "PHYSICS" && !this.world) this.setupWorld();
    this.rebuildPending = true;
  }

  private destroyChildrenExceptNone(): void {
    const root = this.getSceneObject();
    const kids: SceneObject[] = [];
    for (let i = 0; i < root.getChildrenCount(); i++) kids.push(root.getChild(i));
    for (const k of kids) if (alive(k)) k.destroy();
    this.pucks = [];
    this.tethers = [];
    this.trough = null;
    this.fence = null;
    this.fenceCollider = null;
    this.fenceRmv = null;
    this.ring = null;
    this.fenceX = -1;
    this.pinnedId = null;
    this.built = false;
  }

  private currentBuildKey(dag: ChoreographyDAG, sched: ScheduleResult): string {
    const k = KitchenAnchorRoot.getInstance();
    const pose = k ? k.getPose() : null;
    const pp = pose ? `${pose.position.x.toFixed(1)},${pose.position.y.toFixed(1)},${pose.position.z.toFixed(1)}` : "";
    const durs = sched.tasks.map((t) => `${t.id}:${t.planned}`).join("|");
    return `${dag.getActiveDishId()}|${durs}|${this.backend}|${pp}|${k && k.isContentHidden() ? "H" : "V"}`;
  }

  private build(dag: ChoreographyDAG, sched: ScheduleResult): void {
    this.destroyChildrenExceptNone();
    const root = this.getSceneObject();
    const baseline = dag.getBaselineSchedule();
    this.secPerCm = secPerCmFor(baseline.makespan, PLAN_SPAN_CM);
    this.railTris = 0;
    this.puckTris = 0;

    // trough: floor + lips + end stops (static colliders only under PHYSICS)
    this.trough = global.scene.createSceneObject(ScheduleRail.TROUGH_NAME);
    this.trough.setParent(root);
    this.trough.getTransform().setLocalPosition(vec3.zero());
    const floor = new MeshAcc();
    floor.box(RAIL_LEN_CM / 2, -FLOOR_T / 2, -BOARD_DEPTH / 2, RAIL_LEN_CM / 2 + 0.5, FLOOR_T / 2, BOARD_DEPTH / 2);
    this.railTris += floor.triCount();
    const floorObj = this.childMesh(this.trough, "RailFloor", floor, this.matFloor);
    this.addStaticBox(floorObj, new vec3(RAIL_LEN_CM / 2, -FLOOR_T / 2, -BOARD_DEPTH / 2), new vec3(RAIL_LEN_CM + 1, FLOOR_T, BOARD_DEPTH));
    const lips = new MeshAcc();
    for (let i = 0; i <= LANE_ORDER.length; i++) {
      const z = -(LIP_T / 2 + i * ROW_PITCH);
      lips.box(RAIL_LEN_CM / 2, LIP_H / 2, z, RAIL_LEN_CM / 2 + 0.5, LIP_H / 2, LIP_T / 2);
      const lipObj = global.scene.createSceneObject(`RailLip_${i}`);
      lipObj.setParent(this.trough);
      this.addStaticBox(lipObj, new vec3(RAIL_LEN_CM / 2, LIP_H / 2, z), new vec3(RAIL_LEN_CM + 1, LIP_H + 0.5, LIP_T));
    }
    lips.box(-0.5, LIP_H / 2, -BOARD_DEPTH / 2, 0.5, LIP_H / 2, BOARD_DEPTH / 2);
    lips.box(RAIL_LEN_CM + 0.5, LIP_H / 2, -BOARD_DEPTH / 2, 0.5, LIP_H / 2, BOARD_DEPTH / 2);
    this.railTris += lips.triCount();
    this.childMesh(this.trough, "RailLips", lips, this.matLip);
    for (const x of [-0.5, RAIL_LEN_CM + 0.5]) {
      const stop = global.scene.createSceneObject(x < 0 ? "RailStop_L" : "RailStop_R");
      stop.setParent(this.trough);
      this.addStaticBox(stop, new vec3(x, LIP_H / 2, -BOARD_DEPTH / 2), new vec3(1.0, LIP_H + 0.5, BOARD_DEPTH));
    }

    // pucks
    for (const t of sched.tasks) {
      const pinned = t.pinned && dag.isPinned(t.id);
      this.pucks.push(this.makePuck(root, t, pinned));
      if (pinned && !this.pinnedId) this.pinnedId = t.id;
    }

    // tethers: one per cross-lane dependency edge
    for (const d of sched.tasks) {
      for (const u of d.deps) {
        const up = sched.tasks.filter((x) => x.id === u)[0];
        if (!up || up.lane === d.lane) continue;
        const obj = global.scene.createSceneObject(`RailTether_${u}_${d.id}`);
        obj.setParent(root);
        const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        rmv.mainMaterial = this.matTetherSilver;
        this.tethers.push({ u, d: d.id, obj, rmv, lastKey: "", amber: false });
        this.railTris += 12;
      }
    }

    // hold fence + ring for the pinned task (dish 01: in the sauce lane past the sear's end)
    if (this.pinnedId) {
      const pin = sched.tasks.filter((x) => x.id === this.pinnedId)[0];
      const succ = sched.tasks.filter((x) => x.deps.indexOf(pin.id) >= 0)[0];
      const guardLanes: RailLane[] = [];
      if (succ) for (const o of succ.deps) {
        const ot = sched.tasks.filter((x) => x.id === o)[0];
        if (ot && ot.id !== pin.id && ot.lane !== pin.lane && guardLanes.indexOf(ot.lane) < 0) guardLanes.push(ot.lane);
      }
      this.pinnedEndX = pin.start / this.secPerCm + this.nominalLengthCm(pin.dur) + PUCK_GAP;
      if (guardLanes.length > 0) {
        this.fenceX = this.pinnedEndX + HOLD_TOL_SEC / this.secPerCm;
        const z0 = Math.min(...guardLanes.map(laneZ)) - LANE_W / 2;
        const z1 = Math.max(...guardLanes.map(laneZ)) + LANE_W / 2;
        this.fence = global.scene.createSceneObject(ScheduleRail.FENCE_NAME);
        this.fence.setParent(root);
        const fm = new MeshAcc();
        fm.box(this.fenceX + 0.3, 0.9, (z0 + z1) / 2, 0.3, 0.9, (z1 - z0) / 2);
        this.railTris += fm.triCount();
        const fv = this.childMesh(this.fence, "FenceVisual", fm, this.matFenceIdle);
        this.fenceRmv = fv.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        this.fenceCollider = this.addStaticBox(this.fence, new vec3(this.fenceX + 0.3, 0.9, (z0 + z1) / 2), new vec3(0.6, 1.8, z1 - z0));
        this.fenceArmed = true;
        // coral ring over the pinned puck's hold point (enabled only while HEAT_GUARD is active)
        this.ring = global.scene.createSceneObject(ScheduleRail.RING_NAME);
        this.ring.setParent(root);
        const rm = new MeshAcc();
        rm.arc(this.pinnedEndX - 0.6, PUCK_H + 0.3, laneZ(pin.lane), 1.3, 0.35, 0, 360, 24);
        this.railTris += rm.triCount();
        this.childMesh(this.ring, "RingVisual", rm, this.matRing);
        this.ring.enabled = false;
      }
    }

    this.heatGuardActive = false;
    this.built = true;
    this.buildTime = getTime();
    this.smokeDone = this.backend !== "PHYSICS";
    this.driveFrames = 0;
    this.buildKey = this.currentBuildKey(dag, sched);
    this.rebuildPending = false;
    this.lastSchedule = sched;
    this.updateTargets(sched, true);
    print(
      `${TAG} built dish=${dag.getActiveDishId()} pucks=${this.pucks.length} secPerCm=${this.secPerCm} backend=${this.backend} ` +
        `tris rail=${this.railTris} puck<=${this.puckTris} bodies=${this.getLiveBodyCount()} pinned=${this.pinnedId || "-"} fenceX=${this.fenceX.toFixed(2)}`
    );
    this.bus.emit("RAIL_BUILT" as any, { dishKey: dag.getActiveDishId(), puckCount: this.pucks.length, secPerCm: this.secPerCm, backend: this.backend });
  }

  private childMesh(parent: SceneObject, name: string, acc: MeshAcc, mat: Material): SceneObject {
    const o = global.scene.createSceneObject(name);
    o.setParent(parent);
    o.getTransform().setLocalPosition(vec3.zero());
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = acc.toMesh();
    rmv.mainMaterial = mat;
    return o;
  }

  /** Static box collider under PHYSICS (position via the object's transform, shape by size). */
  private addStaticBox(obj: SceneObject, centre: vec3, size: vec3): ColliderComponent | null {
    if (this.backend !== "PHYSICS") return null;
    try {
      const holder = global.scene.createSceneObject(obj.name + "_Col");
      holder.setParent(obj);
      holder.getTransform().setLocalPosition(centre);
      const c = holder.createComponent("Physics.ColliderComponent") as ColliderComponent;
      const s = Shape.createBoxShape();
      s.size = size;
      c.shape = s;
      c.fitVisual = false;
      c.debugDrawEnabled = ScheduleRail.DEBUG_DRAW;
      return c;
    } catch (e) {
      print(`${TAG} static collider failed: ${e}`);
      return null;
    }
  }

  private puckMaterial(lane: RailLane): Material {
    if (!this.puckMats[lane]) {
      const c = laneTint(lane);
      this.puckMats[lane] = makeEmissiveMaterial(c.x, c.y, c.z, 0.55, 0.1, 0.35);
    }
    return this.puckMats[lane];
  }

  private makePuck(root: SceneObject, t: ScheduledTask, pinned: boolean): Puck {
    const len = this.nominalLengthCm(t.dur);
    const xStart = t.start / this.secPerCm;
    const z = laneZ(t.lane);
    const obj = global.scene.createSceneObject(`RailPuck_${t.id}`);
    obj.setParent(root);
    // dynamic pucks spawn a little left of their slot and glide in (visible and it doubles as the physics smoke test)
    const spawnX = pinned ? xStart + len / 2 : Math.max(len / 2, xStart + len / 2 - 6);
    obj.getTransform().setLocalPosition(new vec3(spawnX, PUCK_HOVER_Y, z));
    obj.getTransform().setLocalRotation(quat.quatIdentity());

    const visual = global.scene.createSceneObject("PuckVisual");
    visual.setParent(obj);
    visual.getTransform().setLocalPosition(vec3.zero());
    const rmv = visual.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mainMaterial = this.puckMaterial(t.lane);
    const tris = this.buildPuckMesh(rmv, len, pinned);
    this.puckTris = Math.max(this.puckTris, tris);

    const label = kitText(obj, "PuckLabel", shortTitle(t.title), 26, KIT.TEXT, new vec3(0, PUCK_H / 2 + 0.06, 0), Math.max(1, len - 0.5), 1.4, { weight: 800 });
    label.getSceneObject().getTransform().setLocalRotation(quat.angleAxis(-Math.PI / 2, new vec3(1, 0, 0)));

    let lock: SceneObject | null = null;
    if (pinned) {
      const lm = new MeshAcc();
      lm.box(-len / 2 + 0.55, PUCK_H / 2 + 0.12, 0, 0.3, 0.12, 0.3);
      lock = this.childMesh(obj, "PuckLock", lm, this.matLock);
    }

    let body: BodyComponent | null = null;
    if (this.backend === "PHYSICS") {
      try {
        body = obj.createComponent("Physics.BodyComponent") as BodyComponent;
        const s = Shape.createBoxShape();
        s.size = new vec3(len, PUCK_H, PUCK_W);
        body.shape = s;
        body.fitVisual = false;
        body.dynamic = !pinned;
        body.mass = 1;
        body.damping = 0;
        body.angularDamping = 1;
        body.debugDrawEnabled = ScheduleRail.DEBUG_DRAW;
        if (!pinned) {
          body.onCollisionEnter.add((e: CollisionEnterEventArgs) => this.onPuckContact(t.id, e));
        }
      } catch (e) {
        print(`${TAG} body for ${t.id} failed: ${e}`);
        body = null;
      }
    }

    return {
      id: t.id,
      lane: t.lane,
      obj,
      visual,
      rmv,
      label,
      lock,
      body,
      isStatic: pinned,
      lengthCm: len,
      targetXStart: xStart,
      kx: spawnX,
      ky: PUCK_HOVER_Y,
      kz: z,
      vx: 0,
      offSince: -1,
      spawnX,
    };
  }

  /** Puck mesh: body box + lighter top accent strip. Returns its triangle count. */
  private buildPuckMesh(rmv: RenderMeshVisual, len: number, pinned: boolean): number {
    const m = new MeshAcc();
    m.box(0, 0, 0, len / 2, PUCK_H / 2, PUCK_W / 2);
    m.box(0, PUCK_H / 2 + 0.02, PUCK_W / 2 - 0.2, len / 2 - 0.15, 0.02, 0.12);
    if (pinned) m.box(0, PUCK_H / 2 + 0.02, -(PUCK_W / 2 - 0.2), len / 2 - 0.15, 0.02, 0.12);
    rmv.mesh = m.toMesh();
    return m.triCount();
  }

  // ───────────────────────── per-frame ─────────────────────────

  private onUpdate(): void {
    const dag = ChoreographyDAG.getInstance();
    const kitchen = KitchenAnchorRoot.getInstance();
    if (!dag || !kitchen) return;
    const sched = dag.getScheduleResult();
    if (!this.built || this.rebuildPending || this.currentBuildKey(dag, sched) !== this.buildKey) {
      if (kitchen.isContentHidden()) {
        if (this.built) this.destroyChildrenExceptNone();
        this.rebuildPending = true;
        return;
      }
      this.build(dag, sched);
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, getDeltaTime()));
    this.lastSchedule = sched;
    this.updateTargets(sched, false);
    this.drive(dt, sched);
    this.driveFrames++;
    this.updateTethers();
    this.updateHeatGuard(sched, dag);
    this.smokeTest();
    this.readBack(dag);
    this.logWhenSettled(dag);
  }

  /** Targets and lengths from the DAG schedule (a growing task keeps its left edge and grows to the right). */
  private updateTargets(sched: ScheduleResult, initial: boolean): void {
    for (const t of sched.tasks) {
      const p = this.puck(t.id);
      if (!p) continue;
      const len = this.nominalLengthCm(t.dur);
      p.targetXStart = p.isStatic ? p.targetXStart : t.start / this.secPerCm;
      if (initial) p.targetXStart = t.start / this.secPerCm;
      if (Math.abs(len - p.lengthCm) > MESH_REBUILD_CM) {
        this.resizePuck(p, len);
      }
    }
  }

  private resizePuck(p: Puck, len: number): void {
    const old = p.lengthCm;
    p.lengthCm = len;
    this.buildPuckMesh(p.rmv, len, p.isStatic);
    try {
      p.label.layoutRect = Rect.create(-Math.max(1, len - 0.5) / 2, Math.max(1, len - 0.5) / 2, -0.7, 0.7);
    } catch (e) {
      // label keeps its old rect
    }
    if (p.body && alive(p.body)) {
      try {
        const s = Shape.createBoxShape();
        s.size = new vec3(len, PUCK_H, PUCK_W);
        p.body.shape = s;
        p.body.fitVisual = false;
      } catch (e) {
        print(`${TAG} resize shape failed for ${p.id}: ${e}`);
      }
    }
    // growing keeps the left edge: a dynamic puck's centre target moves by half the growth (spring follows);
    // under KINEMATIC shift the centre now so the left edge visibly stays put
    if (this.backend === "KINEMATIC" && !p.isStatic) p.kx += (len - old) / 2;
  }

  private railLocal(p: Puck): vec3 {
    if (this.backend === "KINEMATIC" || !p.body) return new vec3(p.kx, p.ky, p.kz);
    const wp = p.obj.getTransform().getWorldPosition();
    return this.getSceneObject().getTransform().getInvertedWorldTransform().multiplyPoint(wp);
  }

  private measuredVx(p: Puck): number {
    if (this.backend === "KINEMATIC" || !p.body || !alive(p.body)) return p.vx;
    try {
      const v = p.body.velocity;
      const local = this.getSceneObject().getTransform().getWorldRotation().invert().multiplyVec3(v);
      return local.x;
    } catch (e) {
      return p.vx;
    }
  }

  private drive(dt: number, sched: ScheduleResult): void {
    const railRot = this.getSceneObject().getTransform().getWorldRotation();
    // cross-lane tether floors: a dependent puck is pulled right until it clears its predecessor's end + gap
    const floors: { [id: string]: number } = {};
    for (const te of this.tethers) {
      const u = this.puck(te.u);
      const d = this.puck(te.d);
      if (!u || !d) continue;
      const endU = this.railLocal(u).x + u.lengthCm / 2 + PUCK_GAP;
      const startD = this.railLocal(d).x - d.lengthCm / 2;
      const need = endU - startD;
      te.amber = need > 0.05;
      if (te.amber && !d.isStatic) floors[d.id] = Math.max(floors[d.id] || 0, Math.min(V_MAX, K_SPRING * need));
    }

    for (const p of this.pucks) {
      if (p.isStatic) continue;
      const pos = this.railLocal(p);
      const cx = p.targetXStart + p.lengthCm / 2;
      const ex = cx - pos.x;
      let vxd = clamp(K_SPRING * ex, -V_MAX, V_MAX);
      let vx = p.vx + clamp(vxd - p.vx, -A_MAX * dt, A_MAX * dt);
      if (floors[p.id] !== undefined) vx = Math.max(vx, floors[p.id]);
      if (Math.abs(ex) < 0.02 && Math.abs(vx) < 0.2) vx = 0;
      p.vx = vx;
      const vy = clamp(15 * (PUCK_HOVER_Y - pos.y), -10, 10);
      const vz = clamp(15 * (laneZ(p.lane) - pos.z), -10, 10);
      if (this.backend === "PHYSICS" && p.body && alive(p.body)) {
        p.body.velocity = railRot.multiplyVec3(new vec3(vx, vy, vz));
        // keep the puck lane-aligned: angular velocity toward the rail orientation
        try {
          const q = p.obj.getTransform().getWorldRotation();
          const err = railRot.multiply(q.invert());
          const ang = err.getAngle();
          if (ang > 0.002) {
            const axis = err.getAxis();
            const w = Math.min(2, 10 * ang);
            p.body.angularVelocity = axis.uniformScale(w);
          } else p.body.angularVelocity = vec3.zero();
        } catch (e) {
          // rotation correction is cosmetic
        }
      } else {
        p.kx += vx * dt;
        p.ky = PUCK_HOVER_Y;
        p.kz = laneZ(p.lane);
      }
    }

    if (this.backend === "KINEMATIC") {
      this.kinematicContacts(sched);
      for (const p of this.pucks) {
        if (p.isStatic) continue;
        const half = p.lengthCm / 2;
        p.kx = clamp(p.kx, half, RAIL_LEN_CM - half);
        p.obj.getTransform().setLocalPosition(new vec3(p.kx, p.ky, p.kz));
      }
    }
  }

  /** KINEMATIC: interval overlaps per lane (left pushes right, static pucks block) and the hold fence. */
  private kinematicContacts(sched: ScheduleResult): void {
    for (const lane of LANE_ORDER) {
      const inLane = this.pucks.filter((p) => p.lane === lane).sort((a, b) => a.kx - b.kx);
      for (let i = 0; i + 1 < inLane.length; i++) {
        const a = inLane[i];
        const b = inLane[i + 1];
        const overlap = a.kx + a.lengthCm / 2 + PUCK_GAP - (b.kx - b.lengthCm / 2);
        if (overlap <= 0) continue;
        if (!b.isStatic) {
          b.kx += overlap;
          b.vx = Math.max(b.vx, a.vx);
        } else if (!a.isStatic) {
          a.kx -= overlap;
          a.vx = Math.min(a.vx, 0);
        }
      }
    }
    if (this.fenceX > 0 && this.fenceArmed) {
      for (const p of this.pucks) {
        if (p.isStatic) continue;
        const guarded = this.fenceGuards(p.lane);
        if (!guarded) continue;
        const right = p.kx + p.lengthCm / 2;
        if (right > this.fenceX) {
          p.kx -= right - this.fenceX;
          this.triggerHeatGuard(p.id, "RAIL_ANALYTIC", this.fenceX);
        }
      }
    }
  }

  private fenceGuards(lane: RailLane): boolean {
    if (!this.fence || !alive(this.fence)) return false;
    const pin = this.pinnedId ? this.puck(this.pinnedId) : null;
    return !!pin && lane !== pin.lane && lane !== "PLATE";
  }

  private onPuckContact(id: string, e: CollisionEnterEventArgs): void {
    if (!this.fenceArmed || !this.fenceCollider || !alive(this.fenceCollider)) return;
    try {
      const other = e.collision.collider;
      if (!other || !other.isSame(this.fenceCollider)) return;
      let x = this.fenceX;
      const c = e.collision.contacts;
      if (c && c.length > 0) x = this.getSceneObject().getTransform().getInvertedWorldTransform().multiplyPoint(c[0].position).x;
      this.triggerHeatGuard(id, "RAIL_CONTACT", x);
    } catch (err) {
      print(`${TAG} contact handler: ${err}`);
    }
  }

  private triggerHeatGuard(pusherId: string, source: string, contactX: number): void {
    if (this.heatGuardActive) return;
    const dag = ChoreographyDAG.getInstance();
    this.heatGuardActive = true;
    this.heatGuardCount++;
    this.fenceArmed = false;
    if (this.fenceCollider && alive(this.fenceCollider)) {
      try {
        this.fenceCollider.intangible = true; // the fence yields: the pusher continues to its DAG target
      } catch (e) {
        // leave it solid
      }
    }
    if (this.fenceRmv && alive(this.fenceRmv)) this.fenceRmv.mainMaterial = this.matFenceHot;
    if (this.ring && alive(this.ring)) this.ring.enabled = true;
    const holdSec = dag ? dag.getHoldSec(this.pinnedId || "skillet_sear_skin") : 0;
    const payload = {
      taskId: this.pinnedId || "skillet_sear_skin",
      pusherId,
      stationId: "SKILLET",
      holdSec,
      hint: ScheduleRail.HEAT_GUARD_HINT,
      contactX,
      source,
    };
    this.lastHeatGuard = payload;
    print(`${TAG} HEAT_GUARD ${payload.taskId} hold=${holdSec.toFixed(1)} pusher=${pusherId} x=${contactX.toFixed(2)} (${source})`);
    this.handlingEvent = true;
    try {
      this.bus.emit("HEAT_GUARD", payload);
    } finally {
      this.handlingEvent = false;
    }
  }

  private releaseHeatGuard(): void {
    if (!this.heatGuardActive) return;
    this.heatGuardActive = false;
    if (this.ring && alive(this.ring)) this.ring.enabled = false;
    if (this.fenceRmv && alive(this.fenceRmv)) this.fenceRmv.mainMaterial = this.matFenceIdle;
  }

  /** Ring follows the active state; the fence re-arms once nothing sits past it. */
  private updateHeatGuard(sched: ScheduleResult, dag: ChoreographyDAG): void {
    if (this.fenceX < 0) return;
    if (!this.heatGuardActive && !this.fenceArmed) {
      let clear = true;
      for (const p of this.pucks) {
        if (p.isStatic || !this.fenceGuards(p.lane)) continue;
        if (this.railLocal(p).x + p.lengthCm / 2 > this.fenceX - 0.3) clear = false;
      }
      if (clear) {
        this.fenceArmed = true;
        if (this.fenceCollider && alive(this.fenceCollider)) {
          try {
            this.fenceCollider.intangible = false;
          } catch (e) {
            // stays intangible
          }
        }
      }
    }
  }

  private updateTethers(): void {
    const now = getTime();
    if (now - this.lastTetherBuild < 0.1) return;
    this.lastTetherBuild = now;
    for (const te of this.tethers) {
      const u = this.puck(te.u);
      const d = this.puck(te.d);
      if (!u || !d || !alive(te.obj)) continue;
      const pu = this.railLocal(u);
      const pd = this.railLocal(d);
      const x1 = pu.x + u.lengthCm / 2;
      const x2 = pd.x - d.lengthCm / 2;
      const z1 = laneZ(u.lane);
      const z2 = laneZ(d.lane);
      const key = `${x1.toFixed(1)},${x2.toFixed(1)},${te.amber ? 1 : 0}`;
      if (key === te.lastKey) continue;
      te.lastKey = key;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.max(0.3, Math.hypot(dx, dz));
      const yaw = Math.atan2(-dz, dx);
      const m = new MeshAcc();
      m.box((x1 + x2) / 2, 0.35, (z1 + z2) / 2, len / 2, 0.08, 0.1, yaw, 0);
      te.rmv.mesh = m.toMesh();
      te.rmv.mainMaterial = te.amber ? this.matTetherAmber : this.matTetherSilver;
    }
  }

  /** PHYSICS smoke test: within SMOKE_SEC the dynamic pucks must have moved toward their slots and stayed in lane. */
  private smokeTest(): void {
    if (this.smokeDone || this.backend !== "PHYSICS") return;
    const age = getTime() - this.buildTime;
    let maxProgress = 0;
    let ejected = false;
    for (const p of this.pucks) {
      if (p.isStatic) continue;
      const pos = this.railLocal(p);
      maxProgress = Math.max(maxProgress, pos.x - p.spawnX);
      if (Math.abs(pos.y - PUCK_HOVER_Y) > EJECT_CM || Math.abs(pos.z - laneZ(p.lane)) > EJECT_CM) ejected = true;
    }
    if (ejected) {
      this.smokeDone = true;
      this.switchBackend("KINEMATIC", `puck left its lane after ${age.toFixed(2)} s`);
      return;
    }
    if (age < SMOKE_SEC || this.driveFrames < 30) return;
    this.smokeDone = true;
    if (maxProgress < SMOKE_MIN_PROGRESS_CM) {
      this.switchBackend("KINEMATIC", `bodies did not move (progress ${maxProgress.toFixed(2)} cm in ${age.toFixed(2)} s)`);
    } else {
      print(`${TAG} smoke ok: progress ${maxProgress.toFixed(2)} cm in ${age.toFixed(2)} s, backend PHYSICS`);
    }
  }

  private loggedRevision: number = -1;

  /** Once per DAG schedule revision, when every puck has settled: a compact table (also RAIL_SETTLED on the bus). */
  private logWhenSettled(dag: ChoreographyDAG): void {
    const rev = dag.getScheduleRevision();
    if (rev === this.loggedRevision || !this.isSettled()) return;
    this.loggedRevision = rev;
    const parts = this.pucks.map((p) => `${p.id.split("_")[0]} ${this.getPuckXStartCm(p.id).toFixed(2)}+${p.lengthCm.toFixed(2)}${p.isStatic ? "*" : ""}`);
    print(`${TAG} settled rev=${rev} clock=${dag.getCookClockSec().toFixed(1)} ${this.backend} ${parts.join(" | ")} heatGuard=${this.heatGuardActive}`);
    this.bus.emit("RAIL_SETTLED" as any, { revision: rev, backend: this.backend });
  }

  /** Dead zone 0.5 cm / 250 ms: a stuck or displaced wait puck writes an absolute notBefore back to the DAG. */
  private readBack(dag: ChoreographyDAG): void {
    if (this.handlingEvent || !this.smokeDone) return;
    const now = getTime();
    for (const p of this.pucks) {
      if (p.isStatic) continue;
      const x = this.railLocal(p).x - p.lengthCm / 2;
      const off = x - p.targetXStart;
      const slow = Math.abs(this.measuredVx(p)) < 1;
      if (off > READBACK_DEAD_CM && slow) {
        if (p.offSince < 0) p.offSince = now;
        else if (now - p.offSince >= READBACK_DEAD_SEC && now - this.lastReadbackAt >= READBACK_DEAD_SEC) {
          const sec = x * this.secPerCm;
          const accepted = dag.setNotBefore(p.id, sec);
          this.lastReadbackAt = now;
          p.offSince = -1;
          this.bus.emit("PUCK_DISPLACED", { taskId: p.id, deltaSec: off * this.secPerCm, accepted });
          if (accepted) print(`${TAG} PUCK_DISPLACED ${p.id} +${(off * this.secPerCm).toFixed(1)} s -> notBefore ${sec.toFixed(1)} s`);
        }
      } else {
        p.offSince = -1;
      }
    }
  }
}
