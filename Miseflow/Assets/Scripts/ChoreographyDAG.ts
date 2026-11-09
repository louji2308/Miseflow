import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { computeBaseline, computeSchedule, HeatLevel, ScheduleInputTask, ScheduledTask, ScheduleResult } from "./ScheduleModel";

export type TaskState =
  | "NOT_READY"
  | "READY"
  | "ACTIVE"
  | "NEEDS_ATTENTION"
  | "PAUSED_BY_USER"
  | "COMPLETE";

export type InterruptionPolicy =
  | "WAIT_BEFORE_START"   // Safe to slide start window forward automatically
  | "USER_DECISION"       // Active cooking task: NEVER silently modify; require cook confirmation
  | "FIXED_DURATION"      // Invariant physical duration; never compress to force convergence
  | "MANUAL_CONFIRMATION";// Stove heat cannot be sensed; requires user verification

export interface RecipeTask {
  id: string;
  stationId: "PREP" | "SKILLET" | "SAUCEPOT" | "PLATING";
  title: string;
  instruction: string;
  dependencies: string[];
  plannedDurationSeconds: number;
  remainingDurationSeconds: number;
  state: TaskState;
  interruptionPolicy: InterruptionPolicy;
  // v7 Stage 5 (schedule rail): heat / pin policy and the cook-clock facts behind the rail
  heat?: HeatLevel;
  pinOnHeat?: boolean;
  driftSec?: number;
  latenessSec?: number;
  actualStartSec?: number;
  actualFinishSec?: number;
  notBeforeSec?: number;
  pinnedStartSec?: number;
}

const HEAT_BY_TASK: { [id: string]: HeatLevel } = {
  prep_shallots: "OFF",
  skillet_sear_skin: "HIGH",
  sauce_reduction: "LOW",
  plating_garnish: "OFF",
};

/** Titles/instructions of the four fixed task keys (v5: per-dish copy, same keys). */
interface TaskLabels {
  prepTitle: string;
  prepInstruction: string;
  searTitle: string;
  searInstruction: string;
  sauceTitle: string;
  sauceInstruction: string;
  plateTitle: string;
  plateInstruction: string;
}

const DEFAULT_DISH_ID = "01_salmon_beurre_blanc";

/** Dish 01 copy: exactly the pre-v5 strings. */
const DISH01_LABELS: TaskLabels = {
  prepTitle: "Chop Shallots & Asparagus",
  prepInstruction: "Slice shallots at 1.5cm guide intervals",
  searTitle: "Sear Salmon (Skin Side)",
  searInstruction: "Crisp skin over medium-high heat (invariant duration)",
  sauceTitle: "Shallot-Lemon Reduction",
  sauceInstruction: "Add chopped shallots; reduce on low heat",
  plateTitle: "Plate & Garnish",
  plateInstruction: "Spoon reduction over crispy salmon; plate asparagus",
};

function clampDur(v: any, fallback: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : fallback;
}

function cardText(bp: any, i: number, key: string, fallback: string): string {
  const c = bp && bp.cookbookCards ? bp.cookbookCards[i] : null;
  const v = c ? c[key] : null;
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

@component
export class ChoreographyDAG extends BaseScriptComponent {
  @input
  skilletDurationSeconds: number = 60.0;

  @input
  saucepotDurationSeconds: number = 50.0;

  @input
  prepDurationSeconds: number = 45.0;

  // Curated 3-station demo task graph
  private tasks: Map<string, RecipeTask> = new Map();

  private isRunning: boolean = false;
  private isHeld: boolean = false;
  private timeMultiplier: number = 1.0;
  private hasConverged: boolean = false;
  private driftDelaySeconds: number = 0;
  private latestExplanation: string = "";

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  // v5: task copy (dish 01 strings are the LEAF/visual baseline) + boot durations captured on awake
  private labels: TaskLabels = { ...DISH01_LABELS };
  private bootDurations: { prep: number; sear: number; sauce: number } = { prep: 45, sear: 60, sauce: 50 };
  private activeDishId: string = DEFAULT_DISH_ID;

  // v7 Stage 5: cook clock (s since the cook began, advances dt * timeMultiplier) and schedule bookkeeping
  private cookClockSec: number = 0;
  private cookRunning: boolean = false;
  private cookClockPaused: boolean = false;
  private plateTargetSec: number | null = null;
  private scheduleRevision: number = 0;
  private lastScheduleSig: string = "";
  private lastLateWhole: { [id: string]: number } = {};
  private lastLateEmitAt: number = -1;

  private static instance: ChoreographyDAG | null = null;

  /** v7 Stage 5: the schedule rail reads the DAG without an Inspector input. */
  public static getInstance(): ChoreographyDAG | null {
    const i = ChoreographyDAG.instance;
    return i && !isNull(i) ? i : null;
  }

  onAwake(): void {
    ChoreographyDAG.instance = this;
    this.bootDurations = { prep: this.prepDurationSeconds, sear: this.skilletDurationSeconds, sauce: this.saucepotDurationSeconds };
    this.initRecipeGraph();

    this.createEvent("OnStartEvent").bind(() => {
      this.initListeners();
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
    });
  }

  private initRecipeGraph(): void {
    this.tasks.clear();

    // 1. Prep Board Task
    this.tasks.set("prep_shallots", {
      id: "prep_shallots",
      stationId: "PREP",
      title: this.labels.prepTitle,
      instruction: this.labels.prepInstruction,
      dependencies: [],
      plannedDurationSeconds: this.prepDurationSeconds,
      remainingDurationSeconds: this.prepDurationSeconds,
      state: "READY",
      interruptionPolicy: "WAIT_BEFORE_START"
    });

    // 2. Skillet Sear Skin Task
    this.tasks.set("skillet_sear_skin", {
      id: "skillet_sear_skin",
      stationId: "SKILLET",
      title: this.labels.searTitle,
      instruction: this.labels.searInstruction,
      dependencies: [],
      plannedDurationSeconds: this.skilletDurationSeconds,
      remainingDurationSeconds: this.skilletDurationSeconds,
      state: "READY",
      interruptionPolicy: "FIXED_DURATION"
    });

    // 3. Saucepot Reduction Task (Depends on Prep)
    this.tasks.set("sauce_reduction", {
      id: "sauce_reduction",
      stationId: "SAUCEPOT",
      title: this.labels.sauceTitle,
      instruction: this.labels.sauceInstruction,
      dependencies: ["prep_shallots"],
      plannedDurationSeconds: this.saucepotDurationSeconds,
      remainingDurationSeconds: this.saucepotDurationSeconds,
      state: "NOT_READY",
      interruptionPolicy: "WAIT_BEFORE_START"
    });

    // 4. Plating & Garnish (Convergence Task)
    this.tasks.set("plating_garnish", {
      id: "plating_garnish",
      stationId: "PLATING",
      title: this.labels.plateTitle,
      instruction: this.labels.plateInstruction,
      dependencies: ["skillet_sear_skin", "sauce_reduction"],
      plannedDurationSeconds: 20.0,
      remainingDurationSeconds: 20.0,
      state: "NOT_READY",
      interruptionPolicy: "WAIT_BEFORE_START"
    });

    // v7 Stage 5: heat / pin policy; the sear is pinned on the burner (HEAT_GUARD holds it, never pushes it)
    this.tasks.forEach((t) => {
      t.heat = HEAT_BY_TASK[t.id] || "OFF";
      t.pinOnHeat = t.id === "skillet_sear_skin";
      t.driftSec = 0;
      t.latenessSec = 0;
    });
    this.lastLateWhole = {};
    this.scheduleRevision++;
  }

  private initListeners(): void {
    // When prep transfers to pot, complete prep task and unlock sauce reduction
    this.eventBus.on("STATION_STEP_COMPLETED", (data: any) => {
      if (data && data.stationId === "PREP") {
        this.completeTask("prep_shallots");
        this.startTimers();
      }
    });

    this.eventBus.on("TASK_STARTED", (data: any) => {
      if (data && data.taskId) {
        this.startTask(data.taskId);
      }
    });

    this.eventBus.on("TASK_COMPLETED", (data: any) => {
      if (data && data.taskId) {
        this.completeTask(data.taskId);
      }
    });

    // Hero Feature: Prep Drift Injection (+25s delay)
    this.eventBus.on("DRIFT_RECORDED", (data: any) => {
      const delta = (data && data.deltaSeconds) ? data.deltaSeconds : 25.0;
      const reason = (data && data.reason) ? data.reason : "Shallot prep delayed (+25s)";
      this.injectPrepDrift(delta, reason);
    });

    // Legacy DAG hold toggle support
    this.eventBus.on("DAG_HOLD_TOGGLED", (data: any) => {
      if (data) {
        if (data.isHeld) {
          this.injectPrepDrift(data.lagDeltaSeconds || 25.0, "Manual hold requested");
        } else {
          this.releaseHold();
        }
      }
    });

    this.eventBus.on("HOLD_CONFIRMED", (data: any) => {
      if (data && data.isHeld !== undefined) {
        if (data.isHeld) {
          this.confirmUserHold("skillet_sear_skin");
        } else {
          if (data.decision === "KEEP_CURRENT_PLAN") {
            this.revertPrepDrift();
          } else {
            this.releaseHold();
          }
        }
      }
    });

    this.eventBus.on("TIME_WARP_TOGGLED", (data: any) => {
      if (data && typeof data.multiplier === "number") {
        this.timeMultiplier = data.multiplier;
        print(`[ScheduleEngine] Demo time warp multiplier set to: ${this.timeMultiplier}x`);
      }
    });

    // Advisory visual browning scan result (advisory cue only - not spectroscopy)
    this.eventBus.on("VISUAL_BROWNING_CHECK", (data: any) => {
      if (data && data.status === "IN_PROGRESS" && data.deltaSeconds) {
        this.proposeCookingExtension("skillet_sear_skin", data.deltaSeconds);
      }
    });

    this.eventBus.on("MAILLARD_VISION_RESULT", (data: any) => {
      if (data && data.deltaSeconds) {
        this.proposeCookingExtension("skillet_sear_skin", data.deltaSeconds);
      }
    });

    this.eventBus.on("RESET_REQUESTED", () => {
      this.resetEngine();
    });

    // v7 Stage 5: the cook clock starts with the first prep cut or a hand at the prep station
    this.eventBus.on("CUT_REFERENCE_STEP", () => this.beginCook("CUT"));
    this.eventBus.on("HAND_AT_STATION", (d: any) => {
      if (d && d.stationId === "PREP") this.beginCook("HAND");
    });
  }

  // --- Core Prep Drift Resolver Logic ---

  /**
   * Hero Feature: Injects task slippage and replans only eligible downstream tasks.
   * Invariant: Never silently pause an active cooking task or shorten a fixed duration.
   */
  public injectPrepDrift(deltaSeconds: number = 25.0, reason: string = "Prep delayed"): void {
    this.driftDelaySeconds += deltaSeconds;

    const affectedTasks: string[] = [];
    const prepTask = this.tasks.get("prep_shallots");
    if (prepTask) {
      prepTask.remainingDurationSeconds += deltaSeconds;
      prepTask.driftSec = (prepTask.driftSec || 0) + deltaSeconds; // v7 Stage 5: the prep puck grows by the slip
    }

    // 1. Check saucepot reduction (WAIT_BEFORE_START policy)
    const sauceTask = this.tasks.get("sauce_reduction");
    if (sauceTask && sauceTask.state === "NOT_READY") {
      // Safe to automatically slide start window forward
      affectedTasks.push("sauce_reduction");
      print(`[ScheduleEngine] Downstream task 'sauce_reduction' deferred by +${deltaSeconds}s (Policy: WAIT_BEFORE_START).`);
    }

    // 2. Check skillet sear (USER_DECISION policy)
    const skilletTask = this.tasks.get("skillet_sear_skin");
    let skilletWarning = "";
    if (skilletTask && (skilletTask.state === "ACTIVE" || skilletTask.state === "READY")) {
      // An active cooking step cannot be silently changed! Prompt user for decision.
      skilletTask.state = "NEEDS_ATTENTION";
      skilletWarning = "Skillet is ACTIVE: reduce burner heat or confirm hold.";
      print(`[ScheduleEngine] Guardrail triggered: 'skillet_sear_skin' is active; requiring user decision.`);
    }

    // Formulate human-centered explanation
    this.latestExplanation = `Prep slipped +${deltaSeconds}s. Sauce step start deferred +${deltaSeconds}s. ${skilletWarning}`;

    this.eventBus.emit("SCHEDULE_REVISED", {
      affectedTasks: affectedTasks,
      revisedFinishDeltaSeconds: deltaSeconds,
      explanation: this.latestExplanation,
      recommendedAction: "Hold sauce step; verify burner is low/off before resuming."
    });

    print(`[ScheduleEngine] Prep Drift Resolved: ${this.latestExplanation}`);
  }

  /**
   * User acknowledges physical burner adjustment and confirms hold.
   */
  public confirmUserHold(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.state = "PAUSED_BY_USER";
      this.isHeld = true;
      print(`[ScheduleEngine] Task '${taskId}' marked PAUSED_BY_USER (User-acknowledged hold).`);
    }
  }

  public releaseHold(): void {
    this.isHeld = false;
    const skilletTask = this.tasks.get("skillet_sear_skin");
    if (skilletTask && (skilletTask.state === "PAUSED_BY_USER" || skilletTask.state === "NEEDS_ATTENTION")) {
      skilletTask.state = this.isRunning ? "ACTIVE" : "READY";
    }
    print("[ScheduleEngine] Hold released by user.");
  }

  public revertPrepDrift(): void {
    const prepTask = this.tasks.get("prep_shallots");
    if (prepTask && this.driftDelaySeconds > 0 && prepTask.state !== "COMPLETE") {
      prepTask.remainingDurationSeconds = Math.max(0, prepTask.remainingDurationSeconds - this.driftDelaySeconds);
    }
    if (prepTask) prepTask.driftSec = Math.max(0, (prepTask.driftSec || 0) - this.driftDelaySeconds);
    this.driftDelaySeconds = 0;
    this.latestExplanation = "Current plan kept: original timing restored.";
    this.releaseHold();
    print("[ScheduleEngine] Prep drift changes declined; keeping current plan.");
  }

  public proposeCookingExtension(taskId: string, seconds: number): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.remainingDurationSeconds += seconds;
      print(`[ScheduleEngine] Advisory cooking extension: +${seconds}s added to '${taskId}'.`);
    }
  }

  public startTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Guardrail: check dependencies
    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (dep && dep.state !== "COMPLETE") {
        print(`[ScheduleEngine] Cannot start '${taskId}': dependency '${depId}' is ${dep.state}.`);
        return;
      }
    }

    task.state = "ACTIVE";
    print(`[ScheduleEngine] Task '${taskId}' is now ACTIVE.`);
  }

  public completeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // v7 Stage 5: actuals for the rail (a prep finished before the clock ran starts the clock now)
    if (taskId === "prep_shallots" && !this.cookRunning) this.beginCook("PREP_DONE");
    if (this.cookRunning && task.state !== "COMPLETE") {
      if (task.actualStartSec === undefined) task.actualStartSec = this.cookClockSec;
      task.actualFinishSec = this.cookClockSec;
    }
    task.state = "COMPLETE";
    task.remainingDurationSeconds = 0;
    print(`[ScheduleEngine] Task '${taskId}' marked COMPLETE.`);

    // Unlock dependent tasks
    this.tasks.forEach((t) => {
      if (t.state === "NOT_READY") {
        const allDepsComplete = t.dependencies.every((depId) => {
          const d = this.tasks.get(depId);
          return d && d.state === "COMPLETE";
        });
        if (allDepsComplete) {
          t.state = "READY";
          print(`[ScheduleEngine] Dependent task '${t.id}' unlocked -> READY.`);
        }
      }
    });

    // If prep completed, activate cooking tasks
    if (taskId === "prep_shallots") {
      const sauce = this.tasks.get("sauce_reduction");
      if (sauce) sauce.state = "ACTIVE";
      const skillet = this.tasks.get("skillet_sear_skin");
      if (skillet && skillet.state !== "ACTIVE") skillet.state = "ACTIVE";
    }
  }

  public startTimers(): void {
    this.isRunning = true;
    if (!this.cookRunning) this.beginCook("TIMERS");
    const skillet = this.tasks.get("skillet_sear_skin");
    if (skillet) skillet.state = "ACTIVE";
    const sauce = this.tasks.get("sauce_reduction");
    if (sauce && sauce.dependencies.every(d => this.tasks.get(d)?.state === "COMPLETE")) {
      sauce.state = "ACTIVE";
    }
    print("[ScheduleEngine] Coordinated multi-station cooking clock STARTED.");
  }

  public resetEngine(): void {
    this.isRunning = false;
    this.isHeld = false;
    this.hasConverged = false;
    this.driftDelaySeconds = 0;
    this.latestExplanation = "";
    this.cookClockSec = 0;
    this.cookRunning = false;
    this.cookClockPaused = false;
    this.plateTargetSec = null;
    this.initRecipeGraph();
    print("[ScheduleEngine] Reset complete: tasks restored to initial state.");
  }

  /**
   * v5: re-time and re-title the four fixed tasks (prep_shallots, skillet_sear_skin, sauce_reduction,
   * plating_garnish) for a compiled dish. Dish 01 restores the boot durations and the original copy
   * exactly. While a cook is under way only the copy changes; durations apply from the next reset.
   */
  public applyDishBlueprint(bp: any): void {
    if (!bp) return;
    const isDefault = bp.dishId === DEFAULT_DISH_ID;
    this.activeDishId = typeof bp.dishId === "string" ? bp.dishId : DEFAULT_DISH_ID;
    if (isDefault) {
      this.prepDurationSeconds = this.bootDurations.prep;
      this.skilletDurationSeconds = this.bootDurations.sear;
      this.saucepotDurationSeconds = this.bootDurations.sauce;
      this.labels = { ...DISH01_LABELS };
    } else {
      this.prepDurationSeconds = clampDur(bp.prepDurationSec, this.bootDurations.prep);
      this.skilletDurationSeconds = clampDur(bp.searDurationSec, this.bootDurations.sear);
      this.saucepotDurationSeconds = clampDur(bp.sauceDurationSec, this.bootDurations.sauce);
      const protein = bp.protein && bp.protein.name ? String(bp.protein.name) : "Protein";
      const sauce = bp.sauce && bp.sauce.name ? String(bp.sauce.name) : "Sauce";
      const verb = typeof bp.skilletPillVerb === "string" && bp.skilletPillVerb.length > 0 ? bp.skilletPillVerb : "SEAR";
      this.labels = {
        prepTitle: cardText(bp, 0, "headline", `Prep (${bp.cutLabel || "guide"})`),
        prepInstruction: cardText(bp, 0, "instruction", DISH01_LABELS.prepInstruction),
        searTitle: `${verb} ${protein}`,
        searInstruction: cardText(bp, 1, "instruction", DISH01_LABELS.searInstruction),
        sauceTitle: sauce,
        sauceInstruction: cardText(bp, 2, "instruction", DISH01_LABELS.sauceInstruction),
        plateTitle: cardText(bp, 3, "headline", DISH01_LABELS.plateTitle),
        plateInstruction: cardText(bp, 3, "instruction", DISH01_LABELS.plateInstruction),
      };
    }
    const prep = this.tasks.get("prep_shallots");
    const idle = !this.isRunning && !this.hasConverged && !!prep && prep.state === "READY" && this.driftDelaySeconds === 0;
    if (idle) {
      this.initRecipeGraph();
    } else {
      // keep timers/states of the cook in progress; refresh the copy only
      const set = (id: string, title: string, instruction: string) => {
        const t = this.tasks.get(id);
        if (t) {
          t.title = title;
          t.instruction = instruction;
        }
      };
      set("prep_shallots", this.labels.prepTitle, this.labels.prepInstruction);
      set("skillet_sear_skin", this.labels.searTitle, this.labels.searInstruction);
      set("sauce_reduction", this.labels.sauceTitle, this.labels.sauceInstruction);
      set("plating_garnish", this.labels.plateTitle, this.labels.plateInstruction);
    }
    print(`[ScheduleEngine] Dish ${this.activeDishId}: prep ${this.prepDurationSeconds}s / sear ${this.skilletDurationSeconds}s / sauce ${this.saucepotDurationSeconds}s${idle ? "" : " (timers kept; applies on reset)"}`);
  }

  public getActiveDishId(): string {
    return this.activeDishId;
  }

  public getTaskTitle(taskId: string): string {
    const t = this.tasks.get(taskId);
    return t ? t.title : "";
  }

  public getPlannedDuration(taskId: string): number {
    const t = this.tasks.get(taskId);
    return t ? t.plannedDurationSeconds : 0;
  }

  // --- Backward-Compatible Getters for UI & LEAF Tests ---

  public getSkilletRemaining(): number {
    const task = this.tasks.get("skillet_sear_skin");
    return task ? Math.max(0, task.remainingDurationSeconds) : 0;
  }

  public getSaucepotRemaining(): number {
    const task = this.tasks.get("sauce_reduction");
    return task ? Math.max(0, task.remainingDurationSeconds) : 0;
  }

  public getSkilletProgress(): number {
    const task = this.tasks.get("skillet_sear_skin");
    if (!task) return 0;
    return 1.0 - (task.remainingDurationSeconds / task.plannedDurationSeconds);
  }

  public getSaucepotProgress(): number {
    const task = this.tasks.get("sauce_reduction");
    if (!task) return 0;
    return 1.0 - (task.remainingDurationSeconds / task.plannedDurationSeconds);
  }

  public getTaskState(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId)?.state;
  }

  public getLatestExplanation(): string {
    return this.latestExplanation;
  }

  public isTimeWarpActive(): boolean {
    return this.timeMultiplier > 1.0;
  }

  public isDagHeld(): boolean {
    return this.isHeld;
  }

  public setHold(held: boolean, deltaSeconds: number = 25.0): void {
    if (held) {
      this.injectPrepDrift(deltaSeconds, "Manual hold requested");
    } else {
      this.releaseHold();
    }
  }

  // ───────────── v7 Stage 5: cook clock, schedule, pins, lateness (the rail reads these) ─────────────

  /** Starts the cook clock (idempotent). The prep task gets its actual start now. */
  public beginCook(source: string = "MANUAL"): void {
    if (this.cookRunning) return;
    this.cookRunning = true;
    const prep = this.tasks.get("prep_shallots");
    if (prep && prep.state !== "COMPLETE" && prep.actualStartSec === undefined) prep.actualStartSec = this.cookClockSec;
    print(`[ScheduleEngine] cook clock started at ${this.cookClockSec.toFixed(1)} s (${source})`);
  }

  public getCookClockSec(): number {
    return this.cookClockSec;
  }

  public isCookRunning(): boolean {
    return this.cookRunning;
  }

  /** Test hook: sets the cook clock (begins the cook) and optionally pauses its advance. */
  public setCookClockForTest(sec: number, paused: boolean): void {
    this.beginCook("TEST");
    this.cookClockSec = Math.max(0, sec);
    this.cookClockPaused = paused;
    this.updateCookFacts();
  }

  /** Test hook: begins the cook if needed and moves the clock forward deterministically. */
  public advanceCookClock(seconds: number): void {
    this.beginCook("TEST");
    this.cookClockSec += Math.max(0, seconds);
    this.updateCookFacts();
  }

  /** Pinned = heat task on the burner (READY counts as on heat, mirroring the drift guardrail). */
  public isPinned(taskId: string): boolean {
    const t = this.tasks.get(taskId);
    if (!t || !t.pinOnHeat) return false;
    return (
      t.state === "READY" ||
      t.state === "ACTIVE" ||
      t.state === "NEEDS_ATTENTION" ||
      t.state === "PAUSED_BY_USER" ||
      t.pinnedStartSec !== undefined
    );
  }

  /** Natural / hand lateness input (monotonic per task). Emits TASK_LATE on whole-second crossings (<= 4 Hz). */
  public reportLateness(taskId: string, lateBySec: number, source: string = "CLOCK"): void {
    const t = this.tasks.get(taskId);
    if (!t || !(lateBySec > (t.latenessSec || 0))) return;
    t.latenessSec = lateBySec;
    const whole = Math.floor(lateBySec);
    const now = getTime();
    if (whole >= 1 && whole !== this.lastLateWhole[taskId] && (this.lastLateEmitAt < 0 || now - this.lastLateEmitAt >= 0.25)) {
      this.lastLateWhole[taskId] = whole;
      this.lastLateEmitAt = now;
      this.eventBus.emit("TASK_LATE", { taskId, lateBySec, source });
    }
  }

  /** Read-back from the rail: absolute, idempotent; ignored for pinned / started / non-WAIT tasks. */
  public setNotBefore(taskId: string, sec: number): boolean {
    const t = this.tasks.get(taskId);
    if (!t || this.isPinned(taskId) || t.actualStartSec !== undefined || t.state === "COMPLETE") return false;
    if (t.interruptionPolicy !== "WAIT_BEFORE_START") return false;
    t.notBeforeSec = Math.max(0, sec);
    return true;
  }

  /** Stage 6 hook: user plate start (null clears). */
  public requestPlatingTarget(plateStartSec: number | null): void {
    this.plateTargetSec = plateStartSec === null ? null : Math.max(0, plateStartSec);
  }

  private scheduleInputs(): ScheduleInputTask[] {
    const out: ScheduleInputTask[] = [];
    this.tasks.forEach((t) => {
      out.push({
        id: t.id,
        stationId: t.stationId,
        title: t.title,
        deps: t.dependencies,
        planned: t.plannedDurationSeconds,
        driftSec: t.driftSec || 0,
        latenessSec: t.latenessSec || 0,
        state: t.state,
        policy: t.interruptionPolicy,
        heat: t.heat || "OFF",
        pinned: this.isPinned(t.id),
        pinnedStartSec: t.pinnedStartSec,
        actualStartSec: t.actualStartSec,
        actualFinishSec: t.actualFinishSec,
        notBeforeSec: t.notBeforeSec,
      });
    });
    return out;
  }

  /** Current schedule (pure ScheduleModel); freezes the start of a heat task the first time it is pinned. */
  public getScheduleResult(): ScheduleResult {
    let r = computeSchedule(this.scheduleInputs(), this.cookClockSec, this.cookRunning, this.plateTargetSec);
    let refreeze = false;
    for (const s of r.tasks) {
      const t = this.tasks.get(s.id);
      if (!t) continue;
      if (t.pinOnHeat && t.pinnedStartSec === undefined && this.isPinned(t.id)) {
        t.pinnedStartSec = s.start;
        refreeze = true;
      }
      if (t.notBeforeSec !== undefined && s.asapNoNotBefore >= t.notBeforeSec - 0.01) {
        t.notBeforeSec = undefined; // its own ASAP already reaches it
        refreeze = true;
      }
    }
    if (refreeze) r = computeSchedule(this.scheduleInputs(), this.cookClockSec, this.cookRunning, this.plateTargetSec);
    const sig = r.tasks.map((t) => `${t.start.toFixed(1)}:${t.finish.toFixed(1)}`).join("|");
    if (sig !== this.lastScheduleSig) {
      this.lastScheduleSig = sig;
      this.scheduleRevision++;
    }
    return r;
  }

  public getSchedule(): ScheduledTask[] {
    return this.getScheduleResult().tasks;
  }

  public getBaselineSchedule(): ScheduleResult {
    return computeBaseline(this.scheduleInputs());
  }

  public getScheduleRevision(): number {
    return this.scheduleRevision;
  }

  /** Current scheduled start (s on the cook clock). Dish 01: sauce 45, after +25 s 70. */
  public getScheduledStart(taskId: string): number {
    for (const t of this.getSchedule()) if (t.id === taskId) return t.start;
    return -1;
  }

  public getBaselineStart(taskId: string): number {
    for (const t of this.getBaselineSchedule().tasks) if (t.id === taskId) return t.start;
    return -1;
  }

  public getMakespanSec(): number {
    return this.getScheduleResult().makespan;
  }

  public getBaselineMakespanSec(): number {
    return this.getBaselineSchedule().makespan;
  }

  public getPlateStartSec(): number {
    return this.getScheduleResult().plateStart;
  }

  public getPlateBaselineSec(): number {
    return this.getBaselineSchedule().plateStart;
  }

  /** Story clock of the plate: 400 s (06:40) at baseline plus the slip. */
  public getPlateClockSec(): number {
    return 400 + this.getPlateStartSec() - this.getPlateBaselineSec();
  }

  /** How long the pinned heat task must hold before plating (dish 01 after +25 s: 25). */
  public getHoldSec(pinnedId: string = "skillet_sear_skin"): number {
    const r = this.getScheduleResult();
    let fin = 0;
    for (const t of r.tasks) if (t.id === pinnedId) fin = t.finish;
    return Math.max(0, r.plateStart - fin);
  }

  /** Actual starts for newly active tasks and the natural lateness of the running manual task (prep). */
  private updateCookFacts(): void {
    if (!this.cookRunning) return;
    this.tasks.forEach((t) => {
      if (t.state === "ACTIVE" && t.actualStartSec === undefined) t.actualStartSec = this.cookClockSec;
      if (t.state === "COMPLETE" && t.actualStartSec !== undefined && t.actualFinishSec === undefined) t.actualFinishSec = this.cookClockSec;
    });
    const prep = this.tasks.get("prep_shallots");
    if (prep && prep.state !== "COMPLETE" && prep.actualStartSec !== undefined) {
      const late = this.cookClockSec - prep.actualStartSec - prep.plannedDurationSeconds - (prep.driftSec || 0);
      if (late > 0) this.reportLateness(prep.id, late, "CLOCK");
    }
  }

  private onUpdate(): void {
    if (this.cookRunning && !this.cookClockPaused && !this.hasConverged) {
      this.cookClockSec += getDeltaTime() * this.timeMultiplier;
      this.updateCookFacts();
    }
    if (!this.isRunning || this.isHeld || this.hasConverged) {
      return;
    }

    const dt = getDeltaTime() * this.timeMultiplier;

    // Decrement active tasks
    this.tasks.forEach((task) => {
      if (task.state === "ACTIVE" && task.remainingDurationSeconds > 0) {
        task.remainingDurationSeconds = Math.max(0, task.remainingDurationSeconds - dt);
        if (task.remainingDurationSeconds <= 0) {
          task.state = "COMPLETE";
          print(`[ScheduleEngine] Task '${task.id}' timer finished -> COMPLETE.`);
        }
      }
    });

    const skilletComplete = this.tasks.get("skillet_sear_skin")?.state === "COMPLETE";
    const sauceComplete = this.tasks.get("sauce_reduction")?.state === "COMPLETE";

    if (skilletComplete && sauceComplete && !this.hasConverged) {
      this.hasConverged = true;
      const plating = this.tasks.get("plating_garnish");
      if (plating) plating.state = "READY";

      print("[ScheduleEngine] T-ZERO PLATING CONVERGENCE REACHED!");
      this.eventBus.emit("PLATING_CONVERGENCE", {
        timestamp: getTime(),
        message: "3/3 STATIONS SYNCED • READY TO PLATE"
      });
    }
  }
}
