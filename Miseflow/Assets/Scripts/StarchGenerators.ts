/**
 * StarchGenerators.ts  (v5 A2 – starch catalogue #116-#118, #120; #119 potato and #121 bread live in VegGenerators)
 * Procedural MeshAcc generators, three build stages per starch (raw -> par-cooked -> finished), plus StarchProp:
 * a scene prop that rests on SLOT_STARCH (StationsRoot, front-right between plate and prep bowl) in a shallow
 * stoneware tray and crossfades between its stages (scale-swap, bottom-centre pivot).
 *   GRANULAR_MOUND  #116 rice    : ivory grain heap -> fluffy steamed mound -> saffron / masala-onion layered dum dome
 *   STRAND_TANGLE   #117 noodles : dry coiled nest -> loosened golden strands -> glossy wok-tossed ribbons
 *   STRAND_TANGLE   #118 pasta   : spaghetti bundle -> al dente strands -> emulsified twirl nest in sauce
 *   TUBE_ARRAY      #118 penne   : tube array -> boiled tubes -> sauced heap (name "penne"/"rigatoni"/"tube")
 *   DISC_SHEET      #120 dough   : proofed ball -> rolled sheet -> puffed flatbread with char blisters
 * Spectacles budget: <= 500 tris per stage (tray 192 extra, shared), strands are few low-segment swept tubes.
 * Additive display: every colour stays well above black. Mesh units = StationsRoot cm, y = 0 is the slab contact.
 */

import { MeshAcc, makePbrMaterial, makeTexturedPbr } from "./StationPropsBuilder";
import { getSlot, toRoot } from "./AI/SpatialSlotAllocator";
import { PrepSlotEntry, Rgb } from "./AI/UniversalDishSchema";
import { StarchTint } from "./AI/IDishAssetBuilder";

export type StarchGenId = "RICE_MOUND" | "NOODLE_TANGLE" | "PASTA_SPAGHETTI" | "PASTA_PENNE" | "DOUGH_DISC";
export type StarchStage = 0 | 1 | 2;
export type StarchTex = "" | "rice" | "flatbread";

/** One coloured sub-mesh of a stage (body / accent / detail). */
export interface StarchPart {
  mesh: MeshAcc;
  rgb: Rgb;
  metal: number;
  rough: number;
  tex: StarchTex;
}

export interface StarchStageSet {
  gen: StarchGenId;
  accessNumber: number;
  raw: StarchPart[];
  partial: StarchPart[];
  finished: StarchPart[];
  /** Shared stoneware rest tray under every stage. */
  tray: StarchPart;
  /** Triangles per stage [raw, partial, finished] (tray excluded). */
  tris: number[];
  trayTris: number;
}

/** Access numbers with a starch generator here (#119 / #121 are VegGenerators items). */
export const STARCH_CATALOGUE: number[] = [116, 117, 118, 120];

const TRAY_FLOOR = 0.12; // tray floor top: every stage mesh starts here
const SAFFRON: Rgb = [0.969, 0.792, 0.271]; // #F7CA45
const MASALA: Rgb = [0.549, 0.22, 0.118]; // #8C381E

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function okRgb(c: any): boolean {
  return !!c && c.length === 3 && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Additive-display floor: lift dark colours so they never read as see-through. */
function lift(c: Rgb, minLum: number = 0.3): Rgb {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  if (l >= minLum) return c;
  return mix(c, [1.0, 0.86, 0.62], Math.min(0.6, (minLum - l) / Math.max(0.05, 1 - l)));
}

function part(mesh: MeshAcc, rgb: Rgb, metal: number, rough: number, tex: StarchTex = ""): StarchPart {
  return { mesh: mesh, rgb: rgb, metal: metal, rough: rough, tex: tex };
}

/**
 * Surface of revolution (profile [r, y], rows j0..j1) with radius lobes and arc-length V (u = around, v = arc length /
 * max circumference, so a texture keeps its aspect without wrap), or planar top-down UVs when `planar` > 0.
 */
function rev(
  acc: MeshAcc, prof: [number, number][], segs: number,
  lobes: number = 0, amp: number = 0, phase: number = 0, j0: number = 0, j1: number = -1, planar: number = 0
): void {
  const P = prof.length;
  const last = j1 < 0 ? P - 1 : j1;
  const nrm: [number, number][] = [];
  const arc: number[] = [];
  let maxR = 0.01;
  let run = 0;
  for (let j = 0; j < P; j++) {
    const a = prof[Math.max(0, j - 1)], b = prof[Math.min(P - 1, j + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    nrm.push([dy / l, -dx / l]);
    if (j > 0) run += Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]);
    arc.push(run);
    maxR = Math.max(maxR, prof[j][0]);
  }
  const C = 2 * Math.PI * maxR;
  const rows = last - j0 + 1;
  const base = acc.count();
  for (let i = 0; i <= segs; i++) {
    const ph = (i / segs) * Math.PI * 2;
    const c = Math.cos(ph), s = Math.sin(ph);
    const k = 1 + amp * Math.cos(lobes * ph + phase) + amp * 0.45 * Math.cos((lobes + 3) * ph + phase * 1.7);
    for (let j = j0; j <= last; j++) {
      const r = prof[j][0] * k;
      const x = r * c, z = r * s;
      const u = planar > 0 ? 0.5 + x / (2 * planar) : i / segs;
      const v = planar > 0 ? 0.5 + z / (2 * planar) : arc[j] / C;
      acc.v(x, prof[j][1], z, nrm[j][0] * c, nrm[j][1], nrm[j][0] * s, u, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = base + i * rows + j;
      acc.quad(a, a + 1, a + rows + 1, a + rows);
    }
  }
}

/** Radius modulation used by rev() (so decorations can sit on a lobed surface). */
function lobeK(ph: number, lobes: number, amp: number, phase: number): number {
  return 1 + amp * Math.cos(lobes * ph + phase) + amp * 0.45 * Math.cos((lobes + 3) * ph + phase * 1.7);
}

/** Swept strand with slightly tapered ends; no caps by default (cheap, ends hide in the tangle). */
function strand(acc: MeshAcc, pts: [number, number, number][], rw: number, rh: number, segs: number = 3, caps: boolean = false): void {
  const N = pts.length;
  const w: number[] = [], h: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i === 0 || i === N - 1 ? 0.72 : 1;
    w.push(rw * t);
    h.push(rh * t);
  }
  acc.sweep(pts, w, h, segs, caps);
}

/** Straight tube of length L centred at (x,y,z) along yaw/pitch (radians), flat caps. */
function tube(acc: MeshAcc, x: number, y: number, z: number, yaw: number, pitch: number, L: number, r: number, segs: number = 6, bend: number = 0): void {
  const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
  const h = L / 2;
  const pts: [number, number, number][] = bend > 0
    ? [[x - dx * h, y - dy * h, z - dz * h], [x, y + bend, z], [x + dx * h, y + dy * h, z + dz * h]]
    : [[x - dx * h, y - dy * h, z - dz * h], [x + dx * h, y + dy * h, z + dz * h]];
  acc.sweep(pts, pts.map(() => r), pts.map(() => r), segs, true);
}

/** Interpolated y of a profile at radius r over rows j0..j1 (rows ordered by decreasing radius). */
function yAtR(prof: [number, number][], r: number, j0: number, j1: number): number {
  for (let j = j0; j < j1; j++) {
    const a = prof[j], b = prof[j + 1];
    if ((r <= a[0] && r >= b[0]) || (r >= a[0] && r <= b[0])) {
      const t = Math.abs(a[0] - b[0]) < 1e-6 ? 0 : (r - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return prof[j1][1];
}

// ───────────────────────────── #116 rice (GRANULAR_MOUND) ─────────────────────────────

function riceStages(body: Rgb, tint: StarchTint, mk: () => MeshAcc): StarchPart[][] {
  const R = rng(116);
  // stage 0: raw ivory grain heap + a few loose grains on the tray floor
  const h0 = mk();
  const heap: [number, number][] = [[2.0, TRAY_FLOOR], [1.82, 0.34], [1.4, 0.72], [0.9, 1.06], [0.42, 1.28], [0.0, 1.36]];
  rev(h0, heap, 16, 5, 0.05, 0.4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + R() * 0.5;
    const rr = 2.04 + R() * 0.08;
    h0.ellipsoid(Math.cos(a) * rr, TRAY_FLOOR + 0.035, Math.sin(a) * rr, 0.13, 0.04, 0.05, 4, 3, R() * Math.PI, 0);
  }
  const raw = [part(h0, mix(body, [0.93, 0.85, 0.66], 0.35), 0.0, 0.55, "rice")]; // dry grains: creamy ivory

  // stage 1: fluffy steamed white mound with soft grain clumps
  const s1 = mk();
  const dome: [number, number][] = [[2.05, TRAY_FLOOR], [2.0, 0.4], [1.8, 0.85], [1.4, 1.25], [0.85, 1.55], [0.3, 1.7], [0.0, 1.72]];
  rev(s1, dome, 18, 7, 0.06, 1.1);
  for (let i = 0; i < 6; i++) {
    const j = 1 + Math.floor(R() * 4);
    const ph = R() * Math.PI * 2;
    const k = lobeK(ph, 7, 0.06, 1.1);
    const r = dome[j][0] * k * 0.93;
    s1.ellipsoid(Math.cos(ph) * r, dome[j][1] + 0.02, Math.sin(ph) * r, 0.36 + R() * 0.08, 0.2, 0.32, 6, 3, ph, 0);
  }
  const steamed: Rgb = mix(body, [0.97, 0.96, 0.92], 0.6);
  const partial = [part(s1, steamed, 0.0, 0.42, "rice")];

  // stage 2: dum dome. Bands (bottom -> top): masala/onion layer, white rice, saffron layer, white crown with saffron
  // streaks and caramelised onion strands on top.
  const saffron = okRgb(tint.baseRgb) ? (tint.baseRgb as Rgb) : SAFFRON;
  const masala = lift(okRgb(tint.reducedRgb) ? (tint.reducedRgb as Rgb) : MASALA, 0.34);
  const onion: Rgb = lift(mix(masala, [0.78, 0.48, 0.2], 0.55), 0.36);
  const d: [number, number][] = [[2.1, TRAY_FLOOR], [2.1, 0.42], [2.07, 0.72], [1.98, 1.0], [1.78, 1.27], [1.48, 1.52], [1.06, 1.72], [0.55, 1.84], [0.0, 1.88]];
  const LB = 3, AMP = 0.025, PH = 0.7;
  const white = mk(), gold = mk(), brown = mk();
  rev(brown, d, 16, LB, AMP, PH, 0, 1);
  rev(white, d, 16, LB, AMP, PH, 1, 2);
  rev(gold, d, 16, LB, AMP, PH, 2, 3);
  rev(white, d, 16, LB, AMP, PH, 3, 8);
  for (let i = 0; i < 5; i++) {
    // saffron streak running from the crown down into the saffron band
    const ph = (i / 5) * Math.PI * 2 + 0.35 + R() * 0.4;
    const pts: [number, number, number][] = [];
    for (let j = 7; j >= 3; j--) {
      const q = ph + (7 - j) * 0.07;
      const r = d[j][0] * lobeK(q, LB, AMP, PH) + 0.035;
      pts.push([Math.cos(q) * r, d[j][1] + 0.03, Math.sin(q) * r]);
    }
    strand(gold, pts, 0.09, 0.035, 3);
  }
  for (let i = 0; i < 6; i++) {
    // fried onion curl lying on the crown
    const ph = R() * Math.PI * 2;
    const r0 = 0.25 + R() * 0.95;
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const q = ph + k * 0.32;
      const r = r0 + 0.12 * Math.sin(k * 1.6);
      pts.push([Math.cos(q) * r, yAtR(d, r, 3, 8) + 0.05, Math.sin(q) * r]);
    }
    strand(brown, pts, 0.055, 0.04, 3);
  }
  const finished = [
    part(white, [0.99, 0.98, 0.94], 0.0, 0.42, "rice"),
    part(gold, saffron, 0.0, 0.36, "rice"),
    part(brown, masala, 0.02, 0.4, "rice"),
  ];
  // onions share the masala part; their colour sits between masala and caramel
  finished[2].rgb = mix(masala, onion, 0.4);
  return [raw, partial, finished];
}

// ───────────────────────────── #117 noodles (STRAND_TANGLE) ─────────────────────────────

function noodleStages(body: Rgb, tint: StarchTint, mk: () => MeshAcc): StarchPart[][] {
  const R = rng(117);
  // stage 0: dry coiled nest (squashed core + three wavy coils)
  const n0 = mk();
  n0.ellipsoid(0, TRAY_FLOOR + 0.42, 0, 1.45, 0.42, 1.45, 10, 5);
  for (let s = 0; s < 3; s++) {
    const Rr = 0.55 + 0.42 * s;
    const yc = TRAY_FLOOR + 0.78 - 0.17 * s;
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 20; k++) {
      const t = (k / 20) * Math.PI * 2;
      const r = Rr + 0.13 * Math.sin(5 * t + s);
      pts.push([Math.cos(t) * r, yc + 0.15 * Math.sin(7 * t + 2 * s), Math.sin(t) * r]);
    }
    strand(n0, pts, 0.1, 0.1, 3);
  }
  const dry: Rgb = mix(body, [0.86, 0.72, 0.42], 0.25);
  const raw = [part(n0, dry, 0.0, 0.6)];

  // stage 1: loosened boiling golden strands
  const n1 = mk();
  for (let s = 0; s < 7; s++) {
    const a0 = s * 0.9 + R() * 0.6;
    const ph = R() * 6.28;
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 11; k++) {
      const t = k / 10;
      const ang = a0 + t * 2.4;
      const rad = 0.35 + 1.2 * (0.5 + 0.5 * Math.sin(t * 3.1 + ph));
      const y = Math.max(TRAY_FLOOR + 0.09, TRAY_FLOOR + 0.12 + 0.06 * s + 0.2 * Math.sin(t * 5 + ph));
      pts.push([Math.cos(ang) * rad, y, Math.sin(ang) * rad]);
    }
    strand(n1, pts, 0.085, 0.085, 3);
  }
  const partial = [part(n1, mix(body, [1.0, 0.84, 0.36], 0.45), 0.02, 0.26)];

  // stage 2: glossy wok-tossed ribbons (flattened tubes in a tossed heap) + scallion / chilli bits
  const glaze = okRgb(tint.baseRgb) ? (tint.baseRgb as Rgb) : [0.62, 0.38, 0.18] as Rgb;
  const n2 = mk(), green = mk(), red = mk();
  for (let s = 0; s < 6; s++) {
    const a0 = s * 1.05 + R() * 0.4;
    const ph = R() * 6.28;
    const hgt = 0.75 + 0.35 * R();
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 12; k++) {
      const t = k / 11;
      const ang = a0 + t * 3.0;
      const rad = 1.5 * (1 - 0.5 * t) * (0.8 + 0.2 * Math.sin(t * 7 + ph));
      const y = TRAY_FLOOR + 0.12 + hgt * Math.sin(t * Math.PI) + 0.05 * s;
      pts.push([Math.cos(ang) * rad, y, Math.sin(ang) * rad]);
    }
    strand(n2, pts, 0.16, 0.065, 3);
  }
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2, r = 0.3 + R() * 0.9;
    const tgt = i < 4 ? green : red;
    tgt.box(Math.cos(a) * r, TRAY_FLOOR + 0.75 + R() * 0.35, Math.sin(a) * r, 0.12, 0.045, 0.045, R() * Math.PI, (R() - 0.5) * 0.6);
  }
  const finished = [
    part(n2, lift(mix(body, glaze, 0.36), 0.5), 0.08, 0.12),
    part(green, [0.45, 0.8, 0.32], 0.0, 0.4),
    part(red, [0.94, 0.32, 0.16], 0.02, 0.3),
  ];
  return [raw, partial, finished];
}

// ───────────────────────────── #118 pasta (spaghetti / penne) ─────────────────────────────

function looseStrands(acc: MeshAcc, R: () => number, count: number, rw: number): void {
  for (let s = 0; s < count; s++) {
    const a0 = s * 0.8 + R() * 0.6;
    const ph = R() * 6.28;
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 11; k++) {
      const t = k / 10;
      const ang = a0 + t * 2.9;
      const rad = 0.3 + 1.3 * (0.5 + 0.5 * Math.sin(t * 2.6 + ph));
      const y = Math.max(TRAY_FLOOR + rw, TRAY_FLOOR + 0.1 + 0.05 * s + 0.16 * Math.sin(t * 6 + ph));
      pts.push([Math.cos(ang) * rad, y, Math.sin(ang) * rad]);
    }
    strand(acc, pts, rw, rw, 3);
  }
}

function spaghettiStages(body: Rgb, tint: StarchTint, mk: () => MeshAcc): StarchPart[][] {
  const R = rng(118);
  const sauce = okRgb(tint.reducedRgb) ? (tint.reducedRgb as Rgb) : [0.98, 0.8, 0.35] as Rgb;
  const pool = okRgb(tint.baseRgb) ? (tint.baseRgb as Rgb) : [0.96, 0.9, 0.62] as Rgb;
  // stage 0: uncooked bundle (14 rods, ends fanned) tied with a twine band
  const p0 = mk(), twine = mk();
  const rows = [5, 4, 3, 2];
  const rr = 0.075, step = 0.155;
  let yTop = 0;
  for (let l = 0; l < rows.length; l++) {
    const y = TRAY_FLOOR + rr + l * 0.134;
    yTop = y;
    for (let i = 0; i < rows[l]; i++) {
      const z = (i - (rows[l] - 1) / 2) * step;
      p0.sweep([[-2.05, y, z * 1.35], [0, y, z], [2.05, y, z * 1.35]], [rr, rr, rr], [rr, rr, rr], 4, true);
    }
  }
  const yc = (TRAY_FLOOR + rr + yTop) / 2 + 0.02;
  twine.torus(0, yc, 0, [0, 1, 0], [0, 0, 1], [1, 0, 0], 0.36, 0.05, 0.14, 12, 4);
  const raw = [part(p0, body, 0.0, 0.5), part(twine, [0.82, 0.64, 0.42], 0.0, 0.7)];

  // stage 1: al dente boiled strands (thin, glossy)
  const p1 = mk();
  looseStrands(p1, R, 8, 0.065);
  const partial = [part(p1, mix(body, [1.0, 0.92, 0.6], 0.5), 0.02, 0.22)];

  // stage 2: emulsified twirl nest coated in glossy sauce, sitting in a sauce pool
  const p2 = mk(), poolAcc = mk();
  for (let s = 0; s < 6; s++) {
    const a0 = (s / 6) * Math.PI * 2;
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 14; k++) {
      const t = k / 13;
      const ang = a0 + t * 2.6 * Math.PI;
      const rad = 1.5 * (1 - 0.7 * t) + 0.08 * Math.sin(t * 9 + s);
      const y = TRAY_FLOOR + 0.1 + 0.95 * t * (0.85 + 0.15 * Math.sin(s)) + 0.06 * Math.sin(t * 11 + s);
      pts.push([Math.cos(ang) * rad, y, Math.sin(ang) * rad]);
    }
    strand(p2, pts, 0.07, 0.07, 3);
  }
  poolAcc.disc(0, TRAY_FLOOR + 0.012, 0, 1.95, 16, 0.02);
  const finished = [part(p2, lift(mix(body, sauce, 0.55), 0.45), 0.06, 0.08), part(poolAcc, pool, 0.04, 0.06)];
  return [raw, partial, finished];
}

function penneStages(body: Rgb, tint: StarchTint, mk: () => MeshAcc): StarchPart[][] {
  const R = rng(119);
  const sauce = okRgb(tint.reducedRgb) ? (tint.reducedRgb as Rgb) : [0.94, 0.42, 0.16] as Rgb;
  const pool = okRgb(tint.baseRgb) ? (tint.baseRgb as Rgb) : [0.96, 0.62, 0.3] as Rgb;
  const r = 0.2;
  // stage 0: neat tube array (3 rows x 5), lying along z
  const t0 = mk();
  for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
    tube(t0, (i - 2) * 0.62, TRAY_FLOOR + r, (row - 1) * 1.05, 0, 0, 0.9, r);
  }
  const raw = [part(t0, body, 0.0, 0.5)];
  // stage 1: boiled, swollen tubes in a loose pile
  const t1 = mk();
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2, rr = 0.2 + R() * 1.3;
    const layer = i < 9 ? 0 : 1;
    tube(t1, Math.cos(a) * rr * (layer ? 0.6 : 1), TRAY_FLOOR + 0.23 + layer * 0.4, Math.sin(a) * rr * (layer ? 0.6 : 1), R() * Math.PI, (R() - 0.5) * 0.3, 1.0, 0.22);
  }
  const partial = [part(t1, mix(body, [1.0, 0.9, 0.58], 0.5), 0.02, 0.24)];
  // stage 2: sauced heap in a pool
  const t2 = mk(), poolAcc = mk();
  const rings: [number, number, number][] = [[7, 1.15, 0.23], [5, 0.6, 0.6], [2, 0.18, 0.95]];
  for (const [n, rad, y] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.4;
      tube(t2, Math.cos(a) * rad, TRAY_FLOOR + y, Math.sin(a) * rad, a + Math.PI / 2 + (R() - 0.5) * 0.8, (R() - 0.5) * 0.4, 1.0, 0.22);
    }
  }
  poolAcc.disc(0, TRAY_FLOOR + 0.012, 0, 1.95, 16, 0.02);
  const finished = [part(t2, lift(mix(body, sauce, 0.6), 0.42), 0.06, 0.1), part(poolAcc, lift(pool, 0.4), 0.04, 0.06)];
  return [raw, partial, finished];
}

// ───────────────────────────── #120 dough / flatbread (DISC_SHEET) ─────────────────────────────

function doughStages(body: Rgb, _tint: StarchTint, mk: () => MeshAcc): StarchPart[][] {
  const R = rng(120);
  // stage 0: smooth proofed ball on a flour dusting
  const b0 = mk(), flour = mk();
  rev(b0, [[0.0, TRAY_FLOOR], [0.85, TRAY_FLOOR + 0.01], [1.18, 0.3], [1.3, 0.62], [1.2, 0.98], [0.92, 1.27], [0.5, 1.44], [0.0, 1.48]], 18, 3, 0.02, 0.2);
  flour.disc(0, TRAY_FLOOR + 0.006, 0, 1.75, 14, 0.0);
  const raw = [part(b0, body, 0.0, 0.66), part(flour, [0.99, 0.99, 0.97], 0.0, 0.8)];
  // stage 1: rolled circular sheet (slightly irregular rim)
  const b1 = mk();
  rev(b1, [[0.0, TRAY_FLOOR], [2.05, TRAY_FLOOR], [2.15, 0.17], [2.12, 0.23], [1.9, 0.25], [0.0, 0.26]], 24, 6, 0.025, 0.9);
  const partial = [part(b1, mix(body, [1.0, 0.97, 0.9], 0.3), 0.0, 0.62)];
  // stage 2: puffed flatbread (charred-spot albedo, planar UV) with golden-brown char blisters
  const b2 = mk(), blis = mk();
  const fb: [number, number][] = [[0.0, TRAY_FLOOR], [2.0, TRAY_FLOOR], [2.12, 0.2], [2.0, 0.32], [1.5, 0.5], [0.8, 0.62], [0.0, 0.66]];
  rev(b2, fb, 22, 5, 0.02, 0.3, 0, -1, 2.15);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R() * 0.6;
    const rr = 0.35 + R() * 1.35;
    const y = yAtR(fb, rr, 3, 6);
    const slope = (yAtR(fb, Math.max(0, rr - 0.1), 3, 6) - y) / 0.1;
    blis.dome(Math.cos(a) * rr, y - 0.01, Math.sin(a) * rr, [Math.cos(a) * slope, 1, Math.sin(a) * slope], 0.2 + R() * 0.12, 0.09 + R() * 0.05, 6);
  }
  const finished = [part(b2, [1.0, 1.0, 1.0], 0.0, 0.5, "flatbread"), part(blis, [0.72, 0.44, 0.2], 0.0, 0.48)];
  return [raw, partial, finished];
}

// ───────────────────────────── tray + public builder ─────────────────────────────

function buildTray(mk: () => MeshAcc): StarchPart {
  const t = mk();
  rev(t, [[0.0, 0.0], [2.2, 0.0], [2.42, 0.06], [2.48, 0.3], [2.36, 0.32], [2.2, 0.14], [0.0, TRAY_FLOOR]], 16);
  return part(t, [0.78, 0.72, 0.64], 0.02, 0.36); // warm stoneware (reads apart from the grey plate and white rice)
}

/** Generator for an entry: by catalogue number first, then by starch archetype (#200+ page-fault starches). */
export function starchGenFor(entry: PrepSlotEntry | null): StarchGenId | null {
  if (!entry) return null;
  const n = entry.accessNumber;
  const name = String(entry.name || "").toLowerCase();
  const arch = String(entry.archetype || "");
  const tubeName = /penne|rigatoni|macaroni|ziti|tube/.test(name);
  if (n === 116) return "RICE_MOUND";
  if (n === 117) return "NOODLE_TANGLE";
  if (n === 118) return tubeName || arch === "TUBE_ARRAY" ? "PASTA_PENNE" : "PASTA_SPAGHETTI";
  if (n === 120) return "DOUGH_DISC";
  if (n === 119 || n === 121 || (n >= 101 && n < 200)) return null; // potato / bread cubes = VegGenerators lanes
  if (arch === "TUBE_ARRAY" || tubeName) return "PASTA_PENNE";
  if (arch === "STRAND_TANGLE") return /spaghetti|linguine|pasta|fettuccine/.test(name) ? "PASTA_SPAGHETTI" : "NOODLE_TANGLE";
  if (arch === "DISC_SHEET") return "DOUGH_DISC";
  if (arch === "GRANULAR_MOUND") return "RICE_MOUND";
  return null;
}

const DEFAULT_BODY: { [g: string]: Rgb } = {
  RICE_MOUND: [0.97, 0.95, 0.86],
  NOODLE_TANGLE: [0.95, 0.86, 0.58],
  PASTA_SPAGHETTI: [0.96, 0.84, 0.52],
  PASTA_PENNE: [0.96, 0.84, 0.52],
  DOUGH_DISC: [0.96, 0.9, 0.76],
};

/**
 * Builds the three stage meshes of a starch: { raw, partial, finished } (+ shared tray, tri counts).
 * tint: optional dish sauce colours (rice dum saffron/masala, noodle glaze, pasta sauce). null when no generator.
 */
export function buildStarchStages(entry: PrepSlotEntry, tint?: StarchTint, mk: () => MeshAcc = () => new MeshAcc()): StarchStageSet | null {
  const gen = starchGenFor(entry);
  if (!gen) return null;
  const body = lift(okRgb(entry.colorRgb) ? entry.colorRgb : DEFAULT_BODY[gen], 0.5);
  const t: StarchTint = tint || {};
  let st: StarchPart[][];
  if (gen === "RICE_MOUND") st = riceStages(body, t, mk);
  else if (gen === "NOODLE_TANGLE") st = noodleStages(body, t, mk);
  else if (gen === "PASTA_SPAGHETTI") st = spaghettiStages(body, t, mk);
  else if (gen === "PASTA_PENNE") st = penneStages(body, t, mk);
  else st = doughStages(body, t, mk);
  const tray = buildTray(mk);
  const tris = st.map((ps) => ps.reduce((s, p) => s + p.mesh.triCount(), 0));
  return { gen: gen, accessNumber: entry.accessNumber, raw: st[0], partial: st[1], finished: st[2], tray: tray, tris: tris, trayTris: tray.mesh.triCount() };
}

// ───────────────────────────── materials ─────────────────────────────

const matCache: { [k: string]: Material } = {};
let texRice: Texture | null | undefined = undefined;
let texFlat: Texture | null | undefined = undefined;

function texFor(t: StarchTex): Texture | null {
  if (t === "rice") {
    if (texRice === undefined) {
      try {
        texRice = requireAsset("../Textures/Tex_RiceGrain.png") as Texture;
      } catch (_e) {
        texRice = null;
      }
    }
    return texRice;
  }
  if (t === "flatbread") {
    if (texFlat === undefined) {
      try {
        texFlat = requireAsset("../Textures/Tex_FlatbreadChar.png") as Texture;
      } catch (_e) {
        texFlat = null;
      }
    }
    return texFlat;
  }
  return null;
}

function materialFor(p: StarchPart): Material {
  const key = `${p.tex}|${p.rgb.map((x) => x.toFixed(3)).join(",")}|${p.metal}|${p.rough}`;
  const hit = matCache[key];
  if (hit) return hit;
  const tx = texFor(p.tex);
  let m: Material;
  if (tx) {
    // textured albedo multiplies the tint: grain map is light grey/white, so boost the tint slightly
    const k = p.tex === "rice" ? 1.04 : 1.0;
    m = makeTexturedPbr(tx, p.metal, p.rough, p.rgb[0] * k, p.rgb[1] * k, p.rgb[2] * k);
  } else {
    const fb: Rgb = p.tex === "flatbread" ? [0.93, 0.74, 0.44] : p.rgb;
    m = makePbrMaterial(fb[0], fb[1], fb[2], p.metal, p.rough);
  }
  matCache[key] = m;
  return m;
}

// ───────────────────────────── StarchProp ─────────────────────────────

const STAGE_NAMES = ["Starch_Raw", "Starch_Partial", "Starch_Finished"];
const PART_SUFFIX = ["", "_Accent", "_Detail"];
/** Stage units per second for animated setStage (0 -> 1 takes ~0.65 s). */
const STAGE_RATE = 1.55;

function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/**
 * Scene prop for one starch: StarchProp_<n> (rest tray + three stage children). Rests on SLOT_STARCH.
 * setStage(s, animate) crossfades by scale-swap (outgoing settles down, incoming rises from the pivot);
 * setStageProgress(t) (t in 0..2) drives the same blend continuously for later kinematics (noodle lift/toss, dum layering).
 */
export class StarchProp {
  private host: BaseScriptComponent;
  private root: SceneObject;
  private stageObjs: SceneObject[] = [];
  private set: StarchStageSet;
  private entry: PrepSlotEntry;
  private progress: number = 0;
  private target: number = 0;
  private ev: SceneEvent | null = null;
  private dead: boolean = false;

  constructor(host: BaseScriptComponent, parent: SceneObject, entry: PrepSlotEntry, tint?: StarchTint) {
    const set = buildStarchStages(entry, tint);
    if (!set) throw new Error(`no starch generator for #${entry ? entry.accessNumber : "?"}`);
    this.host = host;
    this.set = set;
    this.entry = entry;
    this.root = global.scene.createSceneObject(`StarchProp_${entry.accessNumber}`);
    this.root.setParent(parent);
    this.placeAtRest();
    this.addPart(this.root, "StarchTray", set.tray);
    const stages = [set.raw, set.partial, set.finished];
    for (let i = 0; i < 3; i++) {
      const so = global.scene.createSceneObject(STAGE_NAMES[i]);
      so.setParent(this.root);
      for (let p = 0; p < stages[i].length && p < PART_SUFFIX.length; p++) {
        if (p === 0) this.attach(so, stages[i][p]);
        else this.addPart(so, STAGE_NAMES[i] + PART_SUFFIX[p], stages[i][p]);
      }
      this.stageObjs.push(so);
    }
    this.apply(0);
    print(`[StarchGen] #${entry.accessNumber} ${entry.name} -> ${set.gen} tris ${set.tris.join("/")} (+tray ${set.trayTris})`);
  }

  private attach(o: SceneObject, p: StarchPart): void {
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = p.mesh.toMesh();
    rmv.mainMaterial = materialFor(p);
  }

  private addPart(parent: SceneObject, name: string, p: StarchPart): void {
    const o = global.scene.createSceneObject(name);
    o.setParent(parent);
    this.attach(o, p);
  }

  /** Root of the prop (StarchProp_<n>), parented to StationsRoot. */
  getObject(): SceneObject {
    return this.root;
  }

  getStageObject(i: number): SceneObject | null {
    return this.stageObjs[i] || null;
  }

  getAccessNumber(): number {
    return this.entry.accessNumber;
  }

  /** Staged-load key used by DISH_ITEM_READY ("starch_116"). */
  getItemKey(): string {
    return `starch_${this.entry.accessNumber}`;
  }

  getGenerator(): StarchGenId {
    return this.set.gen;
  }

  getTriCounts(): number[] {
    return this.set.tris.slice();
  }

  /** Nearest whole stage of the current blend. */
  getStage(): StarchStage {
    return Math.max(0, Math.min(2, Math.round(this.progress))) as StarchStage;
  }

  getStageProgress(): number {
    return this.progress;
  }

  /** Default rest: SLOT_STARCH (StationsRoot cm), tray bottom on the slab. */
  placeAtRest(): void {
    const s = getSlot("SLOT_STARCH");
    const p = toRoot(s);
    const tr = this.root.getTransform();
    tr.setLocalPosition(new vec3(p.x, p.y, p.z));
    tr.setLocalRotation(quat.fromEulerAngles(0, (s.yawDeg * Math.PI) / 180, 0));
  }

  /** Jump (animate = false) or crossfade (default) to a whole stage: 0 raw, 1 par-cooked, 2 finished. */
  setStage(s: StarchStage, animate: boolean = true): void {
    const t = Math.max(0, Math.min(2, Math.round(s)));
    this.target = t;
    if (!animate) {
      this.stopTween();
      this.apply(t);
      return;
    }
    if (Math.abs(t - this.progress) < 1e-4) return;
    if (!this.ev) {
      this.ev = this.host.createEvent("UpdateEvent");
      this.ev.bind(() => this.tick());
    }
    this.ev.enabled = true;
  }

  /** Continuous blend t in [0, 2] (e.g. 0.5 = halfway raw -> par-cooked). Cancels a running crossfade. */
  setStageProgress(t: number): void {
    this.stopTween();
    this.target = Math.max(0, Math.min(2, isFinite(t) ? t : 0));
    this.apply(this.target);
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
    if (this.root && !isNull(this.root)) this.root.destroy();
  }

  private stopTween(): void {
    if (this.ev) this.ev.enabled = false;
  }

  private tick(): void {
    if (this.dead) return;
    const d = this.target - this.progress;
    const step = getDeltaTime() * STAGE_RATE;
    if (Math.abs(d) <= step) {
      this.apply(this.target);
      this.stopTween();
      return;
    }
    this.apply(this.progress + (d > 0 ? step : -step));
  }

  /** Scale-swap blend: stage a fades out (settles flat) while a+1 rises from the bottom pivot. */
  private apply(t: number): void {
    const p = Math.max(0, Math.min(2, t));
    this.progress = p;
    const a = Math.min(1, Math.floor(p));
    const f = p - a;
    for (let i = 0; i < 3; i++) {
      let w = 0;
      if (i === a) w = 1 - smooth01((f - 0.25) / 0.75);
      else if (i === a + 1) w = smooth01(f / 0.75);
      const o = this.stageObjs[i];
      if (!o) continue;
      if (w <= 0.001) {
        o.enabled = false;
        continue;
      }
      o.enabled = true;
      const xz = 0.82 + 0.18 * w;
      o.getTransform().setLocalScale(new vec3(xz, Math.max(0.001, w), xz));
    }
  }
}
