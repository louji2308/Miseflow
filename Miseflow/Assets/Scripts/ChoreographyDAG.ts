import { MiseFlowEventBus } from "./MiseFlowEventBus";

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
}

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

  onAwake(): void {
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

  private onUpdate(): void {
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
