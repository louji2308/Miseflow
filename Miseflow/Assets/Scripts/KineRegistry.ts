import { DishAssetBuilders } from "./AI/IDishAssetBuilder";
import { StepSpec } from "./AI/UniversalDishSchema";

/**
 * KineRegistry.ts (v5 K1b)
 * Import-cycle-free glue between the step engine, Auto Cook, the plating finisher and the K1b kinematics
 * (NoodleLiftToss, RiceDumLayer, WhiskEmulsion, PantryChoreographer). Each kinematic registers a provider
 * (busy flag + completed-run counter); the StepEngine registers itself so Auto Cook can follow it without
 * importing it. Also holds the step classifier (shared by StepEngine and Auto Cook) and a small deterministic
 * timeline used by every K1b kinematic (each segment either runs for a fixed time or waits on a condition with a
 * hard cap, so nothing can hang; any exception ends the timeline).
 */

export type StepKind = "CHOP" | "PORTION" | "TRANSFER" | "SAUCE" | "SEAR" | "FLIPPED" | "LADLE" | "DUM" | "WHISK" | "NOODLE" | "PLATED";
export type K1bKind = "NOODLE" | "DUM" | "WHISK";

export interface KineProvider {
  isBusy(): boolean;
  /** Completed runs since boot (StepEngine compares it with the count when the step started). */
  getDoneCount(): number;
  cancel(): void;
}

export interface StepEngineLike {
  getDishId(): string;
  getCurrentIndex(): number;
  isEnabled(): boolean;
  skipToNext(): void;
  getSteps(): StepSpec[];
}

const providers: { [k: string]: KineProvider } = {};
let engine: StepEngineLike | null = null;
let platingHook: ((topWorld: vec3, plate: SceneObject | null) => void) | null = null;

export const KineRegistry = {
  register(kind: K1bKind | string, p: KineProvider): void {
    providers[kind] = p;
  },
  unregister(kind: K1bKind | string, p: KineProvider): void {
    if (providers[kind] === p) delete providers[kind];
  },
  get(kind: string): KineProvider | null {
    return providers[kind] || null;
  },
  /** True while any K1b kinematic (noodle toss, dum, whisk, pantry chain) is still animating. */
  anyBusy(): boolean {
    for (const k in providers) {
      try {
        if (providers[k].isBusy()) return true;
      } catch (e) {
        // ignore a broken provider
      }
    }
    return false;
  },
  cancelAll(): void {
    for (const k in providers) {
      try {
        providers[k].cancel();
      } catch (e) {
        // ignore
      }
    }
  },
  setEngine(e: StepEngineLike | null): void {
    engine = e;
  },
  getEngine(): StepEngineLike | null {
    return engine;
  },
  /** PantryChoreographer registers the plating finish (cream swirl / cheese melt on the plated dish). */
  setPlatingHook(fn: ((topWorld: vec3, plate: SceneObject | null) => void) | null): void {
    platingHook = fn;
  },
  platingFinish(topWorld: vec3, plate: SceneObject | null): void {
    if (!platingHook) return;
    try {
      platingHook(topWorld, plate);
    } catch (e) {
      print(`[KineRegistry] plating hook error: ${e}`);
    }
  },
};

/** Completion kind of every step of a dish (StepEngine header table). */
export function classifySteps(steps: StepSpec[]): StepKind[] {
  const out: StepKind[] = [];
  let chopSeen = false;
  let transferSeen = false;
  let lastFlip = -1;
  for (let i = 0; i < steps.length; i++) {
    const k = steps[i].kinematic;
    if (k === "KINE_SPATULA_FLIP_180" || k === "KINE_PAN_TOSS_ROLL") lastFlip = i;
  }
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    switch (s.kinematic) {
      case "KINE_ROCK_CHOP":
        out.push(chopSeen ? "PORTION" : "CHOP");
        chopSeen = true;
        break;
      case "KINE_TWO_STAGE_POUR":
        if (s.station === "PREP") out.push("PORTION");
        else {
          out.push(transferSeen ? "SAUCE" : "TRANSFER");
          transferSeen = true;
        }
        break;
      case "KINE_SPATULA_FLIP_180":
      case "KINE_PAN_TOSS_ROLL":
        out.push(i === lastFlip ? "FLIPPED" : "SEAR");
        break;
      case "KINE_LADLE_ORBITAL_STIR":
        out.push("LADLE");
        break;
      case "KINE_RICE_DUM_LAYER":
        out.push("DUM");
        break;
      case "KINE_WHISK_EMULSION":
        out.push("WHISK");
        break;
      case "KINE_NOODLE_LIFT_TOSS":
        out.push("NOODLE");
        break;
      default:
        out.push("PLATED");
        break;
    }
  }
  return out;
}

/** The step the engine just announced (STEP_STARTED payload), or null. */
export function stepOf(d: any): StepSpec | null {
  const e = engine;
  if (!e || !d || typeof d.index !== "number") return null;
  if (d.dishId && e.getDishId() !== d.dishId) return null;
  const steps = e.getSteps();
  return d.index >= 0 && d.index < steps.length ? steps[d.index] : null;
}

/** The real dish builder (StationPropsDishBuilder, duck-typed so this module stays import-light), else null. */
export function dishBuilder(): any {
  const b: any = DishAssetBuilders.get();
  return b && typeof b.getHeroWare === "function" && typeof b.getToolWare === "function" ? b : null;
}

export function findByName(parent: SceneObject | null, name: string): SceneObject | null {
  if (!parent || isNull(parent)) return null;
  if (parent.name === name) return parent;
  const n = parent.getChildrenCount();
  for (let i = 0; i < n; i++) {
    const f = findByName(parent.getChild(i), name);
    if (f) return f;
  }
  return null;
}

export function stationsRootOf(o: SceneObject): SceneObject | null {
  let s: SceneObject | null = o;
  while (s && s.name !== "StationsRoot" && s.hasParent()) s = s.getParent();
  return s && s.name === "StationsRoot" ? s : null;
}

export function smooth01(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}

export function alive(o: SceneObject | null): o is SceneObject {
  return !!o && !isNull(o);
}

/** World AABB over every enabled RenderMeshVisual under obj (null when it has none). */
export function worldAabb(obj: SceneObject): { mn: vec3; mx: vec3 } | null {
  const box: { mn: vec3 | null; mx: vec3 | null } = { mn: null, mx: null };
  const walk = (o: SceneObject) => {
    if (!o.enabled) return;
    const rmv = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (rmv && rmv.mesh) {
      try {
        const a = rmv.worldAabbMin();
        const b = rmv.worldAabbMax();
        const m0 = box.mn;
        const m1 = box.mx;
        box.mn = m0 ? new vec3(Math.min(m0.x, a.x), Math.min(m0.y, a.y), Math.min(m0.z, a.z)) : a;
        box.mx = m1 ? new vec3(Math.max(m1.x, b.x), Math.max(m1.y, b.y), Math.max(m1.z, b.z)) : b;
      } catch (e) {
        // skip visuals without bounds
      }
    }
    const n = o.getChildrenCount();
    for (let i = 0; i < n; i++) walk(o.getChild(i));
  };
  walk(obj);
  return box.mn && box.mx ? { mn: box.mn, mx: box.mx } : null;
}

interface Seg {
  dur: number;
  start?: () => void;
  tick?: (k: number) => void;
  until?: () => boolean;
}

/**
 * Deterministic segment timeline. add(dur, tick, start) runs tick(0..1) over dur seconds; wait(until, cap, start)
 * advances when until() holds or after cap seconds. update(dt) returns true on the frame the timeline finishes.
 */
export class KineTimeline {
  private segs: Seg[] = [];
  private i: number = -1;
  private t: number = 0;
  private entered: boolean = false;
  private label: string;

  constructor(label: string) {
    this.label = label;
  }

  clear(): KineTimeline {
    this.segs = [];
    this.i = -1;
    this.t = 0;
    this.entered = false;
    return this;
  }

  add(dur: number, tick?: (k: number) => void, start?: () => void): KineTimeline {
    this.segs.push({ dur: Math.max(0, dur), tick: tick, start: start });
    return this;
  }

  wait(until: () => boolean, cap: number, start?: () => void): KineTimeline {
    this.segs.push({ dur: Math.max(0.05, cap), until: until, start: start });
    return this;
  }

  /** One-shot action (zero-length segment). */
  call(fn: () => void): KineTimeline {
    this.segs.push({ dur: 0, start: fn });
    return this;
  }

  run(): void {
    this.i = this.segs.length > 0 ? 0 : -1;
    this.t = 0;
    this.entered = false;
  }

  isRunning(): boolean {
    return this.i >= 0 && this.i < this.segs.length;
  }

  cancel(): void {
    this.clear();
  }

  update(dt: number): boolean {
    if (!this.isRunning()) return false;
    try {
      // several zero-length / satisfied segments may pass in one frame
      for (let guard = 0; guard < 16 && this.isRunning(); guard++) {
        const s = this.segs[this.i];
        if (!this.entered) {
          this.entered = true;
          this.t = 0;
          if (s.start) s.start();
          if (!this.isRunning()) return false; // start() cancelled
        } else {
          this.t += dt;
          dt = 0;
        }
        if (s.until) {
          if (s.until() || this.t >= s.dur) this.next();
          else return false;
        } else {
          const k = s.dur <= 0 ? 1 : Math.min(1, this.t / s.dur);
          if (s.tick) s.tick(k);
          if (k >= 1) this.next();
          else return false;
        }
      }
    } catch (e) {
      print(`[${this.label}] timeline error, finishing early: ${e}`);
      this.i = this.segs.length;
    }
    if (this.i >= this.segs.length) {
      this.segs = [];
      this.i = -1;
      return true;
    }
    return false;
  }

  private next(): void {
    this.i++;
    this.t = 0;
    this.entered = false;
  }
}
