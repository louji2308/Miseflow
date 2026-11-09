/**
 * CookRuntime.ts  (Chef Director v6, W4)
 *
 * Runs a CookWorld's plan. Steps form a DAG over step.after (an empty `after` waits on the previous step in the list),
 * so independent steps run concurrently (one vessel fries while another tempers). A step = its CookAction's promise
 * plus a 0.8 s dwell; then STEP_DONE, and FINISHED once every step is done.
 *
 * Modes: MANUAL (default) starts the next ready step on each COOK_DO_STEP request; AUTO (COOK_AUTO {on:true}) starts
 * every ready step immediately. CookEvents.EXIT cancels every running action (tweens rejected, FX destroyed, tools and
 * borrowed poses restored) and resets. A fresh WORLD_READY restarts on the new world.
 *
 * Bus:  in  COOK_WORLD_READY {world}, COOK_EXIT {}, COOK_DO_STEP {}, COOK_AUTO {on:boolean}
 *       out COOK_STEP_STARTED / COOK_STEP_DONE / COOK_FINISHED (payloads in CookWorld.ts), COOK_MODE_CHANGED {auto}
 */

import { MiseFlowEventBus, MiseFlowEventType } from "../MiseFlowEventBus";
import { CookStep, HEAT_LEVELS } from "./CookPlanSchema";
import { CookEvents, CookWorld, EquipmentHandle, HeatLevel, ItemHandle, ToolHandle } from "./CookWorld";
import { ItemState } from "./ItemState";
import { CookActionContext, CookSignal, CookTweener, isCancel, toolSnapHome, alive, setToolAim } from "./Actions/CookActionKit";
import { CookActionRegistry, DEFAULT_DURATION } from "./Actions/CookActionRegistry";

export const CookRuntimeEvents = {
  /** {} start the next ready step (MANUAL mode) */
  DO_STEP: "COOK_DO_STEP",
  /** {on:boolean} AUTO mode on / off */
  AUTO: "COOK_AUTO",
  /** {auto:boolean} mode changed (card button label) */
  MODE: "COOK_MODE_CHANGED",
} as const;

export const STEP_DWELL_SEC = 0.8;

/** Baseline steam over a heated vessel while a step of this action runs (actions with their own steam override it). */
const STEAM_BASE: { [action: string]: number } = {
  HEAT_OIL: 0.18, DEEP_FRY: 0.55, SHALLOW_FRY: 0.4, BOIL: 0.85, SIMMER: 0.6, SAUTE_TOSS: 0.45, TEMPER: 0.4, COOK_FLAT: 0.25,
  FLIP: 0.3, MIX: 0.3, WHISK: 0.3, POUR: 0.35, SEASON: 0.2, STEAM_DUM: 0.6, GENERIC: 0.25,
};

type StepStatus = "pending" | "running" | "dwell" | "done";

interface RunRec {
  step: CookStep;
  index: number;
  sig: CookSignal;
  fxRoot: SceneObject | null;
  tool: ToolHandle | null;
  cleanups: (() => void)[];
  aborted: boolean;
  dwell: number;
  t0: number;
}

export interface CookRuntimeState {
  active: boolean;
  auto: boolean;
  finished: boolean;
  total: number;
  running: string[];
  done: string[];
  pending: string[];
  ready: string[];
  errors: number;
  lastError: string;
  lastStarted: string;
  tweens: number;
}

function ev(name: string): MiseFlowEventType {
  return name as unknown as MiseFlowEventType;
}

@component
export class CookRuntime extends BaseScriptComponent {
  /** Playback speed (1 = real time). Dev / LEAF can raise it. */
  @input
  speed: number = 1;

  /** Start in AUTO mode (otherwise MANUAL: one step per COOK_DO_STEP). */
  @input
  autoDefault: boolean = false;

  private static instance: CookRuntime | null = null;
  /** The speed set in the inspector: every new dish and every exit goes back to it (tests / dev may raise it meanwhile). */
  private baseSpeed: number = 1;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private tweener: CookTweener = new CookTweener();

  private world: CookWorld | null = null;
  private items: ItemState | null = null;
  private steps: CookStep[] = [];
  private status: { [id: string]: StepStatus } = {};
  private deps: { [id: string]: string[] } = {};
  private runs: { [id: string]: RunRec } = {};
  private auto: boolean = false;
  private finished: boolean = false;
  private doRequests: number = 0;
  private generation: number = 0;
  private errors: number = 0;
  private lastError: string = "";
  private lastStarted: string = "";
  private clock: number = 0;

  public static getInstance(): CookRuntime | null {
    return CookRuntime.instance;
  }

  onAwake(): void {
    CookRuntime.instance = this;
    this.baseSpeed = isFinite(this.speed) && this.speed > 0 ? this.speed : 1;
    this.auto = !!this.autoDefault;
    this.listen(CookEvents.WORLD_READY, (d?: any) => {
      if (d && d.world) this.startWorld(d.world as CookWorld);
    });
    this.listen(CookEvents.EXIT, () => this.exit());
    this.listen(CookRuntimeEvents.DO_STEP, () => this.doStep());
    this.listen(CookRuntimeEvents.AUTO, (d?: any) => this.setAuto(d && typeof d.on === "boolean" ? d.on : !this.auto));
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      this.cancelAll();
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (CookRuntime.instance === this) CookRuntime.instance = null;
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public getState(): CookRuntimeState {
    const running: string[] = [];
    const done: string[] = [];
    const pending: string[] = [];
    for (const s of this.steps) {
      const st = this.status[s.id];
      if (st === "running" || st === "dwell") running.push(s.id);
      else if (st === "done") done.push(s.id);
      else pending.push(s.id);
    }
    return {
      active: !!this.world,
      auto: this.auto,
      finished: this.finished,
      total: this.steps.length,
      running: running,
      done: done,
      pending: pending,
      ready: this.readySteps().map((s) => s.id),
      errors: this.errors,
      lastError: this.lastError,
      lastStarted: this.lastStarted,
      tweens: this.tweener.count(),
    };
  }

  public getWorld(): CookWorld | null {
    return this.world;
  }

  public getItemState(): ItemState | null {
    return this.items;
  }

  public getSpeed(): number {
    return this.speed;
  }

  public isAuto(): boolean {
    return this.auto;
  }

  public setAuto(on: boolean): void {
    if (this.auto === on) return;
    this.auto = on;
    print(`[CookRuntime] mode ${on ? "AUTO" : "MANUAL"}`);
    this.bus.emit(ev(CookRuntimeEvents.MODE), { auto: on });
  }

  /** MANUAL: start the next ready step (queued when none is ready yet). Returns true when a step started now. */
  public doStep(): boolean {
    if (!this.world || this.finished) return false;
    const r = this.readySteps();
    if (r.length > 0) return this.startStep(r[0]);
    this.doRequests = Math.min(1, this.doRequests + 1);
    return false;
  }

  /** v7 Stage 3: a station target's Done pinch starts exactly this ready step (same path as COOK_DO_STEP, but vessel-specific). */
  public startReadyStep(stepId: string): boolean {
    if (!this.world || this.finished) return false;
    for (const s of this.readySteps()) if (s.id === stepId) return this.startStep(s);
    return false;
  }

  public setSpeed(s: number): void {
    this.speed = isFinite(s) && s > 0 ? Math.min(20, s) : 1;
  }

  /** Begins a plan on a world (cancels whatever ran before). */
  public startWorld(world: CookWorld): void {
    this.cancelAll();
    this.reset();
    // a new dish always starts at normal speed in MANUAL mode (a previous test or session may have left AUTO / a fast speed on)
    this.speed = this.baseSpeed;
    this.setAuto(!!this.autoDefault);
    this.world = world;
    this.items = new ItemState(world);
    const plan = world.plan;
    this.steps = plan && Array.isArray(plan.steps) ? plan.steps.filter((s) => !!s && typeof s.id === "string") : [];
    const ids: { [id: string]: boolean } = {};
    for (const s of this.steps) ids[s.id] = true;
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i];
      this.status[s.id] = "pending";
      let d = Array.isArray(s.after) ? s.after.filter((a) => ids[a] && a !== s.id) : [];
      if ((!Array.isArray(s.after) || s.after.length === 0) && i > 0) d = [this.steps[i - 1].id];
      this.deps[s.id] = d;
    }
    for (const id in world.items) this.items.paint(id);
    print(`[CookRuntime] world ready: "${plan ? plan.dishTitle : "?"}" ${this.steps.length} steps, mode ${this.auto ? "AUTO" : "MANUAL"}`);
    this.bus.emit(ev(CookRuntimeEvents.MODE), { auto: this.auto });
  }

  /** EXIT: cancel every running action and forget the world (the stage disposes the scene itself). */
  public exit(): void {
    const had = !!this.world;
    this.cancelAll();
    this.reset();
    this.speed = this.baseSpeed;
    this.setAuto(!!this.autoDefault);
    if (had) print("[CookRuntime] exit: cancelled and reset");
  }

  // ───────────────────────── scheduling ─────────────────────────

  private listen(name: string, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[CookRuntime] ${name} handler error: ${e}`);
      }
    };
    this.bus.on(ev(name), safe);
    this.handlers.push({ ev: ev(name), cb: safe });
  }

  private reset(): void {
    this.generation++;
    this.world = null;
    this.items = null;
    this.steps = [];
    this.status = {};
    this.deps = {};
    this.runs = {};
    this.finished = false;
    this.doRequests = 0;
    this.lastStarted = "";
  }

  private readySteps(): CookStep[] {
    const out: CookStep[] = [];
    for (const s of this.steps) {
      if (this.status[s.id] !== "pending") continue;
      let ok = true;
      for (const d of this.deps[s.id] || []) {
        if (this.status[d] !== "done") {
          ok = false;
          break;
        }
      }
      if (ok) out.push(s);
    }
    return out;
  }

  private onUpdate(): void {
    const dt = Math.min(0.1, getDeltaTime());
    this.clock += dt;
    this.tweener.update(dt);
    if (!this.world || this.finished) return;
    // dwell -> done
    for (const id in this.runs) {
      const r = this.runs[id];
      if (this.status[id] !== "dwell") continue;
      r.dwell -= dt * Math.max(1, this.speed);
      if (r.dwell <= 0) this.complete(r);
    }
    if (!this.world || this.finished) return;
    let ready = this.readySteps();
    if (this.auto) {
      for (const s of ready) this.startStep(s);
    } else if (this.doRequests > 0 && ready.length > 0) {
      this.doRequests = 0;
      this.startStep(ready[0]);
    }
    // safety: nothing running, nothing ready, steps left -> a dependency can never resolve; release the first
    ready = this.readySteps();
    if (ready.length === 0 && Object.keys(this.runs).length === 0) {
      for (const s of this.steps) {
        if (this.status[s.id] === "pending") {
          print(`[CookRuntime] unresolvable deps for ${s.id}, releasing it`);
          this.deps[s.id] = [];
          break;
        }
      }
    }
  }

  private equipmentFor(id: string): EquipmentHandle | null {
    const w = this.world;
    if (!w) return null;
    if (id && w.equipment[id]) return w.equipment[id];
    for (const k in w.equipment) if (w.equipment[k] !== w.plate) return w.equipment[k];
    return w.plate || null;
  }

  private startStep(s: CookStep): boolean {
    const w = this.world;
    const items = this.items;
    if (!w || !items || this.status[s.id] !== "pending") return false;
    const eq = this.equipmentFor(s.equipmentId);
    const index = this.steps.indexOf(s);
    const total = this.steps.length;
    this.status[s.id] = "running";
    this.lastStarted = s.id;
    const tool = s.toolId && w.tools[s.toolId] ? w.tools[s.toolId] : null;
    const its = (Array.isArray(s.ingredientIds) ? s.ingredientIds : []).map((id) => w.items[id]).filter((it) => !!it);
    // items the stage staged hidden (e.g. dough produced from flour) appear when a step first uses them
    this.showItems(its);
    if (tool && eq) setToolAim(tool, eq.floorWorld()); // handle points away from the vessel, toward where the tool lies
    const sig: CookSignal = { cancelled: false };
    let fxRoot: SceneObject | null = null;
    try {
      fxRoot = global.scene.createSceneObject(`CookFx_${s.id}`);
      if (w.root && !isNull(w.root)) fxRoot.setParent(w.root);
    } catch (e) {
      fxRoot = null;
    }
    const rec: RunRec = { step: s, index: index, sig: sig, fxRoot: fxRoot, tool: tool, cleanups: [], aborted: false, dwell: STEP_DWELL_SEC, t0: this.clock };
    this.runs[s.id] = rec;
    const action = CookActionRegistry.get(s.action);
    const durRaw = typeof s.durationSec === "number" && isFinite(s.durationSec) && s.durationSec > 0 ? s.durationSec : DEFAULT_DURATION[action.name] || 4;
    const self = this;
    const ctx: CookActionContext = {
      world: w,
      step: s,
      equipment: eq as EquipmentHandle,
      tool: tool,
      items: its,
      from: s.fromId && w.equipment[s.fromId] ? w.equipment[s.fromId] : null,
      to: s.toId && w.equipment[s.toId] ? w.equipment[s.toId] : null,
      state: items,
      signal: sig,
      speed: this.speed,
      dur: Math.max(1, Math.min(45, durRaw)),
      count(def: number, max: number = 20): number {
        const c = typeof s.count === "number" && isFinite(s.count) && s.count > 0 ? Math.round(s.count) : def;
        return Math.max(1, Math.min(max, c));
      },
      tween(sec: number, fn?: (k: number) => void): Promise<void> {
        return self.tweener.run(sig, Math.max(0, sec) / Math.max(0.05, self.speed), fn);
      },
      wait(sec: number): Promise<void> {
        return self.tweener.run(sig, Math.max(0, sec) / Math.max(0.05, self.speed));
      },
      fxRoot: fxRoot || w.root,
      onCleanup(fn: () => void): void {
        rec.cleanups.push(fn);
      },
      holdPose(obj: SceneObject): void {
        if (!alive(obj)) return;
        const tr = obj.getTransform();
        const p = tr.getLocalPosition();
        const r = tr.getLocalRotation();
        const sc = tr.getLocalScale();
        rec.cleanups.push(() => {
          if (!alive(obj)) return;
          tr.setLocalPosition(p);
          tr.setLocalRotation(r);
          tr.setLocalScale(sc);
        });
      },
      log(msg: string): void {
        print(`[Cook:${s.action}:${s.id}] ${msg}`);
      },
    };
    this.applyForms(s, its, sig, ctx.dur);
    // heat follows the step on burner vessels (a burner step with heat OFF turns it off)
    if (eq && this.onBurner(eq.id)) {
      const h = String(s.heat || "").toUpperCase();
      if (HEAT_LEVELS.indexOf(h) >= 0) {
        try {
          eq.setHeat(h as HeatLevel);
        } catch (e) {
          print(`[CookRuntime] setHeat failed: ${e}`);
        }
      }
    }
    // steam wherever the food is hot: over a heated vessel while a step cooks in it, fading when its heat goes off
    if (eq && this.onBurner(eq.id)) {
      try {
        const hot = String(s.heat || "").toUpperCase() !== "OFF";
        const base = STEAM_BASE[action.name];
        if (hot && base !== undefined) eq.setSteam(base);
        else if (!hot) eq.setSteam(0.25, 3);
      } catch (e) {
        print(`[CookRuntime] setSteam failed: ${e}`);
      }
    }
    this.bus.emit(ev(CookEvents.STEP_STARTED), {
      stepId: s.id, index: index, total: total, action: action.name, title: s.title || action.name, whatWhy: s.whatWhy || "", equipmentId: s.equipmentId || (eq ? eq.id : ""),
    });
    print(`[CookRuntime] STEP_STARTED ${index + 1}/${total} ${s.id} (${s.action}${action.name !== String(s.action).toUpperCase() ? " -> GENERIC" : ""})`);
    const gen = this.generation;
    let p: Promise<void>;
    try {
      p = eq ? action.run(ctx) : Promise.reject(new Error("no equipment in world"));
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      () => this.onActionEnd(rec, gen, null),
      (e: any) => this.onActionEnd(rec, gen, e)
    );
    return true;
  }

  /**
   * Shape transformations of vegetables: CUT swaps whole -> cut pieces halfway through the chopping; a vegetable that is
   * used by any other step is never left whole (it is cut when the step starts); in a paste / puree dish the pieces
   * turn into a paste halfway through the first heating / mixing step.
   */
  private applyForms(s: CookStep, its: ItemHandle[], sig: CookSignal, dur: number): void {
    const act = String(s.action).toUpperCase();
    const pasteActs = ["SIMMER", "BOIL", "MIX", "WHISK", "SAUTE_TOSS", "SHALLOW_FRY", "TEMPER", "STEAM_DUM"];
    const later = (sec: number, fn: () => void): void => {
      this.tweener.run(sig, Math.max(0, sec) / Math.max(0.05, this.speed)).then(fn, () => undefined);
    };
    for (const it of its) {
      if (!it.setForm || !it.hasForm) continue;
      const cur = it.form || "whole";
      if (act === "CUT") {
        if (cur === "whole" && it.hasForm("cut")) later(dur * 0.5, () => it.setForm && it.setForm("cut"));
        continue;
      }
      if (cur === "whole" && it.hasForm("cut")) it.setForm("cut");
      if (pasteActs.indexOf(act) >= 0 && it.hasForm("paste") && (it.form || "whole") !== "paste") {
        later(dur * 0.5, () => it.setForm && it.setForm("paste"));
      }
    }
  }

  private onBurner(eqId: string): boolean {
    const plan = this.world ? this.world.plan : null;
    if (!plan || !plan.equipment) return false;
    for (const e of plan.equipment) if (e && e.id === eqId) return (e.burner || 0) > 0;
    return false;
  }

  private onActionEnd(rec: RunRec, gen: number, err: any): void {
    if (rec.aborted || gen !== this.generation) return;
    if (err && !isCancel(err)) {
      this.errors++;
      this.lastError = `${rec.step.id}: ${err}`;
      print(`[CookRuntime] action ${rec.step.action} (${rec.step.id}) error: ${err}${err && err.stack ? "\n" + err.stack : ""}`);
    }
    this.cleanupRun(rec);
    if (String(rec.step.action).toUpperCase() === "CUT" && this.world) {
      for (const id of rec.step.ingredientIds || []) {
        const it = this.world.items[id];
        if (it && it.setForm && it.hasForm && it.hasForm("cut") && (it.form || "whole") === "whole") it.setForm("cut");
      }
    }
    // plated food stays visible (PLATE without ingredients plates the whole dish)
    if (String(rec.step.action).toUpperCase() === "PLATE" && this.world) {
      const w = this.world;
      const ids = Array.isArray(rec.step.ingredientIds) && rec.step.ingredientIds.length > 0 ? rec.step.ingredientIds : Object.keys(w.items);
      const plated = ids.map((id) => w.items[id]).filter((it) => !!it);
      this.showItems(plated);
      // nothing plated stays a whole vegetable that the recipe cut or cooked down
      for (const it of plated) {
        if (it.setForm && it.hasForm && (it.form || "whole") === "whole" && it.hasForm("cut")) it.setForm(it.hasForm("paste") ? "paste" : "cut");
      }
    }
    this.status[rec.step.id] = "dwell";
  }

  private showItems(list: ItemHandle[]): void {
    for (const it of list) {
      try {
        it.setVisible(true);
      } catch (e) {
        // handle gone with the world
      }
    }
  }

  private cleanupRun(rec: RunRec): void {
    this.tweener.cancel(rec.sig); // flushes fire-and-forget FX tweens of this action
    for (let i = rec.cleanups.length - 1; i >= 0; i--) {
      try {
        rec.cleanups[i]();
      } catch (e) {
        print(`[CookRuntime] cleanup error: ${e}`);
      }
    }
    rec.cleanups = [];
    if (rec.fxRoot && !isNull(rec.fxRoot)) {
      try {
        rec.fxRoot.destroy();
      } catch (e) {
        // already gone with the world
      }
    }
    rec.fxRoot = null;
    try {
      toolSnapHome(rec.tool);
    } catch (e) {
      // tool gone with the world
    }
  }

  private complete(rec: RunRec): void {
    const s = rec.step;
    this.status[s.id] = "done";
    delete this.runs[s.id];
    this.bus.emit(ev(CookEvents.STEP_DONE), { stepId: s.id, index: rec.index, total: this.steps.length });
    print(`[CookRuntime] STEP_DONE ${rec.index + 1}/${this.steps.length} ${s.id} (${(this.clock - rec.t0).toFixed(1)} s)`);
    for (const x of this.steps) if (this.status[x.id] !== "done") return;
    this.finished = true;
    const w = this.world;
    if (w) {
      // nothing stays hidden at the end
      const all: ItemHandle[] = [];
      for (const id in w.items) all.push(w.items[id]);
      this.showItems(all);
      for (const id in w.equipment) {
        try {
          if (this.onBurner(id)) {
            w.equipment[id].setHeat("OFF");
            w.equipment[id].setSteam(0.2, 4); // the last wisps rise and fade
          }
        } catch (e) {
          // ignore
        }
      }
    }
    this.bus.emit(ev(CookEvents.FINISHED), {});
    print(`[CookRuntime] FINISHED (${this.errors} action errors)`);
  }

  private cancelAll(): void {
    for (const id in this.runs) {
      const r = this.runs[id];
      if (r.aborted) continue;
      r.aborted = true;
      r.sig.cancelled = true;
      this.cleanupRun(r);
    }
    this.runs = {};
    this.tweener.cancelAll();
  }
}
