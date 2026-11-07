import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { KineProvider, KineRegistry, KineTimeline, alive, dishBuilder, findByName, smooth01, stationsRootOf, stepOf, worldAabb } from "./KineRegistry";

const DEG = Math.PI / 180;
const STEP_DELAY = 0.35; // STEP_STARTED -> NOODLE_TOSS_REQUESTED (the card lands first)
const LIFT_CAP = 4.0; // strainer lift + drain (~2.2 s) cap
const TRAY_LIFT_SEC = 0.55; // no basket: the nest lifts off its tray
const HOP_SEC = 1.0; // basket / tray -> wok arc
const SWIRL_SEC = 3.5; // chopsticks / tongs helix (ToolProp.liftSwirl is 0.7 + 2.0 + 0.8 s)
const SETTLE_SEC = 0.35;
const PAN_NAMES = ["WokPan", "TawaPan", "SkilletPan"];

/**
 * NoodleLiftToss.ts (v5 K1b) - KINE_NOODLE_LIFT_TOSS
 * NOODLE_TOSS_REQUESTED (also emitted ~0.35 s after STEP_STARTED of a dish step with this kinematic, so manual play,
 * Auto Cook and the step engine share one path):
 *   1. #306 strainer basket lifts the boiled noodles / pasta out of the #305 stockpot and drains them (StarchProp
 *      stage raw -> partial); dishes without a basket lift the nest off its tray instead.
 *   2. the nest arcs into the active pan (wok / tawa / skillet) and the basket lowers back into the water.
 *   3. #334 chopsticks (else #335 tongs / #333 chuan) dip and swirl up in a 1.25-turn helix while the nest twists and
 *      lifts with them; the starch glosses partial -> finished.
 * Emits KINEMATIC_COMPLETED { kinematic: "KINE_NOODLE_LIFT_TOSS" } (~6.7 s with a basket, ~5.2 s without). The nest
 * stays in the pan for PlatingFinisher. Reset cancels. Never throws; every wait is capped.
 */
@component
export class NoodleLiftToss extends BaseScriptComponent implements KineProvider {
  private static instance: NoodleLiftToss | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private tl: KineTimeline = new KineTimeline("NoodleLiftToss");
  private done: number = 0;
  private requests: number = 0;
  private pendingT: number = -1;
  private runT: number = 0;

  // per run
  private starch: any = null; // StarchProp
  private nest: SceneObject | null = null;
  private pan: SceneObject | null = null;
  private lifted: boolean = false;
  private swirled: boolean = false;
  private hopFrom: vec3 = vec3.zero();
  private hopTo: vec3 = vec3.zero();
  private hopRot: quat = quat.quatIdentity();
  private hopScale: vec3 = vec3.one();
  private fit: number = 1;
  private nestBase: vec3 = vec3.zero();
  private lift: number = 2.0;

  public static getInstance(): NoodleLiftToss | null {
    return NoodleLiftToss.instance;
  }

  onAwake(): void {
    NoodleLiftToss.instance = this;
    KineRegistry.register("NOODLE", this);
    this.createEvent("OnStartEvent").bind(() => {
      this.listen("NOODLE_TOSS_REQUESTED", () => this.play());
      this.listen("RESET_REQUESTED", () => this.cancel());
      this.listen("STEP_STARTED", (d?: any) => {
        const s = stepOf(d);
        if (s && s.kinematic === "KINE_NOODLE_LIFT_TOSS") this.pendingT = 0;
      });
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      KineRegistry.unregister("NOODLE", this);
      if (NoodleLiftToss.instance === this) NoodleLiftToss.instance = null;
    });
  }

  // ── KineProvider ──

  public isBusy(): boolean {
    return this.tl.isRunning() || this.pendingT >= 0;
  }

  public getDoneCount(): number {
    return this.done;
  }

  public getRequestCount(): number {
    return this.requests;
  }

  public cancel(): void {
    this.tl.cancel();
    this.pendingT = -1;
    this.starch = null;
    this.nest = null;
    this.pan = null;
  }

  // ── internals ──

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[NoodleLiftToss] ${ev} handler error: ${e}`);
      }
    };
    this.bus.on(ev, safe);
    this.handlers.push({ ev: ev, cb: safe });
  }

  private onUpdate(): void {
    const dt = getDeltaTime();
    if (this.pendingT >= 0) {
      this.pendingT += dt;
      if (this.pendingT >= STEP_DELAY) {
        this.pendingT = -1;
        this.bus.emit("NOODLE_TOSS_REQUESTED", { source: "step" });
      }
    }
    if (!this.tl.isRunning()) return;
    this.runT += dt;
    if (this.tl.update(dt)) this.finish();
  }

  private finish(): void {
    this.done++;
    if (this.starch && typeof this.starch.setStageProgress === "function") {
      try {
        this.starch.setStageProgress(2);
      } catch (e) {
        // prop gone
      }
    }
    print(`[NoodleLiftToss] KINE_NOODLE_LIFT_TOSS complete in ${this.runT.toFixed(2)} s (run ${this.done})`);
    this.bus.emit("KINEMATIC_COMPLETED", { kinematic: "KINE_NOODLE_LIFT_TOSS", phase: "toss", durationSec: this.runT });
  }

  private pickStarch(b: any): any {
    const list: any[] = b && typeof b.getStarchProps === "function" ? b.getStarchProps() : [];
    let pick: any = null;
    for (const p of list) {
      if (!p || !alive(p.getObject())) continue;
      if (!pick || (pick.getAccessNumber() === 116 && p.getAccessNumber() !== 116)) pick = p;
    }
    return pick;
  }

  private findPan(root: SceneObject | null): SceneObject | null {
    for (const n of PAN_NAMES) {
      const o = findByName(root, n);
      if (o && o.isEnabledInHierarchy) return o;
    }
    return null;
  }

  private play(): void {
    this.requests++;
    if (this.tl.isRunning()) return;
    this.pendingT = -1;
    this.runT = 0;
    const b = dishBuilder();
    const root = stationsRootOf(this.getSceneObject());
    const tw = b ? b.getToolWare() : null;
    const basket = tw ? tw.getBasket() : null;
    const tool = tw ? tw.getTool(334) || tw.getTool(335) || tw.getTool(333) : null;
    this.starch = this.pickStarch(b);
    this.nest = this.starch ? this.starch.getObject() : null;
    this.pan = this.findPan(root);
    this.lifted = false;
    this.swirled = false;
    const tl = this.tl.clear();
    print(`[NoodleLiftToss] play: starch ${this.starch ? "#" + this.starch.getAccessNumber() : "none"}, basket ${basket ? "yes" : "no"}, tool ${tool ? tool.getKind() : "none"}, pan ${this.pan ? this.pan.name : "none"}`);
    if (!this.nest || !this.pan) {
      // nothing to toss: a short tool swirl (if any) keeps the beat, then complete
      tl.wait(() => this.swirled, SWIRL_SEC + 0.5, () => {
        if (!tool || !tool.liftSwirl(undefined, () => (this.swirled = true))) this.swirled = true;
      });
      tl.run();
      return;
    }
    const nest = this.nest;
    // 1. lift out of the water (basket) or off the tray
    if (basket) {
      tl.call(() => {
        if (alive(nest) && nest.getParent() !== basket.getHoldNode()) basket.holdStarch(nest);
        basket.liftOut(() => (this.lifted = true));
      });
      tl.wait(() => {
        this.stage(Math.min(1, this.runT / 2.2));
        return this.lifted;
      }, LIFT_CAP);
    } else {
      tl.add(TRAY_LIFT_SEC, (k) => this.stage(k), () => {
        const tray = findByName(nest, "StarchTray");
        if (tray) tray.enabled = false;
      });
    }
    // 2. arc into the pan, basket back into the water
    tl.add(HOP_SEC, (k) => this.hop(k), () => this.beginHop());
    tl.call(() => {
      if (basket) basket.lower();
    });
    // 3. helical toss with the hand tool
    tl.add(SWIRL_SEC, (k) => this.swirl(k), () => {
      if (tool) tool.liftSwirl(undefined, () => (this.swirled = true));
    });
    tl.add(SETTLE_SEC, (k) => this.settle(k));
    tl.run();
  }

  private stage(t: number): void {
    if (this.starch && alive(this.nest)) this.starch.setStageProgress(Math.max(0, Math.min(2, t)));
  }

  private panFloor(): { world: vec3; radius: number } {
    const b = dishBuilder();
    const pantry = b && typeof b.getPantry === "function" ? b.getPantry() : null;
    const t = pantry ? pantry.target("pan") : null;
    if (t && t.obj === this.pan) return { world: t.world, radius: t.radius * pantry.unit() };
    const tr = this.pan!.getTransform();
    return { world: tr.getWorldTransform().multiplyPoint(new vec3(0, 0.5, 0)), radius: 6 * tr.getWorldScale().x };
  }

  private beginHop(): void {
    const nest = this.nest;
    const pan = this.pan;
    if (!alive(nest) || !alive(pan)) return;
    const tray = findByName(nest, "StarchTray");
    if (tray) tray.enabled = false;
    nest.setParentPreserveWorldTransform(pan);
    const tr = nest.getTransform();
    this.hopFrom = tr.getWorldPosition();
    this.hopRot = tr.getLocalRotation();
    this.hopScale = tr.getLocalScale();
    const floor = this.panFloor();
    const box = worldAabb(nest);
    const span = box ? Math.max(box.mx.x - box.mn.x, box.mx.z - box.mn.z) : floor.radius;
    this.fit = Math.max(0.45, Math.min(1.5, (floor.radius * 1.15) / Math.max(0.01, span)));
    const lift0 = box ? this.hopFrom.y - box.mn.y : 0;
    this.hopTo = new vec3(floor.world.x, floor.world.y + lift0 * this.fit + 0.05, floor.world.z);
    this.nestBase = this.hopTo;
    this.lift = Math.max(1.2, floor.radius * 0.45);
    this.stage(1); // par-cooked out of the water / off the tray
  }

  private hop(k: number): void {
    const nest = this.nest;
    if (!alive(nest)) return;
    const a = smooth01(k);
    const tr = nest.getTransform();
    tr.setWorldPosition(vec3.lerp(this.hopFrom, this.hopTo, a).add(new vec3(0, 6.0 * Math.sin(Math.PI * a), 0)));
    tr.setLocalScale(this.hopScale.uniformScale(1 + (this.fit - 1) * a));
  }

  private swirl(k: number): void {
    const nest = this.nest;
    if (!alive(nest)) return;
    const tr = nest.getTransform();
    // lift with the tool's helix (dip 0-0.2, rise 0.2-0.77, back down 0.77-1), twist 1.25 turns about the pan axis
    const up = k < 0.2 ? 0 : k < 0.77 ? smooth01((k - 0.2) / 0.57) : 1 - smooth01((k - 0.77) / 0.23);
    const yaw = 2 * Math.PI * 1.25 * smooth01(Math.max(0, (k - 0.2) / 0.57));
    const r = 0.6 * Math.sin(Math.PI * up);
    tr.setWorldPosition(this.nestBase.add(new vec3(Math.cos(yaw) * r, this.lift * up, Math.sin(yaw) * r)));
    tr.setLocalRotation(quat.angleAxis(yaw, vec3.up()).multiply(this.hopRot));
    const st = 1 + 0.32 * Math.sin(Math.PI * up); // strands stretch as they are lifted
    const s = this.hopScale.uniformScale(this.fit);
    tr.setLocalScale(new vec3(s.x / Math.sqrt(st), s.y * st, s.z / Math.sqrt(st)));
    this.stage(1 + smooth01(k));
  }

  private settle(k: number): void {
    const nest = this.nest;
    if (!alive(nest)) return;
    const tr = nest.getTransform();
    tr.setWorldPosition(this.nestBase.add(new vec3(0, 0.25 * Math.sin(Math.PI * k), 0)));
    tr.setLocalScale(this.hopScale.uniformScale(this.fit));
    tr.setLocalRotation(quat.angleAxis(2.5 * Math.PI + 12 * DEG * k, vec3.up()).multiply(this.hopRot));
  }
}
