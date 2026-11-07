import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { LadleOrbitalStir } from "./LadleOrbitalStir";
import { StationPropsBuilder } from "./StationPropsBuilder";
import { StepSpec } from "./AI/UniversalDishSchema";
import { KineProvider, KineRegistry, alive, dishBuilder, stationsRootOf, stepOf } from "./KineRegistry";

const STEP_DELAY = 0.4; // STEP_STARTED -> first pantry action (the step card lands first)
const JOB_CAP = 7.0; // any single pantry action is released after this (real s)
const MELT_SEC = 3.2;
const FILL_SEC = 2.5;

type Job = { name: string; run: (next: () => void) => void };

function textOf(s: StepSpec): string {
  return `${s.id} ${s.title}`.toLowerCase();
}

/**
 * PantryChoreographer.ts (v5 K1b) - per-step pantry choreography (A5 props, only those the dish lists)
 * On STEP_STARTED it runs, in order and one at a time, the pantry actions that belong to that step:
 *   #162 butter / ghee  placeOn + meltOver: the step whose id/title says "butter" (pot when that step is at the
 *                       saucepot, with a RAISED target on the sauce surface), else the first skillet step (pan)
 *   #160 whole spices   dropInto the hot fat of the pan at the first skillet step (before the onions go in)
 *   #161 powders        pinchInto the prep bowl at the PREP "spice / pinch" step, else into the pot (raised) at the
 *                       first saucepot step; one pinch per powder
 *   #165 oil / glaze    drizzle into the pan at the "glaze / drizzle / oil" step, else at the first skillet step
 *   #166 dal / chickpea setFill in the pot at the first saucepot step
 *   LADLE steps         a fresh LADLE_STIR_REQUESTED once the masala is in the pot and the ladle is idle (after the
 *                       butter for a "finish with butter" step)
 *   plating             #164 cream swirl / #163 cheese melt on the plated dish (PlatingFinisher -> KineRegistry hook)
 * Reset (and any newly applied dish) clears the queue; the dish re-apply rebuilds the props at rest. Never throws.
 */
@component
export class PantryChoreographer extends BaseScriptComponent implements KineProvider {
  private static instance: PantryChoreographer | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private props: StationPropsBuilder | null = null;
  private queue: Job[] = [];
  private running: boolean = false;
  private jobName: string = "";
  private jobT: number = 0;
  private gen: number = 0;
  private curNext: (() => void) | null = null;
  private pending: { t: number; jobs: Job[] }[] = [];
  private actions: number = 0;

  public static getInstance(): PantryChoreographer | null {
    return PantryChoreographer.instance;
  }

  onAwake(): void {
    PantryChoreographer.instance = this;
    KineRegistry.register("PANTRY", this);
    KineRegistry.setPlatingHook((top, plate) => this.onPlating(top, plate));
    this.createEvent("OnStartEvent").bind(() => {
      this.listen("RESET_REQUESTED", () => this.cancel());
      this.listen("STEP_STARTED", (d?: any) => this.onStep(d));
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      KineRegistry.unregister("PANTRY", this);
      KineRegistry.setPlatingHook(null);
      if (PantryChoreographer.instance === this) PantryChoreographer.instance = null;
    });
  }

  // ── KineProvider ──

  public isBusy(): boolean {
    return this.running || this.queue.length > 0 || this.pending.length > 0;
  }

  public getDoneCount(): number {
    return this.actions;
  }

  public cancel(): void {
    this.gen++;
    this.queue = [];
    this.pending = [];
    this.running = false;
    this.curNext = null;
    this.jobName = "";
  }

  // ── internals ──

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[PantryChoreo] ${ev} handler error: ${e}`);
      }
    };
    this.bus.on(ev, safe);
    this.handlers.push({ ev: ev, cb: safe });
  }

  private resolveProps(): StationPropsBuilder | null {
    if (!this.props) {
      const root = stationsRootOf(this.getSceneObject());
      if (root) this.props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    }
    return this.props;
  }

  private pantry(): any {
    const b = dishBuilder();
    return b && typeof b.getPantry === "function" ? b.getPantry() : null;
  }

  private onUpdate(): void {
    const dt = getDeltaTime();
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        for (const j of p.jobs) this.queue.push(j);
        this.pump();
      }
    }
    if (this.running) {
      this.jobT += dt;
      if (this.jobT > JOB_CAP && this.curNext) {
        print(`[PantryChoreo] ${this.jobName} capped after ${JOB_CAP}s`);
        this.curNext();
      }
    }
  }

  private pump(): void {
    if (this.running || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    const g = this.gen;
    let finished = false;
    this.running = true;
    this.jobT = 0;
    this.jobName = job.name;
    const next = () => {
      if (finished || g !== this.gen) return;
      finished = true;
      this.running = false;
      this.curNext = null;
      this.actions++;
      this.pump();
    };
    this.curNext = next;
    try {
      print(`[PantryChoreo] ${job.name}`);
      job.run(next);
    } catch (e) {
      print(`[PantryChoreo] ${job.name} failed: ${e}`);
      next();
    }
  }

  /** Pot target; with sauce in the pot the surface is raised to the liquid level (A5 leftover). */
  private potTarget(pantry: any): any {
    const t = pantry.target("pot");
    const props = this.resolveProps();
    if (!t || !props) return t;
    const pot = props.getSaucierPot();
    const level = props.getSauceLevel();
    if (!alive(pot) || level <= 0.05) return t;
    const w = pot.getTransform().getWorldTransform().multiplyPoint(new vec3(0, level + 0.05, 0));
    const rLocal = t.profile ? pantry.innerRadius(t.profile, level) * 0.75 : 3.0;
    return { obj: t.obj, world: w, radius: Math.max(0.8, rLocal * t.scale), scale: t.scale, kind: "top" };
  }

  private onStep(d?: any): void {
    const s = stepOf(d);
    const eng = KineRegistry.getEngine();
    const pantry = this.pantry();
    if (!s || !eng) return;
    const steps = eng.getSteps();
    const idx = d.index as number;
    const first = (pred: (x: StepSpec) => boolean): number => {
      for (let i = 0; i < steps.length; i++) if (pred(steps[i])) return i;
      return -1;
    };
    const firstSkillet = first((x) => x.station === "SKILLET");
    const firstSauce = first((x) => x.station === "SAUCEPOT");
    const jobs: Job[] = [];
    const has = (n: number) => !!pantry && !!pantry.getProp(n);

    if (has(162)) {
      let bi = first((x) => /butter|ghee/.test(textOf(x)) && x.station !== "PLATING");
      if (bi < 0) bi = firstSkillet;
      if (bi === idx) {
        const inPot = s.station === "SAUCEPOT";
        jobs.push({
          name: `#162 butter placeOn + meltOver (${inPot ? "pot, raised" : "pan"})`,
          run: (next) => {
            const p = pantry.getProp(162);
            const t = inPot ? this.potTarget(pantry) : pantry.target("pan");
            if (!p || !t) return next();
            p.placeOn(t, () => {
              p.meltOver(MELT_SEC);
              next();
            });
          },
        });
      }
    }
    if (has(160) && firstSkillet === idx) {
      jobs.push({
        name: "#160 whole spices dropInto (pan)",
        run: (next) => {
          const p = pantry.getProp(160);
          if (!p) return next();
          p.dropInto(pantry.target("pan"), next);
        },
      });
    }
    if (has(161)) {
      let pi = first((x) => x.station === "PREP" && /spice|pinch|powder|masala/.test(textOf(x)));
      const intoBowl = pi >= 0;
      if (pi < 0) pi = firstSauce;
      if (pi === idx) {
        const p = pantry.getProp(161);
        const count = p && typeof p.getPowderCount === "function" ? Math.max(1, Math.min(3, p.getPowderCount())) : 1;
        for (let i = 0; i < count; i++) {
          jobs.push({
            name: `#161 powder ${i + 1}/${count} pinchInto (${intoBowl ? "prep bowl" : "pot, raised"})`,
            run: (next) => {
              const pp = pantry.getProp(161);
              const props = this.resolveProps();
              const bowl = props ? props.getBowlObject() : null;
              const t = intoBowl && alive(bowl) ? bowl : this.potTarget(pantry);
              if (!pp || !t) return next();
              pp.pinchInto(t, i, next);
            },
          });
        }
      }
    }
    if (has(165)) {
      let ci = first((x) => /glaze|drizzle|oil/.test(textOf(x)));
      if (ci < 0) ci = firstSkillet;
      if (ci === idx) {
        jobs.push({
          name: "#165 cruet drizzle (pan)",
          run: (next) => {
            const p = pantry.getProp(165);
            const t = pantry.target("pan");
            if (!p || !t) return next();
            p.drizzle(t, undefined, next);
          },
        });
      }
    }
    if (has(166) && firstSauce === idx) {
      jobs.push({
        name: "#166 legumes setFill (pot)",
        run: (next) => {
          const p = pantry.getProp(166);
          const t = pantry.target("pot");
          if (!p || !t) return next();
          pantry.tweens.add(this, 0, FILL_SEC, (k: number) => p.setFill(k, t), next);
        },
      });
    }
    if (s.kinematic === "KINE_LADLE_ORBITAL_STIR") {
      jobs.push({
        name: "ladle stir request (masala in the pot, ladle idle)",
        run: (next) => {
          const props = this.resolveProps();
          const stir = LadleOrbitalStir.getInstance();
          if (props && props.isBowlPouredIntoSaucier() && !props.isSaucierPourActive() && stir && !stir.isBusy()) {
            this.bus.emit("LADLE_STIR_REQUESTED", { revolutions: 2, source: "step" });
          }
          next();
        },
      });
    }
    if (jobs.length > 0) this.pending.push({ t: STEP_DELAY, jobs: jobs });
  }

  /** Plating finish (called by PlatingFinisher through KineRegistry at the garnish beat): cream swirl, cheese melt. */
  private onPlating(top: vec3, plate: SceneObject | null): void {
    const pantry = this.pantry();
    if (!pantry || !alive(plate)) return;
    const unit = pantry.unit();
    const scale = plate.getTransform().getWorldScale().x / Math.max(1e-4, unit);
    const t = { obj: plate, world: top.add(new vec3(0, 0.04, 0)), radius: 1.5, scale: scale, kind: "top" };
    const cheese = pantry.getProp(163);
    if (cheese) {
      print("[PantryChoreo] #163 cheese placeOn + meltOver (plated dish)");
      cheese.placeOn(t, () => cheese.meltOver(2.5));
    }
    const cream = pantry.getProp(164);
    if (cream) {
      print("[PantryChoreo] #164 cream swirlOnto (plated dish)");
      cream.swirlOnto(t, undefined, 2.4);
    }
  }
}
