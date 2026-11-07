import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { StationPropsBuilder } from "./StationPropsBuilder";
import { HANDI_INNER, HANDI_RIM_Y, HandiLid } from "./VesselGenerators";
import { KineProvider, KineRegistry, KineTimeline, alive, dishBuilder, findByName, smooth01, stationsRootOf, stepOf, worldAabb } from "./KineRegistry";

const STEP_DELAY = 0.35;
const POUR_CAP = 14.0; // waits for a running masala pour into the handi
const LID_CAP = 3.0;
const HOP_SEC = 1.1;
const LAYER_SEC = 1.5;
const DUM_SEC = 2.6;
const BASE_Y_MIN = 1.7; // handi-local floor of the rice layer (over the masala)
const BASE_Y_MAX = 3.0;

type DumPhase = "layer" | "seal" | "full";

function innerR(y: number): number {
  const p = HANDI_INNER;
  if (y <= p[0][0]) return p[1][1];
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][0]) {
      const a = p[i - 1];
      const b = p[i];
      const t = (y - a[0]) / Math.max(1e-4, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return p[p.length - 1][1];
}

/**
 * RiceDumLayer.ts (v5 K1b) - KINE_RICE_DUM_LAYER
 * Plays when a dish step with this kinematic starts (manual play, Auto Cook and the step engine share the path):
 *   layer: waits for a running masala pour, opens the #303 handi lid, the #116 rice arcs off its tray and settles in
 *          layers over the masala / mushroom base (StarchProp raw -> steamed).
 *   seal:  DUM_SEAL_REQUESTED {seal:true} seats the domed lid (dough seal + rattle), a dum knock + saucier steam while
 *          the rice turns into the saffron dum dome (steamed -> finished), then DUM_SEAL_REQUESTED {seal:false} lifts
 *          the lid with a steam burst.
 * A dish with two DUM steps plays layer then seal; a single DUM step plays both ("full"). Emits KINEMATIC_COMPLETED
 * { kinematic: "KINE_RICE_DUM_LAYER", phase } (~2.6-4 s layer, ~5.5 s seal). Reset cancels. Never throws.
 */
@component
export class RiceDumLayer extends BaseScriptComponent implements KineProvider {
  private static instance: RiceDumLayer | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private tl: KineTimeline = new KineTimeline("RiceDumLayer");
  private props: StationPropsBuilder | null = null;
  private done: number = 0;
  private pendingT: number = -1;
  private pendingPhase: DumPhase = "full";
  private phase: DumPhase = "full";
  private runT: number = 0;

  // per run
  private rice: any = null; // StarchProp
  private handi: SceneObject | null = null;
  private layered: boolean = false;
  private hopFrom: vec3 = vec3.zero();
  private hopTo: vec3 = vec3.zero();
  private scFrom: vec3 = vec3.one();
  private fit: number = 1;
  private ySquash: number = 1;

  public static getInstance(): RiceDumLayer | null {
    return RiceDumLayer.instance;
  }

  onAwake(): void {
    RiceDumLayer.instance = this;
    KineRegistry.register("DUM", this);
    this.createEvent("OnStartEvent").bind(() => {
      this.listen("RESET_REQUESTED", () => this.cancel());
      this.listen("DISH_BLUEPRINT_APPLIED", () => (this.layered = false));
      this.listen("STEP_STARTED", (d?: any) => this.onStep(d));
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      KineRegistry.unregister("DUM", this);
      if (RiceDumLayer.instance === this) RiceDumLayer.instance = null;
    });
  }

  // ── KineProvider ──

  public isBusy(): boolean {
    return this.tl.isRunning() || this.pendingT >= 0;
  }

  public getDoneCount(): number {
    return this.done;
  }

  public cancel(): void {
    this.tl.cancel();
    this.pendingT = -1;
    this.layered = false;
    this.rice = null;
    this.handi = null;
  }

  /** Direct trigger (tests / Auto Cook fallback): "layer", "seal" or "full". */
  public play(phase: DumPhase): void {
    if (this.tl.isRunning()) return;
    this.pendingT = -1;
    this.phase = phase;
    this.runT = 0;
    this.resolve();
    const root = stationsRootOf(this.getSceneObject());
    this.handi = findByName(root, "BiryaniHandi");
    if (this.handi && !this.handi.isEnabledInHierarchy) this.handi = null;
    this.rice = this.pickRice();
    const tl = this.tl.clear();
    print(`[RiceDumLayer] play ${phase}: handi ${this.handi ? "yes" : "no"}, rice ${this.rice ? "#" + this.rice.getAccessNumber() : "none"}, lid ${HandiLid.getActive() ? "yes" : "no"}`);
    if (phase !== "seal" || !this.layered) this.addLayer(tl);
    if (phase !== "layer") this.addSeal(tl);
    tl.run();
  }

  // ── internals ──

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[RiceDumLayer] ${ev} handler error: ${e}`);
      }
    };
    this.bus.on(ev, safe);
    this.handlers.push({ ev: ev, cb: safe });
  }

  private resolve(): void {
    if (this.props) return;
    const root = stationsRootOf(this.getSceneObject());
    if (root) this.props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
  }

  private onStep(d?: any): void {
    const s = stepOf(d);
    if (!s || s.kinematic !== "KINE_RICE_DUM_LAYER") return;
    const eng = KineRegistry.getEngine();
    const steps = eng ? eng.getSteps() : [];
    const dumIdx: number[] = [];
    for (let i = 0; i < steps.length; i++) if (steps[i].kinematic === "KINE_RICE_DUM_LAYER") dumIdx.push(i);
    const idx = typeof d.index === "number" ? d.index : -1;
    this.pendingPhase = dumIdx.length < 2 ? "full" : idx === dumIdx[0] ? "layer" : "seal";
    this.pendingT = 0;
  }

  private onUpdate(): void {
    const dt = getDeltaTime();
    if (this.pendingT >= 0) {
      this.pendingT += dt;
      if (this.pendingT >= STEP_DELAY) {
        const p = this.pendingPhase;
        this.pendingT = -1;
        this.play(p);
      }
    }
    if (!this.tl.isRunning()) return;
    this.runT += dt;
    if (this.tl.update(dt)) this.finish();
  }

  private finish(): void {
    this.done++;
    print(`[RiceDumLayer] KINE_RICE_DUM_LAYER ${this.phase} complete in ${this.runT.toFixed(2)} s (run ${this.done})`);
    this.bus.emit("KINEMATIC_COMPLETED", { kinematic: "KINE_RICE_DUM_LAYER", phase: this.phase, durationSec: this.runT });
  }

  private pickRice(): any {
    const b = dishBuilder();
    const list: any[] = b && typeof b.getStarchProps === "function" ? b.getStarchProps() : [];
    let pick: any = null;
    for (const p of list) {
      if (!p || !alive(p.getObject())) continue;
      if (!pick || p.getAccessNumber() === 116) pick = p;
    }
    return pick;
  }

  private stage(t: number): void {
    if (this.rice && alive(this.rice.getObject())) this.rice.setStageProgress(Math.max(0, Math.min(2, t)));
  }

  private addLayer(tl: KineTimeline): void {
    const props = this.props;
    const lid = HandiLid.getActive();
    // the masala goes in first: wait for a running pour into the handi
    tl.wait(() => !props || !props.isSaucierPourActive(), POUR_CAP);
    if (lid) {
      tl.wait(() => !lid.isBusy(), LID_CAP, () => {
        if (lid.isSealed()) lid.lift(false);
      });
    }
    if (!this.rice || !this.handi) {
      tl.add(LAYER_SEC, (k) => this.stage(k));
      tl.call(() => (this.layered = true));
      return;
    }
    tl.add(HOP_SEC, (k) => this.hop(k), () => this.beginHop());
    tl.add(LAYER_SEC, (k) => this.layer(k), () => {
      if (props) props.pulseSaucierSteam(LAYER_SEC + 0.5);
    });
    tl.call(() => (this.layered = true));
  }

  private addSeal(tl: KineTimeline): void {
    const props = this.props;
    const lidNow = () => HandiLid.getActive();
    tl.wait(() => {
      const l = lidNow();
      return !l || !l.isBusy();
    }, LID_CAP, () => this.bus.emit("DUM_SEAL_REQUESTED", { seal: true, source: "dum" }));
    let knocked = false;
    tl.add(DUM_SEC, (k) => {
      this.stage(1 + smooth01(k));
      if (!knocked && k >= 0.5) {
        knocked = true;
        const l = lidNow();
        if (l && l.isSealed() && !l.isBusy()) l.lower(); // seated already: second dum rattle
      }
    }, () => {
      if (props) props.pulseSaucierSteam(DUM_SEC + 1.0);
    });
    tl.wait(() => {
      const l = lidNow();
      return !l || !l.isBusy();
    }, LID_CAP, () => this.bus.emit("DUM_SEAL_REQUESTED", { seal: false, source: "dum" }));
    tl.call(() => this.stage(2));
  }

  private beginHop(): void {
    const rice = this.rice ? (this.rice.getObject() as SceneObject) : null;
    const handi = this.handi;
    if (!alive(rice) || !alive(handi)) return;
    const tray = findByName(rice, "StarchTray");
    if (tray) tray.enabled = false;
    rice.setParentPreserveWorldTransform(handi);
    const tr = rice.getTransform();
    this.hopFrom = tr.getWorldPosition();
    this.scFrom = tr.getLocalScale();
    const level = this.props ? this.props.getSauceLevel() : 0;
    const baseY = Math.max(BASE_Y_MIN, Math.min(BASE_Y_MAX, level + 0.15));
    const hw = handi.getTransform().getWorldTransform();
    const ws = handi.getTransform().getWorldScale().x;
    const r = innerR(baseY + 0.8) * 0.82 * ws;
    const box = worldAabb(rice);
    const span = box ? Math.max(box.mx.x - box.mn.x, box.mx.z - box.mn.z) : r * 2;
    this.fit = Math.max(0.3, Math.min(2.2, (2 * r) / Math.max(0.01, span)));
    const h = box ? box.mx.y - box.mn.y : 1;
    const room = (HANDI_RIM_Y - 0.35 - baseY) * ws; // the dome stays under the seated lid
    this.ySquash = Math.max(0.35, Math.min(1, room / Math.max(0.01, h * this.fit)));
    const under = box ? this.hopFrom.y - box.mn.y : 0;
    const base = hw.multiplyPoint(new vec3(0, baseY, 0));
    this.hopTo = new vec3(base.x, base.y + under * this.fit * this.ySquash, base.z);
    this.stage(0);
  }

  private hop(k: number): void {
    const rice = this.rice ? (this.rice.getObject() as SceneObject) : null;
    if (!alive(rice)) return;
    const a = smooth01(k);
    const tr = rice.getTransform();
    tr.setWorldPosition(vec3.lerp(this.hopFrom, this.hopTo, a).add(new vec3(0, 7.0 * Math.sin(Math.PI * a), 0)));
    const s = 1 + (this.fit - 1) * a;
    tr.setLocalScale(new vec3(this.scFrom.x * s, this.scFrom.y * s * (1 - (1 - 0.45 * this.ySquash) * a),this.scFrom.z * s));
    this.stage(0.4 * a);
  }

  /** Three layers settle in: the mound rises in steps (each layer drops + spreads), grains steam (raw -> steamed). */
  private layer(k: number): void {
    const rice = this.rice ? (this.rice.getObject() as SceneObject) : null;
    if (!alive(rice)) return;
    const n = 3;
    const seg = Math.min(n - 1, Math.floor(k * n));
    const local = k * n - seg;
    const h0 = 0.45 + (0.55 * seg) / n;
    const h1 = 0.45 + (0.55 * (seg + 1)) / n;
    const hy = h0 + (h1 - h0) * smooth01(local) + 0.04 * Math.sin(Math.PI * local);
    const tr = rice.getTransform();
    const s = this.fit;
    tr.setLocalScale(new vec3(this.scFrom.x * s, this.scFrom.y * s * this.ySquash * hy, this.scFrom.z * s));
    tr.setWorldPosition(this.hopTo);
    this.stage(0.4 + 0.6 * smooth01(k));
  }
}
