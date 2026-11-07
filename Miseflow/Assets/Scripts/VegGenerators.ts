/**
 * VegGenerators.ts  (v5 A1 Vegetables)
 * Procedural vegetable meshes for the five prep-board lanes. Every catalogue veg (#101-#109, #122-#130, plus
 * #119 potato) is built in three stages - 0 Whole -> 1 Partial -> 2 Cut pile - and each stage is split in up to
 * three colour parts: body (entry colour), accent (stems / calyx / white parts) and detail (flesh / cut faces).
 * Pure geometry: no scene objects, no materials (StationPropsBuilder applies them to the lane's stage objects).
 *
 * Classic generators (#101-#105 default looks) are the original dish-01 veg row code moved here verbatim, so the
 * salmon dish stays pixel-identical; they are NOT normalised. Every other look is scaled per stage with
 * SpatialSlotAllocator.normalizeScale (lane radius 1.05) and seated on a bottom-centre pivot (y_min = 0).
 * Board-local units: lanes run along +x, the long axis of elongated veg runs along z (front-to-back).
 */
import { MeshAcc } from "./StationPropsBuilder";
import { LANE_MAX_RADIUS, normalizeScale } from "./AI/SpatialSlotAllocator";
import { PrepSlotEntry, Rgb } from "./AI/UniversalDishSchema";

type Prof = [number, number][];
type Pt = [number, number, number];
type Put = (x: number, y: number, z: number, s: number, yaw: number, pitch: number, rnd: () => number) => void;

const H = Math.PI / 2;
const TAU = Math.PI * 2;
/** Elongated veg may use more board depth than width: |z| counts 1/Z_STRETCH against the lane radius. */
const Z_STRETCH = 1.6;

export type VegGenId =
  | "ONION" | "SHALLOT" | "GARLIC" | "EGGPLANT" | "BEET"
  | "CHILLI" | "CUCUMBER" | "CARROT" | "ASPARAGUS" | "SCALLION" | "CORN" | "PEAS"
  | "TOMATO" | "MUSHROOM" | "PEPPER" | "BROCCOLI" | "CITRUS" | "AVOCADO" | "POTATO"
  | "HERB" | "BOKCHOY" | "GINGER" | "BLOCK";

export interface VegGenSpec {
  n: number;
  arch: string;
  gen: VegGenId;
  /** Catalogue default body colour (a variant recolours only when the entry still carries this colour). */
  rgb: Rgb;
  /** Accent fallback when the entry has no stemColorRgb. */
  accent: Rgb;
  /** Flesh / cut-face colour; null = lightened body colour. */
  detail: Rgb | null;
  rough: number;
  metal: number;
  /** Original dish-01 geometry (no normalisation). */
  classic?: boolean;
  /** If the entry name contains `base`, no variant applies. */
  base?: string;
  /** [name keyword, generator, optional body colour override] */
  variants?: [string, VegGenId, Rgb?][];
}

const LEAF_GREEN: Rgb = [0.16, 0.5, 0.14];

/** ONE data table: access number -> generator + colours + surface. */
export const VEG_GENERATOR_TABLE: VegGenSpec[] = [
  { n: 101, arch: "BULB_ALLIUM", gen: "ONION", rgb: [0.66, 0.3, 0.5], accent: LEAF_GREEN, detail: [0.93, 0.82, 0.88], rough: 0.3, metal: 0, classic: true, base: "onion", variants: [["shallot", "SHALLOT"]] },
  { n: 102, arch: "BULB_ALLIUM", gen: "GARLIC", rgb: [0.96, 0.92, 0.78], accent: LEAF_GREEN, detail: null, rough: 0.35, metal: 0, classic: true },
  { n: 103, arch: "LEAFY_HERB", gen: "HERB", rgb: [0.16, 0.5, 0.14], accent: LEAF_GREEN, detail: null, rough: 0.45, metal: 0, classic: true },
  { n: 104, arch: "SPHERE_CROWN", gen: "TOMATO", rgb: [0.9, 0.13, 0.07], accent: LEAF_GREEN, detail: null, rough: 0.18, metal: 0.05, classic: true },
  { n: 105, arch: "CYLINDER_STALK", gen: "CHILLI", rgb: [1.0, 0.8, 0.08], accent: LEAF_GREEN, detail: null, rough: 0.18, metal: 0.05, classic: true },
  { n: 106, arch: "CYLINDER_STALK", gen: "CUCUMBER", rgb: [0.18, 0.52, 0.22], accent: [0.55, 0.62, 0.3], detail: [0.8, 0.92, 0.62], rough: 0.3, metal: 0.02 },
  { n: 107, arch: "CYLINDER_STALK", gen: "CARROT", rgb: [0.95, 0.45, 0.12], accent: [0.3, 0.5, 0.15], detail: null, rough: 0.4, metal: 0, base: "carrot", variants: [["asparagus", "ASPARAGUS", [0.35, 0.6, 0.2]]] },
  { n: 108, arch: "SPHERE_CROWN", gen: "MUSHROOM", rgb: [0.76, 0.68, 0.58], accent: [0.9, 0.84, 0.74], detail: [0.95, 0.9, 0.82], rough: 0.55, metal: 0 },
  { n: 109, arch: "CUBED_BLOCK", gen: "GINGER", rgb: [0.94, 0.86, 0.62], accent: [0.92, 0.6, 0.5], detail: [0.99, 0.94, 0.6], rough: 0.6, metal: 0, base: "ginger", variants: [["paneer", "BLOCK", [0.97, 0.92, 0.72]], ["tofu", "BLOCK", [0.98, 0.95, 0.89]], ["bread", "BLOCK", [0.9, 0.68, 0.36]]] },
  { n: 122, arch: "SPHERE_CROWN", gen: "PEPPER", rgb: [0.86, 0.16, 0.1], accent: [0.25, 0.5, 0.18], detail: null, rough: 0.12, metal: 0.05 },
  { n: 123, arch: "SPHERE_CROWN", gen: "BROCCOLI", rgb: [0.2, 0.5, 0.18], accent: [0.45, 0.65, 0.3], detail: [0.6, 0.76, 0.42], rough: 0.6, metal: 0 },
  { n: 124, arch: "LEAFY_HERB", gen: "BOKCHOY", rgb: [0.3, 0.58, 0.22], accent: [0.75, 0.85, 0.55], detail: null, rough: 0.45, metal: 0 },
  { n: 125, arch: "BULB_ALLIUM", gen: "EGGPLANT", rgb: [0.38, 0.16, 0.42], accent: [0.25, 0.5, 0.2], detail: [0.94, 0.9, 0.72], rough: 0.14, metal: 0.06 },
  { n: 126, arch: "CYLINDER_STALK", gen: "SCALLION", rgb: [0.4, 0.68, 0.25], accent: [0.92, 0.95, 0.8], detail: null, rough: 0.4, metal: 0 },
  { n: 127, arch: "CYLINDER_STALK", gen: "CORN", rgb: [0.98, 0.82, 0.15], accent: [0.62, 0.78, 0.42], detail: [1.0, 0.93, 0.6], rough: 0.3, metal: 0, base: "corn", variants: [["pea", "PEAS", [0.42, 0.72, 0.24]]] },
  { n: 128, arch: "SPHERE_CROWN", gen: "CITRUS", rgb: [0.98, 0.85, 0.2], accent: [0.3, 0.55, 0.18], detail: [0.99, 0.95, 0.62], rough: 0.35, metal: 0 },
  { n: 129, arch: "SPHERE_CROWN", gen: "AVOCADO", rgb: [0.55, 0.65, 0.22], accent: [0.55, 0.38, 0.22], detail: [0.86, 0.92, 0.52], rough: 0.4, metal: 0 },
  { n: 130, arch: "BULB_ALLIUM", gen: "BEET", rgb: [0.62, 0.1, 0.28], accent: [0.3, 0.55, 0.2], detail: [0.88, 0.4, 0.6], rough: 0.35, metal: 0 },
  { n: 119, arch: "SPHERE_CROWN", gen: "POTATO", rgb: [0.85, 0.7, 0.42], accent: [0.6, 0.46, 0.26], detail: [0.98, 0.92, 0.66], rough: 0.7, metal: 0 },
];

/** The 18 veg catalogue numbers (gallery / tests). */
export const VEG_CATALOGUE: number[] = [101, 102, 103, 104, 105, 106, 107, 108, 109, 122, 123, 124, 125, 126, 127, 128, 129, 130];

const ARCH_FALLBACK: { [a: string]: VegGenId } = {
  BULB_ALLIUM: "ONION", CYLINDER_STALK: "CUCUMBER", SPHERE_CROWN: "TOMATO", LEAFY_HERB: "HERB", CUBED_BLOCK: "BLOCK", GRANULAR: "PEAS",
};

export interface VegStageSet {
  /** [stage 0..2][part 0 body, 1 accent, 2 detail]; null = part absent in that stage. */
  parts: (MeshAcc | null)[][];
  bodyRgb: Rgb;
  accentRgb: Rgb;
  detailRgb: Rgb;
  rough: number;
  metal: number;
  gen: VegGenId;
  classic: boolean;
  /** Triangles per stage (all parts). */
  tris: number[];
}

interface VegParts {
  b: MeshAcc;
  a: MeshAcc;
  d: MeshAcc;
}

function sameRgb(a: Rgb | undefined, b: Rgb | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 0.002 && Math.abs(a[1] - b[1]) < 0.002 && Math.abs(a[2] - b[2]) < 0.002;
}

function validRgb(c: Rgb | undefined): boolean {
  return !!c && c.length >= 3 && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]);
}

/** Additive display: lift very dark colours so nothing renders as pure black (invisible). */
function lift(c: Rgb): Rgb {
  const m = Math.max(c[0], c[1], c[2]);
  if (m >= 0.12) return [c[0], c[1], c[2]];
  const k = 0.12 - m;
  return [c[0] + k, c[1] + k, c[2] + k];
}

function lighten(c: Rgb, k: number): Rgb {
  return [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
}

export function vegSpecFor(n: number): VegGenSpec | null {
  for (const s of VEG_GENERATOR_TABLE) if (s.n === n) return s;
  return null;
}

/** Generator + colours for an entry (table row, name variant, or archetype fallback for #200+ / unknown). */
export function resolveVeg(entry: PrepSlotEntry): { spec: VegGenSpec | null; gen: VegGenId; classic: boolean; body: Rgb } {
  const spec = vegSpecFor(entry.accessNumber);
  const name = String(entry.name || "").toLowerCase();
  let body: Rgb = validRgb(entry.colorRgb) ? entry.colorRgb : spec ? spec.rgb : [0.8, 0.8, 0.8];
  if (!spec) return { spec: null, gen: ARCH_FALLBACK[String(entry.archetype)] || "TOMATO", classic: false, body };
  let gen = spec.gen;
  let classic = !!spec.classic;
  if (spec.variants && !(spec.base && name.indexOf(spec.base) >= 0)) {
    for (const v of spec.variants) {
      if (name.indexOf(v[0]) < 0) continue;
      gen = v[1];
      classic = false;
      if (v[2] && sameRgb(body, spec.rgb)) body = v[2];
      break;
    }
  }
  return { spec, gen, classic, body };
}

// ─────────────────────────── shared primitives ───────────────────────────

/** Deterministic PRNG (same LCG as StationPropsBuilder, so the classic dice piles are identical). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Original dish-01 heap of diced pieces (or thin herb flakes) mounded around the origin, resting on y = 0. */
function dicePile(acc: MeshAcc, seed: number, hx: number, hz: number, d: number, n: number, flake: boolean): void {
  const rnd = makeRng(seed);
  for (let k = 0; k < n; k++) {
    const px = (rnd() - 0.5) * 2 * hx;
    const pz = (rnd() - 0.5) * 2 * hz;
    const mound = Math.max(0, 1 - 0.8 * (px / hx) * (px / hx) - 0.8 * (pz / hz) * (pz / hz));
    const s = d * (0.75 + 0.5 * rnd());
    const py = (flake ? s * 0.35 : s * 0.85) + mound * (flake ? 0.22 : 0.38) * rnd();
    acc.box(px, py, pz, s, flake ? s * 0.3 : s * 0.85, s * (flake ? 1.3 : 1.0), rnd() * Math.PI, (rnd() - 0.5) * 0.7);
  }
}

/** Generic mounded heap: put() places one piece (size s, random yaw/pitch) at a heap position. */
function heap(seed: number, hx: number, hz: number, n: number, size: number, put: Put): void {
  const rnd = makeRng(seed);
  for (let k = 0; k < n; k++) {
    const px = (rnd() - 0.5) * 2 * hx;
    const pz = (rnd() - 0.5) * 2 * hz;
    const mound = Math.max(0, 1 - 0.8 * (px / hx) * (px / hx) - 0.8 * (pz / hz) * (pz / hz));
    const s = size * (0.75 + 0.5 * rnd());
    const py = s * 0.8 + mound * 0.4 * rnd();
    put(px, py, pz, s, rnd() * Math.PI, (rnd() - 0.5) * 0.7, rnd);
  }
}

function xf(accs: MeshAcc[], tx: number, ty: number, tz: number, yaw: number = 0, pitch: number = 0, roll: number = 0, s: number = 1): void {
  for (const a of accs) a.setXform(tx, ty, tz, yaw, pitch, roll, s, s, s);
}

function clr(accs: MeshAcc[]): void {
  for (const a of accs) a.clearXform();
}

/**
 * Coin / round (axis +Y, centred on the origin, current xform applies): rim band -> side, both caps -> face.
 * phi0..phi1 = -H..H gives a half-moon (its flat cut goes to face too).
 */
function coin(side: MeshAcc, face: MeshAcc, r: number, th: number, segs: number, half: boolean = false): void {
  const p0 = half ? -H : 0;
  const p1 = half ? H : TAU;
  side.lathe([[r, -th / 2], [r, th / 2]], segs, 0, 0, p0, p1);
  face.lathe([[0, -th / 2], [r, -th / 2]], segs, 0, 0, p0, p1);
  face.lathe([[r, th / 2], [0, th / 2]], segs, 0, 0, p0, p1);
  if (half) face.cutFace([[r, -th / 2], [r, th / 2]], -1);
}

/** Flat face of a lathe sector at angle phi (sign +1: outward toward increasing phi). */
function sectorFace(acc: MeshAcc, prof: Prof, phi: number, sign: number): void {
  const c = Math.cos(phi), s = Math.sin(phi);
  const nx = -s * sign, nz = c * sign;
  const ids: number[] = [];
  for (const [r, y] of prof) ids.push(acc.v(0, y, 0, nx, 0, nz, 0, 0), acc.v(r * c, y, r * s, nx, 0, nz, 1, 0));
  for (let j = 0; j < prof.length - 1; j++) acc.quad(ids[j * 2], ids[j * 2 + 1], ids[j * 2 + 3], ids[j * 2 + 2]);
}

/** Wedge of a lathe solid between a0..a1: skin -> skin acc, the two cut faces -> face acc. */
function wedge(skin: MeshAcc, face: MeshAcc, prof: Prof, segs: number, a0: number, a1: number): void {
  skin.lathe(prof, segs, 0, 0, a0, a1);
  sectorFace(face, prof, a1, 1);
  sectorFace(face, prof, a0, -1);
}

function scaleProf(p: Prof, kr: number, ky: number, dy: number = 0): Prof {
  return p.map(([r, y]) => [r * kr, y * ky + dy] as [number, number]);
}

// ─────────────────────────── profiles ───────────────────────────

const ONION_PROFILE: Prof = [[0, 0], [0.4, 0.03], [0.78, 0.18], [0.98, 0.45], [1.04, 0.75], [0.96, 1.05], [0.72, 1.32], [0.4, 1.52], [0.14, 1.66], [0.05, 1.8], [0, 1.84]];
const SHALLOT_PROFILE: Prof = [[0, 0], [0.3, 0.03], [0.58, 0.2], [0.72, 0.5], [0.7, 0.86], [0.55, 1.2], [0.32, 1.5], [0.13, 1.72], [0.05, 1.88], [0, 1.92]];
const GARLIC_PROFILE: Prof = [[0, 0], [0.25, 0.02], [0.5, 0.12], [0.6, 0.32], [0.58, 0.55], [0.45, 0.76], [0.25, 0.92], [0.1, 1.02], [0.06, 1.2], [0, 1.24]];
const TOMATO_PROFILE: Prof = [[0, 0.04], [0.45, 0], [0.85, 0.12], [1.07, 0.42], [1.1, 0.72], [0.95, 1.05], [0.62, 1.28], [0.25, 1.37], [0, 1.34]];
const BEET_PROFILE: Prof = [[0, 0.1], [0.3, 0.04], [0.62, 0.18], [0.82, 0.46], [0.86, 0.76], [0.72, 1.06], [0.42, 1.26], [0.14, 1.34], [0, 1.35]];
const CUC_PROFILE: Prof = [[0.04, -1.72], [0.24, -1.66], [0.37, -1.48], [0.42, -1.05], [0.43, 0], [0.42, 1.05], [0.37, 1.48], [0.24, 1.66], [0.04, 1.72]];
const COB_PROFILE: Prof = [[0.06, -1.5], [0.24, -1.43], [0.36, -1.24], [0.41, -0.88], [0.43, -0.4], [0.43, 0.2], [0.41, 0.7], [0.37, 1.1], [0.3, 1.4], [0.16, 1.56], [0.05, 1.6]];
const MUSH_STEM: Prof = [[0, 0], [0.28, 0], [0.3, 0.12], [0.27, 0.4], [0.24, 0.64]];
const MUSH_CAP: Prof = [[0.22, 0.6], [0.62, 0.64], [0.94, 0.72], [1.02, 0.84], [0.96, 1.04], [0.76, 1.22], [0.44, 1.34], [0.14, 1.38], [0, 1.385]];
const MUSH_FULL: Prof = [[0, 0], [0.28, 0], [0.3, 0.12], [0.27, 0.4], [0.24, 0.62], [0.62, 0.64], [0.94, 0.72], [1.02, 0.84], [0.96, 1.04], [0.76, 1.22], [0.44, 1.34], [0.14, 1.38], [0, 1.385]];
const PEPPER_PROFILE: Prof = [[0, 0.1], [0.35, 0.02], [0.7, 0.08], [0.92, 0.3], [0.98, 0.65], [0.94, 1.0], [0.8, 1.2], [0.5, 1.28], [0.22, 1.22], [0.1, 1.28], [0, 1.3]];
const BROC_STALK: Prof = [[0, 0], [0.3, 0], [0.32, 0.18], [0.26, 0.5], [0.36, 0.72]];
const LEMON_PROFILE: Prof = [[0.04, -1.1], [0.16, -1.0], [0.42, -0.8], [0.62, -0.48], [0.7, 0], [0.62, 0.48], [0.42, 0.8], [0.16, 1.0], [0.04, 1.1]];
const AVO_PROFILE: Prof = [[0, 0.02], [0.35, 0], [0.66, 0.12], [0.8, 0.38], [0.78, 0.68], [0.62, 0.95], [0.45, 1.2], [0.36, 1.42], [0.24, 1.6], [0.08, 1.68], [0, 1.7]];
const ELLIPSE_PROFILE: Prof = [[0.02, -1], [0.5, -0.87], [0.87, -0.5], [1, 0], [0.87, 0.5], [0.5, 0.87], [0.02, 1]];
const BLOCK_PROFILE: Prof = [[0, 0], [0.92, 0], [1.0, 0.08], [1.0, 0.72], [0.92, 0.8], [0, 0.8]];

// ─────────────────────────── classic dish-01 generators (verbatim) ───────────────────────────

function genOnion(S: VegParts[], prof: Prof = ONION_PROFILE): void {
  // Red onion: whole bulb -> halved (knife on line 1) with slices falling left -> dice
  const a = S.map((p) => p.b);
  a[0].lathe(prof, 22);
  a[1].setXform(0.1, 0, 0);
  a[1].lathe(prof, 12, 0, 0, -H, H);
  a[1].cutFace(prof, -1);
  const slices: [number, number, number][] = [[-0.3, 0.97, 0.12], [-0.66, 0.86, 0.38], [-1.05, 0.66, 0.75]];
  for (const [x, k, roll] of slices) {
    a[1].setXform(x, 0, 0, 0, 0, roll);
    a[1].crossSlab(prof, k, 0.24);
  }
  a[1].clearXform();
  dicePile(a[2], 4101, 1.12, 1.5, 0.19, 42, false);
}

function genGarlic(S: VegParts[]): void {
  // Garlic bulb (lobed cloves) -> loose cloves -> fine mince
  S[0].b.lathe(GARLIC_PROFILE, 32, 8, 0.07);
  const cloves: [number, number, number][] = [[-0.3, -0.42, 0.3], [0.28, -0.2, -0.5], [-0.22, 0.38, 1.2], [0.3, 0.5, 0.2]];
  for (const [x, z, yaw] of cloves) S[1].b.ellipsoid(x, 0.16, z, 0.17, 0.17, 0.33, 10, 6, yaw);
  dicePile(S[2].b, 4202, 0.58, 1.3, 0.115, 36, false);
}

function genHerb(S: VegParts[]): void {
  // Herb bunch lying along z (stems to the front) -> left half chopped -> flakes (also the plating garnish source)
  const rnd = makeRng(4303);
  const leaves: [number, number, number][] = [];
  for (let k = 0; k < 10; k++) leaves.push([-1.2 + 2.4 * ((k + rnd() * 0.6) / 10), 0.24 + rnd() * 0.18, -1.8 + rnd() * 2.2]);
  const sr = [0.05, 0.05, 0.045];
  for (let k = 0; k < 6; k++) {
    const x = -0.9 + (1.8 * k) / 5;
    S[0].a.sweep([[0.1, 0.07, 2.3], [0.05 + x * 0.3, 0.08, 1.4], [x, 0.12, 0.3]], sr, sr, 5, true);
    if (x > 0.1) S[1].a.sweep([[0.6, 0.07, 2.3], [0.5 + x * 0.2, 0.08, 1.4], [x, 0.12, 0.3]], sr, sr, 5, true);
  }
  for (const l of leaves) {
    S[0].b.ellipsoid(l[0], l[1], l[2], 0.46, 0.17, 0.46, 14, 5, l[0] * 3, 0, 6, 0.18);
    if (l[0] > 0.1) S[1].b.ellipsoid(l[0], l[1], l[2], 0.46, 0.17, 0.46, 14, 5, l[0] * 3, 0, 6, 0.18);
  }
  S[1].b.setXform(-0.85, 0, -0.2);
  dicePile(S[1].b, 4304, 0.55, 1.3, 0.13, 40, true);
  S[1].b.clearXform();
  dicePile(S[2].b, 4305, 1.3, 1.6, 0.13, 78, true);
}

function genTomato(S: VegParts[]): void {
  // Tomato with calyx -> halved (knife on line 6) + two slices -> dice
  S[0].b.lathe(TOMATO_PROFILE, 30, 5, 0.035);
  for (let k = 0; k < 5; k++) {
    const ang = (k * 72 * Math.PI) / 180;
    S[0].a.box(0.26 * Math.cos(ang), 1.37, -0.26 * Math.sin(ang), 0.3, 0.025, 0.07, ang, -0.12);
  }
  const cr = [0.06, 0.055, 0.05];
  S[0].a.sweep([[0, 1.3, 0], [0.02, 1.45, 0.01], [0.06, 1.6, 0.03]], cr, cr, 6, true);
  const a1 = S[1].b;
  a1.setXform(0.1, 0, 0);
  a1.lathe(TOMATO_PROFILE, 15, 5, 0.035, -H, H);
  a1.cutFace(TOMATO_PROFILE, -1);
  const slices: [number, number, number][] = [[-0.35, 0.95, 0.28], [-0.88, 0.7, 0.85]];
  for (const [x, k, roll] of slices) {
    a1.setXform(x, 0, 0, 0, 0, roll);
    a1.crossSlab(TOMATO_PROFILE, k, 0.3);
  }
  a1.clearXform();
  dicePile(S[2].b, 4406, 1.25, 1.5, 0.23, 38, false);
}

function genChilli(S: VegParts[]): void {
  // Chilli lying along z with a green stem -> tip + rings -> rings and bits
  const body = (acc: MeshAcc, t1: number): void => {
    const c: Pt[] = [];
    const r: number[] = [];
    const N = 14;
    for (let k = 0; k <= N; k++) {
      const t = (k / N) * t1;
      const rr = t < 0.85 ? 0.04 + 0.32 * Math.pow(Math.min(1, t / 0.7), 0.6) : 0.36 - 0.08 * ((t - 0.85) / 0.15);
      c.push([0.18 * Math.sin(Math.PI * t) - 0.05, rr * 0.95, -1.7 + 3.5 * t]);
      r.push(rr);
    }
    acc.sweep(c, r, r.map((x) => x * 0.9), 12, true);
  };
  body(S[0].b, 1);
  S[0].a.ellipsoid(-0.05, 0.28, 1.8, 0.3, 0.26, 0.12, 10, 5);
  const str = [0.07, 0.065, 0.055, 0.05];
  S[0].a.sweep([[-0.05, 0.3, 1.8], [-0.05, 0.4, 2.05], [0.05, 0.5, 2.3], [0.15, 0.55, 2.45]], str, str, 6, true);
  body(S[1].b, 0.62);
  for (let k = 0; k < 4; k++) {
    S[1].b.torus(0.05 - k * 0.12, 0.3, 0.75 + k * 0.32, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.24, 0.08, 0.09, 12, 5);
  }
  const rnd = makeRng(4507);
  for (let k = 0; k < 11; k++) {
    const R = 0.18 + rnd() * 0.08;
    S[2].b.torus((rnd() - 0.5) * 1.0, 0.07, -1.5 + 3.2 * (k / 10) + (rnd() - 0.5) * 0.2, [1, 0, 0], [0, 0, 1], [0, 1, 0], R, 0.06, 0.06, 10, 4);
  }
  dicePile(S[2].b, 4508, 0.5, 1.5, 0.11, 12, false);
}

// ─────────────────────────── BULB_ALLIUM ───────────────────────────

function genShallot(S: VegParts[]): void {
  genOnion(S, SHALLOT_PROFILE);
  // root hairs under the whole and the halved bulb (detail = pale papery)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const r = [0.02, 0.016];
    S[0].d.sweep([[0.05 * c, 0.03, 0.05 * s], [0.32 * c, 0.02, 0.32 * s]], r, r, 4, true);
  }
}

function eggR(t: number): number {
  return Math.max(0.06, 0.6 * Math.sqrt(Math.sin(Math.PI * (0.06 + 0.9 * t))) * (1 - 0.42 * t));
}

function eggBody(acc: MeshAcc, t0: number, t1: number, N: number): void {
  const c: Pt[] = [];
  const r: number[] = [];
  for (let k = 0; k <= N; k++) {
    const t = t0 + ((t1 - t0) * k) / N;
    const rr = eggR(t);
    c.push([0.15 * Math.sin(Math.PI * t), rr, -1.7 + 3.2 * t]);
    r.push(rr);
  }
  acc.sweep(c, r, r.map((x) => x * 0.92), 10, true);
}

function eggCalyx(acc: MeshAcc, z0: number): void {
  acc.ellipsoid(0, 0.14, z0 - 0.04, 0.2, 0.18, 0.16, 8, 3);
  for (let k = 0; k < 4; k++) {
    const ang = Math.PI / 4 + (k * Math.PI) / 2;
    acc.box(0.17 * Math.cos(ang), 0.14 + 0.15 * Math.sin(ang), z0 - 0.22, 0.05, 0.05, 0.16);
  }
  const r = [0.06, 0.055, 0.05];
  acc.sweep([[0, 0.16, z0 + 0.08], [0, 0.2, z0 + 0.3], [0.05, 0.28, z0 + 0.45]], r, r, 6, true);
}

function genEggplant(S: VegParts[]): void {
  // glossy teardrop + calyx -> trimmed body + angled rounds -> cubed heap
  eggBody(S[0].b, 0, 1, 10);
  eggCalyx(S[0].a, 1.5);
  const p = S[1];
  eggBody(p.b, 0, 0.5, 5);
  const re = eggR(0.5);
  xf([p.b, p.d], 0.15, re, -0.1, 0, H, 0);
  coin(p.b, p.d, re * 0.98, 0.02, 10);
  clr([p.b, p.d]);
  const rounds: [number, number][] = [[0.25, 0.6], [0.62, 0.72], [1.0, 0.84]];
  for (let k = 0; k < rounds.length; k++) {
    const r = eggR(rounds[k][1]);
    xf([p.b, p.d], 0.12 - 0.08 * k, r * 0.92, rounds[k][0], 0.15 * k, H - 0.55, 0);
    coin(p.b, p.d, r, 0.16, 10);
    clr([p.b, p.d]);
  }
  eggBody(p.b, 0.93, 1, 2);
  eggCalyx(p.a, 1.5);
  const c = S[2];
  heap(2501, 1.1, 1.5, 32, 0.17, (x, y, z, s, yaw, pitch) => c.d.box(x, y, z, s, s * 0.9, s, yaw, pitch));
  heap(2502, 1.0, 1.4, 10, 0.15, (x, y, z, s, yaw, pitch) => c.b.box(x, y + 0.05, z, s * 1.1, s * 0.35, s, yaw, pitch));
}

function beetStubs(acc: MeshAcc, dx: number): void {
  const r = [0.05, 0.045, 0.04];
  for (let k = 0; k < 4; k++) {
    const a = 0.3 + (k * Math.PI) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    acc.sweep([[dx + 0.05 * c, 1.28, 0.05 * s], [dx + 0.18 * c, 1.55, 0.18 * s], [dx + 0.3 * c, 1.75, 0.3 * s]], r, r, 5, true);
  }
}

function genBeet(S: VegParts[]): void {
  // round root + tapered tail + leaf stubs -> half bulb + thin rounds -> cubed heap
  S[0].b.lathe(BEET_PROFILE, 14);
  const tr = [0.22, 0.1, 0.05, 0.02];
  S[0].b.sweep([[0, 0.12, 0], [0.25, 0.06, -0.55], [0.45, 0.04, -1.1], [0.5, 0.04, -1.45]], tr, tr, 6, true);
  beetStubs(S[0].a, 0);
  const p = S[1];
  xf([p.b, p.d], 0.35, 0, 0);
  p.b.lathe(BEET_PROFILE, 8, 0, 0, -H, H);
  p.d.cutFace(BEET_PROFILE, -1);
  clr([p.b, p.d]);
  const slices: [number, number, number][] = [[-0.05, 0.95, 0.2], [-0.45, 0.8, 0.5], [-0.85, 0.6, 0.85]];
  for (const [x, k, roll] of slices) {
    p.d.setXform(x, 0, 0, 0, 0, roll);
    p.d.crossSlab(BEET_PROFILE, k, 0.1);
  }
  p.d.clearXform();
  const c = S[2];
  heap(3001, 1.1, 1.45, 44, 0.17, (x, y, z, s, yaw, pitch) => c.b.box(x, y, z, s, s * 0.9, s, yaw, pitch));
  heap(3002, 0.8, 1.1, 8, 0.16, (x, y, z, s, yaw, pitch) => c.d.box(x, y + 0.08, z, s, s * 0.9, s, yaw, pitch));
}

// ─────────────────────────── CYLINDER_STALK ───────────────────────────

function genCucumber(S: VegParts[]): void {
  // ribbed log -> log end + half-moons -> dice
  xf([S[0].b], 0, 0.43, 0, 0, H, 0);
  S[0].b.lathe(CUC_PROFILE, 14, 7, 0.05);
  clr([S[0].b]);
  S[0].a.ellipsoid(0, 0.43, 1.74, 0.1, 0.1, 0.08, 6, 3);
  const p = S[1];
  const log: Prof = CUC_PROFILE.filter((q) => q[1] <= 0.05);
  log.push([0.43, 0.2]);
  xf([p.b, p.d], 0, 0.43, -0.2, 0, H, 0);
  p.b.lathe(log, 14, 7, 0.05);
  p.d.lathe([[0.43, 0.2], [0, 0.2]], 14);
  clr([p.b, p.d]);
  const moons: [number, number, number][] = [[0.3, 0.55, 0.2], [-0.25, 0.9, -0.4], [0.3, 1.25, 0.6], [-0.15, 1.6, -0.1]];
  for (const [x, z, yaw] of moons) {
    xf([p.b, p.d], x, 0.07, z, yaw);
    coin(p.b, p.d, 0.42, 0.14, 8, true);
    clr([p.b, p.d]);
  }
  const c = S[2];
  heap(6001, 1.0, 1.4, 36, 0.15, (x, y, z, s, yaw, pitch) => c.d.box(x, y, z, s, s * 0.85, s, yaw, pitch));
  heap(6002, 0.9, 1.3, 10, 0.14, (x, y, z, s, yaw, pitch) => c.b.box(x, y + 0.04, z, s, s * 0.3, s, yaw, pitch));
}

function carR(t: number): number {
  return 0.06 + 0.3 * Math.pow(1 - t, 0.75);
}

function carBody(acc: MeshAcc, t0: number, t1: number, N: number): void {
  const c: Pt[] = [];
  const r: number[] = [];
  for (let k = 0; k <= N; k++) {
    const t = t0 + ((t1 - t0) * k) / N;
    const rr = carR(t);
    c.push([0.1 * Math.sin(Math.PI * t), rr * 0.95, -1.3 + 2.9 * t]);
    r.push(rr);
  }
  acc.sweep(c, r, r.map((x) => x * 0.95), 10, true);
}

function carGreens(acc: MeshAcc): void {
  const r = [0.05, 0.04, 0.03];
  for (let k = -1; k <= 1; k++) acc.sweep([[0.05 * k, 0.33, -1.3], [0.12 * k, 0.45, -1.58], [0.22 * k, 0.55, -1.85]], r, r, 5, true);
}

function genCarrot(S: VegParts[]): void {
  // tapered root + greens -> stump + batons -> brunoise
  carBody(S[0].b, 0, 1, 10);
  carGreens(S[0].a);
  const p = S[1];
  carBody(p.b, 0, 0.45, 5);
  const rf = carR(0.45);
  xf([p.b, p.d], 0.1 * Math.sin(Math.PI * 0.45), rf * 0.95, -1.3 + 2.9 * 0.45, 0, H, 0);
  coin(p.b, p.d, rf * 0.97, 0.02, 10);
  clr([p.b, p.d]);
  carGreens(p.a);
  for (let k = 0; k < 5; k++) p.b.box(-0.5 + 0.25 * k, 0.07, 0.95 + 0.06 * (k % 2), 0.07, 0.07, 0.45, 0.08 * (k - 2));
  heap(7001, 1.0, 1.35, 55, 0.075, (x, y, z, s, yaw, pitch) => S[2].b.box(x, y, z, s, s, s, yaw, pitch));
}

function spear(body: MeshAcc, tip: MeshAcc, x0: number, z0: number, len: number, yaw: number): void {
  const c: Pt[] = [];
  const r: number[] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    c.push([x0 + Math.sin(yaw) * len * t, 0.11, z0 + Math.cos(yaw) * len * t]);
    r.push(0.11 - 0.025 * t);
  }
  body.sweep(c, r, r, 8, true);
  const e = c[4];
  tip.ellipsoid(e[0] + Math.sin(yaw) * 0.12, 0.1, e[2] + Math.cos(yaw) * 0.12, 0.1, 0.1, 0.18, 6, 3, yaw);
}

function genAsparagus(S: VegParts[]): void {
  // spear bundle -> spears + roll-cut pieces -> small rounds
  spear(S[0].b, S[0].a, -0.3, -1.7, 3.1, 0.04);
  spear(S[0].b, S[0].a, 0, -1.75, 3.2, 0);
  spear(S[0].b, S[0].a, 0.3, -1.65, 3.0, -0.04);
  const p = S[1];
  spear(p.b, p.a, -0.45, -1.7, 3.1, 0.02);
  spear(p.b, p.a, 0.05, -1.7, 1.4, 0);
  const rnd = makeRng(1071);
  for (let k = 0; k < 5; k++) {
    const x = 0.15 + rnd() * 0.6, z = 0.1 + k * 0.32, yaw = 0.8 + rnd() * 0.6;
    const r = [0.1, 0.1];
    p.b.sweep([[x, 0.1, z], [x + Math.sin(yaw) * 0.32, 0.1, z + Math.cos(yaw) * 0.32]], r, r, 8, true);
  }
  const c = S[2];
  heap(1072, 1.0, 1.35, 18, 0.1, (x, y, z, s, yaw, pitch) => {
    c.b.setXform(x, 0.05 + (y - s * 0.8) * 0.5, z, yaw, pitch * 0.4, 0);
    c.d.setXform(x, 0.05 + (y - s * 0.8) * 0.5, z, yaw, pitch * 0.4, 0);
    coin(c.b, c.d, 0.1, 0.08, 6);
    clr([c.b, c.d]);
  });
  for (let k = 0; k < 3; k++) c.a.ellipsoid(-0.6 + 0.6 * k, 0.1, 1.2 - 0.3 * k, 0.1, 0.1, 0.18, 6, 3, k);
}

function scallionStalk(green: MeshAcc, white: MeshAcc, x0: number, zEnd: number): void {
  const wr = [0.13, 0.12, 0.1];
  white.sweep([[x0, 0.12, -1.9], [x0 + 0.02, 0.12, -1.35], [x0 + 0.04, 0.1, -0.8]], wr, wr, 6, true);
  white.box(x0, 0.08, -1.99, 0.1, 0.05, 0.05);
  const pts: Pt[] = [[x0 + 0.04, 0.1, -0.8], [x0 + 0.07, 0.09, 0.1], [x0 + 0.12, 0.08, 1.0], [x0 + 0.2, 0.07, 1.75]];
  const gr = [0.1, 0.085, 0.07, 0.05];
  const n = zEnd >= 1.75 ? 4 : 3;
  green.sweep(pts.slice(0, n), gr.slice(0, n), gr.slice(0, n), 6, true);
}

function genScallion(S: VegParts[]): void {
  // 3 stalks (white -> green) -> trimmed + bias pieces -> fine rings
  for (const x of [-0.28, 0, 0.28]) scallionStalk(S[0].b, S[0].a, x, 1.75);
  const p = S[1];
  scallionStalk(p.b, p.a, -0.45, 1.0);
  scallionStalk(p.b, p.a, -0.15, 1.0);
  const rnd = makeRng(1261);
  for (let k = 0; k < 6; k++) {
    const x = 0.25 + rnd() * 0.6, z = -0.2 + k * 0.38, yaw = 0.7;
    const r = [0.09, 0.09];
    (k < 4 ? p.b : p.a).sweep([[x, 0.09, z], [x + Math.sin(yaw) * 0.22, 0.09, z + Math.cos(yaw) * 0.22]], r, r, 6, true);
  }
  const c = S[2];
  let i = 0;
  heap(1262, 0.95, 1.3, 17, 0.12, (x, y, z, s, yaw, pitch) => {
    const acc = i++ % 4 === 3 ? c.a : c.b;
    acc.torus(x, 0.05 + (y - s * 0.8) * 0.6, z, [Math.cos(pitch), Math.sin(pitch) * 0.3, 0], [0, 0, 1], [-Math.sin(pitch) * 0.3, 1, 0], s * 1.1, 0.045, 0.05, 8, 3);
  });
}

function genCorn(S: VegParts[]): void {
  // cob with kernel rows + husk -> half cob + cob rounds -> loose kernels
  xf([S[0].b], 0, 0.43, 0, 0, H, 0);
  S[0].b.lathe(COB_PROFILE, 15, 8, 0.07);
  clr([S[0].b]);
  const husk = (acc: MeshAcc): void => {
    for (const x of [-0.15, 0.15]) acc.sweep([[x, 0.1, -1.3], [x * 1.3, 0.12, -1.6], [x * 1.8, 0.1, -1.85]], [0.2, 0.18, 0.06], [0.03, 0.03, 0.02], 5, true);
    const sr = [0.12, 0.11];
    acc.sweep([[0, 0.4, -1.5], [0, 0.4, -1.75]], sr, sr, 6, true);
  };
  husk(S[0].a);
  const p = S[1];
  const half: Prof = COB_PROFILE.filter((q) => q[1] <= -0.3);
  half.push([0.43, -0.1]);
  xf([p.b, p.d], 0, 0.43, 0, 0, H, 0);
  p.b.lathe(half, 15, 8, 0.07);
  p.d.lathe([[0.43, -0.1], [0, -0.1]], 15);
  clr([p.b, p.d]);
  husk(p.a);
  for (let k = 0; k < 3; k++) {
    xf([p.b, p.d], 0.2 * (k % 2 ? -1 : 1), 0.16, 0.45 + 0.52 * k, 0.4 * k);
    coin(p.b, p.d, 0.43, 0.32, 10);
    clr([p.b, p.d]);
  }
  heap(2701, 1.0, 1.35, 64, 0.07, (x, y, z, s, yaw, pitch) => S[2].b.box(x, y * 0.8, z, s, s * 0.8, s * 0.7, yaw, pitch));
}

function genPeas(S: VegParts[]): void {
  // pod -> opened pod + row of peas -> loose peas
  const pod = (acc: MeshAcc, dx: number, flat: number, yaw: number): void => {
    const c: Pt[] = [];
    const rw: number[] = [];
    const rh: number[] = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      const w = 0.3 * Math.sqrt(Math.sin(Math.PI * (0.08 + 0.84 * t)));
      const z = -1.5 + 3 * t;
      c.push([dx + 0.12 * Math.sin(Math.PI * t) + Math.sin(yaw) * z, w * flat, Math.cos(yaw) * z]);
      rw.push(w);
      rh.push(w * flat);
    }
    acc.sweep(c, rw, rh, 8, true);
  };
  pod(S[0].b, 0, 0.7, 0);
  for (let k = 0; k < 5; k++) S[0].b.ellipsoid(0.1 + 0.08 * Math.sin(k), 0.26, -1.0 + 0.5 * k, 0.17, 0.12, 0.17, 6, 3);
  const sr = [0.04, 0.03];
  S[0].a.sweep([[0.02, 0.2, -1.5], [0.05, 0.25, -1.8]], sr, sr, 6, true);
  const p = S[1];
  pod(p.b, -0.5, 0.25, 0.1);
  pod(p.b, 0.5, 0.25, -0.1);
  for (let k = 0; k < 6; k++) p.b.ellipsoid(0.48 + 0.04 * Math.sin(k), 0.2, -1.1 + 0.45 * k, 0.16, 0.15, 0.16, 6, 3);
  heap(1271, 0.95, 1.3, 22, 0.15, (x, y, z, s) => S[2].b.ellipsoid(x, y * 0.85, z, s, s * 0.95, s, 6, 3));
}

// ─────────────────────────── SPHERE_CROWN ───────────────────────────

function genMushroom(S: VegParts[]): void {
  // umbrella cap + stem -> half + T-slices -> sliced pile
  S[0].a.lathe(MUSH_STEM, 12);
  S[0].b.lathe(MUSH_CAP, 18);
  const p = S[1];
  xf([p.b, p.a, p.d], 0.25, 0, 0);
  p.b.lathe(MUSH_CAP, 9, 0, 0, -H, H);
  p.a.lathe(MUSH_STEM, 6, 0, 0, -H, H);
  p.d.cutFace(MUSH_FULL, -1);
  clr([p.b, p.a, p.d]);
  const slices: [number, number, number][] = [[-0.25, 0.97, 0.12], [-0.62, 0.85, 0.4]];
  for (const [x, k, roll] of slices) {
    p.d.setXform(x, 0, 0, 0, 0, roll);
    p.d.crossSlab(MUSH_FULL, k, 0.13);
  }
  p.d.clearXform();
  const c = S[2];
  heap(1081, 0.75, 1.15, 8, 0.065, (x, y, z, s, yaw) => {
    c.d.setXform(x + 0.55, s + (y - s * 0.8) * 0.8, z, yaw, 0, H, 0.8, 0.8, 0.8);
    c.d.crossSlab(MUSH_FULL, 0.9, 0.13);
    c.d.clearXform();
  });
}

function genPepper(S: VegParts[]): void {
  // 4-lobed glossy pepper -> de-seeded half + strips -> strip pile
  S[0].b.lathe(PEPPER_PROFILE, 16, 4, 0.12);
  const sr = [0.09, 0.07, 0.06];
  S[0].a.sweep([[0, 1.22, 0], [0, 1.42, 0.02], [0.06, 1.58, 0.08]], sr, sr, 6, true);
  S[0].a.ellipsoid(0, 1.26, 0, 0.16, 0.06, 0.16, 6, 3);
  const p = S[1];
  const inner: Prof = scaleProf(PEPPER_PROFILE, 0.88, 0.92, 0.06).reverse();
  xf([p.b, p.d], -0.65, 1.0, -0.35, 0, 0, -H);
  p.b.lathe(PEPPER_PROFILE, 8, 4, 0.12, -H, H);
  p.d.lathe(inner, 8, 4, 0.12, -H, H);
  clr([p.b, p.d]);
  for (let k = 0; k < 3; k++) p.b.box(-0.4 + 0.4 * k, 0.06, 1.15 + 0.12 * (k % 2), 0.08, 0.05, 0.5, 0.15 * (k - 1));
  const c = S[2];
  heap(1221, 1.0, 1.35, 40, 0.1, (x, y, z, s, yaw, pitch) => c.b.box(x, y * 0.7, z, s * 0.7, s * 0.4, s * 4.0, yaw, pitch * 0.4));
  heap(1222, 0.8, 1.1, 6, 0.1, (x, y, z, s, yaw, pitch) => c.d.box(x, y * 0.7 + 0.05, z, s * 0.7, s * 0.4, s * 3.5, yaw, pitch * 0.4));
}

function floret(head: MeshAcc, stem: MeshAcc, x: number, y: number, z: number, k: number, segs: number, rings: number): void {
  const sr = [0.11 * k, 0.13 * k];
  stem.sweep([[x, y, z], [x, y + 0.3 * k, z]], sr, sr, segs > 8 ? 6 : 5, true);
  head.ellipsoid(x, y + 0.48 * k, z, 0.38 * k, 0.28 * k, 0.38 * k, segs, rings, 0, 0, 5, 0.15);
}

function genBroccoli(S: VegParts[]): void {
  // floret crown on a stalk -> branches -> bite florets
  S[0].a.lathe(BROC_STALK, 8);
  S[0].b.ellipsoid(0, 1.02, 0, 0.95, 0.5, 0.95, 18, 5, 0, 0, 7, 0.12);
  for (let k = 0; k < 4; k++) {
    const a = 0.4 + (k * Math.PI) / 2;
    S[0].b.ellipsoid(0.6 * Math.cos(a), 1.22, 0.6 * Math.sin(a), 0.32, 0.26, 0.32, 6, 3);
  }
  const p = S[1];
  const spots: [number, number][] = [[-0.5, -0.95], [0.45, -0.55], [-0.2, 0.35]];
  for (const [x, z] of spots) floret(p.b, p.a, x, 0, z, 1, 10, 4);
  xf([p.a], 0.35, 0, 1.2, 0, 0, 0, 0.8);
  p.a.lathe(BROC_STALK, 8);
  clr([p.a]);
  heap(1231, 0.95, 1.3, 9, 0.5, (x, _y, z, s) => floret(S[2].b, S[2].a, x, 0, z, s, 7, 3));
}

function genCitrus(S: VegParts[]): void {
  // citrus with pointed nubs + leaf -> half + wheels -> wedges + zest
  xf([S[0].b], 0, 0.7, 0, 0, 0, -H);
  S[0].b.lathe(LEMON_PROFILE, 14);
  clr([S[0].b]);
  S[0].a.ellipsoid(0.95, 0.62, 0.12, 0.32, 0.04, 0.14, 8, 3, 0.5);
  S[0].a.ellipsoid(1.12, 0.7, 0, 0.07, 0.07, 0.07, 6, 3);
  const p = S[1];
  xf([p.b, p.d], 0, 0.7, -0.8, 0, 0, -H);
  p.b.lathe(LEMON_PROFILE, 7, 0, 0, -H, H);
  p.d.cutFace(LEMON_PROFILE, -1);
  clr([p.b, p.d]);
  const wheels: [number, number][] = [[-0.3, 0.6], [0.35, 1.25]];
  for (const [x, z] of wheels) {
    xf([p.b, p.d], x, 0.07, z);
    coin(p.b, p.d, 0.66, 0.14, 12);
    clr([p.b, p.d]);
  }
  const c = S[2];
  const ws: [number, number, number][] = [[-0.45, -0.9, 0.3], [0.45, -0.6, -0.4], [-0.35, 0.15, 0.9], [0.45, 0.45, 0.1], [-0.1, 1.05, -0.6]];
  for (const [x, z, yaw] of ws) {
    xf([c.b, c.d], x, 0.56, z, yaw, 0, -H, 0.8);
    wedge(c.b, c.d, LEMON_PROFILE, 4, -0.55, 0.55);
    clr([c.b, c.d]);
  }
  heap(1281, 0.9, 1.3, 24, 0.1, (x, y, z, s, yaw) => c.b.box(x, 0.03 + (y - s * 0.8) * 0.3, z, s * 1.2, 0.015, 0.02, yaw));
}

function genAvocado(S: VegParts[]): void {
  // pear-shaped whole -> two halves (one with the stone) -> fanned slices + cubes
  S[0].b.lathe(AVO_PROFILE, 16, 9, 0.015);
  S[0].a.ellipsoid(0, 1.7, 0, 0.07, 0.07, 0.07, 6, 3);
  const p = S[1];
  xf([p.b, p.d], -0.85, 0.8, -0.85, 0, 0, -H);
  p.b.lathe(AVO_PROFILE, 8, 9, 0.015, -H, H);
  p.d.cutFace(AVO_PROFILE, -1);
  xf([p.b, p.d], 0.85, 0.8, 0.85, Math.PI, 0, -H);
  p.b.lathe(AVO_PROFILE, 8, 9, 0.015, -H, H);
  p.d.cutFace(AVO_PROFILE, -1);
  clr([p.b, p.d]);
  p.a.ellipsoid(-0.85 + 0.42, 0.82, -0.85, 0.32, 0.26, 0.32, 8, 4);
  const c = S[2];
  for (let k = 0; k < 6; k++) {
    c.d.setXform(0.9, 0.06 + 0.012 * k, -0.9 + 0.08 * k, -0.25 + 0.17 * k, 0, H, 0.8, 0.8, 0.8);
    c.d.crossSlab(AVO_PROFILE, 0.9, 0.12);
  }
  c.d.clearXform();
  heap(1291, 0.6, 0.6, 20, 0.15, (x, y, z, s, yaw, pitch) => c.d.box(x - 0.2, y, z + 0.9, s, s * 0.9, s, yaw, pitch));
}

function genPotato(S: VegParts[]): void {
  // earthy lumpy tuber -> wedges -> steak-fry batons
  S[0].b.ellipsoid(0, 0.5, 0, 0.72, 0.5, 1.0, 12, 5, 0.3, 0, 3, 0.08);
  const eyes: Pt[] = [[0.45, 0.75, 0.3], [-0.4, 0.8, -0.35], [0.2, 0.9, -0.6], [-0.3, 0.7, 0.6]];
  for (const e of eyes) S[0].a.ellipsoid(e[0], e[1], e[2], 0.07, 0.04, 0.07, 5, 2);
  const p = S[1];
  for (let k = 0; k < 4; k++) {
    const x = -0.6 + 0.4 * k, z = (k % 2) * 0.4 - 0.2, yaw = 0.25 * (k - 1.5);
    p.b.setXform(x, 0.5, z, yaw, 0, -H, 0.5, 1.0, 0.5);
    p.d.setXform(x, 0.5, z, yaw, 0, -H, 0.5, 1.0, 0.5);
    wedge(p.b, p.d, ELLIPSE_PROFILE, 3, -0.6, 0.6);
    clr([p.b, p.d]);
  }
  heap(1191, 1.0, 1.2, 40, 0.07, (x, y, z, s, yaw, pitch) => S[2].d.box(x, y, z, s, s, s * 6, yaw, pitch * 0.3));
}

// ─────────────────────────── LEAFY_HERB ───────────────────────────

function bokStalk(white: MeshAcc, leaf: MeshAcc, f: number): void {
  white.sweep([[f * 0.08, 0.17, -1.85], [f * 0.18, 0.2, -0.95], [f * 0.32, 0.22, -0.05]], [0.2, 0.19, 0.16], [0.1, 0.09, 0.075], 6, true);
  leaf.ellipsoid(f * 0.45, 0.24, 0.85, 0.4, 0.09, 0.95, 8, 3, f * 0.18, -0.05);
}

function genBokChoy(S: VegParts[]): void {
  // layered head (white stalks + green blades) -> halved wedges -> shredded ribbons
  for (let k = 0; k < 4; k++) bokStalk(S[0].a, S[0].b, k - 1.5);
  S[0].a.ellipsoid(0, 0.16, -1.95, 0.32, 0.16, 0.12, 6, 3);
  const p = S[1];
  for (const h of [-1, 1]) {
    xf([p.a, p.b], h * 0.45, 0, 0, h * 0.12);
    bokStalk(p.a, p.b, h * 0.3);
    bokStalk(p.a, p.b, h * 1.1);
    p.a.box(-h * 0.08, 0.14, -1.0, 0.02, 0.1, 0.85);
    clr([p.a, p.b]);
  }
  const c = S[2];
  let i = 0;
  heap(1241, 1.05, 1.4, 64, 0.16, (x, y, z, s, yaw, pitch) => {
    const acc = i++ % 7 < 5 ? c.b : c.a;
    acc.box(x, y * 0.4, z, s * 1.6, s * 0.12, s * 0.32, yaw, pitch * 0.5);
  });
}

// ─────────────────────────── CUBED_BLOCK ───────────────────────────

function genGinger(S: VegParts[]): void {
  // knobby rhizome -> piece + thin slabs -> julienne matchsticks
  const w = S[0];
  w.b.ellipsoid(0, 0.3, 0, 0.78, 0.3, 0.38, 10, 4, 0.1);
  w.b.ellipsoid(0.55, 0.28, 0.42, 0.34, 0.26, 0.3, 8, 4, 0.6);
  w.b.ellipsoid(-0.5, 0.28, 0.45, 0.32, 0.25, 0.27, 8, 4, -0.5);
  w.b.ellipsoid(0.1, 0.28, -0.48, 0.3, 0.24, 0.3, 8, 4);
  w.b.ellipsoid(0.98, 0.26, 0.1, 0.25, 0.2, 0.2, 6, 3);
  w.a.ellipsoid(0.62, 0.5, 0.62, 0.08, 0.07, 0.08, 6, 3);
  w.a.ellipsoid(-0.55, 0.48, 0.66, 0.08, 0.07, 0.08, 6, 3);
  const p = S[1];
  p.b.ellipsoid(-0.35, 0.3, -0.6, 0.5, 0.3, 0.38, 10, 4, 0.1);
  p.b.ellipsoid(-0.6, 0.28, -0.25, 0.32, 0.25, 0.27, 8, 4, -0.5);
  for (let k = 0; k < 5; k++) {
    xf([p.b, p.d], 0.05 + 0.16 * k, 0.06 + 0.02 * k, 0.55 + 0.05 * k, 0.3 * k, 0.12);
    coin(p.b, p.d, 0.3, 0.06, 10);
    clr([p.b, p.d]);
  }
  heap(1091, 1.0, 1.3, 60, 0.025, (x, y, z, s, yaw, pitch) => S[2].d.box(x, y * 1.4, z, s, s, 0.3, yaw, pitch * 0.3));
}

function genBlock(S: VegParts[]): void {
  // bevelled block (paneer / tofu / bread) -> shorter block + slabs -> cubes
  S[0].b.setXform(0, 0, 0, 0, 0, 0, 1.25, 1, 0.9);
  S[0].b.lathe(BLOCK_PROFILE, 4, 0, 0, Math.PI / 4, Math.PI / 4 + TAU);
  S[0].b.clearXform();
  const p = S[1];
  p.b.setXform(-0.35, 0, 0, 0, 0, 0, 0.8, 1, 0.9);
  p.b.lathe(BLOCK_PROFILE, 4, 0, 0, Math.PI / 4, Math.PI / 4 + TAU);
  p.b.clearXform();
  for (let k = 0; k < 3; k++) p.b.box(0.5 + 0.2 * k, 0.4, 0, 0.06, 0.4, 0.6, 0, -0.18 * k);
  heap(1092, 1.0, 1.3, 40, 0.14, (x, y, z, s, yaw, pitch) => S[2].b.box(x, y, z, s, s, s, yaw, pitch * 0.4));
}

const GENS: { [g: string]: (S: VegParts[]) => void } = {
  ONION: (S) => genOnion(S), SHALLOT: genShallot, GARLIC: genGarlic, EGGPLANT: genEggplant, BEET: genBeet,
  CHILLI: genChilli, CUCUMBER: genCucumber, CARROT: genCarrot, ASPARAGUS: genAsparagus, SCALLION: genScallion, CORN: genCorn, PEAS: genPeas,
  TOMATO: genTomato, MUSHROOM: genMushroom, PEPPER: genPepper, BROCCOLI: genBroccoli, CITRUS: genCitrus, AVOCADO: genAvocado, POTATO: genPotato,
  HERB: genHerb, BOKCHOY: genBokChoy, GINGER: genGinger, BLOCK: genBlock,
};

/** Per-stage lane fit: scale with normalizeScale (lane radius 1.05) and seat the lowest vertex on y = 0. */
function normaliseStage(parts: MeshAcc[], mult: number): void {
  let minY = 1e9, rx = 0, rz = 0;
  for (const a of parts) {
    if (a.count() === 0) continue;
    const b = a.bounds();
    minY = Math.min(minY, b[1]);
    rx = Math.max(rx, Math.abs(b[0]), Math.abs(b[3]));
    rz = Math.max(rz, Math.abs(b[2]), Math.abs(b[5]));
  }
  if (minY > 1e8) return;
  const r = Math.max(rx, rz / Z_STRETCH);
  const m = isFinite(mult) && mult > 0 ? Math.max(0.6, Math.min(1.2, mult)) : 1;
  const s = Math.min(normalizeScale(r) * m, r > 0 ? LANE_MAX_RADIUS / r : 1);
  for (const a of parts) if (a.count() > 0) a.scaleShift(s, -minY * s);
}

/** Builds the Whole / Partial / Cut-pile meshes (3 colour parts each) for one prep-slot entry. */
export function buildVegStages(entry: PrepSlotEntry, mk: () => MeshAcc): VegStageSet {
  const res = resolveVeg(entry);
  const spec = res.spec;
  const S: VegParts[] = [0, 1, 2].map(() => ({ b: mk(), a: mk(), d: mk() }));
  (GENS[res.gen] || genTomato)(S);
  if (!res.classic) for (const st of S) normaliseStage([st.b, st.a, st.d], entry.scaleMultiplier);
  const body = lift(res.body);
  const accent = lift(validRgb(entry.stemColorRgb) ? (entry.stemColorRgb as Rgb) : spec ? spec.accent : LEAF_GREEN);
  const detail = lift(spec && spec.detail && sameRgb(res.body, spec.rgb) ? spec.detail : lighten(body, 0.45));
  return {
    parts: S.map((st) => [st.b, st.a, st.d].map((a) => (a.count() > 0 ? a : null))),
    bodyRgb: body,
    accentRgb: accent,
    detailRgb: detail,
    rough: spec ? spec.rough : 0.35,
    metal: spec ? spec.metal : 0.02,
    gen: res.gen,
    classic: res.classic,
    tris: S.map((st) => st.b.triCount() + st.a.triCount() + st.d.triCount()),
  };
}
