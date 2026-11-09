/**
 * AttentionDirector.ts
 * MiseFlow AR v7, Stage 4 (Plan D6): the attention director. A 37 degree view misses alerts, so out-of-view
 * attention is called by sound and an edge arrow (the organizer's own prescription).
 *
 * ONE alert at a time. Priority: heat guard (HEAT_GUARD event, DRIFT_RECORDED), then a step that starts at an off-view
 * station, then a timer under 10 s. A higher priority preempts the active alert (the old one goes back to the queue);
 * a lower one waits. ALERT_RAISED { stationId, kind, hint } / ALERT_RESOLVED { stationId, how } go on the bus: the
 * StationTargetHub grants the alert slot (coral Open card) and GazeEdgeBeacon points the edge arrow at the station.
 *
 * Chime: a 0.4 s two-tone (660 Hz then 880 Hz) synthesised locally (Assets/Audio/AttentionChime.wav, pure maths, no
 * samples, no third-party audio), played from an AudioComponent placed at the station's world position with spatial
 * audio on. It repeats every 8 s while the alert is unresolved and never more than one chime per 8 s across alerts.
 *
 * Resolved when gaze is within 15 deg of the station for 0.5 s ("GAZE"), a hand arrives (HAND_AT_STATION: "HAND") or
 * Done is pinched at that station (STEP_DONE_PINCHED: "DONE"). Reset clears everything ("RESET"); non-heat alerts
 * expire after 60 s so a forgotten step never chimes forever.
 *
 * Test hooks: raiseTestAlert(stationId, kind), clearAlerts(), getActiveAlert(), getChimeCount(), getLastChimeTime().
 * The gaze angle uses GazeEdgeBeacon.offAxisDegTo, so setSimulatedCameraYaw on the beacon steers both.
 *
 * Self-contained, no @input; created by MiseFlowSpatialUI.ensureHeroComponents.
 */
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { ChoreographyDAG } from "./ChoreographyDAG";
import { GazeEdgeBeacon } from "./GazeEdgeBeacon";
import { HandZoneSensor } from "./HandZoneSensor";
import { StepEngine } from "./StepEngine";
import { CookEvents } from "./Cook/CookWorld";
import { findSceneCamera } from "./StudioCardKit";

const TAG = "[AttentionDirector]";
const DEG = Math.PI / 180;

export const CHIME_INTERVAL_SEC = 8;
export const GAZE_RESOLVE_DEG = 15;
export const OFF_VIEW_DEG = 20;
const GAZE_RESOLVE_DWELL_SEC = 0.5;
const EXPIRE_SEC = 60;
const PENDING_MAX_AGE_SEC = 30;
const TIMER_POLL_SEC = 0.25;

export interface ActiveAlert {
  stationId: string;
  kind: string;
  raisedAt: number;
}

interface PendingAlert extends ActiveAlert {}

function priorityOf(kind: string): number {
  if (kind === "HEAT_GUARD" || kind === "DRIFT") return 3;
  if (kind === "STEP_START") return 2;
  return 1;
}

function hintOf(kind: string): string {
  switch (kind) {
    case "HEAT_GUARD":
      return "Check the heat";
    case "DRIFT":
      return "Verify low heat";
    case "STEP_START":
      return "Next step here";
    case "TIMER_UNDER_10":
      return "Timer ending";
    default:
      return "Look here";
  }
}

function ev(name: string): MiseFlowEventType {
  return name as unknown as MiseFlowEventType;
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

function wrap180(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

@component
export class AttentionDirector extends BaseScriptComponent {
  static readonly OBJECT_NAME = "AttentionDirector";
  private static instance: AttentionDirector | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private started: boolean = false;

  private active: ActiveAlert | null = null;
  private pending: PendingAlert[] = [];
  private gazeT: number = 0;
  private nextChimeAt: number = 0;
  private chimeCount: number = 0;
  private lastChimeTime: number = -1;
  private chimeAudio: AudioComponent | null = null;
  private chimeObj: SceneObject | null = null;

  private beacon: GazeEdgeBeacon | null = null;
  private dag: ChoreographyDAG | null = null;
  private refsAt: number = -10;
  private timerPollT: number = 0;
  private timerRaised: boolean = false;
  private lastReal: number = -1;

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): AttentionDirector | null {
    const c = AttentionDirector.instance;
    return c && !isNull(c) && !isNull(c.getSceneObject()) ? c : null;
  }

  /** Creates (idempotent) the scene-root "AttentionDirector" object plus this component. */
  public static ensure(): AttentionDirector {
    const existing = AttentionDirector.getInstance();
    if (existing) return existing;
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i);
      if (o.name !== AttentionDirector.OBJECT_NAME) continue;
      const comp = o.getComponent(AttentionDirector.getTypeName()) as AttentionDirector;
      if (comp) {
        AttentionDirector.instance = comp;
        return comp;
      }
    }
    const obj = global.scene.createSceneObject(AttentionDirector.OBJECT_NAME);
    const comp = obj.createComponent(AttentionDirector.getTypeName()) as AttentionDirector;
    if (!AttentionDirector.instance) AttentionDirector.instance = comp;
    return AttentionDirector.instance!;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    AttentionDirector.instance = this;
    this.createEvent("OnStartEvent").bind(() => this.start());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (AttentionDirector.instance === this) AttentionDirector.instance = null;
    });
  }

  private listen(name: string, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`${TAG} ${name} handler error: ${e}`);
      }
    };
    this.bus.on(ev(name), safe);
    this.handlers.push({ ev: ev(name), cb: safe });
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.buildChime();
    this.listen("HEAT_GUARD", (d?: any) => this.raise(String((d && d.stationId) || "SKILLET"), "HEAT_GUARD"));
    this.listen("DRIFT_RECORDED", () => this.raise("SKILLET", "DRIFT"));
    this.listen("HOLD_CONFIRMED", () => this.dropKind("DRIFT", "HOLD"));
    this.listen("STEP_STARTED", (d?: any) => this.onLegacyStep(d));
    this.listen(CookEvents.STEP_STARTED, (d?: any) => {
      const id = d && d.equipmentId ? String(d.equipmentId) : "";
      if (id) this.raiseIfOffView(id, "STEP_START");
    });
    this.listen("STEP_DONE_PINCHED", (d?: any) => {
      if (this.active && d && String(d.stationId) === this.active.stationId) this.resolve("DONE");
    });
    this.listen("HAND_AT_STATION", (d?: any) => {
      if (this.active && d && String(d.stationId) === this.active.stationId) this.resolve("HAND");
    });
    this.listen("RESET_REQUESTED", () => this.clearAlerts("RESET"));
    print(`${TAG} ready: chime every ${CHIME_INTERVAL_SEC} s while unresolved, gaze resolve ${GAZE_RESOLVE_DEG} deg`);
  }

  private buildChime(): void {
    try {
      const obj = global.scene.createSceneObject("AttentionChimeAudio");
      obj.setParent(this.getSceneObject());
      const audio = obj.createComponent("Component.AudioComponent") as AudioComponent;
      audio.audioTrack = requireAsset("../Audio/AttentionChime.wav") as AudioTrackAsset;
      audio.volume = 1.0;
      try {
        audio.playbackMode = Audio.PlaybackMode.LowLatency; // immediate attention cue
      } catch (e) {
        // default playback mode
      }
      try {
        audio.spatialAudio.enabled = true;
        audio.spatialAudio.distanceEffect.enabled = true;
        audio.spatialAudio.distanceEffect.type = Audio.DistanceCurveType.Linear;
        audio.spatialAudio.distanceEffect.minDistance = 30;
        audio.spatialAudio.distanceEffect.maxDistance = 400;
      } catch (e) {
        print(`${TAG} spatial audio settings unavailable: ${e}`);
      }
      this.chimeObj = obj;
      this.chimeAudio = audio;
      // Spatial audio needs a listener: a component on the camera object (nothing is parented to the camera).
      try {
        const cam = findSceneCamera();
        const camObj = cam ? cam.getSceneObject() : null;
        if (camObj && !camObj.getComponent("Component.AudioListenerComponent")) {
          camObj.createComponent("Component.AudioListenerComponent");
          print(`${TAG} added an AudioListenerComponent to the camera object for spatial audio`);
        }
      } catch (e) {
        print(`${TAG} audio listener unavailable: ${e}`);
      }
    } catch (e) {
      print(`${TAG} chime audio unavailable (${e}); alerts stay visual`);
    }
  }

  // ───────────────────────── public API ─────────────────────────

  public getActiveAlert(): ActiveAlert | null {
    return this.active ? { stationId: this.active.stationId, kind: this.active.kind, raisedAt: this.active.raisedAt } : null;
  }

  public getPendingCount(): number {
    return this.pending.length;
  }

  public getChimeCount(): number {
    return this.chimeCount;
  }

  /** getTime() of the last chime, -1 when none has played. */
  public getLastChimeTime(): number {
    return this.lastChimeTime;
  }

  public isChimePlaying(): boolean {
    try {
      return !!this.chimeAudio && this.chimeAudio.isPlaying();
    } catch (e) {
      return false;
    }
  }

  /** Test / dev hook: raises an alert exactly like a real source (no off-view check). */
  public raiseTestAlert(stationId: string, kind: string): void {
    this.raise(stationId, kind);
  }

  /** Test / dev hook: resolves the active alert and empties the queue. */
  public clearAlerts(how: string = "CLEARED"): void {
    this.pending = [];
    this.timerRaised = false;
    if (this.active) this.resolve(how);
    this.pending = [];
  }

  // ───────────────────────── sources ─────────────────────────

  private onLegacyStep(d?: any): void {
    const se = StepEngine.getInstance();
    if (!se || !d || typeof d.index !== "number") return;
    const s = se.getSteps()[d.index];
    if (s && s.station) this.raiseIfOffView(String(s.station), "STEP_START");
  }

  private raiseIfOffView(stationId: string, kind: string): void {
    const pos = this.stationPos(stationId);
    if (!pos) return;
    if (this.gazeErrDeg(pos) > OFF_VIEW_DEG) this.raise(stationId, kind);
  }

  private pollTimers(): void {
    const dag = this.dag;
    if (!dag) return;
    const rem = dag.getSkilletRemaining();
    const activeTask = dag.getTaskState("skillet_sear_skin") === "ACTIVE";
    if (!activeTask || rem > 10 || rem <= 0) {
      if (!activeTask || rem > 10) this.timerRaised = false;
      return;
    }
    if (this.timerRaised) return;
    this.timerRaised = true;
    this.raiseIfOffView("SKILLET", "TIMER_UNDER_10");
  }

  // ───────────────────────── alert state machine ─────────────────────────

  private raise(stationId: string, kind: string): void {
    if (!stationId) return;
    const a: ActiveAlert = { stationId, kind, raisedAt: getTime() };
    if (!this.active) {
      this.activate(a);
      return;
    }
    if (this.active.stationId === stationId) {
      // same station: only a higher priority changes the kind
      if (priorityOf(kind) > priorityOf(this.active.kind)) {
        this.active.kind = kind;
        this.bus.emit("ALERT_RAISED", { stationId, kind, hint: hintOf(kind) });
      }
      return;
    }
    if (priorityOf(kind) > priorityOf(this.active.kind)) {
      const old = this.active;
      this.resolve("PREEMPTED", false);
      this.queue({ stationId: old.stationId, kind: old.kind, raisedAt: old.raisedAt });
      this.activate(a);
      return;
    }
    this.queue(a);
  }

  private queue(a: PendingAlert): void {
    const i = this.pending.findIndex((p) => p.stationId === a.stationId);
    if (i >= 0) {
      if (priorityOf(a.kind) > priorityOf(this.pending[i].kind)) this.pending[i] = a;
      return;
    }
    this.pending.push(a);
  }

  private activate(a: ActiveAlert): void {
    this.active = a;
    this.gazeT = 0;
    // never more than one chime per 8 s, across alerts too
    const now = getTime();
    const earliest = this.lastChimeTime < 0 ? now : this.lastChimeTime + CHIME_INTERVAL_SEC;
    this.nextChimeAt = Math.max(now, earliest);
    print(`${TAG} ALERT_RAISED ${a.stationId} ${a.kind}`);
    this.bus.emit("ALERT_RAISED", { stationId: a.stationId, kind: a.kind, hint: hintOf(a.kind) });
  }

  private resolve(how: string, promote: boolean = true): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.gazeT = 0;
    print(`${TAG} ALERT_RESOLVED ${a.stationId} ${a.kind} (${how})`);
    this.bus.emit("ALERT_RESOLVED", { stationId: a.stationId, how });
    if (promote) this.promoteNext();
  }

  private promoteNext(): void {
    const now = getTime();
    this.pending = this.pending.filter((p) => now - p.raisedAt <= PENDING_MAX_AGE_SEC);
    if (this.pending.length === 0 || this.active) return;
    let bi = 0;
    for (let i = 1; i < this.pending.length; i++) {
      if (priorityOf(this.pending[i].kind) > priorityOf(this.pending[bi].kind)) bi = i;
    }
    const next = this.pending.splice(bi, 1)[0];
    this.activate({ stationId: next.stationId, kind: next.kind, raisedAt: now });
  }

  private dropKind(kind: string, how: string): void {
    this.pending = this.pending.filter((p) => p.kind !== kind);
    if (this.active && this.active.kind === kind) this.resolve(how);
  }

  // ───────────────────────── gaze and chime ─────────────────────────

  private resolveRefs(): void {
    const now = getTime();
    if (now - this.refsAt < 1.0) return;
    this.refsAt = now;
    if (!this.beacon || isNull(this.beacon)) {
      const layer = findInScene("DiegeticLayer");
      this.beacon = layer ? (layer.getComponent(GazeEdgeBeacon.getTypeName()) as GazeEdgeBeacon) : null;
    }
    if (!this.dag || isNull(this.dag)) {
      const st = findInScene("StationsRoot");
      this.dag = st ? (st.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG) : null;
    }
  }

  private stationPos(stationId: string): vec3 | null {
    const s = HandZoneSensor.getInstance();
    return s ? s.getStationWorldPos(stationId) : null;
  }

  /** Absolute yaw error (degrees) between the gaze and the station; 180 when unknown. */
  private gazeErrDeg(pos: vec3): number {
    this.resolveRefs();
    if (this.beacon && !isNull(this.beacon)) return Math.abs(this.beacon.offAxisDegTo(pos));
    const cam = findSceneCamera();
    if (!cam) return 180;
    const tr = cam.getSceneObject().getTransform();
    const p = tr.getWorldPosition();
    const look = tr.getWorldRotation().multiplyVec3(new vec3(0, 0, -1));
    const camYaw = Math.atan2(look.x, -look.z) / DEG;
    const yaw = Math.atan2(pos.x - p.x, -(pos.z - p.z)) / DEG;
    return Math.abs(wrap180(yaw - camYaw));
  }

  private playChime(pos: vec3 | null): void {
    this.chimeCount++;
    this.lastChimeTime = getTime();
    if (this.chimeObj && pos) this.chimeObj.getTransform().setWorldPosition(pos);
    try {
      if (this.chimeAudio) this.chimeAudio.play(1);
    } catch (e) {
      print(`${TAG} chime play failed: ${e}`);
    }
    print(`${TAG} chime #${this.chimeCount} at ${this.active ? this.active.stationId : "?"}`);
  }

  private onUpdate(): void {
    if (!this.started) return;
    const now = getTime();
    const dt = this.lastReal < 0 ? Math.min(0.1, getDeltaTime()) : Math.max(0, Math.min(1.0, now - this.lastReal));
    this.lastReal = now;

    this.timerPollT += dt;
    if (this.timerPollT >= TIMER_POLL_SEC) {
      this.timerPollT = 0;
      this.resolveRefs();
      this.pollTimers();
    }

    const a = this.active;
    if (!a) return;
    const pos = this.stationPos(a.stationId);
    if (!pos) return;
    const err = this.gazeErrDeg(pos);

    if (err < GAZE_RESOLVE_DEG) {
      this.gazeT += dt;
      if (this.gazeT >= GAZE_RESOLVE_DWELL_SEC) {
        this.resolve("GAZE");
        return;
      }
    } else {
      this.gazeT = 0;
    }

    if (priorityOf(a.kind) < 3 && now - a.raisedAt > EXPIRE_SEC) {
      this.resolve("EXPIRED");
      return;
    }

    // the chime calls attention, so it only plays while the station is out of the gaze cone
    if (now >= this.nextChimeAt && err >= GAZE_RESOLVE_DEG) {
      this.playChime(pos);
      this.nextChimeAt = now + CHIME_INTERVAL_SEC;
    }
  }
}
