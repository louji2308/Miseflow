/**
 * ShapeRecipe.ts (v6 Chef Director, W2)
 * Procedural 3D for ANY ingredient or vessel as a small, flat, JSON-friendly op list (<= 12 ops, <= 450 tris).
 * Pure data + sanitizer: NO imports, so CookPlan / PlanLibrary / CookStage can import it without any cycle.
 * Interpreted by Cook/ShapeRecipeBuilder.ts onto StationPropsBuilder's MeshAcc.
 *
 * Units: centimetres, recipe-local, +Y up, item resting on y = 0. Rotations in DEGREES (yaw about Y, pitch about X,
 * roll about Z, applied Ry*Rx*Rz). Every op is a unit primitive placed by T(pos) * R(rot) * S(scale):
 *   ELLIPSOID unit sphere; lobes = bump frequency, amp = irregularity (0 = smooth). Seeded per instance (irregular chunks).
 *   LATHE     surface of revolution about +Y; pts = [r0,y0, r1,y1, ...] bottom -> top; lobes/amp ripple the radius.
 *   SWEEP     tube; pts = [x0,y0,z0,r0, x1,y1,z1,r1, ...]; capped ends.
 *   TORUS     ring about +Y, major radius 1; amp = tube radius (default 0.18).
 *   BOX       half-extents 1 (scale = half sizes).
 *   DISC      unit disc facing +Y; amp = centre dome height.
 *   DOME      unit dome facing +Y (radius 1, height 1).
 * scatter repeats an op: DISC = Vogel spiral of radius `jitter`; LINE = along X from -jitter..+jitter, alternating
 * sides, each instance pushed out along its own +X by scale.x (leaves on a stem); RING = circle of radius `jitter`
 * facing outward. `split` = each instance becomes its own child SceneObject ("piece") so actions can move/recolour it;
 * `heap` > 0 lifts instances near the centre (a pile). Scatter also randomises size (+-18%) and orientation.
 * Vessel mode: outer wall profile [r,y] (bottom -> top); the builder adds an inner wall, lip, optional floor and handle.
 */

export type ShapeOpKind = "ELLIPSOID" | "LATHE" | "SWEEP" | "TORUS" | "BOX" | "DISC" | "DOME";
export type ShapeSlot = "body" | "accent" | "detail";
export type ScatterPattern = "DISC" | "LINE" | "RING";
export type VesselHandle = "NONE" | "LONG" | "TWIN" | "LOOP";
export type Vec3T = [number, number, number];
export type RgbT = [number, number, number];

export interface ShapeScatter {
  count: number;
  jitter: number;
  seed: number;
  pattern?: ScatterPattern;
  split?: boolean;
  heap?: number;
}

export interface ShapeOp {
  op: ShapeOpKind;
  slot: ShapeSlot;
  pos: Vec3T;
  rot?: Vec3T;
  scale: Vec3T;
  segs?: number;
  lobes?: number;
  amp?: number;
  pts?: number[];
  scatter?: ShapeScatter;
}

export interface ShapeVessel {
  profile: [number, number][];
  segs: number;
  handle: VesselHandle;
  floor: boolean;
}

export interface ShapeRecipe {
  name: string;
  ops: ShapeOp[];
  vessel?: ShapeVessel;
  /** body finish (PBR) */
  rough?: number;
  metal?: number;
  /** default colours (0..1) when the caller passes none (hand-authored recipes) */
  palette?: { body: RgbT; accent?: RgbT; detail?: RgbT; doneBody?: RgbT };
}

export const SHAPE_MAX_OPS = 12;
export const SHAPE_MAX_TRIS = 450;
export const SHAPE_MAX_SCATTER = 16;

const KINDS: ShapeOpKind[] = ["ELLIPSOID", "LATHE", "SWEEP", "TORUS", "BOX", "DISC", "DOME"];
const SLOTS: ShapeSlot[] = ["body", "accent", "detail"];
const PATTERNS: ScatterPattern[] = ["DISC", "LINE", "RING"];
const HANDLES: VesselHandle[] = ["NONE", "LONG", "TWIN", "LOOP"];

// ───────────────────────────── triangle estimate (exactly what the builder emits) ─────────────────────────────

export function ellipsoidRings(segs: number): number {
  return Math.max(3, Math.round(segs * 0.67));
}

export function torusTube(segs: number): number {
  return Math.max(3, Math.round(segs / 3));
}

/** Triangles for ONE instance of an op. */
export function opTris(o: ShapeOp): number {
  const s = o.segs || 8;
  const pts = o.pts || [];
  switch (o.op) {
    case "ELLIPSOID": return 2 * s * (ellipsoidRings(s) - 1);
    case "LATHE": return 2 * s * Math.max(0, Math.floor(pts.length / 2) - 1);
    case "SWEEP": return 2 * s * Math.max(0, Math.floor(pts.length / 4) - 1) + 2 * s;
    case "TORUS": return 2 * s * torusTube(s);
    case "BOX": return 12;
    case "DISC": return s;
    case "DOME": return 6 * s;
  }
  return 0;
}

export function vesselProfilePoints(v: ShapeVessel): number {
  // outer + inner wall (+ 2 axis points with a floor)
  return v.profile.length * 2 + (v.floor ? 2 : 0);
}

export function vesselTris(v: ShapeVessel): number {
  const wall = 2 * v.segs * (vesselProfilePoints(v) - 1);
  const handle = v.handle === "LONG" ? 2 * 6 * 3 + 12 : v.handle === "TWIN" ? 2 * (2 * 5 * 4 + 10) : v.handle === "LOOP" ? 2 * 5 * 4 + 10 : 0;
  return wall + handle;
}

export function estimateShapeTris(r: ShapeRecipe): number {
  let t = r.vessel ? vesselTris(r.vessel) : 0;
  for (const o of r.ops) t += opTris(o) * (o.scatter ? o.scatter.count : 1);
  return t;
}

/** Scene objects the builder creates: root + Main (if any non-split geometry) + one per split instance. */
export function estimateShapeObjects(r: ShapeRecipe): number {
  let split = 0;
  let main = !!r.vessel;
  for (const o of r.ops) {
    if (o.scatter && o.scatter.split) split += o.scatter.count;
    else main = true;
  }
  return 1 + (main ? 1 : 0) + split;
}

// ───────────────────────────── sanitizer ─────────────────────────────

function num(v: any, d: number, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, n));
}

function int(v: any, d: number, lo: number, hi: number): number {
  return Math.round(num(v, d, lo, hi));
}

function pick<T extends string>(v: any, list: T[], d: T): T {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  for (const k of list) if (k.toUpperCase() === s) return k;
  return d;
}

function vec(v: any, fx: any, fy: any, fz: any, d: number, lo: number, hi: number): Vec3T {
  if (Array.isArray(v) && v.length >= 3) return [num(v[0], d, lo, hi), num(v[1], d, lo, hi), num(v[2], d, lo, hi)];
  if (v && typeof v === "object" && ("x" in v || "y" in v || "z" in v)) return [num(v.x, d, lo, hi), num(v.y, d, lo, hi), num(v.z, d, lo, hi)];
  return [num(fx, d, lo, hi), num(fy, d, lo, hi), num(fz, d, lo, hi)];
}

function rgb(v: any): RgbT | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  const c: RgbT = [num(v[0], NaN, 0, 1), num(v[1], NaN, 0, 1), num(v[2], NaN, 0, 1)];
  return isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]) ? c : undefined;
}

function flatNums(v: any, maxLen: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  if (!Array.isArray(v)) return out;
  for (const e of v) {
    if (out.length >= maxLen) break;
    if (Array.isArray(e)) {
      for (const q of e) if (out.length < maxLen) out.push(num(q, 0, lo, hi));
    } else out.push(num(e, 0, lo, hi));
  }
  return out;
}

function sanitizeOp(raw: any): ShapeOp | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = pick<ShapeOpKind>(raw.op !== undefined ? raw.op : raw.type, KINDS, "ELLIPSOID");
  if (raw.op === undefined && raw.type === undefined) return null;
  const slot = pick<string>(raw.slot, ["BODY", "ACCENT", "DETAIL"], "BODY").toLowerCase() as ShapeSlot;
  const o: ShapeOp = {
    op: kind,
    slot: SLOTS.indexOf(slot) >= 0 ? slot : "body",
    pos: vec(raw.pos, raw.x, raw.y, raw.z, 0, -60, 60),
    rot: vec(raw.rot, raw.yaw, raw.pitch, raw.roll, 0, -360, 360),
    scale: vec(raw.scale, raw.sx, raw.sy, raw.sz, 1, 0.02, 40),
    segs: int(raw.segs, 8, 3, 24),
    lobes: num(raw.lobes, 0, 0, 8),
    amp: num(raw.amp, 0, 0, 0.6),
  };
  if (kind === "BOX") o.segs = 4;
  if (kind === "TORUS" && !(o.amp! > 0)) o.amp = 0.18;
  if (kind === "LATHE") {
    const p = flatNums(raw.pts !== undefined ? raw.pts : raw.profile, 32, -40, 40);
    if (p.length % 2) p.pop();
    for (let i = 0; i < p.length; i += 2) p[i] = Math.max(0, p[i]);
    if (p.length < 4) return null;
    o.pts = p;
  } else if (kind === "SWEEP") {
    const p = flatNums(raw.pts !== undefined ? raw.pts : raw.path, 40, -40, 40);
    while (p.length % 4) p.pop();
    for (let i = 3; i < p.length; i += 4) p[i] = Math.max(0.01, Math.abs(p[i]));
    if (p.length < 8) return null;
    o.pts = p;
  }
  const sc = raw.scatter && typeof raw.scatter === "object" ? raw.scatter : raw;
  const count = int(sc.count, 1, 1, SHAPE_MAX_SCATTER);
  if (count > 1) {
    o.scatter = {
      count: count,
      jitter: num(sc.jitter, 2, 0, 30),
      seed: int(sc.seed, 7, 0, 1e6),
      pattern: pick<ScatterPattern>(sc.pattern, PATTERNS, "DISC"),
      split: sc.split === true || sc.split === "true" || sc.split === 1,
      heap: num(sc.heap, 0, 0, 3),
    };
  }
  return o;
}

function sanitizeVessel(raw: any): ShapeVessel | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const flat = flatNums(raw.profile, 16, -40, 40);
  if (flat.length % 2) flat.pop();
  const prof: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) prof.push([Math.max(0.2, Math.min(40, flat[i])), Math.max(-5, Math.min(30, flat[i + 1]))]);
  if (prof.length < 2) return undefined;
  return {
    profile: prof,
    segs: int(raw.segs, 16, 6, 24),
    handle: pick<VesselHandle>(raw.handle, HANDLES, "NONE"),
    floor: raw.floor === undefined ? true : !!raw.floor && raw.floor !== "false",
  };
}

/**
 * Accepts the authoring shape (pos/rot/scale arrays, nested scatter, vessel.profile as pairs) OR the flat Smith shape
 * (x,y,z,yaw,pitch,roll,sx,sy,sz,count,jitter,seed,pattern,split,heap; top-level mode/profile/segs/handle/floor).
 * Clamps everything, then trims segs / counts / trailing ops until the recipe fits SHAPE_MAX_TRIS.
 * Returns null when nothing buildable remains.
 */
export function sanitizeShapeRecipe(raw: any): ShapeRecipe | null {
  try {
    if (typeof raw === "string") raw = JSON.parse(raw);
  } catch (_e) {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const out: ShapeRecipe = { name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : "Shape", ops: [] };
  const ops: any[] = Array.isArray(raw.ops) ? raw.ops.slice(0, SHAPE_MAX_OPS) : [];
  for (const r of ops) {
    const o = sanitizeOp(r);
    if (o) out.ops.push(o);
  }
  const vRaw = raw.vessel ? raw.vessel : String(raw.mode || "").toUpperCase() === "VESSEL" ? raw : null;
  const v = sanitizeVessel(vRaw);
  if (v) out.vessel = v;
  out.rough = num(raw.rough, 0.45, 0.02, 1);
  out.metal = num(raw.metal, 0.02, 0, 1);
  if (raw.palette && typeof raw.palette === "object") {
    const b = rgb(raw.palette.body);
    if (b) out.palette = { body: b, accent: rgb(raw.palette.accent), detail: rgb(raw.palette.detail), doneBody: rgb(raw.palette.doneBody) };
  }
  // budget: shave segs off the costliest op, then scatter counts, then drop trailing ops
  let guard = 400;
  while (estimateShapeTris(out) > SHAPE_MAX_TRIS && guard-- > 0) {
    if (out.vessel && vesselTris(out.vessel) > SHAPE_MAX_TRIS * 0.75 && out.vessel.segs > 8) {
      out.vessel.segs--;
      continue;
    }
    let worst = -1, cost = -1;
    for (let i = 0; i < out.ops.length; i++) {
      const o = out.ops[i];
      const c = opTris(o) * (o.scatter ? o.scatter.count : 1);
      if (c > cost) { cost = c; worst = i; }
    }
    if (worst < 0) {
      if (out.vessel && out.vessel.segs > 6) { out.vessel.segs--; continue; }
      if (out.vessel && out.vessel.handle !== "NONE") { out.vessel.handle = "NONE"; continue; }
      break;
    }
    const o = out.ops[worst];
    const minSegs = o.op === "ELLIPSOID" ? 5 : o.op === "DOME" ? 5 : 4;
    if (o.op !== "BOX" && (o.segs || 8) > minSegs) o.segs = (o.segs || 8) - 1;
    else if (o.scatter && o.scatter.count > 2) o.scatter.count--;
    else out.ops.splice(worst, 1);
  }
  if (estimateShapeTris(out) > SHAPE_MAX_TRIS) return null;
  if (out.ops.length === 0 && !out.vessel) return null;
  return out;
}

// ───────────────────────────── Smith API schema (small + flat: no min/max/minItems/maxLength) ─────────────────────────────

const NUM = { type: "number" };
const OP_NUM_KEYS = ["x", "y", "z", "yaw", "pitch", "roll", "sx", "sy", "sz", "segs", "lobes", "amp", "count", "jitter", "seed", "heap"];

function opSchema(): any {
  const props: any = {
    op: { type: "string", enum: KINDS.slice() },
    slot: { type: "string", enum: SLOTS.slice() },
    pts: { type: "array", items: NUM },
    pattern: { type: "string", enum: PATTERNS.slice() },
    split: { type: "boolean" },
  };
  for (const k of OP_NUM_KEYS) props[k] = NUM;
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}

/** JSON schema for one Smith call ("output_config.format" json_schema). Flat, every field required. */
export const SHAPE_RECIPE_JSON_SCHEMA: any = {
  type: "object",
  properties: {
    name: { type: "string" },
    mode: { type: "string", enum: ["ITEM", "VESSEL"] },
    ops: { type: "array", items: opSchema() },
    profile: { type: "array", items: NUM },
    segs: NUM,
    handle: { type: "string", enum: HANDLES.slice() },
    floor: { type: "boolean" },
    rough: NUM,
  },
  required: ["name", "mode", "ops", "profile", "segs", "handle", "floor", "rough"],
  additionalProperties: false,
};

/** Short system-prompt crib for the Smith call (keeps the model inside the builder's conventions). */
export const SHAPE_RECIPE_PROMPT_HINT =
  "Units cm, item rests on y=0, +Y up, angles degrees. <=12 ops, <=450 triangles total (ELLIPSOID 2*segs*(round(0.67*segs)-1), " +
  "LATHE 2*segs*(points-1), BOX 12, DISC segs, DOME 6*segs, TORUS 2*segs*round(segs/3), SWEEP 2*segs*points). " +
  "Each op is a unit primitive scaled by sx,sy,sz (BOX = half sizes). LATHE pts=[r,y,...] bottom->top; SWEEP pts=[x,y,z,r,...]. " +
  "ELLIPSOID lobes 2-4 + amp 0.15-0.35 = irregular chunk. count>1 scatters (DISC spiral radius jitter, LINE along X alternate sides, RING); " +
  "split=true makes each copy a separate piece (bite-size chunks), heap>0 piles them. slot body=main colour, accent=secondary, detail=spots. " +
  "mode VESSEL: profile=[r,y,...] outer wall bottom->top, handle NONE|LONG|TWIN|LOOP, floor true; ops may add details. Unused fields: 0, [] or false.";

// ───────────────────────────── hand-authored recipes ─────────────────────────────

/** 12 irregular fried-chicken chunks (Chicken 65): lobed, bumpy, varied size, split pieces, piled. Never cubes.
 *  Raw = marinated blush; done = glossy chilli-red / golden glaze (low roughness reads as a crisp lacquered crust). */
export const IRREGULAR_CHICKEN_CHUNKS: ShapeRecipe = {
  name: "ChickenChunks",
  rough: 0.5,
  metal: 0.0,
  palette: { body: [0.95, 0.72, 0.58], doneBody: [0.84, 0.36, 0.12] },
  ops: [
    {
      op: "ELLIPSOID", slot: "body", pos: [0, 1.0, 0], rot: [0, 48, 40], scale: [1.55, 0.95, 1.18],
      segs: 6, lobes: 2, amp: 0.27,
      scatter: { count: 12, jitter: 4.6, seed: 65, pattern: "DISC", split: true, heap: 1.15 },
    },
  ],
};

/** Two-tone rolling pin (chapathi): 26 cm pale maple barrel with chamfered ends + walnut turned handles
 *  (neck, bead, knob), lying along X. */
export const ROLLING_PIN: ShapeRecipe = {
  name: "RollingPin",
  rough: 0.45,
  palette: { body: [0.90, 0.74, 0.52], accent: [0.46, 0.28, 0.17] },
  ops: [
    { op: "LATHE", slot: "body", pos: [0, 2.25, 0], rot: [0, 0, 90], scale: [1, 1, 1], segs: 12, pts: [0, -13, 1.9, -13, 2.18, -12.65, 2.25, -11.9, 2.25, 11.9, 2.18, 12.65, 1.9, 13, 0, 13] },
    { op: "LATHE", slot: "accent", pos: [-15.5, 2.25, 0], rot: [0, 0, 90], scale: [1, 1, 1], segs: 8, pts: [0, -3.2, 1.15, -3.2, 1.2, -0.7, 0.92, -0.35, 1.36, 0.05, 1.02, 0.45, 1.06, 1.9, 1.26, 2.45, 0, 2.95] },
    { op: "LATHE", slot: "accent", pos: [15.5, 2.25, 0], rot: [0, 0, -90], scale: [1, 1, 1], segs: 8, pts: [0, -3.2, 1.15, -3.2, 1.2, -0.7, 0.92, -0.35, 1.36, 0.05, 1.02, 0.45, 1.06, 1.9, 1.26, 2.45, 0, 2.95] },
  ],
};

/** Walnut chopping / rolling board 30 x 20 cm: stepped (chamfered) top and bottom edges, paler oiled top, juice
 *  groove, handle tab with a hang hole and a leather loop. */
export const WOODEN_BOARD: ShapeRecipe = {
  name: "WoodenBoard",
  rough: 0.5,
  palette: { body: [0.52, 0.33, 0.20], accent: [0.66, 0.46, 0.29], detail: [0.34, 0.20, 0.12] },
  ops: [
    { op: "BOX", slot: "body", pos: [0, 1.0, 0], scale: [13, 0.8, 10] },
    { op: "BOX", slot: "body", pos: [0, 0.1, 0], scale: [12.7, 0.1, 9.7] },
    { op: "BOX", slot: "body", pos: [15.3, 1.0, 0], scale: [2.5, 0.8, 4.0] },
    { op: "BOX", slot: "accent", pos: [0, 1.9, 0], scale: [12.75, 0.1, 9.75] },
    { op: "BOX", slot: "accent", pos: [15.2, 1.9, 0], scale: [2.35, 0.1, 3.75] },
    { op: "TORUS", slot: "detail", pos: [0, 2.0, 0], scale: [11.2, 1.0, 8.2], segs: 18, amp: 0.028 },
    { op: "TORUS", slot: "detail", pos: [16.2, 1.98, 0], scale: [0.95, 1.0, 0.95], segs: 10, amp: 0.24 },
    { op: "TORUS", slot: "detail", pos: [18.3, 1.05, 0], scale: [2.0, 1.4, 1.05], segs: 12, amp: 0.15 },
  ],
};

/** Curry-leaf sprig: curved stem + 10 glossy, slender alternate leaves. */
export const CURRY_LEAF_SPRIG: ShapeRecipe = {
  name: "CurryLeafSprig",
  rough: 0.24,
  palette: { body: [0.18, 0.50, 0.17], accent: [0.46, 0.56, 0.24] },
  ops: [
    { op: "SWEEP", slot: "accent", pos: [0, 0.35, 0], scale: [1, 1, 1], segs: 4, pts: [-5.6, 0, 0, 0.12, -2, 0.15, 0.2, 0.1, 2, 0.15, 0.1, 0.08, 5.6, 0, -0.3, 0.06] },
    { op: "ELLIPSOID", slot: "body", pos: [0, 0.42, 0], rot: [58, 0, 0], scale: [1.4, 0.09, 0.5], segs: 6, lobes: 2, amp: 0.08, scatter: { count: 10, jitter: 4.8, seed: 11, pattern: "LINE" } },
  ],
};

/** Lemon wedge: an eighth of a lemon - glossy rind boat, white pith band, juicy flesh with a centre line and
 *  segment membranes. */
export const LEMON_WEDGE: ShapeRecipe = {
  name: "LemonWedge",
  rough: 0.28,
  palette: { body: [1.0, 0.84, 0.12], accent: [1.0, 0.92, 0.5], detail: [0.99, 0.97, 0.86] },
  ops: [
    // rind: boat-shaped half shell (flipped by pitch 180), rind side down, long axis X
    { op: "LATHE", slot: "body", pos: [0, 1.4, 0], rot: [0, 180, 0], scale: [3.3, 1.4, 1.05], segs: 12, pts: [1, 0, 0.93, 0.4, 0.72, 0.74, 0.4, 0.94, 0, 1] },
    // pith band (flat, full width) under the slightly smaller, domed flesh face
    { op: "DISC", slot: "detail", pos: [0, 1.405, 0], scale: [3.28, 1, 1.04], segs: 14 },
    { op: "DISC", slot: "accent", pos: [0, 1.43, 0], scale: [3.0, 1, 0.86], segs: 14, amp: 0.2 },
    { op: "BOX", slot: "detail", pos: [0, 1.62, 0], scale: [2.6, 0.015, 0.035] },
    { op: "BOX", slot: "detail", pos: [0, 1.6, 0], scale: [0.025, 0.015, 0.62], scatter: { count: 4, jitter: 1.9, seed: 5, pattern: "LINE" } },
  ],
};

/** Shallow ivory dish (atta / cornflour) with a soft, peaked flour mound. */
export const FLOUR_DISH: ShapeRecipe = {
  name: "FlourDish",
  rough: 0.2,
  palette: { body: [0.95, 0.93, 0.88], accent: [0.98, 0.95, 0.86] },
  vessel: { profile: [[6.5, 0], [8.5, 0.6], [9.5, 2.2], [10, 3.0]], segs: 16, handle: "NONE", floor: true },
  ops: [
    { op: "LATHE", slot: "accent", pos: [0, 0, 0], scale: [1, 1, 1], segs: 13, lobes: 3, amp: 0.05, pts: [0, 0.63, 6.0, 0.63, 7.3, 1.3, 6.0, 1.95, 3.6, 2.65, 1.2, 3.05, 0, 3.15] },
  ],
};

/** Smooth dough ball (chapathi portion): soft squashed sphere, gentle lobes, a pinched seam on top. */
export const DOUGH_BALL: ShapeRecipe = {
  name: "DoughBall",
  rough: 0.72,
  palette: { body: [0.97, 0.88, 0.68], detail: [0.90, 0.79, 0.58] },
  ops: [
    { op: "ELLIPSOID", slot: "body", pos: [0, 2.15, 0], scale: [3.05, 2.2, 3.0], segs: 16, lobes: 3, amp: 0.04 },
    { op: "TORUS", slot: "detail", pos: [0, 4.22, 0], rot: [20, 0, 0], scale: [0.75, 0.45, 0.6], segs: 9, amp: 0.13 },
  ],
};

/** Rolled flatbread (chapathi / roti), ~18 cm, soft wavy edge, puffed blisters and browned char spots. */
export const FLATBREAD_DISC: ShapeRecipe = {
  name: "FlatbreadDisc",
  rough: 0.72,
  palette: { body: [0.97, 0.87, 0.64], accent: [0.96, 0.84, 0.60], detail: [0.80, 0.55, 0.30], doneBody: [0.93, 0.74, 0.46] },
  ops: [
    { op: "LATHE", slot: "body", pos: [0, 0, 0], scale: [9, 1, 9], segs: 16, lobes: 5, amp: 0.025, pts: [0, 0, 0.94, 0, 1, 0.12, 0.96, 0.3, 0.7, 0.4, 0, 0.44] },
    { op: "DOME", slot: "accent", pos: [0, 0.4, 0], scale: [1.1, 0.2, 0.85], segs: 6, scatter: { count: 5, jitter: 5.0, seed: 31, pattern: "DISC" } },
    { op: "DISC", slot: "detail", pos: [0, 0.455, 0], scale: [0.48, 1, 0.38], segs: 6, amp: 0.02, scatter: { count: 10, jitter: 6.0, seed: 9, pattern: "DISC" } },
    { op: "DISC", slot: "detail", pos: [0, 0.455, 0], scale: [0.26, 1, 0.22], segs: 5, amp: 0.02, scatter: { count: 8, jitter: 6.4, seed: 21, pattern: "DISC" } },
  ],
};

/** Perforated spider skimmer (jhara): shallow brushed-steel dish with punched holes, rolled rim, steel shank and
 *  walnut grip. */
export const SKIMMER: ShapeRecipe = {
  name: "Skimmer",
  rough: 0.22,
  metal: 0.8,
  palette: { body: [0.84, 0.86, 0.89], accent: [0.44, 0.27, 0.16], detail: [0.24, 0.24, 0.26] },
  ops: [
    { op: "LATHE", slot: "body", pos: [0, 0.4, 0], scale: [5, 1, 5], segs: 16, pts: [0.96, 0.42, 1, 0.35, 0.7, 0.05, 0, 0] },
    { op: "TORUS", slot: "body", pos: [0, 0.79, 0], scale: [4.92, 1, 4.92], segs: 16, amp: 0.022 },
    { op: "DISC", slot: "detail", pos: [0, 0.465, 0], scale: [0.2, 1, 0.2], segs: 5, scatter: { count: 14, jitter: 2.9, seed: 3, pattern: "DISC" } },
    { op: "SWEEP", slot: "body", pos: [0, 0, 0], scale: [1, 1, 1], segs: 6, pts: [4.8, 0.8, 0, 0.22, 9, 2.2, 0, 0.2, 16, 3.4, 0, 0.21] },
    { op: "SWEEP", slot: "accent", pos: [0, 0, 0], scale: [1, 1, 1], segs: 8, pts: [16, 3.4, 0, 0.4, 19, 3.9, 0, 0.5, 23.5, 4.6, 0, 0.53, 27, 5.1, 0, 0.42] },
  ],
};

/** Olive-wood spoon: oval shallow bowl + slim neck and a tapered, rounded handle along +X. */
export const WOODEN_SPOON: ShapeRecipe = {
  name: "WoodenSpoon",
  rough: 0.5,
  palette: { body: [0.84, 0.64, 0.42], accent: [0.80, 0.59, 0.37] },
  ops: [
    { op: "LATHE", slot: "body", pos: [0, 0.5, 0], scale: [3.2, 1, 2.2], segs: 16, pts: [0, 0, 0.6, 0.04, 0.95, 0.3, 1, 0.55, 0.9, 0.62, 0.55, 0.3, 0, 0.26] },
    { op: "SWEEP", slot: "accent", pos: [0, 0, 0], scale: [1, 1, 1], segs: 8, pts: [2.9, 1.0, 0, 0.36, 5.5, 1.4, 0, 0.27, 10, 2.0, 0, 0.36, 18, 2.75, 0, 0.47, 24.5, 3.15, 0, 0.5, 26, 3.2, 0, 0.36] },
  ],
};

/** Pastry / ghee brush: walnut handle, brass ferrule, natural bristle tuft. */
export const BRUSH: ShapeRecipe = {
  name: "Brush",
  rough: 0.45,
  palette: { body: [0.46, 0.29, 0.17], accent: [0.92, 0.76, 0.42], detail: [0.96, 0.89, 0.70] },
  ops: [
    { op: "SWEEP", slot: "body", pos: [0, 0, 0], scale: [1, 1, 1], segs: 8, pts: [5.5, 0.9, 0, 0.55, 10, 1.1, 0, 0.62, 15, 1.3, 0, 0.52, 18, 1.35, 0, 0.4] },
    { op: "LATHE", slot: "accent", pos: [3.6, 0.85, 0], rot: [0, 0, 90], scale: [1, 1, 1], segs: 10, pts: [0, -2.0, 0.66, -2.0, 0.72, -1.6, 0.7, 0, 0.62, 2.0, 0, 2.0] },
    { op: "ELLIPSOID", slot: "detail", pos: [0.4, 0.75, 0], rot: [0, 0, 0], scale: [2.4, 0.55, 1.1], segs: 10, lobes: 6, amp: 0.1 },
  ],
};

/** All hand-authored recipes by id (gallery + PlanLibrary lookups). */
export const SHAPE_RECIPES: { [id: string]: ShapeRecipe } = {
  IRREGULAR_CHICKEN_CHUNKS: IRREGULAR_CHICKEN_CHUNKS,
  ROLLING_PIN: ROLLING_PIN,
  WOODEN_BOARD: WOODEN_BOARD,
  CURRY_LEAF_SPRIG: CURRY_LEAF_SPRIG,
  LEMON_WEDGE: LEMON_WEDGE,
  FLOUR_DISH: FLOUR_DISH,
  DOUGH_BALL: DOUGH_BALL,
  FLATBREAD_DISC: FLATBREAD_DISC,
  SKIMMER: SKIMMER,
  WOODEN_SPOON: WOODEN_SPOON,
  BRUSH: BRUSH,
};
