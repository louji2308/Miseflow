/**
 * ProteinGenerators.ts  (v5 A3 – protein catalogue #141-#149; #140 salmon stays the StationPropsBuilder fillet)
 * Procedural MeshAcc generators for dual-surface proteins: every piece has a TOP face (raw / marinated, faces up
 * at rest) and a SEAR face (the pan side, crust + char) split at the piece's waist, plus optional detail meshes
 * (marbling / fat cap / flecks / char bars / yolk). Multi-piece items are arrays of pieces with their own pan
 * transforms (pan toss hops them one by one).
 *   #141 RIBEYE_STEAK     marbled ruby steak + fat cap        -> mahogany crust, cross-hatch char bars
 *   #142 CHICKEN_CUTLET   ivory spiced cutlet (FILLET_SLAB)   -> golden-brown crust     | TIKKA_CHUNKS (CUBED_SEAR) 7 pcs
 *        MUSHROOM_CHUNKS  halved buttons (name "mushroom" / #108) -> golden sauteed cut faces, 7 pcs
 *   #143 PRAWN_CURLS      grey-blue C-curled prawns + tail fan -> coral butter-garlic sear, 5 pcs
 *   #144 SCALLOP_DISCS    pearl cylinders                     -> amber-gold crust, 3 pcs
 *   #145 FRIED_EGGS       clear white + yolk                  -> lacy crisp edge, glossy yolk (flip = over easy), 2 pcs
 *   #146 PANEER_STEAK / PANEER_CUBES  turmeric ivory block     -> blistered tandoori char
 *   #147 TOFU_STEAK / TOFU_CUBES      cream block              -> glossy amber miso-soy glaze
 *   #148 KOFTA_BALLS      seasoned spheres                    -> caramelised crust, 6 pcs
 *   #149 BACON_LARDONS    streaky pink-white lardons          -> mahogany crisp, 8 pcs
 * Budget: <= 450 tris per single item, <= 900 per multi-piece set. Mesh units = pan-local (SkilletPan) units,
 * piece pivot = bottom centre (y 0 = pan-floor contact). Additive display: no pure black, dark crusts are lifted
 * and get a little emissive so they stay readable. ProteinProp (scene prop) + ProteinRegistry (active flip / toss
 * target for SpatulaFlipRig / PanTossRoll / SpatulaTechniqueGuide; none active = the legacy salmon) live here too.
 */

import { MeshAcc, makePbrMaterial } from "./StationPropsBuilder";
import { canonicalProteinNumber } from "./AI/AssetPageTable";
import { Rgb } from "./AI/UniversalDishSchema";

export type ProteinGenId =
  | "RIBEYE_STEAK" | "CHICKEN_CUTLET" | "TIKKA_CHUNKS" | "MUSHROOM_CHUNKS" | "PRAWN_CURLS" | "SCALLOP_DISCS"
  | "FRIED_EGGS" | "PANEER_STEAK" | "PANEER_CUBES" | "TOFU_STEAK" | "TOFU_CUBES" | "KOFTA_BALLS" | "BACON_LARDONS";

/** What the generators read (a blueprint protein spec and an AssetPageTable ProteinPageEntry both fit). */
export interface ProteinEntryLike {
  accessNumber: number;
  name: string;
  archetype: string;
  rawTopRgb?: Rgb;
  searedCrustRgb?: Rgb;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

/** Optional dish colours (a compiled dish's marinade / glaze); omitted = the catalogue design palette. */
export interface ProteinTint {
  rawRgb?: Rgb;
  searedRgb?: Rgb;
}

/** Material slots shared by every piece of a set. */
export const SLOT_TOP = 0;
export const SLOT_SEAR = 1;
export const SLOT_TOP_DETAIL = 2;
export const SLOT_SEAR_DETAIL = 3;
export const SLOT_ACCENT = 4;
const SLOT_NAMES = ["Top", "Sear", "TopDetail", "SearDetail", "Accent"];
const SLOT_COUNT = 5;

/** raw -> done colour (setDoneness blends), PBR params and a small emissive lift for the additive display. */
export interface ProteinSlotSpec {
  raw: Rgb;
  done: Rgb;
  metal: number;
  rough: number;
  roughDone: number;
  glow: number;
}

export interface ProteinPieceBuild {
  /** One mesh per slot (null = slot unused by this piece). */
  meshes: (MeshAcc | null)[];
  x: number;
  z: number;
  yaw: number;
  height: number;
  radius: number;
  tris: number;
}

export interface ProteinSet {
  gen: ProteinGenId;
  accessNumber: number;
  name: string;
  pieces: ProteinPieceBuild[];
  slots: (ProteinSlotSpec | null)[];
  tris: number;
  /** Footprint radius of the whole set around the set centre (pan units). */
  extent: number;
  height: number;
}

type V2 = [number, number];
type V3 = [number, number, number];

const U = 1.12; // pan units per spec cm (salmon 9 cm -> 10.6 u)
const PI = Math.PI;

// ───────────────────────────── small helpers ─────────────────────────────

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function fin(v: number | undefined, d: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : d;
}

function okRgb(c: any): boolean {
  return !!c && c.length === 3 && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lum(c: Rgb): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
}

/** Additive-display floor: lift dark colours toward warm amber (keeps the hue family, never black). */
function lift(c: Rgb, minLum: number = 0.2): Rgb {
  const l = lum(c);
  if (l >= minLum) return c;
  return mix(c, [1.0, 0.72, 0.45], Math.min(0.6, (minLum - l) / Math.max(0.05, 1 - l)));
}

function slot(raw: Rgb, done: Rgb, metal: number, rough: number, glow: number, roughDone?: number, minLum: number = 0.16): ProteinSlotSpec {
  return { raw: lift(raw, 0.16), done: lift(done, minLum), metal: metal, rough: rough, roughDone: roughDone !== undefined ? roughDone : rough, glow: glow };
}

/** Thin char marks: darker than the crust (contrast) but still above black. */
function charSlot(raw: Rgb, done: Rgb): ProteinSlotSpec {
  return slot(raw, done, 0.0, 0.6, 0.1, 0.6, 0.085);
}

function smooth01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function smoother01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Point clamped inside the ellipse (k*a, k*b). */
function inside(x: number, z: number, a: number, b: number): V2 {
  const q = Math.hypot(x / a, z / b);
  return q <= 1 ? [x, z] : [x / q, z / q];
}

// ───────────────────────────── surface primitives ─────────────────────────────

/** Superellipse footprint (exponent P), optional radius lobes [freq, amp, phase] and +x taper (fillet tail). */
interface Foot {
  a: number;
  b: number;
  P: number;
  lobes?: V3[];
  taper?: number;
  cx?: number;
  cz?: number;
}

function footPt(f: Foot, th: number): V2 {
  const c = Math.cos(th), s = Math.sin(th);
  const x = f.a * Math.sign(c) * Math.pow(Math.abs(c), 2 / f.P);
  let z = f.b * Math.sign(s) * Math.pow(Math.abs(s), 2 / f.P);
  let k = 1;
  if (f.lobes) for (const l of f.lobes) k += l[1] * Math.cos(l[0] * th + l[2]);
  if (f.taper) {
    const t = clamp((x / f.a + 1) / 2, 0, 1);
    z *= 1 - f.taper * Math.pow(t, 1.6);
  }
  return [x * k, z * k];
}

/**
 * Footprint shell: rows of a profile [scale, y] swept around the footprint (theta th0..th1, M segments).
 * A row with scale 0 closes the shell with a fan (top cap / bottom cap). Profile order: bottom-centre -> rim for an
 * underside, rim -> top-centre for a top (normals then point outward / up / down as expected).
 */
function shell(acc: MeshAcc, f: Foot, prof: V2[], M: number, th0: number = 0, th1: number = PI * 2, sc: number = 1): void {
  const P = prof.length;
  const span = th1 - th0;
  const cx = f.cx || 0, cz = f.cz || 0;
  const ua = Math.max(0.01, f.a * 2.2), ub = Math.max(0.01, f.b * 2.2);
  const rows: number[][] = [];
  for (let j = 0; j < P; j++) {
    const s = prof[j][0] * sc;
    const y = prof[j][1];
    const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(P - 1, j + 1)];
    const ids: number[] = [];
    if (s <= 1e-6) {
      const up = -(pb[0] - pa[0]) >= 0 ? 1 : -1;
      ids.push(acc.v(cx, y, cz, 0, up, 0, 0.5, 0.5));
      rows.push(ids);
      continue;
    }
    for (let i = 0; i <= M; i++) {
      const th = th0 + (span * i) / M;
      const F = footPt(f, th);
      const e = 1e-3;
      const Fa = footPt(f, th + e), Fb = footPt(f, th - e);
      let nx = Fa[1] - Fb[1], nz = -(Fa[0] - Fb[0]);
      let nl = Math.hypot(nx, nz);
      if (nl < 1e-9) {
        nx = Math.cos(th);
        nz = Math.sin(th);
        nl = 1;
      }
      nx /= nl;
      nz /= nl;
      if (nx * F[0] + nz * F[1] < 0) {
        nx = -nx;
        nz = -nz;
      }
      const R = Math.hypot(F[0], F[1]);
      const dr = (pb[0] - pa[0]) * R * sc, dy = pb[1] - pa[1];
      const l = Math.hypot(dr, dy) || 1;
      const pr = dy / l, py = -dr / l;
      const x = cx + F[0] * s, z = cz + F[1] * s;
      ids.push(acc.v(x, y, z, nx * pr, py, nz * pr, 0.5 + x / ua, 0.5 + z / ub));
    }
    rows.push(ids);
  }
  for (let j = 0; j < P - 1; j++) {
    const A = rows[j], B = rows[j + 1];
    if (A.length === 1 && B.length === 1) continue;
    for (let i = 0; i < M; i++) {
      if (A.length === 1) acc.tri(A[0], B[i], B[i + 1]);
      else if (B.length === 1) acc.tri(B[0], A[i], A[i + 1]);
      else acc.quad(A[i], A[i + 1], B[i + 1], B[i]);
    }
  }
}

/** Flat ribbon facing +y (up = 1) or -y (up = -1) through XZ points at height y. */
function strip(acc: MeshAcc, pts: V2[], y: number, w: number, up: number, taper: boolean = true): void {
  const N = pts.length;
  const ids: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const hw = ((taper && (i === 0 || i === N - 1) ? 0.55 : 1) * w) / 2;
    ids.push(acc.v(pts[i][0] - dz * hw, y, pts[i][1] + dx * hw, 0, up, 0, 0, i / Math.max(1, N - 1)));
    ids.push(acc.v(pts[i][0] + dz * hw, y, pts[i][1] - dx * hw, 0, up, 0, 1, i / Math.max(1, N - 1)));
  }
  for (let i = 0; i < N - 1; i++) acc.quad(ids[i * 2], ids[i * 2 + 1], ids[i * 2 + 3], ids[i * 2 + 2]);
}

/** Flat n-gon spot (blister / fleck / char) facing up or down. */
function spot(acc: MeshAcc, x: number, z: number, y: number, rx: number, rz: number, n: number, up: number, rot: number = 0): void {
  const c = acc.v(x, y, z, 0, up, 0, 0.5, 0.5);
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * PI * 2;
    ring.push(acc.v(x + Math.cos(a) * rx, y, z + Math.sin(a) * rz, 0, up, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5));
  }
  for (let i = 0; i < n; i++) acc.tri(c, ring[i], ring[(i + 1) % n]);
}

/** Parallel bars at `angle` (radians in XZ), clipped to the ellipse (A, B): grill / char marks. */
function hatch(acc: MeshAcc, A: number, B: number, angle: number, offsets: number[], y: number, w: number, up: number): void {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const nx = -dz, nz = dx;
  for (const o of offsets) {
    const px = nx * o, pz = nz * o;
    const qa = (dx / A) * (dx / A) + (dz / B) * (dz / B);
    const qb = 2 * ((px * dx) / (A * A) + (pz * dz) / (B * B));
    const qc = (px / A) * (px / A) + (pz / B) * (pz / B) - 1;
    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) continue;
    const sq = Math.sqrt(disc);
    const t0 = (-qb - sq) / (2 * qa), t1 = (-qb + sq) / (2 * qa);
    strip(acc, [[px + t0 * dx, pz + t0 * dz], [px + t1 * dx, pz + t1 * dz]], y, w, up, true);
  }
}

/** Upper (y >= 0) half of a body of revolution around the X axis; profile [x, r] with x increasing. */
function halfRevolve(acc: MeshAcc, prof: V2[], segs: number): void {
  const P = prof.length;
  const base = acc.count();
  for (let j = 0; j < P; j++) {
    const a = prof[Math.max(0, j - 1)], b = prof[Math.min(P - 1, j + 1)];
    const dax = b[0] - a[0], dr = b[1] - a[1];
    const l = Math.hypot(dax, dr) || 1;
    const nax = -dr / l, nr = dax / l;
    for (let i = 0; i <= segs; i++) {
      const ph = (i / segs) * PI;
      const r = prof[j][1];
      acc.v(prof[j][0], r * Math.sin(ph), r * Math.cos(ph), nax, nr * Math.sin(ph), nr * Math.cos(ph), i / segs, j / (P - 1));
    }
  }
  const S = segs + 1;
  for (let j = 0; j < P - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const q = base + j * S + i;
      if (prof[j][1] <= 1e-6) acc.tri(q, q + S + 1, q + S);
      else if (prof[j + 1][1] <= 1e-6) acc.tri(q, q + 1, q + S);
      else acc.quad(q, q + 1, q + S + 1, q + S);
    }
  }
}

/** Flat cut face of halfRevolve in the y = 0 plane (faces down). */
function halfRevolveCut(acc: MeshAcc, prof: V2[], y: number): void {
  const ids: number[] = [];
  for (const p of prof) ids.push(acc.v(p[0], y, -p[1], 0, -1, 0, 0, 0), acc.v(p[0], y, p[1], 0, -1, 0, 1, 0));
  for (let j = 0; j < prof.length - 1; j++) {
    if (prof[j][1] <= 1e-6) acc.tri(ids[j * 2], ids[j * 2 + 3], ids[j * 2 + 2]);
    else if (prof[j + 1][1] <= 1e-6) acc.tri(ids[j * 2], ids[j * 2 + 1], ids[j * 2 + 2]);
    else acc.quad(ids[j * 2], ids[j * 2 + 1], ids[j * 2 + 3], ids[j * 2 + 2]);
  }
}

/** Half of a swept elliptical tube (upper: phi 0..pi, lower: pi..2pi) along a near-horizontal curve. */
function halfTube(acc: MeshAcc, curve: V3[], rw: number[], rh: number[], segs: number, upper: boolean): void {
  const N = curve.length;
  const base = acc.count();
  const p0 = upper ? 0 : PI;
  for (let i = 0; i < N; i++) {
    const a = curve[Math.max(0, i - 1)], b = curve[Math.min(N - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const sx = tz, sz = -tx; // side (horizontal), up = +y
    for (let j = 0; j <= segs; j++) {
      const ph = p0 + (j / segs) * PI;
      const c = Math.cos(ph), s = Math.sin(ph);
      acc.v(curve[i][0] + sx * c * rw[i], curve[i][1] + s * rh[i], curve[i][2] + sz * c * rw[i],
        (sx * c) / rw[i], s / rh[i], (sz * c) / rw[i], j / segs, i / (N - 1));
    }
  }
  const S = segs + 1;
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < segs; j++) {
    const q = base + i * S + j;
    acc.quad(q, q + 1, q + S + 1, q + S);
  }
  // half-disc cap at the head end
  const a = curve[0], b = curve[1];
  let tx = a[0] - b[0], tz = a[2] - b[2];
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  const sx = -tz, sz = tx; // same side vector as ring 0 of the tube
  const c0 = acc.v(a[0], a[1], a[2], tx, 0, tz, 0.5, 0.5);
  const ring: number[] = [];
  for (let j = 0; j <= segs; j++) {
    const ph = p0 + (j / segs) * PI;
    ring.push(acc.v(a[0] + sx * Math.cos(ph) * rw[0], a[1] + Math.sin(ph) * rh[0], a[2] + sz * Math.cos(ph) * rw[0], tx, 0, tz, 0, 0));
  }
  for (let j = 0; j < segs; j++) acc.tri(c0, ring[j], ring[j + 1]);
}

// ───────────────────────────── pieces ─────────────────────────────

class PieceAcc {
  meshes: (MeshAcc | null)[] = [null, null, null, null, null];
  x: number;
  z: number;
  yaw: number;

  constructor(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
  }

  m(slotIndex: number): MeshAcc {
    let a = this.meshes[slotIndex];
    if (!a) {
      a = new MeshAcc();
      this.meshes[slotIndex] = a;
    }
    return a;
  }

  build(): ProteinPieceBuild {
    let tris = 0;
    let top = 0;
    let rad = 0;
    for (const a of this.meshes) {
      if (!a) continue;
      tris += a.triCount();
      const b = a.bounds();
      top = Math.max(top, b[4]);
      rad = Math.max(rad, Math.hypot(Math.max(-b[0], b[3]), Math.max(-b[2], b[5])));
    }
    return { meshes: this.meshes, x: this.x, z: this.z, yaw: this.yaw, height: top, radius: rad, tris: tris };
  }
}

interface GenCtx {
  R: () => number;
  L: number;
  W: number;
  H: number;
  name: string;
}

interface GenOut {
  pieces: PieceAcc[];
  slots: (ProteinSlotSpec | null)[];
}

/** Vogel spiral layout (centred, jittered), spacing c. */
function phyllo(i: number, c: number, R: () => number): V2 {
  const r = c * Math.sqrt(i + 0.5);
  const a = i * 2.39996 + 0.6;
  return [Math.cos(a) * r + (R() - 0.5) * 0.25, Math.sin(a) * r + (R() - 0.5) * 0.25];
}

function slots5(top: ProteinSlotSpec, sear: ProteinSlotSpec, topD: ProteinSlotSpec | null, searD: ProteinSlotSpec | null, acc: ProteinSlotSpec | null): (ProteinSlotSpec | null)[] {
  return [top, sear, topD, searD, acc];
}

// ───────────────────────────── #141 ribeye ─────────────────────────────

function genRibeye(c: GenCtx): GenOut {
  const R = c.R;
  const a = clamp((c.L * U) / 2, 3.5, 5.8), b = clamp((c.W * U) / 2, 2.5, 4.2), H = clamp(c.H * 0.8, 1.4, 3.0);
  const f: Foot = { a: a, b: b, P: 2.3, lobes: [[2, 0.05, -0.5], [3, 0.04, 1.2]], taper: 0.14 };
  const p = new PieceAcc(0, 0, 0);
  const S = 0.42 * H;
  shell(p.m(SLOT_TOP), f, [[1, S], [1, 0.8 * H], [0.93, 0.97 * H], [0.62, H], [0, H]], 22);
  shell(p.m(SLOT_SEAR), f, [[0, 0], [0.86, 0], [1, 0.15 * H], [1, S]], 22);
  // fat cap along the +z flank: cream on the raw half, rendered gold on the seared half
  shell(p.m(SLOT_TOP_DETAIL), f, [[1, S], [1, 0.8 * H], [0.93, 0.97 * H]], 7, PI / 2 - 0.85, PI / 2 + 0.85, 1.018);
  shell(p.m(SLOT_ACCENT), f, [[1, 0.15 * H], [1, S]], 7, PI / 2 - 0.85, PI / 2 + 0.85, 1.018);
  // marbling: wandering fat streaks + one wider seam between eye and cap
  for (let k = 0; k < 6; k++) {
    const pts: V2[] = [];
    let ang = R() * PI * 2;
    let x = (R() - 0.5) * a * 0.8, z = (R() - 0.5) * b * 0.7;
    for (let i = 0; i < 5; i++) {
      pts.push(inside(x, z, a * 0.52, b * 0.48));
      ang += (R() - 0.5) * 1.2;
      x += Math.cos(ang) * 0.72;
      z += Math.sin(ang) * 0.72;
    }
    strip(p.m(SLOT_TOP_DETAIL), pts, H + 0.012, k === 0 ? 0.4 : 0.16 + R() * 0.14, 1);
  }
  // cross-hatch char bars on the pan side
  const off = [-2.1, -0.7, 0.7, 2.1];
  hatch(p.m(SLOT_SEAR_DETAIL), a * 0.78, b * 0.72, PI / 4, off, -0.012, 0.3, -1);
  hatch(p.m(SLOT_SEAR_DETAIL), a * 0.78, b * 0.72, -PI / 4, off, -0.012, 0.3, -1);
  const ruby: Rgb = [0.65, 0.14, 0.14]; // #A62424
  const crust: Rgb = [0.4, 0.19, 0.075]; // #4A2210 mahogany, lifted + warmed so the additive display keeps it brown
  const fat: Rgb = [0.97, 0.88, 0.84];
  return {
    pieces: [p],
    slots: slots5(
      slot(ruby, [0.58, 0.2, 0.16], 0.0, 0.36, 0.12, 0.42),
      slot(ruby, crust, 0.05, 0.36, 0.26, 0.24),
      slot(fat, [0.95, 0.8, 0.6], 0.0, 0.42, 0.1),
      charSlot(ruby, [0.16, 0.07, 0.035]),
      slot(fat, [0.84, 0.56, 0.26], 0.02, 0.4, 0.12, 0.3)
    ),
  };
}

// ───────────────────────────── #142 chicken / tikka / mushrooms ─────────────────────────────

function genCutlet(c: GenCtx): GenOut {
  const R = c.R;
  const a = clamp((c.L * U) / 2, 2.8, 5.2), b = clamp((c.W * U) / 2, 2.0, 3.4), H = clamp(c.H * 0.8, 1.0, 2.2);
  const f: Foot = { a: a, b: b, P: 2.2, lobes: [[3, 0.035, 0.4], [2, 0.03, 1.0]], taper: 0.38 };
  const p = new PieceAcc(0, 0, 0);
  const S = 0.4 * H;
  shell(p.m(SLOT_TOP), f, [[1, S], [0.98, 0.72 * H], [0.86, 0.94 * H], [0.5, H], [0, H]], 20);
  shell(p.m(SLOT_SEAR), f, [[0, 0], [0.84, 0], [0.98, 0.14 * H], [1, S]], 20);
  for (let i = 0; i < 9; i++) {
    const q = inside((R() - 0.6) * a * 0.9, (R() - 0.5) * b * 0.8, a * 0.42, b * 0.36);
    spot(p.m(SLOT_TOP_DETAIL), q[0], q[1], H + 0.01, 0.12 + R() * 0.08, 0.09 + R() * 0.06, 5, 1, R() * PI);
  }
  hatch(p.m(SLOT_SEAR_DETAIL), a * 0.7, b * 0.62, 0.35, [-1.2, 0, 1.2], -0.012, 0.28, -1);
  const ivory: Rgb = [0.94, 0.82, 0.66];
  return {
    pieces: [p],
    slots: slots5(
      slot(ivory, [0.93, 0.74, 0.52], 0.0, 0.42, 0.1),
      slot(ivory, [0.72, 0.45, 0.18], 0.02, 0.4, 0.16, 0.3),
      slot([0.9, 0.42, 0.2], [0.66, 0.26, 0.1], 0.0, 0.5, 0.1),
      charSlot(ivory, [0.3, 0.15, 0.06]),
      null
    ),
  };
}

/** Rounded chunks / cubes (tikka, paneer, tofu): count pieces on a Vogel spiral, P = squareness. */
function chunkSet(c: GenCtx, count: number, half: number, H0: number, P: number, lob: number, spacing: number, spotsTop: number, spotsSear: number): PieceAcc[] {
  const R = c.R;
  const out: PieceAcc[] = [];
  for (let i = 0; i < count; i++) {
    const q = phyllo(i, spacing, R);
    const p = new PieceAcc(q[0], q[1], R() * PI * 2);
    const a = half * (0.88 + 0.22 * R()), b = a * (0.86 + 0.22 * R()), H = H0 * (0.86 + 0.22 * R());
    const f: Foot = { a: a, b: b, P: P, lobes: lob > 0 ? [[3, lob, R() * 6.28], [2, lob * 0.7, R() * 6.28]] : undefined };
    shell(p.m(SLOT_TOP), f, [[1, 0.45 * H], [0.96, 0.86 * H], [0.7, H], [0, H]], 12);
    shell(p.m(SLOT_SEAR), f, [[0, 0], [0.72, 0], [0.97, 0.13 * H], [1, 0.45 * H]], 12);
    for (let k = 0; k < spotsTop; k++) {
      const s = inside((R() - 0.5) * a, (R() - 0.5) * b, a * 0.5, b * 0.5);
      spot(p.m(SLOT_TOP_DETAIL), s[0], s[1], H + 0.01, 0.2 + R() * 0.12, 0.16 + R() * 0.1, 3, 1, R() * PI);
    }
    for (let k = 0; k < spotsSear; k++) {
      const s = inside((R() - 0.5) * a, (R() - 0.5) * b, a * 0.55, b * 0.55);
      spot(p.m(SLOT_SEAR_DETAIL), s[0], s[1], -0.012, 0.24 + R() * 0.14, 0.18 + R() * 0.1, 3, -1, R() * PI);
    }
    out.push(p);
  }
  return out;
}

function genTikka(c: GenCtx): GenOut {
  const marinade: Rgb = [0.93, 0.6, 0.36];
  return {
    pieces: chunkSet(c, 7, 1.3, clamp(c.H * 1.05, 1.6, 2.4), 4.5, 0.05, 1.75, 1, 1),
    slots: slots5(
      slot(marinade, [0.86, 0.44, 0.2], 0.0, 0.44, 0.12),
      slot(marinade, [0.55, 0.25, 0.09], 0.02, 0.4, 0.18, 0.3),
      slot([0.88, 0.52, 0.28], [0.36, 0.15, 0.06], 0.0, 0.6, 0.12),
      slot(marinade, [0.3, 0.13, 0.05], 0.0, 0.6, 0.12),
      null
    ),
  };
}

function genMushroom(c: GenCtx, tint: ProteinTint): GenOut {
  const R = c.R;
  const raw: Rgb = okRgb(tint.rawRgb) ? (tint.rawRgb as Rgb) : [0.86, 0.78, 0.68];
  const sear: Rgb = okRgb(tint.searedRgb) ? (tint.searedRgb as Rgb) : [0.58, 0.36, 0.16];
  const flesh = mix(raw, [0.98, 0.95, 0.9], 0.55);
  const base: V2[] = [[-1.25, 0.42], [-0.55, 0.5], [-0.25, 0.62], [-0.15, 1.35], [0.2, 1.6], [0.7, 1.45], [1.05, 0.95], [1.2, 0.0]];
  const pieces: PieceAcc[] = [];
  for (let i = 0; i < 7; i++) {
    const q = phyllo(i, 1.85, R);
    const p = new PieceAcc(q[0], q[1], R() * PI * 2);
    const m = 0.85 + 0.25 * R();
    const prof: V2[] = base.map((v) => [v[0] * m, v[1] * m] as V2);
    halfRevolve(p.m(SLOT_TOP), prof, 6);
    // stem end cap (half disc facing -x)
    const st = p.m(SLOT_TOP);
    const r0 = prof[0][1], x0 = prof[0][0];
    const c0 = st.v(x0, 0, 0, -1, 0, 0, 0.5, 0.5);
    const ring: number[] = [];
    for (let j = 0; j <= 6; j++) {
      const ph = (j / 6) * PI;
      ring.push(st.v(x0, r0 * Math.sin(ph), r0 * Math.cos(ph), -1, 0, 0, 0, 0));
    }
    for (let j = 0; j < 6; j++) st.tri(c0, ring[j], ring[j + 1]);
    halfRevolveCut(p.m(SLOT_SEAR), prof, 0);
    // gill line where the cap meets the stem (darker band on the cut face)
    strip(p.m(SLOT_SEAR_DETAIL), [[-0.12 * m, -1.3 * m], [-0.12 * m, 1.3 * m]], -0.012, 0.2 * m, -1, false);
    pieces.push(p);
  }
  return {
    pieces: pieces,
    slots: slots5(
      slot(raw, mix(raw, sear, 0.45), 0.0, 0.4, 0.1, 0.24),
      slot(flesh, sear, 0.02, 0.42, 0.16, 0.26),
      null,
      slot(mix(raw, [0.45, 0.36, 0.3], 0.45), mix(sear, [0.25, 0.12, 0.05], 0.4), 0.0, 0.6, 0.1),
      null
    ),
  };
}

// ───────────────────────────── #143 prawns ─────────────────────────────

function genPrawns(c: GenCtx): GenOut {
  const R = c.R;
  const pieces: PieceAcc[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * PI * 2 + 0.3;
    const p = new PieceAcc(Math.cos(ang) * 3.8, Math.sin(ang) * 3.8, -ang + (R() - 0.5) * 0.5);
    const k = 0.92 + 0.16 * R();
    const Rc = 1.45 * k;
    const N = 10;
    const curve: V3[] = [];
    const rw: number[] = [];
    const rh: number[] = [];
    for (let j = 0; j < N; j++) {
      const t = j / (N - 1);
      const ph = -0.35 * PI + t * 1.5 * PI;
      const r = k * (0.78 - 0.5 * Math.pow(t, 1.4)) * (1 + 0.07 * Math.cos(2 * PI * 5.5 * t));
      rw.push(r);
      rh.push(r * 0.92);
      curve.push([Math.cos(ph) * Rc, r * 0.92, Math.sin(ph) * Rc]);
    }
    halfTube(p.m(SLOT_TOP), curve, rw, rh, 4, true);
    halfTube(p.m(SLOT_SEAR), curve, rw, rh, 4, false);
    // tail fan (two flat faces) rooted inside the last shell segment, flaring past the open tail end
    const e = curve[N - 1], d = curve[N - 2];
    let tx = e[0] - d[0], tz = e[2] - d[2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const base = Math.atan2(tz, tx);
    const rx0 = d[0] + (e[0] - d[0]) * 0.4, rz0 = d[2] + (e[2] - d[2]) * 0.4;
    for (const up of [1, -1]) {
      const acc = p.m(SLOT_TOP_DETAIL);
      const y = e[1] + up * 0.05;
      const c0 = acc.v(rx0, y, rz0, 0, up, 0, 0.5, 0.5);
      const ring: number[] = [];
      for (let j = 0; j < 5; j++) {
        const a = base - 0.62 + (j / 4) * 1.24;
        const L = (j === 2 ? 1.05 : 1.35) * k;
        ring.push(acc.v(rx0 + Math.cos(a) * L, y, rz0 + Math.sin(a) * L, 0, up, 0, 0, 0));
      }
      for (let j = 0; j < 4; j++) acc.tri(c0, ring[j], ring[j + 1]);
    }
    // shell bands across the back (top face)
    for (let j = 2; j < N - 2; j += 2) {
      const q = curve[j], q2 = curve[j + 1];
      let ux = q2[0] - q[0], uz = q2[2] - q[2];
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      const sx = uz, sz = -ux;
      const w = rw[j] * 0.55;
      strip(p.m(SLOT_TOP_DETAIL), [[q[0] - sx * w, q[2] - sz * w], [q[0] + sx * w, q[2] + sz * w]], q[1] + rh[j] + 0.012, 0.12, 1, false);
    }
    pieces.push(p);
  }
  return {
    pieces: pieces,
    slots: slots5(
      slot([0.56, 0.64, 0.72], [0.95, 0.47, 0.34], 0.04, 0.18, 0.14, 0.3), // translucent grey-blue -> coral
      slot([0.7, 0.76, 0.8], [0.96, 0.58, 0.32], 0.04, 0.2, 0.14, 0.26), // pale belly -> butter-garlic golden coral
      slot([0.4, 0.48, 0.58], [0.9, 0.28, 0.16], 0.02, 0.3, 0.14),
      null,
      null
    ),
  };
}

// ───────────────────────────── #144 scallops ─────────────────────────────

function genScallops(c: GenCtx): GenOut {
  const R = c.R;
  const pieces: PieceAcc[] = [];
  const H0 = clamp(c.H * 0.8, 1.2, 2.0);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * PI * 2 + 0.5;
    const p = new PieceAcc(Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, R() * PI);
    const r = 1.5 * (0.94 + 0.12 * R()), H = H0 * (0.92 + 0.12 * R());
    const f: Foot = { a: r, b: r, P: 2, lobes: [[3, 0.025, R() * 6], [5, 0.015, R() * 6]] };
    shell(p.m(SLOT_TOP), f, [[1, 0.5 * H], [1, 0.84 * H], [0.9, H], [0, H]], 14);
    shell(p.m(SLOT_SEAR), f, [[0, 0], [0.9, 0], [1, 0.16 * H], [1, 0.5 * H]], 14);
    const ring: V2[] = [];
    const ring2: V2[] = [];
    for (let j = 0; j <= 14; j++) {
      const a = (j / 14) * PI * 2;
      ring.push([Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8]);
      ring2.push([Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62]);
    }
    strip(p.m(SLOT_SEAR_DETAIL), ring, -0.012, 0.26, -1, false); // caramelised crust ring
    strip(p.m(SLOT_TOP_DETAIL), ring2, H + 0.012, 0.12, 1, false); // muscle-fibre sheen ring
    pieces.push(p);
  }
  const pearl: Rgb = [1.0, 0.97, 0.93]; // #FFF8EE
  const amber: Rgb = [0.83, 0.53, 0.16]; // #D4882A
  return {
    pieces: pieces,
    slots: slots5(
      slot(pearl, [0.99, 0.9, 0.76], 0.02, 0.2, 0.08, 0.32),
      slot(pearl, amber, 0.04, 0.22, 0.16, 0.24),
      slot([0.9, 0.88, 0.86], [0.92, 0.72, 0.42], 0.02, 0.2, 0.08),
      slot(pearl, [0.66, 0.36, 0.1], 0.02, 0.36, 0.14),
      null
    ),
  };
}

// ───────────────────────────── #145 eggs ─────────────────────────────

function genEggs(c: GenCtx): GenOut {
  const R = c.R;
  const pieces: PieceAcc[] = [];
  for (let i = 0; i < 2; i++) {
    const p = new PieceAcc(i === 0 ? -2.55 : 2.55, (R() - 0.5) * 0.8, R() * PI * 2);
    const rr = 2.35 * (0.95 + 0.08 * R());
    const f: Foot = { a: rr, b: rr, P: 2, lobes: [[3, 0.07, R() * 6], [5, 0.05, R() * 6], [2, 0.04, R() * 6]] };
    shell(p.m(SLOT_TOP), f, [[1, 0.05], [0.95, 0.17], [0.72, 0.25], [0, 0.28]], 20);
    shell(p.m(SLOT_SEAR), f, [[0, 0], [0.9, 0], [1, 0.05]], 20);
    shell(p.m(SLOT_TOP_DETAIL), f, [[1, 0.05], [0.95, 0.17]], 20, 0, PI * 2, 1.012); // lacy crisp edge
    const yolk: Foot = { a: 0.95, b: 0.95, P: 2, cx: 0.3, cz: 0.2 };
    shell(p.m(SLOT_ACCENT), yolk, [[1, 0.24], [0.86, 0.6], [0.5, 0.88], [0, 0.96]], 12);
    pieces.push(p);
  }
  const clear: Rgb = [0.8, 0.83, 0.82];
  return {
    pieces: pieces,
    slots: slots5(
      slot(clear, [0.98, 0.97, 0.94], 0.02, 0.06, 0.08, 0.45),
      slot(clear, [0.84, 0.6, 0.27], 0.02, 0.1, 0.12, 0.4),
      slot(clear, [0.76, 0.48, 0.2], 0.0, 0.1, 0.12, 0.55),
      null,
      slot([1.0, 0.74, 0.16], [1.0, 0.55, 0.08], 0.02, 0.1, 0.16, 0.08)
    ),
  };
}

// ───────────────────────────── #146 paneer / #147 tofu ─────────────────────────────

function blockSteak(c: GenCtx, flecks: number, blisters: number): PieceAcc {
  const R = c.R;
  const a = clamp((c.L * U) / 2, 2.8, 4.8), b = clamp((c.W * U) / 2, 1.9, 3.2), H = clamp(c.H * 0.85, 1.2, 2.4);
  const f: Foot = { a: a, b: b, P: 6, lobes: [[2, 0.012, 0.3]] };
  const p = new PieceAcc(0, 0, 0);
  shell(p.m(SLOT_TOP), f, [[1, 0.5 * H], [1, 0.86 * H], [0.92, H], [0, H]], 24);
  shell(p.m(SLOT_SEAR), f, [[0, 0], [0.9, 0], [1, 0.14 * H], [1, 0.5 * H]], 24);
  hatch(p.m(SLOT_SEAR_DETAIL), a * 0.8, b * 0.74, 0.3, [-1.4, -0.45, 0.45, 1.4], -0.012, 0.26, -1);
  for (let i = 0; i < blisters; i++) {
    const s = inside((R() - 0.5) * a * 1.6, (R() - 0.5) * b * 1.6, a * 0.7, b * 0.62);
    spot(p.m(SLOT_SEAR_DETAIL), s[0], s[1], -0.014, 0.22 + R() * 0.2, 0.18 + R() * 0.14, 6, -1, R() * PI);
  }
  for (let i = 0; i < flecks; i++) {
    const s = inside((R() - 0.5) * a * 1.6, (R() - 0.5) * b * 1.6, a * 0.78, b * 0.7);
    spot(p.m(SLOT_TOP_DETAIL), s[0], s[1], H + 0.01, 0.1 + R() * 0.07, 0.08 + R() * 0.05, 5, 1, R() * PI);
  }
  return p;
}

function paneerSlots(): (ProteinSlotSpec | null)[] {
  const raw: Rgb = [0.97, 0.89, 0.59]; // #F7E396
  return slots5(
    slot(raw, [0.97, 0.8, 0.46], 0.0, 0.5, 0.1),
    slot(raw, [0.79, 0.36, 0.12], 0.02, 0.44, 0.16, 0.32), // #C95B1E
    slot([0.88, 0.36, 0.14], [0.66, 0.22, 0.08], 0.0, 0.5, 0.1),
    charSlot(raw, [0.36, 0.13, 0.05]),
    null
  );
}

function tofuSlots(): (ProteinSlotSpec | null)[] {
  const raw: Rgb = [0.98, 0.95, 0.89]; // #FAF3E3
  return slots5(
    slot(raw, [0.94, 0.8, 0.6], 0.0, 0.5, 0.08, 0.34),
    slot(raw, [0.62, 0.28, 0.09], 0.06, 0.4, 0.18, 0.12), // #9E4716 glossy glaze
    slot([0.9, 0.86, 0.78], [0.92, 0.72, 0.42], 0.0, 0.4, 0.08), // sesame / glaze dots
    slot(raw, [0.46, 0.18, 0.06], 0.06, 0.2, 0.14, 0.1),
    null
  );
}

// ───────────────────────────── #148 kofta ─────────────────────────────

function genKofta(c: GenCtx): GenOut {
  const R = c.R;
  const pieces: PieceAcc[] = [];
  for (let i = 0; i < 6; i++) {
    const q = phyllo(i, 1.95, R);
    const p = new PieceAcc(q[0], q[1], R() * PI * 2);
    const a = 1.3 * (0.92 + 0.16 * R()), H = clamp(c.H * 0.75, 1.6, 2.3) * (0.9 + 0.15 * R());
    const f: Foot = { a: a, b: a * (0.94 + 0.1 * R()), P: 2, lobes: [[3, 0.04, R() * 6], [5, 0.03, R() * 6]] };
    shell(p.m(SLOT_TOP), f, [[1, 0.45 * H], [0.88, 0.78 * H], [0.52, 0.96 * H], [0, H]], 12);
    shell(p.m(SLOT_SEAR), f, [[0, 0], [0.55, 0.03 * H], [0.9, 0.2 * H], [1, 0.45 * H]], 12);
    for (let k = 0; k < 3; k++) {
      const ang = R() * PI * 2, rr = R() * 0.35 * a;
      spot(p.m(SLOT_TOP_DETAIL), Math.cos(ang) * rr, Math.sin(ang) * rr, H + 0.012, 0.13, 0.08, 3, 1, R() * PI);
    }
    pieces.push(p);
  }
  const mince: Rgb = [0.8, 0.5, 0.4];
  return {
    pieces: pieces,
    slots: slots5(
      slot(mince, [0.6, 0.32, 0.18], 0.0, 0.5, 0.1, 0.36),
      slot(mince, [0.42, 0.2, 0.09], 0.02, 0.42, 0.18, 0.28),
      slot([0.36, 0.56, 0.26], [0.3, 0.42, 0.18], 0.0, 0.5, 0.1),
      null,
      null
    ),
  };
}

// ───────────────────────────── #149 bacon / pancetta ─────────────────────────────

function genBacon(c: GenCtx): GenOut {
  const R = c.R;
  const pieces: PieceAcc[] = [];
  for (let i = 0; i < 8; i++) {
    const q = phyllo(i, 1.6, R);
    const p = new PieceAcc(q[0], q[1], R() * PI * 2);
    const a = 1.05 * (0.85 + 0.3 * R()), b = 0.55 * (0.9 + 0.2 * R()), H = clamp(c.H * 0.8, 0.7, 1.2);
    const f: Foot = { a: a, b: b, P: 8 };
    shell(p.m(SLOT_TOP), f, [[1, 0.5 * H], [0.9, H], [0, H]], 12);
    shell(p.m(SLOT_SEAR), f, [[0, 0], [0.9, 0], [1, 0.5 * H]], 12);
    for (const z0 of [-0.22 * b, 0.3 * b]) {
      strip(p.m(SLOT_TOP_DETAIL), [[-0.82 * a, z0], [0.82 * a, z0]], H + 0.01, 0.16 * b + 0.06, 1, false);
      strip(p.m(SLOT_SEAR_DETAIL), [[-0.8 * a, z0], [0.8 * a, z0]], -0.012, 0.16 * b + 0.06, -1, false);
    }
    pieces.push(p);
  }
  const pink: Rgb = [0.93, 0.56, 0.54];
  const fat: Rgb = [0.99, 0.94, 0.9];
  return {
    pieces: pieces,
    slots: slots5(
      slot(pink, [0.74, 0.36, 0.24], 0.0, 0.44, 0.12, 0.3),
      slot(pink, [0.5, 0.22, 0.1], 0.04, 0.4, 0.2, 0.22),
      slot(fat, [0.9, 0.66, 0.38], 0.0, 0.4, 0.1),
      slot(fat, [0.82, 0.52, 0.24], 0.02, 0.3, 0.12),
      null
    ),
  };
}

// ───────────────────────────── public builder ─────────────────────────────

/** Proteins with a generator here (#140 salmon is the StationPropsBuilder fillet). */
export const PROTEIN_CATALOGUE: number[] = [141, 142, 143, 144, 145, 146, 147, 148, 149];

/** Generator for an entry: catalogue number first (aliases resolved), then name, then archetype (#250+ faults). */
export function proteinGenFor(entry: ProteinEntryLike | null): ProteinGenId | null {
  if (!entry) return null;
  const n = canonicalProteinNumber(entry.accessNumber);
  const name = String(entry.name || "").toLowerCase();
  const arch = String(entry.archetype || "");
  if (n === 140) return null;
  const cubed = arch === "CUBED_SEAR" || /cube|chunk|tikka|bite|dice/.test(name);
  const slab = /steak|slab|cutlet|breast|block/.test(name);
  if (n === 108 || /mushroom/.test(name)) return "MUSHROOM_CHUNKS";
  if (n === 141) return "RIBEYE_STEAK";
  if (n === 142) return cubed && !slab ? "TIKKA_CHUNKS" : "CHICKEN_CUTLET";
  if (n === 143) return "PRAWN_CURLS";
  if (n === 144) return "SCALLOP_DISCS";
  if (n === 145) return "FRIED_EGGS";
  if (n === 146) return cubed && !slab ? "PANEER_CUBES" : "PANEER_STEAK";
  if (n === 147) return cubed && !slab ? "TOFU_CUBES" : "TOFU_STEAK";
  if (n === 148) return "KOFTA_BALLS";
  if (n === 149) return "BACON_LARDONS";
  if (/salmon|trout|cod|fish/.test(name) && arch === "FILLET_SLAB") return "CHICKEN_CUTLET";
  if (/prawn|shrimp|langoustine/.test(name)) return "PRAWN_CURLS";
  if (/scallop/.test(name)) return "SCALLOP_DISCS";
  if (/egg/.test(name)) return "FRIED_EGGS";
  if (/paneer|halloumi/.test(name)) return cubed && !slab ? "PANEER_CUBES" : "PANEER_STEAK";
  if (/tofu|tempeh|seitan/.test(name)) return cubed && !slab ? "TOFU_CUBES" : "TOFU_STEAK";
  if (/kofta|kofte|meatball|kebab|falafel/.test(name)) return "KOFTA_BALLS";
  if (/bacon|pancetta|lardon|guanciale/.test(name)) return "BACON_LARDONS";
  if (/steak|ribeye|sirloin|beef|lamb|pork chop|chop/.test(name)) return "RIBEYE_STEAK";
  if (/chicken|turkey|tikka/.test(name)) return cubed && !slab ? "TIKKA_CHUNKS" : "CHICKEN_CUTLET";
  if (arch === "MARBLED_STEAK") return "RIBEYE_STEAK";
  if (arch === "MEDALLION_SCALLOP") return "SCALLOP_DISCS";
  if (arch === "DISC_SHEET") return "FRIED_EGGS";
  if (arch === "CUBED_SEAR") return "TIKKA_CHUNKS";
  if (arch === "FILLET_SLAB") return "CHICKEN_CUTLET";
  return null;
}

/** Applies a dish tint: raw colour on the raw faces, seared colour on the crust (detail char follows darker). */
function applyTint(slots: (ProteinSlotSpec | null)[], gen: ProteinGenId, tint: ProteinTint): void {
  if (gen === "MUSHROOM_CHUNKS") return; // the mushroom palette is built from the tint directly
  const raw = okRgb(tint.rawRgb) ? lift(tint.rawRgb as Rgb, 0.16) : null;
  const sear = okRgb(tint.searedRgb) ? lift(tint.searedRgb as Rgb, 0.16) : null;
  const top = slots[SLOT_TOP], crust = slots[SLOT_SEAR], charD = slots[SLOT_SEAR_DETAIL];
  if (raw && top) {
    top.done = mix(raw, top.done, 0.5);
    top.raw = raw;
  }
  if (raw && crust) crust.raw = raw;
  if (raw && charD) charD.raw = raw;
  if (sear && crust) crust.done = sear;
  if (sear && charD) charD.done = lift(mix(sear, [0.2, 0.08, 0.04], 0.45), 0.14);
}

/**
 * Builds a protein's dual-surface piece set: { pieces (per-slot meshes + pan transforms), slots (raw/done materials),
 * tris, extent, height }. tint = optional dish colours. null when the entry has no generator (#140 salmon).
 */
export function buildProteinSet(entry: ProteinEntryLike, tint?: ProteinTint): ProteinSet | null {
  const gen = proteinGenFor(entry);
  if (!gen) return null;
  const n = canonicalProteinNumber(entry.accessNumber);
  const c: GenCtx = {
    R: rng(1400 + n * 7 + gen.length),
    L: fin(entry.lengthCm, 8),
    W: fin(entry.widthCm, 5),
    H: fin(entry.heightCm, 2),
    name: String(entry.name || ""),
  };
  const t: ProteinTint = tint || {};
  let g: GenOut;
  if (gen === "RIBEYE_STEAK") g = genRibeye(c);
  else if (gen === "CHICKEN_CUTLET") g = genCutlet(c);
  else if (gen === "TIKKA_CHUNKS") g = genTikka(c);
  else if (gen === "MUSHROOM_CHUNKS") g = genMushroom(c, t);
  else if (gen === "PRAWN_CURLS") g = genPrawns(c);
  else if (gen === "SCALLOP_DISCS") g = genScallops(c);
  else if (gen === "FRIED_EGGS") g = genEggs(c);
  else if (gen === "PANEER_STEAK") g = { pieces: [blockSteak(c, 7, 7)], slots: paneerSlots() };
  else if (gen === "PANEER_CUBES") g = { pieces: chunkSet(c, 7, 1.3, clamp(c.H, 1.6, 2.4), 6, 0.0, 1.75, 1, 1), slots: paneerSlots() };
  else if (gen === "TOFU_STEAK") g = { pieces: [blockSteak(c, 5, 5)], slots: tofuSlots() };
  else if (gen === "TOFU_CUBES") g = { pieces: chunkSet(c, 7, 1.35, clamp(c.H * 1.1, 1.8, 2.5), 6, 0.0, 1.78, 1, 1), slots: tofuSlots() };
  else if (gen === "KOFTA_BALLS") g = genKofta(c);
  else g = genBacon(c);
  if (tint) applyTint(g.slots, gen, t);
  const pieces = g.pieces.map((p) => p.build());
  let tris = 0, extent = 0, height = 0;
  for (const p of pieces) {
    tris += p.tris;
    extent = Math.max(extent, Math.hypot(p.x, p.z) + p.radius);
    height = Math.max(height, p.height);
  }
  return { gen: gen, accessNumber: n, name: String(entry.name || gen), pieces: pieces, slots: g.slots, tris: tris, extent: extent, height: height };
}

// ───────────────────────────── pan-floor query ─────────────────────────────

/** Pan-local floor of a vessel: contact height y, usable radius r, bowl curvature (y += curve * r^2, woks). */
export interface PanFloor {
  y: number;
  r: number;
  curve: number;
}

const PAN_FLOORS: { [name: string]: PanFloor } = {};

/** Vessels register their floor (StationPropsBuilder: SkilletPan; A4a: WokPan). */
export function registerPanFloor(panName: string, floor: PanFloor): void {
  PAN_FLOORS[panName] = { y: floor.y, r: floor.r, curve: floor.curve || 0 };
}

/** Floor of a pan object: registered value, else estimated from its mesh bounds. */
export function queryPanFloor(pan: SceneObject | null): PanFloor {
  if (pan && PAN_FLOORS[pan.name]) return PAN_FLOORS[pan.name];
  try {
    const rmv = pan ? (pan.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
    if (rmv && rmv.mesh) {
      const mn = rmv.mesh.aabbMin, mx = rmv.mesh.aabbMax;
      const half = Math.min(mx.x - mn.x, mx.z - mn.z) / 2;
      return { y: mn.y + 0.06 * (mx.y - mn.y) + 0.3, r: half * 0.62, curve: 0 };
    }
  } catch (_e) {
    // fall through
  }
  return { y: 0.5, r: 7.9, curve: 0 };
}

const PAN_NAMES = ["WokPan", "TawaPan", "SkilletPan"]; // first found wins (the wok arrives with A4a)

function findByName(root: SceneObject, name: string): SceneObject | null {
  if (root.name === name) return root;
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const f = findByName(root.getChild(i), name);
    if (f) return f;
  }
  return null;
}

// ───────────────────────────── materials ─────────────────────────────

function setMat(m: Material, sp: ProteinSlotSpec, d: number): void {
  const c = mix(sp.raw, sp.done, d);
  m.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
  try {
    (m.mainPass as any).roughness = sp.rough + (sp.roughDone - sp.rough) * d;
    (m.mainPass as any).Port_Emissive_N006 = new vec3(c[0] * sp.glow, c[1] * sp.glow, c[2] * sp.glow);
  } catch (_e) {
    // shader without the port: base colour still reads
  }
}

// ───────────────────────────── ProteinProp ─────────────────────────────

/** One piece of a live protein prop: scene object + its home (unflipped) pose for flip / pan toss. */
export interface ProteinPieceRef {
  obj: SceneObject;
  homePos: vec3;
  homeRot: quat;
  homeScale: vec3;
  /** Roll pivot height (half the piece height, piece-local units). */
  halfH: number;
}

const FLIP_TWEEN_SEC = 0.55;

/**
 * Scene prop for one protein: ProteinProp_<n> > ProteinPiece_i > ProteinFace_i_<Slot>. Lives in the pan (placeInPan:
 * WokPan else SkilletPan, floor from queryPanFloor, scaled to fit). setDoneness(0..1) blends every slot raw -> seared;
 * setFlipped rolls each piece 180 deg about its long axis (same roll the spatula flip / pan toss perform), so the
 * seared face ends on top.
 */
export class ProteinProp {
  private host: BaseScriptComponent;
  private searchRoot: SceneObject;
  private root: SceneObject;
  private set: ProteinSet;
  private key: string;
  private pieces: ProteinPieceRef[] = [];
  private mats: (Material | null)[] = [];
  private doneness: number = 0;
  private flipped: boolean = false;
  private tweenK: number = 0;
  private tweenTo: number = 0;
  private tweening: boolean = false;
  private ev: SceneEvent | null = null;
  private dead: boolean = false;
  private pan: SceneObject | null = null;
  private fit: number = 1;

  /** parent: StationsRoot (also the search root for the pan). key: builder cache key (spec + tint). */
  constructor(host: BaseScriptComponent, parent: SceneObject, entry: ProteinEntryLike, tint?: ProteinTint, key?: string) {
    const set = buildProteinSet(entry, tint);
    if (!set) throw new Error(`no protein generator for #${entry ? entry.accessNumber : "?"}`);
    this.host = host;
    this.searchRoot = parent;
    this.set = set;
    this.key = key || `${set.accessNumber}|${set.gen}`;
    this.root = global.scene.createSceneObject(`ProteinProp_${set.accessNumber}`);
    this.root.setParent(parent);
    for (let s = 0; s < SLOT_COUNT; s++) {
      const sp = set.slots[s];
      const used = !!sp && set.pieces.some((p) => !!p.meshes[s]);
      if (!used || !sp) {
        this.mats.push(null);
        continue;
      }
      const m = makePbrMaterial(sp.raw[0], sp.raw[1], sp.raw[2], sp.metal, sp.rough);
      setMat(m, sp, 0);
      this.mats.push(m);
    }
    for (let i = 0; i < set.pieces.length; i++) {
      const pb = set.pieces[i];
      const po = global.scene.createSceneObject(`ProteinPiece_${i}`);
      po.setParent(this.root);
      for (let s = 0; s < SLOT_COUNT; s++) {
        const acc = pb.meshes[s];
        const m = this.mats[s];
        if (!acc || !m) continue;
        const fo = global.scene.createSceneObject(`ProteinFace_${i}_${SLOT_NAMES[s]}`);
        fo.setParent(po);
        const rmv = fo.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        rmv.mesh = acc.toMesh();
        rmv.mainMaterial = m;
      }
      const tr = po.getTransform();
      tr.setLocalPosition(new vec3(pb.x, 0, pb.z));
      tr.setLocalRotation(quat.angleAxis(pb.yaw, vec3.up()));
      this.pieces.push({ obj: po, homePos: tr.getLocalPosition(), homeRot: tr.getLocalRotation(), homeScale: vec3.one(), halfH: Math.max(0.05, pb.height / 2) });
    }
    print(`[ProteinGen] #${set.accessNumber} ${set.name} -> ${set.gen}: ${set.pieces.length} piece(s), ${set.tris} tris, extent ${set.extent.toFixed(2)}, h ${set.height.toFixed(2)}`);
  }

  getObject(): SceneObject {
    return this.root;
  }

  /** Staged-load key used by DISH_ITEM_READY. */
  getItemKey(): string {
    return "protein";
  }

  getKey(): string {
    return this.key;
  }

  getAccessNumber(): number {
    return this.set.accessNumber;
  }

  getGenerator(): ProteinGenId {
    return this.set.gen;
  }

  getTriCount(): number {
    return this.set.tris;
  }

  getPieceCount(): number {
    return this.pieces.length;
  }

  /** Pieces with their home transforms (piece-local to the prop root; pan toss hops these). */
  getPieces(): ProteinPieceRef[] {
    return this.pieces.slice();
  }

  getPan(): SceneObject | null {
    return this.pan && !isNull(this.pan) ? this.pan : null;
  }

  /** Item height in pan units (fit scale applied). */
  getHeight(): number {
    return this.set.height * this.fit;
  }

  /** Footprint radius of the set in pan units. */
  getHalfExtent(): number {
    return this.set.extent * this.fit;
  }

  isLive(): boolean {
    return !this.dead && !!this.root && !isNull(this.root);
  }

  getDoneness(): number {
    return this.doneness;
  }

  isFlipped(): boolean {
    return this.flipped;
  }

  /**
   * Parent into the pan (given, else WokPan, else SkilletPan under the search root) at the pan floor; aligned like the
   * salmon fillet when the pan has one; scaled down only if the set is wider than the floor.
   */
  placeInPan(panObject?: SceneObject | null): void {
    if (!this.isLive()) return;
    let pan: SceneObject | null = panObject && !isNull(panObject) ? panObject : null;
    if (!pan) for (const n of PAN_NAMES) if (!pan) pan = findByName(this.searchRoot, n);
    if (!pan) return;
    const floor = queryPanFloor(pan);
    this.pan = pan;
    this.root.setParent(pan);
    const tr = this.root.getTransform();
    const fillet = findByName(pan, "SalmonFillet");
    tr.setLocalPosition(new vec3(0, floor.y, 0));
    tr.setLocalRotation(fillet ? this.filletYaw(fillet) : quat.quatIdentity());
    this.fit = Math.min(1, (floor.r * 0.96) / Math.max(0.01, this.set.extent));
    tr.setLocalScale(new vec3(this.fit, this.fit, this.fit));
    for (let i = 0; i < this.pieces.length; i++) {
      const pb = this.set.pieces[i];
      const rr = (pb.x * pb.x + pb.z * pb.z) * this.fit;
      const p = this.pieces[i];
      p.homePos = new vec3(pb.x, floor.curve * rr, pb.z);
    }
    this.applyFlip(this.flipped ? 1 : 0);
  }

  /** The fillet's rest yaw (its rotation is a pure yaw inside the pan). */
  private filletYaw(fillet: SceneObject): quat {
    const f = fillet.getTransform().getLocalRotation().multiplyVec3(vec3.right());
    return quat.angleAxis(Math.atan2(-f.z, f.x), vec3.up());
  }

  /** 0 raw .. 1 fully seared: blends every face colour, gloss and emissive lift. */
  setDoneness(d: number): void {
    const k = clamp(isFinite(d) ? d : 0, 0, 1);
    this.doneness = k;
    for (let s = 0; s < SLOT_COUNT; s++) {
      const m = this.mats[s], sp = this.set.slots[s];
      if (m && sp) setMat(m, sp, k);
    }
  }

  /** Seared face up (true) or raw face up; animate = quick roll with a small hop. */
  setFlipped(f: boolean, animate: boolean = false): void {
    if (!this.isLive()) return;
    this.flipped = f;
    this.tweenTo = f ? 1 : 0;
    if (!animate) {
      this.stopTween();
      this.applyFlip(this.tweenTo);
      return;
    }
    if (Math.abs(this.tweenTo - this.tweenK) < 1e-4) return;
    if (!this.ev) {
      this.ev = this.host.createEvent("UpdateEvent");
      this.ev.bind(() => this.tick());
    }
    this.tweening = true;
    this.ev.enabled = true;
  }

  /** Kinematics (spatula flip / pan toss) already moved the pieces: record the state without moving them. */
  markFlipped(f: boolean): void {
    this.stopTween();
    this.flipped = f;
    this.tweenK = f ? 1 : 0;
    this.tweenTo = this.tweenK;
  }

  /** Raw face up at home, doneness 0. */
  resetToRaw(): void {
    if (!this.isLive()) return;
    this.stopTween();
    this.flipped = false;
    this.applyFlip(0);
    this.setDoneness(0);
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    if (this.ev) {
      try {
        this.host.removeEvent(this.ev);
      } catch (_e) {
        this.ev.enabled = false;
      }
      this.ev = null;
    }
    if (ProteinRegistry.getActive() === this) ProteinRegistry.setActive(null);
    if (this.root && !isNull(this.root)) this.root.destroy();
  }

  private stopTween(): void {
    this.tweening = false;
    if (this.ev) this.ev.enabled = false;
  }

  private tick(): void {
    if (this.dead || !this.tweening) return;
    const d = this.tweenTo - this.tweenK;
    const step = getDeltaTime() / FLIP_TWEEN_SEC;
    if (Math.abs(d) <= step) {
      this.applyFlip(this.tweenTo);
      this.stopTween();
      return;
    }
    this.applyFlip(this.tweenK + (d > 0 ? step : -step), true);
  }

  /** Roll k (0 raw up .. 1 seared up) about each piece's long axis at half height; hop while tweening. */
  private applyFlip(k: number, hop: boolean = false): void {
    this.tweenK = clamp(k, 0, 1);
    const theta = -PI * smoother01(this.tweenK);
    const rx = quat.angleAxis(theta, vec3.right());
    const h = hop ? 0.9 * Math.sin(PI * this.tweenK) : 0;
    for (const p of this.pieces) {
      if (!p.obj || isNull(p.obj)) continue;
      const c = new vec3(0, p.halfH, 0);
      const pivotOff = p.homeRot.multiplyVec3(c.sub(rx.multiplyVec3(c)));
      const tr = p.obj.getTransform();
      tr.setLocalRotation(p.homeRot.multiply(rx));
      tr.setLocalPosition(p.homePos.add(pivotOff).add(new vec3(0, h, 0)));
      tr.setLocalScale(p.homeScale);
    }
  }
}

/** Smoothstep shared by the kinematics when they drive doneness during a flip / toss. */
export function proteinSearEase(k: number): number {
  return smooth01(k);
}

// ───────────────────────────── registry ─────────────────────────────

let activeProtein: ProteinProp | null = null;

export interface ProteinTarget {
  /** SALMON = legacy SalmonFillet (dish 01 default); PROP = a ProteinProp in the pan. */
  kind: "SALMON" | "PROP";
  prop: ProteinProp | null;
}

/**
 * Which protein the kinematics (SpatulaFlipRig, SpatulaTechniqueGuide, PanTossRoll) act on. Nothing active = the
 * salmon fillet, exactly as before A3. StationPropsDishBuilder sets it at a dish's protein reveal; Reset clears it.
 */
export const ProteinRegistry = {
  setActive(p: ProteinProp | null): void {
    activeProtein = p;
  },
  getActive(): ProteinProp | null {
    return activeProtein && activeProtein.isLive() ? activeProtein : null;
  },
  getActiveTarget(): ProteinTarget {
    const p = ProteinRegistry.getActive();
    return p ? { kind: "PROP", prop: p } : { kind: "SALMON", prop: null };
  },
};
