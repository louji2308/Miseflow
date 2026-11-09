/**
 * ScheduleModel.ts (v7 Stage 5) - pure schedule maths for the physical schedule rail.
 * No Lens APIs: plain data in, plain data out (deterministic, LEAF friendly).
 *
 * Plan rules (docs/v7/notes/stage5-rail-design.md 1.2-1.4):
 *  - effective duration = planned + injected drift + natural lateness (COMPLETE tasks with actuals use the actuals);
 *  - fixed starts: a pinned start (heat task frozen on the burner) or an actual start;
 *  - forward ASAP pass: start = max(dependency finishes, notBefore, clock when cooking and not yet started, 0);
 *  - plate start may be raised to a user plate target (Stage 6 re-plan hook);
 *  - backward ALAP pass for unpinned, unstarted heat tasks (the sear goes on as late as plating allows).
 * Dish 01: prep 0-45, sear 35-95 (ALAP), sauce 45-95, plate 95-115; makespan 115 s.
 */

export type RailLane = "BOARD" | "BURNER_L" | "BURNER_R" | "PLATE";
export type HeatLevel = "OFF" | "LOW" | "MED" | "HIGH";

export interface ScheduleInputTask {
  id: string;
  stationId: string;
  title: string;
  deps: string[];
  planned: number;
  driftSec: number;
  latenessSec: number;
  state: string;
  policy: string;
  heat: HeatLevel;
  pinned: boolean;
  pinnedStartSec?: number;
  actualStartSec?: number;
  actualFinishSec?: number;
  notBeforeSec?: number;
}

export interface ScheduledTask {
  id: string;
  stationId: string;
  title: string;
  lane: RailLane;
  start: number;
  finish: number;
  dur: number;
  planned: number;
  state: string;
  policy: string;
  pinned: boolean;
  heat: HeatLevel;
  deps: string[];
  /** ASAP start ignoring notBefore (the DAG drops a notBefore that this already reaches). */
  asapNoNotBefore: number;
}

export interface ScheduleResult {
  tasks: ScheduledTask[];
  makespan: number;
  plateStart: number;
}

export function laneForStation(stationId: string): RailLane {
  switch (stationId) {
    case "PREP":
      return "BOARD";
    case "SKILLET":
      return "BURNER_L";
    case "SAUCEPOT":
      return "BURNER_R";
    default:
      return "PLATE";
  }
}

/** Rail time scale: the baseline plan fills PLAN_SPAN_CM, rounded up to 0.5 s/cm, at least 1 s/cm. Dish 01: 3.0 s/cm. */
export const PLAN_SPAN_CM = 40;
export function secPerCmFor(makespanSec: number, planSpanCm: number = PLAN_SPAN_CM): number {
  if (!(makespanSec > 0)) return 1;
  return Math.max(1, Math.ceil((2 * makespanSec) / planSpanCm) / 2);
}

function topoOrder(tasks: ScheduleInputTask[]): ScheduleInputTask[] {
  const byId: { [id: string]: ScheduleInputTask } = {};
  for (const t of tasks) byId[t.id] = t;
  const out: ScheduleInputTask[] = [];
  const mark: { [id: string]: number } = {};
  const visit = (t: ScheduleInputTask) => {
    if (mark[t.id] === 2) return;
    if (mark[t.id] === 1) return; // cycle guard (never expected)
    mark[t.id] = 1;
    for (const d of t.deps) if (byId[d]) visit(byId[d]);
    mark[t.id] = 2;
    out.push(t);
  };
  for (const t of tasks) visit(t);
  return out;
}

function effectiveDuration(t: ScheduleInputTask): number {
  if (t.state === "COMPLETE" && t.actualStartSec !== undefined && t.actualFinishSec !== undefined) {
    return Math.max(0, t.actualFinishSec - t.actualStartSec);
  }
  return Math.max(0, t.planned + t.driftSec + t.latenessSec);
}

/**
 * @param clockSec cook clock (s since the cook began)
 * @param cooking true once the cook has begun (unstarted tasks cannot start in the past)
 * @param plateTargetSec optional user plate start (Stage 6); raises the PLATING start
 */
export function computeSchedule(
  input: ScheduleInputTask[],
  clockSec: number,
  cooking: boolean,
  plateTargetSec: number | null = null
): ScheduleResult {
  const order = topoOrder(input);
  const res: { [id: string]: ScheduledTask } = {};
  const fixedStart = (t: ScheduleInputTask): number | undefined =>
    t.pinnedStartSec !== undefined ? t.pinnedStartSec : t.actualStartSec;

  // forward ASAP pass
  for (const t of order) {
    const dur = effectiveDuration(t);
    let depFinish = 0;
    for (const d of t.deps) if (res[d]) depFinish = Math.max(depFinish, res[d].finish);
    const started = t.actualStartSec !== undefined;
    let asap = depFinish;
    if (cooking && !started) asap = Math.max(asap, clockSec);
    let start: number;
    const fs = fixedStart(t);
    if (fs !== undefined) {
      start = fs;
    } else {
      start = asap;
      if (t.notBeforeSec !== undefined) start = Math.max(start, t.notBeforeSec);
      if (plateTargetSec !== null && t.stationId === "PLATING") start = Math.max(start, plateTargetSec);
    }
    res[t.id] = {
      id: t.id,
      stationId: t.stationId,
      title: t.title,
      lane: laneForStation(t.stationId),
      start,
      finish: start + dur,
      dur,
      planned: t.planned,
      state: t.state,
      policy: t.policy,
      pinned: t.pinned,
      heat: t.heat,
      deps: t.deps.slice(),
      asapNoNotBefore: fs !== undefined ? fs : asap,
    };
  }

  // backward ALAP pass: unpinned, unstarted, unfinished heat tasks go as late as their successors allow
  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i];
    if (t.heat === "OFF" || fixedStart(t) !== undefined || t.state === "COMPLETE") continue;
    let succStart = Infinity;
    for (const s of order) if (s.deps.indexOf(t.id) >= 0 && res[s.id]) succStart = Math.min(succStart, res[s.id].start);
    if (!isFinite(succStart)) continue;
    const r = res[t.id];
    const alap = succStart - r.dur;
    if (alap > r.start) {
      r.start = alap;
      r.finish = alap + r.dur;
    }
  }

  const tasks = input.map((t) => res[t.id]);
  let makespan = 0;
  let plateStart = 0;
  for (const t of tasks) {
    makespan = Math.max(makespan, t.finish);
    if (t.stationId === "PLATING") plateStart = Math.max(plateStart, t.start);
  }
  return { tasks, makespan, plateStart };
}

/** Baseline plan (planned durations only: no drift, lateness, actuals, pins or notBefore; clock 0). */
export function computeBaseline(input: ScheduleInputTask[]): ScheduleResult {
  const clean = input.map((t) => ({
    id: t.id,
    stationId: t.stationId,
    title: t.title,
    deps: t.deps,
    planned: t.planned,
    driftSec: 0,
    latenessSec: 0,
    state: "NOT_READY",
    policy: t.policy,
    heat: t.heat,
    pinned: false,
  }));
  return computeSchedule(clean, 0, false, null);
}
