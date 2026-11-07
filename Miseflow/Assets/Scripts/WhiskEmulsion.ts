import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { DishBlueprintApplier } from "./DishBlueprintApplier";
import { StationPropsBuilder } from "./StationPropsBuilder";
import { Rgb } from "./AI/UniversalDishSchema";
import { KineProvider, KineRegistry, KineTimeline, dishBuilder, smooth01, stationsRootOf, stepOf } from "./KineRegistry";

const STEP_DELAY = 0.35;
const WHISK_CAP = 5.0; // WhiskProp.whiskEmulsion is 0.5 + 2.0 + 0.5 s
const NO_PROP_SEC = 2.2; // no #336 on this dish: the gloss still builds over this time
const GLOSS_LIFT = 0.16; // how much lighter / shinier the emulsified sauce reads

/**
 * WhiskEmulsion.ts (v5 K1b) - KINE_WHISK_EMULSION wiring
 * WHISK_REQUESTED (emitted ~0.35 s after STEP_STARTED of a dish step with this kinematic, or by anyone else) ->
 * #336 WhiskProp.whiskEmulsion over the pot (ToolWareController already starts it on the same event; this component
 * starts it only if it did not), the reduced sauce colour glosses (setSauceColors tint toward a lighter, glossier
 * shade) with a steam pulse while it whisks, then KINEMATIC_COMPLETED { kinematic: "KINE_WHISK_EMULSION" } (~3 s).
 * Reset cancels (the dish re-apply restores the sauce colours). Never throws.
 */
@component
export class WhiskEmulsion extends BaseScriptComponent implements KineProvider {
  private static instance: WhiskEmulsion | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private tl: KineTimeline = new KineTimeline("WhiskEmulsion");
  private props: StationPropsBuilder | null = null;
  private done: number = 0;
  private pendingT: number = -1;
  private runT: number = 0;
  private base: Rgb = [1, 1, 1];
  private reduced: Rgb = [1, 1, 1];

  public static getInstance(): WhiskEmulsion | null {
    return WhiskEmulsion.instance;
  }

  onAwake(): void {
    WhiskEmulsion.instance = this;
    KineRegistry.register("WHISK", this);
    this.createEvent("OnStartEvent").bind(() => {
      this.listen("WHISK_REQUESTED", () => this.play());
      this.listen("RESET_REQUESTED", () => this.cancel());
      this.listen("STEP_STARTED", (d?: any) => {
        const s = stepOf(d);
        if (s && s.kinematic === "KINE_WHISK_EMULSION") this.pendingT = 0;
      });
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      KineRegistry.unregister("WHISK", this);
      if (WhiskEmulsion.instance === this) WhiskEmulsion.instance = null;
    });
  }

  public isBusy(): boolean {
    return this.tl.isRunning() || this.pendingT >= 0;
  }

  public getDoneCount(): number {
    return this.done;
  }

  public cancel(): void {
    this.tl.cancel();
    this.pendingT = -1;
  }

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[WhiskEmulsion] ${ev} handler error: ${e}`);
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
        this.bus.emit("WHISK_REQUESTED", { source: "step" });
      }
    }
    if (!this.tl.isRunning()) return;
    this.runT += dt;
    if (this.tl.update(dt)) {
      this.done++;
      print(`[WhiskEmulsion] KINE_WHISK_EMULSION complete in ${this.runT.toFixed(2)} s (run ${this.done})`);
      this.bus.emit("KINEMATIC_COMPLETED", { kinematic: "KINE_WHISK_EMULSION", phase: "whisk", durationSec: this.runT });
    }
  }

  private play(): void {
    if (this.tl.isRunning()) return;
    this.pendingT = -1;
    this.runT = 0;
    if (!this.props) {
      const root = stationsRootOf(this.getSceneObject());
      if (root) this.props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    }
    const bp = DishBlueprintApplier.getActiveBlueprint();
    if (bp && bp.sauce) {
      this.base = bp.sauce.baseLiquidRgb;
      this.reduced = bp.sauce.reducedSauceRgb;
    }
    const b = dishBuilder();
    const tw = b ? b.getToolWare() : null;
    const whisk = tw && typeof tw.getWhisk === "function" ? tw.getWhisk() : null;
    const tl = this.tl.clear();
    let started = false;
    // ToolWareController starts the whisk on WHISK_REQUESTED itself; give it this frame, then make sure it runs
    tl.call(() => {
      if (this.props) this.props.pulseSaucierSteam(3.0);
    });
    tl.add(0.05);
    tl.call(() => {
      started = !!whisk && (whisk.isBusy() || whisk.whiskEmulsion());
      print(`[WhiskEmulsion] play: whisk ${whisk ? (started ? "whisking" : "busy/hidden") : "none (gloss only)"}`);
    });
    tl.wait(() => {
      const k = Math.min(1, this.runT / (started ? 3.0 : NO_PROP_SEC));
      this.gloss(smooth01(k));
      return started ? !whisk.isBusy() && k >= 0.6 : k >= 1;
    }, WHISK_CAP);
    tl.call(() => this.gloss(1));
    tl.run();
  }

  /** Reduced sauce tint moves toward a lighter, glossier shade (emulsified butter + starch water). */
  private gloss(k: number): void {
    const b = dishBuilder();
    if (!b || typeof b.setSauceColors !== "function") return;
    const r = this.reduced;
    const g: Rgb = [0, 1, 2].map((i) => Math.min(1, r[i] + (GLOSS_LIFT + (1 - r[i]) * 0.12) * k)) as Rgb;
    b.setSauceColors(this.base, g);
  }
}
