import { ChoreographyDAG } from "./ChoreographyDAG";
import { MetricPrepBlueprint } from "./MetricPrepBlueprint";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { PlatingFinisher } from "./PlatingFinisher";
import { SpatulaTechniqueGuide } from "./SpatulaTechniqueGuide";
import { StationInteractableController } from "./StationInteractableController";
import { StationPropsBuilder } from "./StationPropsBuilder";

/** One stage of the scripted cook: enter once, then wait for min dwell AND `until` (or timeout). */
interface AutoStep {
  id: string;
  caption: () => string;
  /** Minimum real seconds (scaled by 1/speed) spent in the step. */
  dwell: number;
  enter?: () => void;
  until?: () => boolean;
  /** Real seconds (not scaled) after which the step is forced to finish. */
  timeout?: number;
  onTimeout?: () => void;
  exit?: () => void;
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

/**
 * AutoCookController.ts (WS9-P3)
 * "Auto Cook" director mode: runs the whole service start -> finish with natural pacing (~70 s at
 * speed 1) through the same controller / bus APIs the Btn_* triggers use (no duplicated DAG logic):
 * Reset -> sear clock on -> 8 x Step Cut (1.4 s apart, veg change one by one) -> portion 100% ->
 * Transfer (WS10: bowl pours the portion base into the empty saucier, the diced veg hop into the
 * bowl, bowl pours them in -> red sauce) -> sear runs, then 10x warp to the <=10 s
 * flip window -> physical spatula flip (SpatulaTechniqueGuide.playFlip onDone) -> sauce step completes
 * -> sear completes -> PLATING_CONVERGENCE -> PlatingFinisher tween -> DISH READY.
 * Captions go out on AUTO_COOK_STATE (shown in the PLATE IN capsule). Stop / Reset cancel cleanly:
 * the step machine is frame-driven (no DelayedCallbackEvents), so cancelling is a state change plus
 * a scene reset. Manual buttons are ignored while it runs (see isAutoRunning()).
 */
@component
export class AutoCookController extends BaseScriptComponent {
  private static instance: AutoCookController | null = null;

  /** Pacing multiplier for dwell times (LEAF test mode raises it; physical animations keep real time). */
  public speed: number = 1.0;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private controller: StationInteractableController | null = null;
  private dag: ChoreographyDAG | null = null;
  private prep: MetricPrepBlueprint | null = null;
  private guide: SpatulaTechniqueGuide | null = null;
  private finisher: PlatingFinisher | null = null;
  private props: StationPropsBuilder | null = null;

  private running: boolean = false;
  private resettingSelf: boolean = false;
  private steps: AutoStep[] = [];
  private stepIdx: number = -1;
  private stepT: number = 0; // real seconds in step
  private stepDwellT: number = 0; // speed-scaled seconds in step
  private totalT: number = 0;
  private lastCaption: string = "";
  private warpOn: boolean = false;
  private flipDone: boolean = false;
  private bowlFilledSeen: boolean = false;
  private bowlPouredSeen: boolean = false;
  private dishPlatedSeen: boolean = false;
  private convergedSeen: boolean = false;

  /** True while an Auto Cook run is in progress (manual triggers check this and stand down). */
  public static isAutoRunning(): boolean {
    return !!AutoCookController.instance && AutoCookController.instance.running;
  }

  public static getInstance(): AutoCookController | null {
    return AutoCookController.instance;
  }

  onAwake(): void {
    AutoCookController.instance = this;
    this.createEvent("OnStartEvent").bind(() => {
      this.resolve();
      this.listen("PREP_BOWL_FILLED", () => (this.bowlFilledSeen = true));
      this.listen("PREP_BOWL_POURED", () => (this.bowlPouredSeen = true));
      this.listen("DISH_PLATED", () => (this.dishPlatedSeen = true));
      this.listen("PLATING_CONVERGENCE", () => (this.convergedSeen = true));
      this.listen("RESET_REQUESTED", () => {
        if (this.running && !this.resettingSelf) this.cancel("reset");
      });
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
      if (AutoCookController.instance === this) AutoCookController.instance = null;
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public isRunning(): boolean {
    return this.running;
  }

  public getStageId(): string {
    return this.running && this.stepIdx >= 0 && this.stepIdx < this.steps.length ? this.steps[this.stepIdx].id : "IDLE";
  }

  public getCaption(): string {
    return this.running ? this.lastCaption : "";
  }

  public getElapsedSec(): number {
    return this.totalT;
  }

  /** Director button / Btn_AutoCook: start when idle, Stop (cancel + full reset) when running. */
  public toggle(): void {
    if (this.running) this.stop();
    else this.start();
  }

  public start(speed?: number): void {
    if (this.running) return;
    this.resolve();
    if (!this.controller || !this.dag) {
      print("[AutoCook] Cannot start: StationInteractableController / ChoreographyDAG not found.");
      return;
    }
    if (typeof speed === "number" && speed > 0) this.speed = speed;
    // clean slate through the normal Reset path (also normalises any lingering time warp)
    this.resettingSelf = true;
    this.controller.onResetPressed();
    this.resettingSelf = false;
    this.eventBus.emit("TIME_WARP_TOGGLED", { multiplier: 1.0, isDemoMode: true });
    if (this.finisher) this.finisher.timeScale = this.speed;

    this.warpOn = false;
    this.flipDone = false;
    this.bowlFilledSeen = false;
    this.bowlPouredSeen = false;
    this.dishPlatedSeen = false;
    this.convergedSeen = false;
    this.steps = this.buildSteps();
    this.stepIdx = -1;
    this.totalT = 0;
    this.running = true;
    print(`[AutoCook] START (speed ${this.speed}x, ${this.steps.length} stages)`);
    this.nextStep();
  }

  /** Cancel the run and restore the whole scene (Stop button). */
  public stop(): void {
    if (!this.running) return;
    this.cancel("stop");
    if (this.controller) this.controller.onResetPressed();
  }

  // ───────────────────────── internals ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  private resolve(): void {
    let root: SceneObject | null = this.getSceneObject();
    while (root && root.name !== "StationsRoot" && root.hasParent()) root = root.getParent();
    if (!root || root.name !== "StationsRoot") root = this.getSceneObject();
    if (!this.controller) this.controller = root.getComponent(StationInteractableController.getTypeName()) as StationInteractableController;
    if (!this.dag) this.dag = root.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    if (!this.prep) this.prep = root.getComponent(MetricPrepBlueprint.getTypeName()) as MetricPrepBlueprint;
    if (!this.props) this.props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    const self = this.getSceneObject();
    if (!this.guide) this.guide = self.getComponent(SpatulaTechniqueGuide.getTypeName()) as SpatulaTechniqueGuide;
    if (!this.finisher) this.finisher = self.getComponent(PlatingFinisher.getTypeName()) as PlatingFinisher;
  }

  /** Stop stepping; undo what only Auto Cook owns (warp, finisher speed). Caller resets the scene if needed. */
  private cancel(reason: string): void {
    this.running = false;
    this.stepIdx = -1;
    this.steps = [];
    if (this.warpOn) {
      this.warpOn = false;
      this.eventBus.emit("TIME_WARP_TOGGLED", { multiplier: 1.0, isDemoMode: true });
    }
    if (this.finisher) this.finisher.timeScale = 1.0;
    this.lastCaption = "";
    this.eventBus.emit("AUTO_COOK_STATE", { running: false, caption: "", stage: "CANCELLED" });
    print(`[AutoCook] CANCELLED (${reason}) after ${this.totalT.toFixed(1)} s`);
  }

  private finish(): void {
    this.running = false;
    this.stepIdx = -1;
    this.steps = [];
    if (this.finisher) this.finisher.timeScale = 1.0;
    this.lastCaption = "";
    this.eventBus.emit("AUTO_COOK_STATE", { running: false, caption: "", stage: "DONE" });
    print(`[AutoCook] DONE in ${this.totalT.toFixed(1)} s: dish plated.`);
  }

  private setWarp(on: boolean): void {
    if (!this.controller || on === this.warpOn) return;
    this.warpOn = on;
    // same path as the 10x Warp button (controller keeps its own toggle state in sync)
    this.controller.onToggleTimeWarpPressed();
  }

  private transferCaption(): string {
    const st = this.props ? this.props.getTransferStage() : 0;
    if (st <= 1) return "AUTO PORTION IN";
    if (st <= 3) return "AUTO TO BOWL";
    return "AUTO VEG IN SAUCE";
  }

  private searRemaining(): number {
    return this.dag ? this.dag.getSkilletRemaining() : 0;
  }

  private buildSteps(): AutoStep[] {
    const c = this.controller!;
    const dag = this.dag!;
    const steps: AutoStep[] = [];
    steps.push({ id: "START", caption: () => "AUTO COOK", dwell: 2.0 });
    steps.push({
      id: "SEAR_ON",
      caption: () => "AUTO SEAR ON",
      dwell: 2.5,
      enter: () => dag.startTimers(), // salmon goes in the pan while the prep happens
    });
    for (let i = 1; i <= 8; i++) {
      steps.push({
        id: `CHOP_${i}`,
        caption: () => `AUTO CHOP ${i}/8`,
        dwell: 1.4,
        enter: () => c.onStepChopPressed(), // same path as Btn_StepChop
      });
    }
    for (let i = 1; i <= 4; i++) {
      steps.push({
        id: `PORTION_${i}`,
        caption: () => `AUTO PORTION ${this.prep ? Math.round(this.prep.getFillRatio() * 100) : 0}%`,
        dwell: i <= 3 ? 1.3 : 0,
        enter: () => {
          if (!this.prep || this.prep.getFillRatio() < 0.999) c.onFillPortionPressed(); // Btn_FillPortion path
        },
      });
    }
    steps.push({ id: "PREP_DONE", caption: () => "AUTO PREP READY", dwell: 1.5 });
    // WS10 two-pour transfer (~11 s, real time): portion -> saucier, veg board -> bowl, veg -> saucier
    steps.push({
      id: "TRANSFER",
      caption: () => this.transferCaption(),
      dwell: 1.0,
      enter: () => c.onTransferPressed(), // Btn_Transfer path: STATION_STEP_COMPLETED(PREP)
      until: () => this.bowlFilledSeen,
      timeout: 12.0,
    });
    steps.push({
      id: "INTO_SAUCIER",
      caption: () => this.transferCaption(),
      dwell: 1.0,
      until: () => this.bowlPouredSeen,
      timeout: 9.0,
    });
    steps.push({ id: "SEARING", caption: () => `AUTO SEAR ${mmss(this.searRemaining())}`, dwell: 14.0 });
    steps.push({
      id: "FAST_FORWARD",
      caption: () => `AUTO 10x ${mmss(this.searRemaining())}`,
      dwell: 0,
      enter: () => {
        if (this.speed > 1.5) {
          // test pacing: jump the sear clock straight into the flip window
          dag.proposeCookingExtension("skillet_sear_skin", 9.0 - this.searRemaining());
        } else {
          this.setWarp(true);
        }
      },
      until: () => this.searRemaining() <= 9.0,
      timeout: 12.0,
      onTimeout: () => dag.proposeCookingExtension("skillet_sear_skin", 9.0 - this.searRemaining()),
      exit: () => this.setWarp(false),
    });
    steps.push({ id: "FLIP_WINDOW", caption: () => "AUTO FLIP WINDOW", dwell: 1.0 });
    steps.push({
      id: "FLIP",
      caption: () => "AUTO FLIPPING",
      dwell: 0,
      enter: () => {
        this.flipDone = false;
        const g = this.guide;
        if (!g) {
          this.flipDone = true;
          return;
        }
        const started = g.playFlip(() => (this.flipDone = true));
        if (!started && !g.isFlipping()) this.flipDone = true; // already flipped or props missing
      },
      until: () => this.flipDone,
      timeout: 9.0,
    });
    steps.push({ id: "CRUST_UP", caption: () => "AUTO CRUST UP", dwell: 2.5 });
    steps.push({
      id: "SAUCE",
      caption: () => "AUTO SAUCE READY",
      dwell: 1.5,
      enter: () => {
        if (dag.getTaskState("sauce_reduction") !== "COMPLETE") {
          this.eventBus.emit("TASK_COMPLETED", { taskId: "sauce_reduction", stationId: "SAUCEPOT", triggerSource: "MANUAL" });
        }
      },
    });
    steps.push({
      id: "SEAR_FINISH",
      caption: () => `AUTO SEAR ${mmss(this.searRemaining())}`,
      dwell: 0,
      enter: () => {
        if (this.speed > 1.5 && dag.getTaskState("skillet_sear_skin") !== "COMPLETE") {
          this.eventBus.emit("TASK_COMPLETED", { taskId: "skillet_sear_skin", stationId: "SKILLET", triggerSource: "MANUAL" });
        }
      },
      until: () => this.convergedSeen || dag.getTaskState("skillet_sear_skin") === "COMPLETE",
      timeout: 8.0,
      onTimeout: () => this.eventBus.emit("TASK_COMPLETED", { taskId: "skillet_sear_skin", stationId: "SKILLET", triggerSource: "MANUAL" }),
    });
    steps.push({
      id: "PLATING",
      caption: () => "AUTO PLATING",
      dwell: 1.0,
      until: () => this.dishPlatedSeen,
      timeout: 20.0,
      onTimeout: () => {
        if (this.finisher && !this.finisher.isPlating() && !this.finisher.isDishPlated()) this.finisher.begin();
      },
    });
    steps.push({ id: "DISH_READY", caption: () => "AUTO DISH READY", dwell: 4.0 });
    return steps;
  }

  private nextStep(): void {
    const prev = this.stepIdx >= 0 && this.stepIdx < this.steps.length ? this.steps[this.stepIdx] : null;
    if (prev && prev.exit) prev.exit();
    if (!this.running) return;
    this.stepIdx++;
    if (this.stepIdx >= this.steps.length) {
      this.finish();
      return;
    }
    this.stepT = 0;
    this.stepDwellT = 0;
    const s = this.steps[this.stepIdx];
    if (s.enter) s.enter();
    if (!this.running) return; // enter() may have cancelled (e.g. a reset)
    this.publishCaption(true);
  }

  private publishCaption(force: boolean): void {
    if (!this.running || this.stepIdx < 0) return;
    const s = this.steps[this.stepIdx];
    const cap = s.caption();
    if (!force && cap === this.lastCaption) return;
    this.lastCaption = cap;
    this.eventBus.emit("AUTO_COOK_STATE", { running: true, caption: cap, stage: s.id });
  }

  private onUpdate(): void {
    if (!this.running || this.stepIdx < 0 || this.stepIdx >= this.steps.length) return;
    const dt = getDeltaTime();
    this.totalT += dt;
    this.stepT += dt;
    this.stepDwellT += dt * Math.max(0.1, this.speed);
    const s = this.steps[this.stepIdx];
    const dwellOk = this.stepDwellT >= s.dwell;
    const condOk = s.until ? s.until() : true;
    if (dwellOk && condOk) {
      this.nextStep();
      return;
    }
    if (s.timeout !== undefined && this.stepT >= s.timeout && dwellOk) {
      print(`[AutoCook] stage ${s.id} timed out after ${s.timeout}s; forcing it forward.`);
      if (s.onTimeout) s.onTimeout();
      this.nextStep();
      return;
    }
    this.publishCaption(false);
  }
}
