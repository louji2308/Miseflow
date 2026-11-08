/**
 * ShapeRecipeBuilder.ts (v6 Chef Director, W2)
 * Interprets a ShapeRecipe (Cook/ShapeRecipe.ts) onto StationPropsBuilder's MeshAcc and returns a root SceneObject
 * whose children are the pieces:
 *   "Main"     every non-split op (+ the vessel walls / handle), one RenderMeshVisual per used material slot
 *   "Piece_k"  one per instance of a `scatter.split` op (k = 0..n-1 in op order), positioned at its own centre so an
 *              action can lift / toss / recolour each chunk independently (each owns its body material).
 * Deterministic: every random draw comes from a seeded LCG (same recipe -> same mesh, every run).
 * Import cycle note (ToolGenerators.ts:12, PantryGenerators.ts:13): MeshAcc / makePbrMaterial are only touched
 * inside build() at runtime, never at module load, so this file is safe anywhere in the import graph.
 */
import { MeshAcc, makePbrMaterial } from "../StationPropsBuilder";
import {
  ellipsoidRings,
  IRREGULAR_CHICKEN_CHUNKS,
  RgbT,
  sanitizeShapeRecipe,
  SHAPE_RECIPES,
  ShapeOp,
  ShapeRecipe,
  ShapeSlot,
  ShapeVessel,
  torusTube,
} from "./ShapeRecipe";

export interface ShapeColours {
  body: vec3;
  accent?: vec3;
  detail?: vec3;
  doneBody?: vec3;
}

export interface ShapeBuildStats {
  name: string;
  tris: number;
  pieces: number;
  objects: number;
  meshes: number;
}

interface Entry {
  root: SceneObject;
  pieces: SceneObject[];
  bodyMats: Material[]; // aligned with pieces
  from: RgbT;
  to: RgbT;
  stats: ShapeBuildStats;
}

const DEG = Math.PI / 180;
const SLOT_ORDER: ShapeSlot[] = ["body", "accent", "detail"];

// ───────────────────────────── helpers ─────────────────────────────

function makeRng(seed: number): () => number {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function lum(c: RgbT): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
}

function mix(a: RgbT, b: RgbT, t: number): RgbT {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Additive-display floor (same rule as ProteinGenerators.lift): dark colours drift to warm amber, never black. */
function lift(c: RgbT, minLum: number = 0.2): RgbT {
  const l = lum(c);
  if (l >= minLum) return c;
  return mix(c, [1.0, 0.72, 0.45], Math.min(0.6, (minLum - l) / Math.max(0.05, 1 - l)));
}

function toRgb(v: vec3 | undefined): RgbT | undefined {
  if (!v || !isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) return undefined;
  const c = (x: number) => Math.max(0, Math.min(1, x));
  return [c(v.x), c(v.y), c(v.z)];
}

function setColour(m: Material, c: RgbT, glow: number): void {
  m.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
  try {
    (m.mainPass as any).Port_Emissive_N006 = new vec3(c[0] * glow, c[1] * glow, c[2] * glow);
  } catch (_e) {
    // shader without the emissive port
  }
}

function makeMat(c: RgbT, metal: number, rough: number): Material {
  const m = makePbrMaterial(c[0], c[1], c[2], metal, rough);
  setColour(m, c, 0.08);
  return m;
}

// ───────────────────────────── primitives (unit space; MeshAcc.setXform places them) ─────────────────────────────

/**
 * Irregular unit "blob": UV sphere with low-frequency lobes + per-vertex crust noise, pole fans
 * (2 * segs * (rings - 1) tris). amp = 0 gives a smooth sphere. Normals from the displaced surface.
 */
function blob(a: MeshAcc, segs: number, lobes: number, amp: number, R: () => number): void {
  const rings = ellipsoidRings(segs);
  const L = Math.max(1, Math.round(lobes || 2));
  const p1 = R() * 6.283, p2 = R() * 6.283, p3 = R() * 6.283, p4 = R() * 6.283;
  const w1 = 0.5 + 0.5 * R(), w2 = 0.3 + 0.4 * R(), w3 = 0.3 + 0.4 * R();
  const crust = amp * 0.55;
  const P: number[][][] = []; // [row][col] -> xyz
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * Math.PI;
    const st = Math.sin(th), ct = Math.cos(th);
    const row: number[][] = [];
    const cols = j === 0 || j === rings ? 1 : segs;
    const poleNoise = R() - 0.5;
    for (let i = 0; i < cols; i++) {
      const ph = (i / segs) * Math.PI * 2;
      let r = 1 + amp * (w1 * st * Math.cos(L * ph + p1) + w2 * Math.cos(2 * th + p2) + w3 * Math.sin(2 * th) * Math.cos((L + 1) * ph + p3) + 0.25 * Math.cos(3 * th + p4));
      r += crust * (cols === 1 ? poleNoise : R() - 0.5);
      r = Math.max(0.35, r);
      row.push([r * st * Math.cos(ph), r * ct, r * st * Math.sin(ph)]);
    }
    P.push(row);
  }
  const at = (j: number, i: number): number[] => (j === 0 || j === rings ? P[j][0] : P[j][((i % segs) + segs) % segs]);
  const nrm = (j: number, i: number): number[] => {
    const p = at(j, i);
    if (j === 0 || j === rings) return [0, j === 0 ? 1 : -1, 0];
    const a1 = at(j, i + 1), a0 = at(j, i - 1), b1 = at(j + 1, i), b0 = at(j - 1, i);
    const u = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
    const v = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  };
  const top = (() => { const p = P[0][0]; return a.v(p[0], p[1], p[2], 0, 1, 0, 0.5, 0); })();
  const bot = (() => { const p = P[rings][0]; return a.v(p[0], p[1], p[2], 0, -1, 0, 0.5, 1); })();
  const ids: number[][] = [];
  for (let j = 1; j < rings; j++) {
    const row: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const p = at(j, i), n = nrm(j, i);
      row.push(a.v(p[0], p[1], p[2], n[0], n[1], n[2], i / segs, j / rings));
    }
    ids.push(row);
  }
  for (let i = 0; i < segs; i++) {
    a.tri(top, ids[0][i], ids[0][i + 1]);
    a.tri(bot, ids[ids.length - 1][i + 1], ids[ids.length - 1][i]);
  }
  for (let j = 0; j < ids.length - 1; j++) {
    for (let i = 0; i < segs; i++) a.quad(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]);
  }
}

function pairs(pts: number[]): [number, number][] {
  const o: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) o.push([pts[i], pts[i + 1]]);
  return o;
}

/** Emits one instance of an op (already placed with setXform). */
function emitOp(a: MeshAcc, o: ShapeOp, R: () => number): void {
  const s = o.segs || 8;
  const pts = o.pts || [];
  switch (o.op) {
    case "ELLIPSOID":
      blob(a, s, o.lobes || 0, o.amp || 0, R);
      break;
    case "LATHE":
      a.lathe(pairs(pts), s, Math.round(o.lobes || 0), o.amp || 0);
      break;
    case "SWEEP": {
      const c: [number, number, number][] = [];
      const rr: number[] = [];
      for (let i = 0; i + 3 < pts.length; i += 4) {
        c.push([pts[i], pts[i + 1], pts[i + 2]]);
        rr.push(pts[i + 3]);
      }
      a.sweep(c, rr, rr, s, true);
      break;
    }
    case "TORUS": {
      const t = o.amp && o.amp > 0 ? o.amp : 0.18;
      a.torus(0, 0, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 1, t, t, s, torusTube(s));
      break;
    }
    case "BOX":
      a.box(0, 0, 0, 1, 1, 1);
      break;
    case "DISC":
      a.disc(0, 0, 0, 1, s, o.amp || 0);
      break;
    case "DOME":
      a.dome(0, 0, 0, [0, 1, 0], 1, 1, s);
      break;
  }
}

interface Inst {
  pos: number[];
  rot: number[]; // radians yaw, pitch, roll
  scale: number[];
}

/** Instance frames for an op (1 when not scattered). Deterministic per scatter seed. */
function instances(o: ShapeOp, R: () => number): Inst[] {
  const p = o.pos, r = o.rot || [0, 0, 0], s = o.scale;
  const sc = o.scatter;
  if (!sc || sc.count <= 1) return [{ pos: [p[0], p[1], p[2]], rot: [r[0] * DEG, r[1] * DEG, r[2] * DEG], scale: [s[0], s[1], s[2]] }];
  const n = sc.count;
  const out: Inst[] = [];
  const spread = sc.split ? 0.3 : 0.18;
  const phase = R() * 6.283;
  for (let i = 0; i < n; i++) {
    const k = 1 - spread + 2 * spread * R();
    const ks = [k * (0.9 + 0.2 * R()), k * (0.9 + 0.2 * R()), k * (0.9 + 0.2 * R())];
    const scale = [s[0] * ks[0], s[1] * ks[1], s[2] * ks[2]];
    let x = 0, z = 0, yaw = 0, pitch = r[1] * DEG * (2 * R() - 1), roll = r[2] * DEG * (2 * R() - 1);
    let dNorm = 0;
    if (sc.pattern === "LINE") {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const side = i % 2 === 0 ? 1 : -1;
      // Ry(yaw) maps +X to (cos, 0, -sin): +yaw leans to -Z, -yaw to +Z, both still pointing forward along +X
      yaw = side * r[0] * DEG + (R() - 0.5) * 0.25;
      const dx = Math.cos(yaw), dz = -Math.sin(yaw);
      x = -sc.jitter + 2 * sc.jitter * t + dx * scale[0] * 0.95;
      z = dz * scale[0] * 0.95;
      dNorm = Math.abs(2 * t - 1);
    } else if (sc.pattern === "RING") {
      const ang = (i / n) * Math.PI * 2 + phase;
      x = Math.cos(ang) * sc.jitter;
      z = -Math.sin(ang) * sc.jitter;
      yaw = ang + r[0] * DEG;
      dNorm = 1;
    } else {
      const rad = sc.jitter * Math.sqrt((i + 0.5) / n);
      const ang = i * 2.39996 + phase;
      const wob = (sc.jitter / Math.sqrt(n)) * 0.3;
      x = Math.cos(ang) * rad + (R() - 0.5) * wob;
      z = Math.sin(ang) * rad + (R() - 0.5) * wob;
      yaw = r[0] * DEG + R() * Math.PI * 2;
      dNorm = sc.jitter > 0 ? Math.min(1, Math.hypot(x, z) / sc.jitter) : 0;
    }
    const y = p[1] + (sc.heap || 0) * s[1] * Math.max(0, 1 - dNorm) * (0.8 + 0.4 * R());
    out.push({ pos: [p[0] + x, y, p[2] + z], rot: [yaw, pitch, roll], scale: scale });
  }
  return out;
}

/** Vessel walls (outer + lip + inner + floor in ONE lathe) and handle sweeps. */
function emitVessel(body: MeshAcc, accent: MeshAcc, v: ShapeVessel): void {
  const prof = v.profile;
  let maxR = 0;
  for (const q of prof) maxR = Math.max(maxR, q[0]);
  const t = Math.max(0.25, Math.min(0.8, maxR * 0.06));
  const outer: [number, number][] = prof.map((q) => [q[0], q[1]] as [number, number]);
  const inner: [number, number][] = [];
  for (let j = 0; j < outer.length; j++) {
    const a = outer[Math.max(0, j - 1)], b = outer[Math.min(outer.length - 1, j + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = dy / l, ny = -dx / l; // outward
    inner.push([Math.max(0.05, outer[j][0] - nx * t), outer[j][1] - ny * t]);
  }
  inner[0][1] = Math.max(inner[0][1], outer[0][1] + t);
  inner[inner.length - 1][1] = outer[outer.length - 1][1];
  const full: [number, number][] = [];
  if (v.floor) full.push([0, outer[0][1]]);
  for (const q of outer) full.push(q);
  for (let j = inner.length - 1; j >= 0; j--) full.push(inner[j]);
  if (v.floor) full.push([0, inner[0][1]]);
  body.clearXform();
  body.lathe(full, v.segs);

  const top = outer[outer.length - 1];
  const rT = top[0], yT = top[1];
  accent.clearXform();
  if (v.handle === "LONG") {
    accent.sweep([[rT * 0.96, yT * 0.78, 0], [rT + 5, yT * 0.9 + 0.6, 0], [rT + 10, yT + 1.4, 0], [rT + 15, yT + 2.1, 0]], [0.55, 0.5, 0.55, 0.62], [0.45, 0.42, 0.45, 0.5], 6, true);
  } else if (v.handle === "TWIN" || v.handle === "LOOP") {
    const sides = v.handle === "TWIN" ? [1, -1] : [1];
    const yc = yT * 0.72, rr = Math.max(1.1, Math.min(2.4, rT * 0.16));
    for (const sd of sides) {
      const c: [number, number, number][] = [];
      for (let k = 0; k < 5; k++) {
        const ang = -Math.PI / 2 + (k / 4) * Math.PI;
        c.push([sd * (rT - 0.1 + rr * Math.cos(ang)), yc + rr * Math.sin(ang), 0]);
      }
      accent.sweep(c, [0.3, 0.3, 0.3, 0.3, 0.3], [0.3, 0.3, 0.3, 0.3, 0.3], 5, true);
    }
  }
}

// ───────────────────────────── builder ─────────────────────────────

export class ShapeRecipeBuilder {
  private static entries: Entry[] = [];

  /**
   * Build a recipe (sanitized again here, so raw AI output is fine). colours override recipe.palette; every colour
   * passes lift() (additive display). Returns the root; children = "Main" and/or "Piece_k".
   */
  static build(recipe: ShapeRecipe | any, colours?: ShapeColours | null, name?: string, parent?: SceneObject): SceneObject {
    const r = sanitizeShapeRecipe(recipe) || (sanitizeShapeRecipe(IRREGULAR_CHICKEN_CHUNKS) as ShapeRecipe);
    const pal = r.palette;
    const body0 = toRgb(colours ? colours.body : undefined) || (pal ? pal.body : [0.86, 0.72, 0.56]);
    const body = lift(body0, 0.2);
    const accent = lift(toRgb(colours ? colours.accent : undefined) || (pal && pal.accent) || mix(body0, [1, 1, 1], 0.35), 0.2);
    const detail = lift(toRgb(colours ? colours.detail : undefined) || (pal && pal.detail) || mix(body0, [0.45, 0.22, 0.08], 0.45), 0.14);
    const done = lift(toRgb(colours ? colours.doneBody : undefined) || (pal && pal.doneBody) || mix(body0, [0.62, 0.32, 0.12], 0.6), 0.16);
    const rough = r.rough !== undefined ? r.rough : 0.45, metal = r.metal !== undefined ? r.metal : 0.02;

    const root = global.scene.createSceneObject(name || r.name || "Shape");
    if (parent) root.setParent(parent);
    const sharedMats: { [k: string]: Material } = {
      body: makeMat(body, metal, rough),
      accent: makeMat(accent, metal * 0.6, Math.min(1, rough + 0.05)),
      detail: makeMat(detail, 0.0, Math.min(1, rough + 0.1)),
    };

    const mainAccs: { [k: string]: MeshAcc } = { body: new MeshAcc(), accent: new MeshAcc(), detail: new MeshAcc() };
    const split: { center: number[]; accs: { [k: string]: MeshAcc } }[] = [];
    if (r.vessel) emitVessel(mainAccs.body, mainAccs.accent, r.vessel);

    for (let oi = 0; oi < r.ops.length; oi++) {
      const o = r.ops[oi];
      const seed = o.scatter ? o.scatter.seed : 101 + oi * 17;
      const R = makeRng(seed * 7 + oi * 131 + 1);
      const insts = instances(o, R);
      const isSplit = !!(o.scatter && o.scatter.split);
      for (const ins of insts) {
        let accs = mainAccs;
        let px = ins.pos[0], py = ins.pos[1], pz = ins.pos[2];
        if (isSplit) {
          accs = { body: new MeshAcc(), accent: new MeshAcc(), detail: new MeshAcc() };
          split.push({ center: [px, py, pz], accs: accs });
          px = 0; py = 0; pz = 0;
        }
        const a = accs[o.slot] || accs.body;
        a.setXform(px, py, pz, ins.rot[0], ins.rot[1], ins.rot[2], ins.scale[0], ins.scale[1], ins.scale[2]);
        emitOp(a, o, R);
        a.clearXform();
      }
    }

    const pieces: SceneObject[] = [];
    const bodyMats: Material[] = [];
    let tris = 0, meshes = 0;
    const attach = (o: SceneObject, accs: { [k: string]: MeshAcc }, mats: { [k: string]: Material }) => {
      for (const k of SLOT_ORDER) {
        const acc = accs[k];
        if (!acc || acc.triCount() === 0) continue;
        const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        rmv.mesh = acc.toMesh();
        rmv.mainMaterial = mats[k];
        tris += acc.triCount();
        meshes++;
      }
    };
    const hasMain = mainAccs.body.triCount() + mainAccs.accent.triCount() + mainAccs.detail.triCount() > 0;
    if (hasMain) {
      const m = global.scene.createSceneObject("Main");
      m.setParent(root);
      attach(m, mainAccs, sharedMats);
      pieces.push(m);
      bodyMats.push(sharedMats.body);
    }
    for (let k = 0; k < split.length; k++) {
      const sp = split[k];
      const o = global.scene.createSceneObject("Piece_" + k);
      o.setParent(root);
      o.getTransform().setLocalPosition(new vec3(sp.center[0], sp.center[1], sp.center[2]));
      const own = sharedMats.body.clone();
      attach(o, sp.accs, { body: own, accent: sharedMats.accent, detail: sharedMats.detail });
      pieces.push(o);
      bodyMats.push(own);
    }
    const stats: ShapeBuildStats = { name: r.name, tris: tris, pieces: pieces.length, objects: 1 + pieces.length, meshes: meshes };
    ShapeRecipeBuilder.entries.push({ root: root, pieces: pieces, bodyMats: bodyMats, from: body, to: done, stats: stats });
    if (ShapeRecipeBuilder.entries.length > 256) ShapeRecipeBuilder.entries.shift();
    return root;
  }

  private static find(root: SceneObject): Entry | null {
    for (const e of ShapeRecipeBuilder.entries) if (e.root === root) return e;
    return null;
  }

  /** Stats of a root returned by build() (null if unknown). */
  static statsOf(root: SceneObject): ShapeBuildStats | null {
    const e = ShapeRecipeBuilder.find(root);
    return e ? e.stats : null;
  }

  /** Pieces in build order: "Main" first (if any), then "Piece_0..n". */
  static getPieces(root: SceneObject): SceneObject[] {
    const e = ShapeRecipeBuilder.find(root);
    return e ? e.pieces.slice() : [];
  }

  /** Split pieces only ("Piece_k"), e.g. chicken chunks for batch frying. */
  static getSplitPieces(root: SceneObject): SceneObject[] {
    return ShapeRecipeBuilder.getPieces(root).filter((p) => p.name.indexOf("Piece_") === 0);
  }

  /**
   * Lerp body colour raw -> doneBody (t 0..1). `pieceIdx` indexes getPieces(); omitted = all pieces.
   * Split pieces own their material, so batch 1 can fry golden while batch 2 stays raw.
   */
  static setDoneness(root: SceneObject, t: number, pieceIdx?: number[]): void {
    const e = ShapeRecipeBuilder.find(root);
    if (!e) return;
    const k = Math.max(0, Math.min(1, t));
    const c = mix(e.from, e.to, k);
    const idx = pieceIdx || e.bodyMats.map((_m, i) => i);
    for (const i of idx) if (e.bodyMats[i]) setColour(e.bodyMats[i], c, 0.08 + 0.06 * k);
  }

  /**
   * Debug / test gallery: builds every SHAPE_RECIPES entry once, laid out in rows of `perRow` along +X starting at
   * `origin` (cm), `spacing` cm apart, uniformly scaled by `scale`. Returns the roots in SHAPE_RECIPES order.
   */
  static buildGallery(origin: vec3, spacing: number = 34, perRow: number = 11, scale: number = 1, parent?: SceneObject): SceneObject[] {
    const out: SceneObject[] = [];
    const ids = Object.keys(SHAPE_RECIPES);
    const rows = Math.ceil(ids.length / perRow);
    for (let i = 0; i < ids.length; i++) {
      const row = Math.floor(i / perRow), col = i % perRow;
      const inRow = Math.min(perRow, ids.length - row * perRow);
      const root = ShapeRecipeBuilder.build(SHAPE_RECIPES[ids[i]], null, "Gallery_" + ids[i], parent);
      const t = root.getTransform();
      t.setLocalPosition(new vec3(origin.x + (col - (inRow - 1) / 2) * spacing * scale, origin.y, origin.z + (row - (rows - 1) / 2) * spacing * scale));
      t.setLocalScale(new vec3(scale, scale, scale));
      out.push(root);
    }
    return out;
  }

  /** Destroy a built root and forget it. */
  static destroy(root: SceneObject): void {
    const list = ShapeRecipeBuilder.entries;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].root === root) list.splice(i, 1);
    if (root && !(root as any).isDestroyed) root.destroy();
  }
}
