/**
 * HandZoneSensor.ts
 * MiseFlow AR v7, Stage 4 (Plan D5): the hands are the sensor.
 *
 * Every tracked hand is assigned to the nearest station within 25 cm (28 cm to leave: hysteresis) and a dwell timer
 * runs per station. Arrival emits HAND_AT_STATION { stationId, hand }, leaving emits HAND_LEFT_STATION. The station
 * targets open on arrival (StationTargetHub listens) and the attention director resolves an alert on arrival.
 *
 * Stations (position of the vessel / board / plate on the counter):
 *   SKILLET, SAUCEPOT, PREP, PLATING   claimed Station_BurnerL / Station_BurnerR / Station_Board / Station_Plate when the
 *                                      kitchen is claimed, otherwise the legacy SkilletStation / SaucepotStation /
 *                                      PrepBoardStation objects, otherwise the fixed kitchen-frame point.
 *   Cook mode: StationTargetHub registers a provider with the Cook vessel / board / plate targets (setStationProvider).
 *
 * Hand sources (platform branching only through global.deviceInfoSystem.isEditor()):
 *   LEAF   setSimulatedHand(worldPos | null): one puppet hand at a world position (the only source while set).
 *   Editor the active SIK interactors: a hand interactor contributes its pinch point (startPoint), the Preview mouse
 *          its ray hit point while it targets something (raw hand events do not fire in the editor).
 *   Device SIK HandInputData (index tip, else wrist). Subscriptions are bound in OnStartEvent. Feel unproven: it
 *          compiles and is guarded, it has not run on glasses.
 *   Visible fallback everywhere: pinching a station target means "I am here" (notifyPinchHere): one HAND_AT_STATION,
 *   then HAND_LEFT_STATION one second later.
 *
 * Self-contained, no @input; created by MiseFlowSpatialUI.ensureHeroComponents.
 */
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { InteractorInputType } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { KitchenAnchorRoot } from "./KitchenAnchorRoot";
import { ClaimController } from "./ClaimController";

const TAG = "[HandZoneSensor]";

export const HAND_ZONE_ENTER_CM = 25;
export const HAND_ZONE_LEAVE_CM = 28;
const PINCH_HERE_SEC = 1.0;
const INTERACTOR_REFRESH_SEC = 1.0;

export type HandName = "left" | "right";

export interface HandStationPoint {
  id: string;
  pos: vec3;
}

/** Kitchen-frame fallback points (cm): the fixed positions of the legacy stations (burner, burner, board, plate). */
const FALLBACK_LOCAL: { [id: string]: vec3 } = {
  SKILLET: new vec3(-11.2, 1.0, -1.5),
  SAUCEPOT: new vec3(0.0, 2.0, -10.5),
  PREP: new vec3(10.5, 1.0, -3.0),
  PLATING: new vec3(0.0, 0.5, 4.5),
};
const LEGACY_OBJECT: { [id: string]: string } = {
  SKILLET: "SkilletStation",
  SAUCEPOT: "SaucepotStation",
  PREP: "PrepBoardStation",
};
const CLAIM_ROLE: { [id: string]: string } = {
  SKILLET: "BURNER_L",
  SAUCEPOT: "BURNER_R",
  PREP: "BOARD",
  PLATING: "PLATE",
};
const LEGACY_IDS = ["SKILLET", "SAUCEPOT", "PREP", "PLATING"];

interface HandSlot {
  key: string;
  hand: HandName;
  pos: vec3;
  station: string | null;
}

function alive(o: any): boolean {
  return !!o && !isNull(o);
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

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const f = findByName(parent.getChild(i), name);
    if (f) return f;
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

@component
export class HandZoneSensor extends BaseScriptComponent {
  static readonly OBJECT_NAME = "HandZoneSensor";
  private static instance: HandZoneSensor | null = null;
  private static provider: (() => HandStationPoint[] | null) | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private editor: boolean = isEditorRuntime();
  private started: boolean = false;
  private clock: number = 0;
  private lastReal: number = -1;

  private slots: HandSlot[] = [];
  private dwell: { [id: string]: number } = {};
  private atCount: { [id: string]: number } = {};
  private simHand: vec3 | null = null;
  private pinchLeaveAt: { [id: string]: number } = {};

  private legacyObjs: { [name: string]: SceneObject | null } = {};
  private interactors: any[] = [];
  private lastInteractorScan: number = -10;
  private handsFound: { [side: string]: boolean } = { left: false, right: false };
  private unsubs: (() => void)[] = [];

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): HandZoneSensor | null {
    const c = HandZoneSensor.instance;
    return c && alive(c) && alive(c.getSceneObject()) ? c : null;
  }

  /** Creates (idempotent) the scene-root "HandZoneSensor" object plus this component. */
  public static ensure(): HandZoneSensor {
    const existing = HandZoneSensor.getInstance();
    if (existing) return existing;
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i);
      if (o.name !== HandZoneSensor.OBJECT_NAME) continue;
      const comp = o.getComponent(HandZoneSensor.getTypeName()) as HandZoneSensor;
      if (comp) {
        HandZoneSensor.instance = comp;
        return comp;
      }
    }
    const obj = global.scene.createSceneObject(HandZoneSensor.OBJECT_NAME);
    const comp = obj.createComponent(HandZoneSensor.getTypeName()) as HandZoneSensor;
    if (!HandZoneSensor.instance) HandZoneSensor.instance = comp;
    return HandZoneSensor.instance!;
  }

  /** The hub registers the Cook-mode stations (return null for the default four legacy stations). */
  public static setStationProvider(p: (() => HandStationPoint[] | null) | null): void {
    HandZoneSensor.provider = p;
  }

  /** Pinching a station target means "I am here": works with or without a sensor instance. */
  public static notifyPinchHere(stationId: string): void {
    const s = HandZoneSensor.getInstance();
    if (s) s.pinchHere(stationId);
    else MiseFlowEventBus.getInstance().emit("HAND_AT_STATION", { stationId, hand: "right" });
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    HandZoneSensor.instance = this;
    this.createEvent("OnStartEvent").bind(() => this.start());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const u of this.unsubs) {
        try {
          u();
        } catch (e) {
          // ignore
        }
      }
      this.unsubs = [];
      if (HandZoneSensor.instance === this) HandZoneSensor.instance = null;
    });
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    // SIK / hand subscriptions live in OnStart. Device path: feel unproven.
    if (!this.editor) this.bindDeviceHands();
    this.bus.on("RESET_REQUESTED", () => this.onReset());
    print(`${TAG} ready (${this.editor ? "editor: interactor points + LEAF puppet" : "device: SIK hand data, feel unproven"})`);
  }

  private bindDeviceHands(): void {
    for (const side of ["left", "right"]) {
      try {
        const hand: any = SIK.HandInputData.getHand(side as any);
        if (!hand) continue;
        const u1 = hand.onHandFound.add(() => (this.handsFound[side] = true));
        const u2 = hand.onHandLost.add(() => (this.handsFound[side] = false));
        for (const u of [u1, u2]) if (typeof u === "function") this.unsubs.push(u);
      } catch (e) {
        print(`${TAG} hand ${side} events unavailable: ${e}`);
      }
    }
  }

  // ───────────────────────── public API ─────────────────────────

  /** LEAF: one puppet hand at a world position (null clears it and goes back to the real sources). */
  public setSimulatedHand(worldPos: vec3 | null): void {
    this.simHand = worldPos ? new vec3(worldPos.x, worldPos.y, worldPos.z) : null;
  }

  /** The station a hand is assigned to (null when it is not at one). Accepts "left" | "right". */
  public getHandStation(hand: HandName): string | null {
    for (const s of this.slots) if (s.hand === hand && s.station) return s.station;
    return null;
  }

  /** Seconds a hand has been at the station without a gap (0 when no hand is there). */
  public getDwellSeconds(stationId: string): number {
    return this.dwell[stationId] || 0;
  }

  public isHandAt(stationId: string): boolean {
    return (this.atCount[stationId] || 0) > 0;
  }

  /** World position of a station (claimed object, legacy object or kitchen-frame point), null when unknown. */
  public getStationWorldPos(stationId: string): vec3 | null {
    for (const p of this.getStations()) if (p.id === stationId) return p.pos;
    return null;
  }

  public getStations(): HandStationPoint[] {
    const custom = HandZoneSensor.provider ? HandZoneSensor.provider() : null;
    if (custom && custom.length > 0) return custom;
    const out: HandStationPoint[] = [];
    for (const id of LEGACY_IDS) {
      const p = this.legacyStationPos(id);
      if (p) out.push({ id, pos: p });
    }
    return out;
  }

  /** The visible fallback: a pinch on a station target. */
  public pinchHere(stationId: string): void {
    if (!stationId) return;
    this.bus.emit("HAND_AT_STATION", { stationId, hand: "right" });
    this.pinchLeaveAt[stationId] = this.clock + PINCH_HERE_SEC;
  }

  // ───────────────────────── stations ─────────────────────────

  private legacyStationPos(id: string): vec3 | null {
    const role = CLAIM_ROLE[id];
    if (role) {
      const o = ClaimController.findStation(role as any);
      if (o && alive(o)) return o.getTransform().getWorldPosition();
    }
    const name = LEGACY_OBJECT[id];
    if (name) {
      let o = this.legacyObjs[name];
      if (!alive(o)) {
        o = findInScene(name);
        this.legacyObjs[name] = o;
      }
      if (o && alive(o)) return o.getTransform().getWorldPosition();
    }
    const k = KitchenAnchorRoot.getInstance();
    const local = FALLBACK_LOCAL[id];
    if (k && local) return k.getRoot().getTransform().getWorldTransform().multiplyPoint(local);
    return null;
  }

  // ───────────────────────── hand sources ─────────────────────────

  private collectHands(): HandSlot[] {
    const out: HandSlot[] = [];
    if (this.simHand) {
      out.push({ key: "sim", hand: "right", pos: this.simHand, station: null });
      return out;
    }
    if (this.editor) this.collectEditorHands(out);
    else this.collectDeviceHands(out);
    return out;
  }

  private collectEditorHands(out: HandSlot[]): void {
    if (this.clock - this.lastInteractorScan > INTERACTOR_REFRESH_SEC) {
      this.lastInteractorScan = this.clock;
      try {
        this.interactors = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All) as any[];
      } catch (e) {
        this.interactors = [];
      }
    }
    let i = 0;
    for (const it of this.interactors) {
      i++;
      try {
        if (!it || !it.isActive()) continue;
        const type = it.inputType;
        const isHand = (type & InteractorInputType.BothHands) !== 0;
        let p: vec3 | null = null;
        if (isHand) p = it.startPoint;
        else if (it.isTargeting()) p = it.endPoint;
        if (!p) continue;
        const left = (type & InteractorInputType.LeftHand) !== 0;
        out.push({ key: `it${i}`, hand: left ? "left" : "right", pos: p, station: null });
      } catch (e) {
        // an interactor mid-teardown: skip it this frame
      }
    }
  }

  private collectDeviceHands(out: HandSlot[]): void {
    for (const side of ["left", "right"] as HandName[]) {
      try {
        const hand: any = SIK.HandInputData.getHand(side as any);
        if (!hand) continue;
        const tracked = typeof hand.isTracked === "function" ? !!hand.isTracked() : !!this.handsFound[side];
        if (!tracked) continue;
        const kp = hand.indexTip || hand.wrist;
        if (!kp || !kp.position) continue;
        out.push({ key: side, hand: side, pos: kp.position, station: null });
      } catch (e) {
        // hand data unavailable this frame
      }
    }
  }

  // ───────────────────────── frame ─────────────────────────

  private onReset(): void {
    // a Reset ends every hand presence quietly (the targets reset themselves)
    for (const s of this.slots) s.station = null;
    this.dwell = {};
    this.atCount = {};
  }

  private onUpdate(): void {
    if (!this.started) return;
    // real elapsed time (the editor preview can run at a low frame rate; dwell and timers must stay in seconds)
    const realNow = getTime();
    const dt = this.lastReal < 0 ? Math.min(0.1, getDeltaTime()) : Math.max(0, Math.min(1.0, realNow - this.lastReal));
    this.lastReal = realNow;
    this.clock += dt;

    // pinch-here pseudo presence ends
    for (const id in this.pinchLeaveAt) {
      if (this.clock >= this.pinchLeaveAt[id]) {
        delete this.pinchLeaveAt[id];
        this.bus.emit("HAND_LEFT_STATION", { stationId: id, hand: "right" });
      }
    }

    const stations = this.getStations();
    const hands = this.collectHands();
    const prev = this.slots;
    const counts: { [id: string]: number } = {};

    for (const h of hands) {
      const old = prev.find((x) => x.key === h.key);
      const prevStation = old ? old.station : null;
      let best: string | null = null;
      let bestD = 1e9;
      for (const st of stations) {
        const d = st.pos.distance(h.pos);
        if (d < bestD) {
          bestD = d;
          best = st.id;
        }
      }
      let next: string | null = null;
      if (best !== null) {
        const limit = prevStation === best ? HAND_ZONE_LEAVE_CM : HAND_ZONE_ENTER_CM;
        if (bestD <= limit) next = best;
      }
      h.station = next;
      if (next !== prevStation) {
        if (prevStation) this.bus.emit("HAND_LEFT_STATION", { stationId: prevStation, hand: h.hand });
        if (next) {
          print(`${TAG} ${h.hand} hand at ${next} (${bestD.toFixed(1)} cm)`);
          this.bus.emit("HAND_AT_STATION", { stationId: next, hand: h.hand });
        }
      }
      if (next) counts[next] = (counts[next] || 0) + 1;
    }

    // hands that disappeared while at a station
    for (const o of prev) {
      if (o.station && !hands.find((h) => h.key === o.key)) {
        this.bus.emit("HAND_LEFT_STATION", { stationId: o.station, hand: o.hand });
      }
    }

    // dwell timers: grow while any hand is at the station, reset when none is
    const nextDwell: { [id: string]: number } = {};
    for (const id in counts) nextDwell[id] = (this.dwell[id] || 0) + dt;
    this.dwell = nextDwell;
    this.atCount = counts;
    this.slots = hands;
  }
}
