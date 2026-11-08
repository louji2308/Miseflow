/**
 * CookActionKit.ts  (Chef Director v6, W4)
 *
 * Shared contract + helpers of the Cook action library:
 *  - CookAction / CookActionContext (what CookRuntime hands every action)
 *  - CookTweener: a tiny update-driven, promise-based tween list (one per CookRuntime). A cancelled signal rejects
 *    every pending tween of that action with CookCancel, so `await ctx.tween(...)` unwinds the action at once.
 *  - motion helpers (arcs, disc layouts, rotate-about, tool poses) and short-lived FX blobs (drops, bursts, bubbles,
 *    streams). FX live under a per-action root that the runtime destroys when the action ends or is cancelled.
 *
 * Conventions every action follows:
 *  - Heat, steam, oil and fill ONLY through EquipmentHandle methods.
 *  - Tools only move through ToolHandle.obj (world pose) and end at restPos / restRot (the runtime snaps them home
 *    after an action, also on cancel). A tool's long axis is its LOCAL +X (handle -> tip), up is local +Y.
 *  - Items are moved through their pieces (ItemHandle.pieces, or the item root when it has none).
 *  - Equipment may be tilted / shaken (pan toss, pour) only through ctx.holdPose(), which restores the exact pose.
 *  - Colours pass ItemState / liftRgb (additive display, nothing near black).
 */

import { CookStep } from "../CookPlanSchema";
import { BENCH } from "../CookLayout";
import { CookWorld, EquipmentHandle, HeatLevel, ItemHandle, ToolHandle } from "../CookWorld";
import { ItemState, ItemStateKey, liftRgb, mixRgb } from "../ItemState";
import { worldAabb } from "../../KineRegistry";
import { MeshAcc, makeEmissiveMaterial } from "../../StationPropsBuilder";

export type Rgb3 = [number, number, number];

/** Thrown into a running action when its signal is cancelled (EXIT / restart). */
export class CookCancel {
  public readonly cancelled: boolean = true;
  public toString(): string {
    return "CookCancel";
  }
}

export function isCancel(e: any): boolean {
  return !!e && e.cancelled === true;
}

export interface CookSignal {
  cancelled: boolean;
}

interface Tw {
  sig: CookSignal;
  t: number;
  dur: number;
  fn: ((k: number) => void) | null;
  resolve: () => void;
  reject: (e: any) => void;
}

/** Update-driven tween list. update(dt) once per frame from the owning component. */
export class CookTweener {
  private list: Tw[] = [];

  public run(sig: CookSignal, dur: number, fn?: (k: number) => void): Promise<void> {
    if (sig.cancelled) return Promise.reject(new CookCancel());
    return new Promise<void>((resolve, reject) => {
      this.list.push({ sig: sig, t: 0, dur: Math.max(0, isFinite(dur) ? dur : 0), fn: fn || null, resolve: resolve, reject: reject });
    });
  }

  public update(dt: number): void {
    if (this.list.length === 0) return;
    const keep: Tw[] = [];
    const settle: (() => void)[] = [];
    const cur = this.list;
    this.list = [];
    for (const w of cur) {
      if (w.sig.cancelled) {
        settle.push(() => w.reject(new CookCancel()));
        continue;
      }
      w.t += dt;
      let k = w.dur <= 0 ? 1 : Math.min(1, w.t / w.dur);
      if (w.fn) {
        try {
          w.fn(k);
        } catch (e) {
          print(`[CookTween] tween error, finishing it: ${e}`);
          k = 1;
        }
      }
      if (k >= 1) settle.push(w.resolve);
      else keep.push(w);
    }
    // tweens added while ticking (none normally: continuations run as microtasks) stay queued
    this.list = keep.concat(this.list);
    for (const f of settle) f();
  }

  /** Rejects every pending tween of this signal now (no further ticks). */
  public cancel(sig: CookSignal): void {
    sig.cancelled = true;
    const cur = this.list;
    this.list = [];
    for (const w of cur) {
      if (w.sig === sig) w.reject(new CookCancel());
      else this.list.push(w);
    }
  }

  public cancelAll(): void {
    const cur = this.list;
    this.list = [];
    for (const w of cur) {
      w.sig.cancelled = true;
      w.reject(new CookCancel());
    }
  }

  public count(): number {
    return this.list.length;
  }
}

export interface CookActionContext {
  world: CookWorld;
  step: CookStep;
  equipment: EquipmentHandle;
  tool: ToolHandle | null;
  items: ItemHandle[];
  /** step.fromId / step.toId equipment (null when not set) */
  from: EquipmentHandle | null;
  to: EquipmentHandle | null;
  state: ItemState;
  signal: CookSignal;
  /** playback speed (1 = real time); every ctx.tween / ctx.wait is divided by it */
  speed: number;
  /** step duration at 1x, sanitised (seconds) */
  dur: number;
  /** step.count or the action default */
  count(def: number, max?: number): number;
  /** k(0..1) over sec seconds (speed-scaled); rejects with CookCancel when cancelled */
  tween(sec: number, fn?: (k: number) => void): Promise<void>;
  wait(sec: number): Promise<void>;
  /** root for short-lived FX (destroyed when the action ends) */
  fxRoot: SceneObject;
  /** run on end / cancel (restore an equipment pose, stop a pulse...) */
  onCleanup(fn: () => void): void;
  /** snapshot obj's local pose now and restore it on cleanup */
  holdPose(obj: SceneObject): void;
  log(msg: string): void;
}

export interface CookAction {
  readonly name: string;
  run(ctx: CookActionContext): Promise<void>;
}

// ───────────────────────────── math ─────────────────────────────

export const DEG = Math.PI / 180;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smooth(k: number): number {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
}

export function easeOut(k: number): number {
  const t = clamp01(k);
  return 1 - (1 - t) * (1 - t);
}

export function easeIn(k: number): number {
  const t = clamp01(k);
  return t * t;
}

/** Sub-range of a 0..1 progress: 0 before a, 1 after b. */
export function seg(k: number, a: number, b: number): number {
  return clamp01((k - a) / Math.max(1e-4, b - a));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function vlerp(a: vec3, b: vec3, t: number): vec3 {
  return new vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

/** Parabolic hop from a to b with apex `h` above the straight line. */
export function arcPoint(a: vec3, b: vec3, h: number, t: number): vec3 {
  const p = vlerp(a, b, t);
  return new vec3(p.x, p.y + 4 * h * t * (1 - t), p.z);
}

export function v3(x: number, y: number, z: number): vec3 {
  return new vec3(x, y, z);
}

export function horiz(v: vec3): vec3 {
  const l = Math.sqrt(v.x * v.x + v.z * v.z);
  return l > 1e-5 ? new vec3(v.x / l, 0, v.z / l) : new vec3(1, 0, 0);
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** n points spread evenly over a disc (sunflower layout) at height y. */
export function discSpots(center: vec3, radius: number, n: number, y: number): vec3[] {
  const out: vec3[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = n <= 1 ? 0 : radius * Math.sqrt((i + 0.5) / n);
    const a = i * ga;
    out.push(new vec3(center.x + Math.cos(a) * r, y, center.z + Math.sin(a) * r));
  }
  return out;
}

// ───────────────────────────── transforms ─────────────────────────────

export function alive(o: SceneObject | null | undefined): o is SceneObject {
  return !!o && !isNull(o);
}

export function wpos(o: SceneObject): vec3 {
  return o.getTransform().getWorldPosition();
}

export function setWpos(o: SceneObject, p: vec3): void {
  if (alive(o)) o.getTransform().setWorldPosition(p);
}

export function wrot(o: SceneObject): quat {
  return o.getTransform().getWorldRotation();
}

export function setWrot(o: SceneObject, q: quat): void {
  if (alive(o)) o.getTransform().setWorldRotation(q);
}

/** Rotates obj by q (world) about the world pivot. */
export function rotateAbout(o: SceneObject, pivot: vec3, q: quat, pos0: vec3, rot0: quat): void {
  if (!alive(o)) return;
  const rel = pos0.sub(pivot);
  setWpos(o, pivot.add(q.multiplyVec3(rel)));
  setWrot(o, q.multiply(rot0));
}

/** Pieces of an item (the root itself when the stage made none). */
export function piecesOf(item: ItemHandle): SceneObject[] {
  const out: SceneObject[] = [];
  if (item.pieces && item.pieces.length > 0) {
    for (const p of item.pieces) if (alive(p)) out.push(p);
  }
  if (out.length === 0 && alive(item.obj)) out.push(item.obj);
  return out;
}

export function allPieces(items: ItemHandle[]): SceneObject[] {
  let out: SceneObject[] = [];
  for (const it of items) out = out.concat(piecesOf(it));
  return out;
}

/** Height of the origin above the lowest visible point (so a piece can rest ON a surface). */
export function bottomOffset(o: SceneObject): number {
  try {
    const b = worldAabb(o);
    if (!b) return 0;
    return Math.max(0, wpos(o).y - b.mn.y);
  } catch (e) {
    return 0;
  }
}

export function heightOf(o: SceneObject): number {
  try {
    const b = worldAabb(o);
    return b ? Math.max(0.1, b.mx.y - b.mn.y) : 0.5;
  } catch (e) {
    return 0.5;
  }
}

export function topY(objs: SceneObject[], fallback: number): number {
  let y = -1e9;
  for (const o of objs) {
    try {
      const b = worldAabb(o);
      if (b) y = Math.max(y, b.mx.y);
    } catch (e) {
      // skip
    }
  }
  return y > -1e8 ? y : fallback;
}

export function itemsByRole(items: ItemHandle[], roles: string[]): ItemHandle[] {
  return items.filter((it) => roles.indexOf(String(it.role).toUpperCase()) >= 0);
}

export function itemsNotRole(items: ItemHandle[], roles: string[]): ItemHandle[] {
  return items.filter((it) => roles.indexOf(String(it.role).toUpperCase()) < 0);
}

/** Solid food (moves into vessels as pieces) vs. pantry items (poured / sprinkled from where they stand). */
export const SOLID_ROLES = ["PROTEIN", "VEG", "DOUGH", "AROMATIC", "GARNISH"];
export const POUR_ROLES = ["LIQUID", "OIL", "SPICE", "FLOUR", "DAIRY"];

export function heatOf(step: CookStep, def: HeatLevel): HeatLevel {
  const h = String(step.heat || "").toUpperCase();
  return h === "OFF" || h === "LOW" || h === "MED" || h === "HIGH" ? (h as HeatLevel) : def;
}

export function heat01(h: HeatLevel): number {
  return h === "HIGH" ? 1 : h === "MED" ? 0.66 : h === "LOW" ? 0.33 : 0;
}

/** A free spot beside a vessel (for resting fried food / finished items). */
export function besideSpot(eq: EquipmentHandle, i: number, n: number, side: number = 1): vec3 {
  const f = eq.floorWorld();
  const r = Math.max(2, eq.radiusCm);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cx = i % cols;
  const cz = Math.floor(i / cols);
  return new vec3(f.x + side * (r + 3 + cx * 1.6), f.y, f.z + (cz - (Math.ceil(n / cols) - 1) / 2) * 1.6);
}

// ───────────────────────────── piece motion ─────────────────────────────

export interface Move {
  obj: SceneObject;
  a: vec3;
  b: vec3;
  h: number;
  delay: number;
  spin?: quat;
  rot0?: quat;
}

/** Hop every move along its arc (staggered by delay, all within `sec`). */
export function hopAll(ctx: CookActionContext, moves: Move[], sec: number, hopFrac: number = 0.6): Promise<void> {
  if (moves.length === 0) return ctx.wait(0.01);
  let maxDelay = 0;
  for (const m of moves) maxDelay = Math.max(maxDelay, m.delay);
  const hop = Math.max(0.15, sec * hopFrac);
  const total = Math.max(sec, maxDelay + hop);
  return ctx.tween(total, (k) => {
    const t = k * total;
    for (const m of moves) {
      const u = clamp01((t - m.delay) / hop);
      const e = smooth(u);
      setWpos(m.obj, arcPoint(m.a, m.b, m.h, e));
      if (m.spin && m.rot0) setWrot(m.obj, quat.slerp(quat.quatIdentity(), m.spin, e).multiply(m.rot0));
    }
  });
}

/**
 * Pieces not already inside `eq` hop into it (spread over `spread` of the radius, bottoms on the floor + lift).
 * Returns the target positions of ALL pieces (inside ones keep theirs).
 */
export async function gatherInto(ctx: CookActionContext, pieces: SceneObject[], eq: EquipmentHandle, sec: number, spread: number = 0.55, lift: number = 0.2): Promise<vec3[]> {
  const f = eq.floorWorld();
  const spots = discSpots(f, Math.max(0.5, eq.radiusCm * spread), pieces.length, f.y);
  const moves: Move[] = [];
  const out: vec3[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const cur = wpos(p);
    const dx = cur.x - f.x;
    const dz = cur.z - f.z;
    const inside = Math.sqrt(dx * dx + dz * dz) <= eq.radiusCm * 0.95 && Math.abs(cur.y - f.y) < Math.max(3, eq.radiusCm);
    if (inside) {
      out.push(cur);
      continue;
    }
    const s = spots[i];
    const b = new vec3(s.x, f.y + bottomOffset(p) + lift, s.z);
    out.push(b);
    moves.push({ obj: p, a: cur, b: b, h: 4 + eq.radiusCm * 0.4, delay: moves.length * 0.08 });
  }
  if (moves.length > 0) await hopAll(ctx, moves, sec);
  return out;
}

/** Gentle bob / jiggle of pieces around their current positions (ends exactly where they started). */
export function bobPieces(ctx: CookActionContext, pieces: SceneObject[], sec: number, amp: number, freq: number = 1.6, spinDeg: number = 0): Promise<void> {
  const base = pieces.map((p) => wpos(p));
  const rot = pieces.map((p) => wrot(p));
  return ctx.tween(sec, (k) => {
    const env = Math.sin(Math.PI * k);
    for (let i = 0; i < pieces.length; i++) {
      const ph = i * 1.7;
      const w = Math.sin((k * sec * freq + ph) * Math.PI * 2) * amp * env;
      setWpos(pieces[i], base[i].add(new vec3(0, w, 0)));
      if (spinDeg !== 0) setWrot(pieces[i], quat.angleAxis(spinDeg * DEG * Math.sin(k * Math.PI * 2 + ph) * env, vec3.up()).multiply(rot[i]));
    }
  });
}

/** Pieces orbit a centre by `turns` (stir), keeping their radius and height. */
export function orbitPieces(ctx: CookActionContext, pieces: SceneObject[], center: vec3, turns: number, sec: number): Promise<void> {
  const base = pieces.map((p) => wpos(p));
  const rot = pieces.map((p) => wrot(p));
  return ctx.tween(sec, (k) => {
    const a = turns * Math.PI * 2 * smooth(k);
    const q = quat.angleAxis(a, vec3.up());
    for (let i = 0; i < pieces.length; i++) {
      const rel = base[i].sub(center);
      const p = center.add(q.multiplyVec3(rel));
      setWpos(pieces[i], new vec3(p.x, base[i].y + Math.sin(k * Math.PI * turns * 2 + i) * 0.15, p.z));
      setWrot(pieces[i], q.multiply(rot[i]));
    }
  });
}

// ───────────────────────────── tools ─────────────────────────────

/** Tool long axis (local +X) at rest, flattened to the horizontal plane. */
export function toolAxis(tool: ToolHandle): vec3 {
  return horiz(tool.restRot.multiplyVec3(vec3.right()));
}

/** World offset of the tip from the tool origin for a rotation. */
export function tipOffset(tool: ToolHandle, rot: quat): vec3 {
  const s = tool.obj.getTransform().getWorldScale();
  const t = tool.tipLocal || vec3.zero();
  return rot.multiplyVec3(new vec3(t.x * s.x, t.y * s.y, t.z * s.z));
}

export function tipWorld(tool: ToolHandle): vec3 {
  const r = wrot(tool.obj);
  return wpos(tool.obj).add(tipOffset(tool, r));
}

/** Places the tool so its tip sits at tipW with rotation rot. */
export function placeTip(tool: ToolHandle, tipW: vec3, rot: quat): void {
  if (!alive(tool.obj)) return;
  setWrot(tool.obj, rot);
  setWpos(tool.obj, tipW.sub(tipOffset(tool, rot)));
}

/** Tween the tool tip to tipW / rot (slerp + arc lift). */
export function toolTo(ctx: CookActionContext, tool: ToolHandle | null, tipW: vec3, rot: quat, sec: number, lift: number = 2): Promise<void> {
  if (!tool || !alive(tool.obj)) return ctx.wait(Math.min(sec, 0.05));
  const a = tipWorld(tool);
  const r0 = wrot(tool.obj);
  return ctx.tween(sec, (k) => {
    const e = smooth(k);
    placeTip(tool, arcPoint(a, tipW, lift, e), quat.slerp(r0, rot, e));
  });
}

/** Tween the tool back to its rest pose. */
export function toolHome(ctx: CookActionContext, tool: ToolHandle | null, sec: number = 0.6): Promise<void> {
  if (!tool || !alive(tool.obj)) return ctx.wait(0.01);
  const p0 = wpos(tool.obj);
  const r0 = wrot(tool.obj);
  return ctx.tween(sec, (k) => {
    const e = smooth(k);
    setWpos(tool.obj, arcPoint(p0, tool.restPos, 2.5, e));
    setWrot(tool.obj, quat.slerp(r0, tool.restRot, e));
  });
}

export function toolSnapHome(tool: ToolHandle | null): void {
  if (!tool || !alive(tool.obj)) return;
  setWpos(tool.obj, tool.restPos);
  setWrot(tool.obj, tool.restRot);
}

/**
 * +1 when the working tip is at the +X end of the tool (handle toward -X), -1 when the handle runs toward +X
 * (CookStage tools: spatula / knife / spoon heads sit at the origin, grip along +X). Cached per tool.
 */
export function tipSign(tool: ToolHandle): number {
  const t = tool as any;
  if (typeof t.__tipSign === "number") return t.__tipSign;
  let sgn = 1;
  try {
    const b = worldAabb(tool.obj);
    if (b) {
      const c = b.mn.add(b.mx).uniformScale(0.5);
      const ax = wrot(tool.obj).multiplyVec3(vec3.right());
      const d = c.sub(tipWorld(tool)).dot(ax);
      sgn = d > 0.05 ? -1 : 1;
    }
  } catch (e) {
    sgn = 1;
  }
  t.__tipSign = sgn;
  return sgn;
}

/**
 * Working rotation: rest rotation tilted about the horizontal axis perpendicular to the tool axis. Positive pitchDeg
 * raises the handle (tip down into the vessel) whichever end the tip is on.
 */
export function toolTilt(tool: ToolHandle, pitchDeg: number, yawDeg: number = 0): quat {
  const ax = toolAxis(tool);
  const side = horiz(vec3.up().cross(ax));
  const q = quat.angleAxis((yawDeg + aimYawDeg(tool, ax)) * DEG, vec3.up()).multiply(quat.angleAxis(pitchDeg * tipSign(tool) * DEG, side));
  return q.multiply(tool.restRot);
}

/** The vessel a tool currently works over (set by CookRuntime when a step starts); the handle then points away from it. */
export function setToolAim(tool: ToolHandle | null, vesselCentre: vec3 | null): void {
  if (!tool) return;
  (tool as any).__aim = vesselCentre;
}

/**
 * Extra yaw (degrees) that turns the handle from its lying direction to the direction "from the vessel toward where the tool
 * rests" - a cook holds a spoon or spatula with the handle toward their side, not in whatever direction it was laid down.
 */
function aimYawDeg(tool: ToolHandle, axis: vec3): number {
  const aim: vec3 | undefined = (tool as any).__aim;
  if (!aim) return 0;
  const away = new vec3(tool.restPos.x - aim.x, 0, tool.restPos.z - aim.z);
  if (away.x * away.x + away.z * away.z < 1.0) return 0;
  const want = horiz(away);
  const h = axis.uniformScale(-tipSign(tool)); // handle direction (tip at +X => handle toward -X)
  const cy = h.z * want.x - h.x * want.z; // y component of h x want (positive = counter-clockwise seen from above, same as angleAxis about +Y)
  const dt = h.x * want.x + h.z * want.z;
  return Math.atan2(cy, dt) / DEG;
}

/** The tool tip traces `turns` circles of radius r over the vessel floor (stir / generic). */
export async function toolCircles(ctx: CookActionContext, tool: ToolHandle | null, center: vec3, r: number, turns: number, sec: number, pitchDeg: number = 35, dip: number = 0.3): Promise<void> {
  if (!tool || !alive(tool.obj)) {
    await ctx.wait(sec);
    return;
  }
  const rot = toolTilt(tool, pitchDeg);
  const start = new vec3(center.x + r, center.y + dip, center.z);
  await toolTo(ctx, tool, start, rot, Math.min(0.6, sec * 0.2), 3);
  // the tip circles the vessel while the hand stays on one side: the handle only swings a little and the pitch breathes
  const swing = Math.min(28, 6 + r * 4);
  await ctx.tween(sec, (k) => {
    const a = turns * Math.PI * 2 * k;
    const sw = quat.angleAxis(Math.sin(a) * swing * DEG, vec3.up());
    const pitch = toolTilt(tool, pitchDeg + Math.sin(a * 2) * 5);
    placeTip(tool, new vec3(center.x + Math.cos(a) * r, center.y + dip + Math.sin(a * 2) * 0.2, center.z - Math.sin(a) * r), sw.multiply(pitch));
  });
}

/** Surface height food floats at / is set down on inside a vessel (oil surface when it holds oil, else the floor). */
export function surfaceY(eq: EquipmentHandle): number {
  const l = eq.oilLevel ? eq.oilLevel() : 0;
  return l > 0.02 ? levelY(eq, l) : eq.floorWorld().y;
}

/** Horizontal distance from the vessel axis. */
export function distFromAxis(eq: EquipmentHandle, p: vec3): number {
  const f = eq.floorWorld();
  return Math.sqrt((p.x - f.x) ** 2 + (p.z - f.z) ** 2);
}

/** Keeps a world point on the bench slab (with a margin) so nothing is ever set down over the table edge. */
export function clampToBench(world: CookWorld, p: vec3, margin: number = 1.4): vec3 {
  const root = world.root;
  if (!alive(root)) return p;
  const tr = root.getTransform();
  const l = tr.getInvertedWorldTransform().multiplyPoint(p);
  const x = Math.max(BENCH.minX + margin, Math.min(BENCH.maxX - margin, l.x));
  const z = Math.max(BENCH.minZ + margin, Math.min(BENCH.maxZ - margin, l.z));
  return tr.getWorldTransform().multiplyPoint(new vec3(x, l.y, z));
}

// ───────────────────────────── FX blobs ─────────────────────────────

let blobMesh: RenderMesh | null = null;
const fxMats: { [k: string]: Material } = {};

function sphereMesh(): RenderMesh {
  if (!blobMesh) {
    const a = new MeshAcc();
    a.ellipsoid(0, 0, 0, 1, 1, 1, 8, 5);
    blobMesh = a.toMesh();
  }
  return blobMesh;
}

function fxMat(c: Rgb3, glow: number): Material {
  const l = liftRgb(c, 0.3);
  const key = `${Math.round(l[0] * 20)}_${Math.round(l[1] * 20)}_${Math.round(l[2] * 20)}_${Math.round(glow * 10)}`;
  let m = fxMats[key];
  if (!m) {
    m = makeEmissiveMaterial(l[0], l[1], l[2], glow, 0, 0.35);
    fxMats[key] = m;
  }
  return m;
}

export function vecToRgb(v: vec3): Rgb3 {
  return [v.x, v.y, v.z];
}

/** One sphere blob (world position / radius), destroyed with the action's FX root. */
export function fxBlob(ctx: CookActionContext, pos: vec3, radius: number, color: Rgb3, glow: number = 0.6, name: string = "CookFx"): SceneObject {
  const o = global.scene.createSceneObject(name);
  o.setParent(ctx.fxRoot);
  const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  rmv.mesh = sphereMesh();
  rmv.mainMaterial = fxMat(color, glow);
  const tr = o.getTransform();
  tr.setWorldPosition(pos);
  tr.setWorldScale(new vec3(radius, radius, radius));
  return o;
}

function setBlobScale(o: SceneObject, r: number): void {
  if (!alive(o)) return;
  const s = Math.max(0.0001, r);
  o.getTransform().setWorldScale(new vec3(s, s, s));
}

/** n drops falling from `from` (scattered by `scatter`) to `to`, staggered over sec; they shrink as they land. */
export function fxDrops(ctx: CookActionContext, from: vec3, to: vec3, n: number, color: Rgb3, sec: number, radius: number = 0.18, scatter: number = 0.5): Promise<void> {
  const r = rng(hashStr(ctx.step.id) + n);
  const drops: { o: SceneObject; a: vec3; b: vec3; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ox = (r() - 0.5) * scatter;
    const oz = (r() - 0.5) * scatter;
    const a = new vec3(from.x + ox * 0.4, from.y, from.z + oz * 0.4);
    const b = new vec3(to.x + ox * 2, to.y, to.z + oz * 2);
    const o = fxBlob(ctx, a, 0.0001, color, 0.5, "CookFx_Drop");
    drops.push({ o: o, a: a, b: b, d: (i / Math.max(1, n)) * sec * 0.6 });
  }
  const fall = Math.max(0.2, sec * 0.4);
  return ctx.tween(sec, (k) => {
    const t = k * sec;
    for (const d of drops) {
      const u = clamp01((t - d.d) / fall);
      if (u <= 0) continue;
      setWpos(d.o, vlerp(d.a, d.b, easeIn(u)));
      setBlobScale(d.o, u >= 1 ? 0 : radius * (u > 0.85 ? (1 - u) / 0.15 : 1));
    }
  });
}

/** Burst of blobs flying up and out from `at` (flour puff, oil splash, sizzle spit), fading out. */
export function fxBurst(ctx: CookActionContext, at: vec3, n: number, color: Rgb3, height: number, spread: number, sec: number, radius: number = 0.16): Promise<void> {
  const r = rng(hashStr(ctx.step.id + "b") + Math.floor(at.x * 13 + at.z * 7));
  const parts: { o: SceneObject; dir: vec3; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const s = spread * (0.4 + r() * 0.6);
    parts.push({ o: fxBlob(ctx, at, 0.0001, color, 0.65, "CookFx_Burst"), dir: new vec3(Math.cos(a) * s, 0, Math.sin(a) * s), h: height * (0.5 + r() * 0.5) });
  }
  return ctx.tween(sec, (k) => {
    for (const p of parts) {
      const pos = at.add(p.dir.uniformScale(easeOut(k))).add(new vec3(0, 4 * p.h * k * (1 - k) + p.h * 0.3 * k, 0));
      setWpos(p.o, pos);
      setBlobScale(p.o, radius * (1 - k) * (0.6 + 0.4 * Math.sin(k * Math.PI)));
    }
  });
}

/** Bubbles rising from the vessel floor to `surfaceY` for sec seconds at `rate` per second (boil / fry). */
export function fxBubbles(ctx: CookActionContext, eq: EquipmentHandle, surfaceY: number, sec: number, rate: number, color: Rgb3, radius: number = 0.22): Promise<void> {
  const r = rng(hashStr(ctx.step.id + "u"));
  const f = eq.floorWorld();
  const pool: { o: SceneObject; x: number; z: number; t0: number; life: number }[] = [];
  const total = Math.max(1, Math.round(sec * rate));
  for (let i = 0; i < Math.min(total, 40); i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * eq.radiusCm * 0.7;
    pool.push({ o: fxBlob(ctx, f, 0.0001, color, 0.45, "CookFx_Bubble"), x: f.x + Math.cos(a) * d, z: f.z + Math.sin(a) * d, t0: r() * 0.9, life: 0.35 + r() * 0.35 });
  }
  const rise = Math.max(0.2, surfaceY - f.y);
  return ctx.tween(sec, (k) => {
    const t = k * sec;
    for (const b of pool) {
      const cyc = b.life * 1.6;
      const u = ((t / cyc + b.t0) % 1) / 0.62;
      if (u > 1 || k >= 1) {
        setBlobScale(b.o, 0);
        continue;
      }
      setWpos(b.o, new vec3(b.x + Math.sin(u * 9 + b.t0 * 6) * 0.15, f.y + rise * u, b.z));
      setBlobScale(b.o, radius * (0.4 + 0.6 * u) * (u > 0.9 ? 1.6 : 1) * Math.min(1, k * 8));
    }
  });
}

/** Continuous stream of blobs along an arc a -> b (pouring), running for sec. */
export function fxStream(ctx: CookActionContext, a: () => vec3, b: vec3, h: number, sec: number, color: Rgb3, radius: number = 0.24, n: number = 12): Promise<void> {
  const blobs: SceneObject[] = [];
  for (let i = 0; i < n; i++) blobs.push(fxBlob(ctx, b, 0.0001, color, 0.55, "CookFx_Stream"));
  return ctx.tween(sec, (k) => {
    const env = Math.min(1, k * 6, (1 - k) * 6);
    const start = a();
    for (let i = 0; i < n; i++) {
      const u = ((k * sec * 1.6 + i / n) % 1);
      setWpos(blobs[i], arcPoint(start, b, h, u));
      setBlobScale(blobs[i], k >= 1 ? 0 : radius * env * (0.7 + 0.3 * Math.sin(u * Math.PI)));
    }
  });
}

/** Neutral colours used by FX. */
export const FX = {
  OIL: [1.0, 0.82, 0.36] as Rgb3,
  STEAM: [0.92, 0.95, 1.0] as Rgb3,
  FLOUR: [0.98, 0.96, 0.9] as Rgb3,
  WATER: [0.55, 0.82, 1.0] as Rgb3,
  SPARK: [1.0, 0.7, 0.3] as Rgb3,
};

export function itemRgb(ctx: CookActionContext, it: ItemHandle): Rgb3 {
  return vecToRgb(ctx.state.shownColor(it.id));
}

export function mix3(a: Rgb3, b: Rgb3, t: number): Rgb3 {
  return mixRgb(a, b, t);
}

/** Ingredient look-key progress for a group of items. */
export function advanceAll(ctx: CookActionContext, items: ItemHandle[], key: ItemStateKey, k: number): void {
  for (const it of items) ctx.state.advance(it.id, key, k);
}

// ───────────────────────────── pantry pours ─────────────────────────────

/**
 * Pantry item (spice jar, paste, oil, flour...) lifts over `eq`, tips toward the centre, drops / streams its colour
 * in and goes back exactly where it was (pose restored on cancel too).
 */
export async function tipInto(ctx: CookActionContext, it: ItemHandle, eq: EquipmentHandle, sec: number, stream: boolean = false): Promise<void> {
  const o = it.obj;
  if (!alive(o)) return;
  ctx.holdPose(o);
  const p0 = wpos(o);
  const r0 = wrot(o);
  const rim = eq.rimWorld();
  let dir = horiz(p0.sub(rim));
  if (Math.abs(p0.x - rim.x) + Math.abs(p0.z - rim.z) < 0.01) dir = new vec3(1, 0, 0);
  const above = rim.add(dir.uniformScale(Math.max(1, eq.radiusCm * 0.55))).add(new vec3(0, 4.5, 0));
  const tiltQ = quat.angleAxis(-70 * DEG, horiz(vec3.up().cross(dir)));
  const color = itemRgb(ctx, it);
  await ctx.tween(sec * 0.3, (k) => setWpos(o, arcPoint(p0, above, 3, smooth(k))));
  await ctx.tween(sec * 0.15, (k) => setWrot(o, quat.slerp(quat.quatIdentity(), tiltQ, smooth(k)).multiply(r0)));
  const mouth = above.sub(dir.uniformScale(1.0));
  const floor = eq.floorWorld();
  if (stream) await fxStream(ctx, () => mouth, floor, 0.6, sec * 0.3, color, 0.22, 10);
  else await fxDrops(ctx, mouth, floor, 9, color, sec * 0.3, 0.2, 1.2);
  await ctx.tween(sec * 0.25, (k) => {
    const e = smooth(k);
    setWrot(o, quat.slerp(tiltQ, quat.quatIdentity(), e).multiply(r0));
    setWpos(o, arcPoint(above, p0, 3, e));
  });
}

/** Split step items into solids (move as pieces) and pantry (poured / sprinkled from their spot). */
export function splitItems(items: ItemHandle[]): { solids: ItemHandle[]; pantry: ItemHandle[] } {
  return { solids: itemsByRole(items, SOLID_ROLES), pantry: itemsNotRole(items, SOLID_ROLES) };
}

/** Average shown colour of items (fallback when empty). */
export function avgRgb(ctx: CookActionContext, items: ItemHandle[], fallback: Rgb3): Rgb3 {
  if (items.length === 0) return fallback;
  const s: Rgb3 = [0, 0, 0];
  for (const it of items) {
    const c = itemRgb(ctx, it);
    s[0] += c[0];
    s[1] += c[1];
    s[2] += c[2];
  }
  return [s[0] / items.length, s[1] / items.length, s[2] / items.length];
}

export function rgbVec(c: Rgb3): vec3 {
  const l = liftRgb(c, 0.25);
  return new vec3(l[0], l[1], l[2]);
}

/** Surface height of a fill / oil level inside a vessel. */
export function levelY(eq: EquipmentHandle, level01: number): number {
  const f = eq.floorWorld().y;
  const r = eq.rimWorld().y;
  return f + Math.max(0.15, (r - f) * clamp01(level01) * 0.9);
}
