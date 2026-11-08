/**
 * CookProps.ts  (Chef Director v6, W3: geometry + materials for the dynamic Cook bench)
 *
 * Everything here is authored in bench centimetres, bottom-centre pivot, additive-display safe colours (lift()).
 *  - materials: shared hardware materials (lazy) + per-item paintable materials
 *  - own low-poly meshes for the catalogue pieces whose builders are private to the legacy stations
 *    (#301 skillet, #304 saucier, #325 prep bowl, #341 coupe plate, #331 spatula, #321 knife) and copies of the
 *    #334/#335/#336 tool recipes (ToolGenerators.buildToolMesh is module-private)
 *  - makeFallbackProp(kind, colour): the ONE entry point for shapes the catalogue does not have (board, rolling pin,
 *    skimmer, spoon, brush, curry leaves, lemon wedge, flour dish, dough ball, flatbread, irregular protein chunks...).
 *    W2's ShapeRecipeBuilder replaces it through shapeProp() in CookStage (one-line swap).
 * StationPropsBuilder exports are only touched inside functions (never at module load), like ToolGenerators does,
 * so the MeshAcc import cycle noted in ToolGenerators.ts:12 can never bite.
 */
import { MeshAcc, makePbrMaterial, makeTexturedPbr } from "../StationPropsBuilder";

const TEX_SLAB = requireAsset("../../Textures/Tex_SlabBrushed.png") as Texture;
const TEX_ENDGRAIN = requireAsset("../../Textures/Tex_EndGrainWood.png") as Texture;
const TEX_CAST_IRON = requireAsset("../../Textures/Tex_CastIron.png") as Texture;

export const DEG = Math.PI / 180;
export type Rgb3 = number[];

// ───────────────────────────── colour helpers ─────────────────────────────

export function okRgb(c: any): boolean {
  return !!c && c.length >= 3 && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lum(c: Rgb3): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
}

export function mixRgb(a: Rgb3, b: Rgb3, t: number): Rgb3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Additive-display floor (same idea as ProteinGenerators.lift): dark colours drift toward warm amber, never black. */
export function lift(c: any, minLum: number = 0.2, fallback: Rgb3 = [0.8, 0.8, 0.8]): Rgb3 {
  const v: Rgb3 = okRgb(c) ? [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])] : [fallback[0], fallback[1], fallback[2]];
  const l = lum(v);
  if (l >= minLum) return v;
  return mixRgb(v, [1.0, 0.72, 0.45], Math.min(0.6, (minLum - l) / Math.max(0.05, 1 - l)));
}

export function lighten(c: Rgb3, k: number): Rgb3 {
  return [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
}

export function setEmissive(m: Material, c: Rgb3, k: number): void {
  try {
    (m.mainPass as any).Port_Emissive_N006 = new vec3(c[0] * k, c[1] * k, c[2] * k);
  } catch (_e) {
    // shader without the emissive port: the bright base colour still reads on the additive display
  }
}

/** Opaque per-item material (cloned, so paint() never leaks into another item). */
export function itemMat(c: any, rough: number = 0.5, metal: number = 0.0, emi: number = 0.14): Material {
  const l = lift(c);
  const m = makePbrMaterial(l[0], l[1], l[2], metal, rough);
  setEmissive(m, l, emi);
  return m;
}

/** ItemHandle.paint backend: colour is already lifted by the caller (ItemState), we only floor it again. */
export function paintMat(m: Material, color: vec3, rough01: number, emissive01: number): void {
  const c = lift([color.x, color.y, color.z], 0.12);
  m.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
  try {
    (m.mainPass as any).roughness = clamp01(rough01);
  } catch (_e) {
    // no roughness port
  }
  setEmissive(m, c, 0.08 + 0.6 * clamp01(emissive01));
}

const shared: { [k: string]: Material } = {};

/** Shared hardware materials (created on first use). */
export function hwMat(key: string): Material {
  if (shared[key]) return shared[key];
  let m: Material;
  switch (key) {
    case "slab": m = makeTexturedPbr(TEX_SLAB, 0.35, 0.28, 1.44, 1.42, 1.43); break; // mid-grey brushed slab (legacy MAT_SLAB)
    case "steel": m = makePbrMaterial(0.86, 0.88, 0.92, 0.7, 0.26); setEmissive(m, [0.1, 0.1, 0.11], 1); break;
    case "chrome": m = makePbrMaterial(0.93, 0.94, 0.96, 0.62, 0.17); break;
    case "iron": m = makeTexturedPbr(TEX_CAST_IRON, 0.55, 0.4, 1.5, 1.46, 1.42); setEmissive(m, [0.09, 0.085, 0.08], 1); break;
    case "wood": m = makePbrMaterial(0.62, 0.4, 0.22, 0.02, 0.55); break;
    case "woodLight": m = makePbrMaterial(0.86, 0.66, 0.42, 0.0, 0.6); setEmissive(m, [0.86, 0.66, 0.42], 0.08); break;
    case "endgrain": m = makeTexturedPbr(TEX_ENDGRAIN, 0.0, 0.62); break;
    case "ceramic": m = makePbrMaterial(0.9, 0.9, 0.88, 0.02, 0.4); setEmissive(m, [0.9, 0.9, 0.88], 0.06); break;
    case "ceramicRim": m = makePbrMaterial(0.56, 0.6, 0.66, 0.05, 0.45); break;
    case "ramekin": m = makePbrMaterial(0.93, 0.91, 0.86, 0.0, 0.2); break;
    case "glassCup": m = makePbrMaterial(0.78, 0.86, 0.92, 0.1, 0.12); setEmissive(m, [0.78, 0.86, 0.92], 0.08); break;
    case "bamboo": m = makePbrMaterial(0.9, 0.72, 0.4, 0.0, 0.5); break;
    case "bambooDark": m = makePbrMaterial(0.7, 0.48, 0.24, 0.0, 0.5); break;
    case "bristle": m = makePbrMaterial(0.96, 0.9, 0.7, 0.0, 0.8); break;
    case "polymer": m = makePbrMaterial(0.32, 0.36, 0.42, 0.1, 0.4); setEmissive(m, [0.32, 0.36, 0.42], 0.1); break;
    default: m = makePbrMaterial(0.8, 0.8, 0.8, 0.2, 0.4);
  }
  shared[key] = m;
  return m;
}

// ───────────────────────────── scene helpers ─────────────────────────────

export function newObj(name: string, parent: SceneObject | null): SceneObject {
  const o = global.scene.createSceneObject(name);
  if (parent) o.setParent(parent);
  return o;
}

export function meshObj(parent: SceneObject | null, name: string, acc: MeshAcc, mat: Material): SceneObject {
  const o = newObj(name, parent);
  const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  rmv.mesh = acc.toMesh();
  rmv.mainMaterial = mat;
  return o;
}

/** Deterministic PRNG (same LCG as the legacy generators). */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Collect every RenderMeshVisual under o (o included). */
export function collectRmvs(o: SceneObject, out: RenderMeshVisual[] = []): RenderMeshVisual[] {
  const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  if (r) out.push(r);
  for (let i = 0; i < o.getChildrenCount(); i++) collectRmvs(o.getChild(i), out);
  return out;
}

export function findChild(o: SceneObject, name: string): SceneObject | null {
  if (o.name === name) return o;
  for (let i = 0; i < o.getChildrenCount(); i++) {
    const f = findChild(o.getChild(i), name);
    if (f) return f;
  }
  return null;
}

/** Scene objects + triangles (enabled render meshes) under o. */
export function countTree(o: SceneObject): { objects: number; tris: number } {
  let objects = 1;
  let tris = 0;
  const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  if (r && r.mesh && o.enabled) {
    try {
      tris += Math.floor(r.mesh.getIndexBuffer().length / 3);
    } catch (_e) {
      // mesh without readable indices
    }
  }
  for (let i = 0; i < o.getChildrenCount(); i++) {
    const c = countTree(o.getChild(i));
    objects += c.objects;
    if (o.enabled) tris += c.tris;
  }
  return { objects, tris };
}

// ───────────────────────────── bench slab + burner arcs ─────────────────────────────

/** Rounded, bevelled slab (same construction as the legacy counter, fewer segments). */
export function slabMesh(hx: number, hz: number, top: number, bottom: number, cr: number, br: number): MeshAcc {
  const acc = new MeshAcc();
  const CS = 6;
  const BS = 3;
  const per: { x: number; z: number; nx: number; nz: number }[] = [];
  const corners = [
    { cx: hx - cr, cz: hz - cr, a0: 0 },
    { cx: hx - cr, cz: -(hz - cr), a0: 270 },
    { cx: -(hx - cr), cz: -(hz - cr), a0: 180 },
    { cx: -(hx - cr), cz: hz - cr, a0: 90 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= CS; i++) {
      const a = ((c.a0 + 90 - (90 * i) / CS) * Math.PI) / 180;
      const nx = Math.cos(a), nz = Math.sin(a);
      per.push({ x: c.cx + nx * cr, z: c.cz + nz * cr, nx, nz });
    }
  }
  const prof: { d: number; y: number; h: number; vy: number }[] = [];
  for (let j = 0; j <= BS; j++) {
    const phi = (j / BS) * (Math.PI / 2);
    prof.push({ d: br - br * Math.sin(phi), y: top - br + br * Math.cos(phi), h: Math.sin(phi), vy: Math.cos(phi) });
  }
  prof.push({ d: 0, y: bottom, h: 1, vy: 0 });
  const P = prof.length;
  const N = per.length;
  const ring = acc.count();
  for (let i = 0; i < N; i++) {
    const p = per[i];
    for (let j = 0; j < P; j++) {
      const q = prof[j];
      const x = p.x - p.nx * q.d;
      const z = p.z - p.nz * q.d;
      acc.v(x, q.y, z, p.nx * q.h, q.vy, p.nz * q.h, x / (2 * hx) + 0.5, j <= BS ? z / (2 * hz) + 0.5 : 0.02 + (top - q.y) * 0.05);
    }
  }
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let j = 0; j < P - 1; j++) acc.quad(ring + i * P + j, ring + i2 * P + j, ring + i2 * P + j + 1, ring + i * P + j + 1);
  }
  const c = acc.v(0, top, 0, 0, 1, 0, 0.5, 0.5);
  for (let i = 0; i < N; i++) acc.tri(c, ring + i * P, ring + ((i + 1) % N) * P);
  return acc;
}

/** Legacy burner-arc look (StationPropsBuilder sear arcs) scaled to a vessel radius. */
export function burnerArcMesh(r: number): MeshAcc {
  const a = new MeshAcc();
  const R = [r * 1.06, r * 1.2, r * 1.25];
  for (let k = 0; k < 6; k++) a.arc(0, 0, 0, R[0], 0.11, k * 60 + 4, k * 60 + 56, 6);
  for (const [a0, a1] of [[-40, 60], [140, 240]]) a.arc(0, 0, 0, R[1], 0.07, a0, a1, 12);
  for (const [a0, a1] of [[70, 110], [250, 290]]) a.arc(0, 0, 0, R[2], 0.15, a0, a1, 6);
  return a;
}

// ───────────────────────────── own vessel meshes (cm) ─────────────────────────────

export interface OwnVessel {
  root: SceneObject;
  rimY: number;
  rimR: number;
  floorY: number;
  floorR: number;
  /** inner wall as [y, r] bottom -> top (fill / oil disc radius) */
  inner: [number, number][];
  /** handle direction in the root's local frame (deg, 0 = +X toward +Z) or NaN */
  handleDeg: number;
  handleLen: number;
}

function handleSweep(acc: MeshAcc, deg: number, r0: number, r1: number, y0: number, y1: number, w: number, h: number): void {
  const d = [Math.cos(deg * DEG), Math.sin(deg * DEG)];
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const r = r0 + (r1 - r0) * t;
    pts.push([d[0] * r, y0 + (y1 - y0) * t, d[1] * r]);
  }
  acc.sweep(pts, pts.map((_p, i) => w * (i === 0 ? 1.1 : 1)), pts.map(() => h), 8, true);
}

/** #301 cast-iron skillet (r 6 cm), long handle at 180 deg local. */
export function buildSkillet(name: string): OwnVessel {
  const root = newObj(name, null);
  const body = new MeshAcc();
  body.lathe([[0, 0], [5.2, 0.02], [5.65, 0.3], [6.0, 1.9], [6.15, 2.06], [5.95, 2.1], [5.62, 0.66], [5.1, 0.44], [0, 0.42]], 24);
  meshObj(root, name + "_Body", body, hwMat("iron"));
  const h = new MeshAcc();
  handleSweep(h, 180, 5.9, 14.5, 1.8, 2.7, 0.55, 0.3);
  meshObj(root, name + "_Handle", h, hwMat("iron"));
  return { root, rimY: 2.08, rimR: 6.0, floorY: 0.44, floorR: 5.1, inner: [[0.42, 0], [0.44, 5.1], [0.66, 5.62], [2.1, 5.95]], handleDeg: 180, handleLen: 8.6 };
}

/** #304 tri-ply saucier (r 4 cm), long handle at 180 deg local. */
export function buildSaucepan(name: string, scale: number = 1): OwnVessel {
  const s = scale;
  const root = newObj(name, null);
  const body = new MeshAcc();
  const prof: [number, number][] = [[0, 0], [3.5, 0.02], [3.95, 0.35], [4.05, 2.4], [4.0, 4.3], [4.22, 4.52], [4.06, 4.58], [3.84, 4.3], [3.85, 2.4], [3.78, 0.44], [0, 0.4]];
  body.lathe(prof.map(([r, y]) => [r * s, y * s] as [number, number]), 24);
  meshObj(root, name + "_Body", body, hwMat("steel"));
  const h = new MeshAcc();
  handleSweep(h, 180, 3.9 * s, 12.5 * s, 3.9 * s, 4.9 * s, 0.42 * s, 0.22 * s);
  meshObj(root, name + "_Handle", h, hwMat("steel"));
  return {
    root, rimY: 4.55 * s, rimR: 4.06 * s, floorY: 0.44 * s, floorR: 3.78 * s,
    inner: [[0.4 * s, 0], [0.44 * s, 3.78 * s], [2.4 * s, 3.85 * s], [4.3 * s, 3.84 * s]], handleDeg: 180, handleLen: 8.6 * s,
  };
}

/** #325 stainless prep / mixing bowl of rim radius R. */
export function buildBowl(name: string, R: number): OwnVessel {
  const root = newObj(name, null);
  const p: [number, number][] = [[0, 0], [0.5, 0], [0.58, 0.04], [0.84, 0.25], [0.97, 0.52], [1.0, 0.6], [0.96, 0.62], [0.92, 0.55], [0.8, 0.3], [0.55, 0.11], [0, 0.09]];
  const a = new MeshAcc();
  a.lathe(p.map(([r, y]) => [r * R, y * R] as [number, number]), 24);
  meshObj(root, name + "_Body", a, hwMat("steel"));
  return {
    root, rimY: 0.62 * R, rimR: R, floorY: 0.1 * R, floorR: 0.55 * R,
    inner: [[0.09 * R, 0], [0.11 * R, 0.55 * R], [0.3 * R, 0.8 * R], [0.55 * R, 0.92 * R], [0.62 * R, 0.96 * R]], handleDeg: NaN, handleLen: 0,
  };
}

/** #341 matte stoneware coupe plate of rim radius R. */
export function buildPlate(name: string, R: number): OwnVessel {
  const root = newObj(name, null);
  const k = R / 5.6;
  const p: [number, number][] = [[0, 0], [2.8, 0], [3.0, 0.1], [4.6, 0.36], [5.6, 0.76], [5.55, 0.84], [4.5, 0.52], [3.0, 0.3], [0, 0.27]];
  const a = new MeshAcc();
  a.lathe(p.map(([r, y]) => [r * k, y] as [number, number]), 24);
  meshObj(root, name + "_Body", a, hwMat("ceramic"));
  const rim = new MeshAcc();
  rim.torus(0, 0.8, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 5.56 * k, 0.06, 0.05, 24, 3);
  meshObj(root, name + "_Rim", rim, hwMat("ceramicRim"));
  return { root, rimY: 0.8, rimR: 5.6 * k, floorY: 0.3, floorR: 3.0 * k, inner: [[0.27, 0], [0.3, 3.0 * k], [0.52, 4.5 * k], [0.84, 5.5 * k]], handleDeg: NaN, handleLen: 0 };
}

// ───────────────────────────── tools (tool frame: working tip at the origin, handle along +X, lying on y = 0) ─────────────────────────────

export interface ToolBuild {
  root: SceneObject;
  tipLocal: vec3;
  /** length along +X, cm */
  length: number;
  /** half width across Z, cm */
  halfWidth: number;
}

function chain(pts: [number, number, number][], r: number[], rh: number[], segs: number): MeshAcc {
  const a = new MeshAcc();
  a.sweep(pts, r, rh, segs, true);
  return a;
}

/** #331 turner spatula (own copy of the look; the legacy SpatulaProp builder is private). */
export function buildSpatula(name: string): ToolBuild {
  const root = newObj(name, null);
  const head = new MeshAcc();
  head.box(1.5, 0.08, 0, 1.5, 0.06, 1.15);
  for (const z of [-0.55, 0, 0.55]) head.box(1.6, 0.15, z, 1.0, 0.012, 0.09);
  meshObj(root, name + "_Head", head, hwMat("steel"));
  meshObj(root, name + "_Neck", chain([[2.9, 0.1, 0], [4.4, 0.55, 0], [5.8, 0.85, 0]], [0.32, 0.22, 0.2], [0.07, 0.07, 0.07], 6), hwMat("steel"));
  meshObj(root, name + "_Grip", chain([[5.6, 0.85, 0], [8.0, 0.9, 0], [10.5, 0.9, 0], [12.6, 0.88, 0]], [0.32, 0.4, 0.4, 0.32], [0.3, 0.36, 0.36, 0.3], 8), hwMat("wood"));
  return { root, tipLocal: new vec3(1.2, 0.1, 0), length: 12.6, halfWidth: 1.2 };
}

/** #321 santoku-style knife (blade edge along +X from the tip). */
export function buildKnife(name: string): ToolBuild {
  const root = newObj(name, null);
  const blade = new MeshAcc();
  blade.sweep([[0, 0.95, 0], [1.2, 0.85, 0], [3.0, 0.82, 0], [5.0, 0.84, 0], [6.6, 0.86, 0]], [0.02, 0.04, 0.05, 0.06, 0.07], [0.12, 0.62, 0.8, 0.84, 0.84], 4, true);
  meshObj(root, name + "_Blade", blade, hwMat("chrome"));
  meshObj(root, name + "_Grip", chain([[6.5, 0.9, 0], [8.2, 0.9, 0], [10.0, 0.9, 0], [11.2, 0.92, 0]], [0.32, 0.36, 0.38, 0.34], [0.42, 0.48, 0.5, 0.46], 8), hwMat("wood"));
  return { root, tipLocal: new vec3(3.0, 0.1, 0), length: 11.2, halfWidth: 0.6 };
}

/** #335 tongs / #334 chopsticks / #336 whisk: same recipes as ToolGenerators.buildToolMesh (module-private there). */
export function buildCatalogueTool(kind: "tongs" | "chopsticks" | "whisk", name: string, scale: number): ToolBuild {
  const root = newObj(name, null);
  const body = newObj(name + "_Body", root);
  body.getTransform().setLocalScale(new vec3(scale, scale, scale));
  let len = 18;
  let hw = 1.0;
  if (kind === "chopsticks") {
    for (const sg of [-1, 1]) {
      const c: [number, number, number][] = [[0, 0.2, sg * 0.18], [6, 0.2, sg * 0.32], [12, 0.2, sg * 0.42], [18, 0.2, sg * 0.5]];
      const w = [0.1, 0.14, 0.18, 0.2];
      meshObj(body, sg < 0 ? name + "_A" : name + "_B", chain(c, w, w, 6), hwMat(sg < 0 ? "bamboo" : "bambooDark"));
    }
    hw = 0.7;
  } else if (kind === "tongs") {
    const arms = new MeshAcc();
    for (const sg of [-1, 1]) {
      const c: [number, number, number][] = [[0, 0.3, sg * 0.3], [4, 0.3, sg * 0.55], [9, 0.3, sg * 0.9], [14, 0.3, sg * 0.7], [18, 0.3, sg * 0.15]];
      arms.sweep(c, c.map(() => 0.28), c.map(() => 0.12), 8, true);
    }
    for (const sg of [-1, 1]) arms.ellipsoid(0.9, 0.28, sg * 0.55, 1.1, 0.18, 0.5, 8, 4);
    meshObj(body, name + "_Arms", arms, hwMat("steel"));
    len = 18.5;
  } else {
    const wires = new MeshAcc();
    const prof: [number, number][] = [[5.2, 0], [3.9, 0.9], [2.2, 1.25], [0.9, 0.8], [0, 0], [0.9, -0.8], [2.2, -1.25], [3.9, -0.9], [5.2, 0]];
    for (let i = 0; i < 8; i++) {
      const th = i * 22.5 * DEG;
      const cy = Math.cos(th), sz = Math.sin(th);
      const c: [number, number, number][] = prof.map((p) => [p[0], p[1] * cy + 1.3, p[1] * sz] as [number, number, number]);
      wires.sweep(c, c.map(() => 0.05), c.map(() => 0.05), 3, true);
    }
    meshObj(body, name + "_Wires", wires, hwMat("chrome"));
    meshObj(body, name + "_Handle", chain([[5.0, 1.3, 0], [6.8, 1.3, 0], [9, 1.3, 0], [12.5, 1.3, 0], [13.2, 1.3, 0]], [0.3, 0.5, 0.52, 0.5, 0.3], [0.3, 0.5, 0.52, 0.5, 0.3], 8), hwMat("steel"));
    len = 13.2;
    hw = 1.3;
  }
  const tip = kind === "whisk" ? new vec3(1.6 * scale, 1.3 * scale, 0) : new vec3(0.6 * scale, 0.3 * scale, 0);
  return { root, tipLocal: tip, length: len * scale, halfWidth: hw * scale };
}

// ───────────────────────────── fallback shapes (W2 ShapeRecipe stand-ins) ─────────────────────────────

/** Kinds served by makeFallbackProp (and, once W2 lands, by ShapeRecipeBuilder). */
export const FALLBACK_KINDS: string[] = [
  "BOARD", "ROLLING_PIN", "SKIMMER", "SPOON", "BRUSH", "CURRY_LEAF_SPRIG", "LEMON_WEDGE", "FLOUR_DISH", "DOUGH_BALL",
  "FLATBREAD_DISC", "IRREGULAR_CHICKEN_CHUNKS", "PROTEIN_SLAB", "PROTEIN_BALLS", "PRAWNS", "SPICE_RAMEKIN", "LIQUID_CUP",
  "DAIRY_CUP", "GRAIN_HEAP", "HERB_SPRIG", "GENERIC_PIECE",
];

export { pieceCountFor } from "./CookBenchPlan";

function lobedChunk(rnd: () => number, size: number): MeshAcc {
  // irregular boneless chunk: a lobed, tilted core + an offset knob (never a cube)
  const a = new MeshAcc();
  const rx = size * (0.85 + rnd() * 0.4), ry = size * (0.62 + rnd() * 0.25), rz = size * (0.7 + rnd() * 0.35);
  a.ellipsoid(0, ry * 0.92, 0, rx, ry, rz, 7, 4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5, 2 + Math.floor(rnd() * 3), 0.12 + rnd() * 0.1);
  const ang = rnd() * Math.PI * 2;
  a.ellipsoid(Math.cos(ang) * rx * 0.62, ry * (0.8 + rnd() * 0.5), Math.sin(ang) * rz * 0.62, rx * 0.5, ry * 0.55, rz * 0.48, 5, 3, rnd() * 3, 0, 2, 0.15);
  return a;
}

/** Piece object (one food piece, paintable through `mat`). */
function piece(parent: SceneObject, name: string, acc: MeshAcc, mat: Material): SceneObject {
  return meshObj(parent, name, acc, mat);
}

function heapLayout(n: number, radius: number, i: number): [number, number, number] {
  if (n <= 1) return [0, 0, 0];
  const r = radius * Math.sqrt((i + 0.5) / n);
  const a = i * 2.39996;
  const layer = i >= Math.ceil(n * 0.65) ? 1 : 0;
  return [Math.cos(a) * r * (layer ? 0.55 : 1), layer * 0.9, Math.sin(a) * r * (layer ? 0.55 : 1)];
}

function containerObj(root: SceneObject, name: string, prof: [number, number][], segs: number, mat: Material): SceneObject {
  const a = new MeshAcc();
  a.lathe(prof, segs);
  const o = meshObj(root, name, a, mat);
  return o;
}

/**
 * ONE fallback for every shape the catalogue lacks. Returns an unparented root (bottom-centre pivot, cm). Food parts are
 * children named "Piece_<i>" (they become ItemHandle.pieces), the holder (ramekin, dish, cup) is named "Container".
 * Tools (ROLLING_PIN, SKIMMER, SPOON, BRUSH) use the tool frame: tip at the origin, handle along +X, lying on y = 0.
 * colour = linear RGB of the food (lifted here); hardware keeps its own material.
 */
export function makeFallbackProp(kind: string, colour: any, opts: { count?: number; seed?: number; size?: number } = {}): SceneObject {
  const k = String(kind || "GENERIC_PIECE").toUpperCase();
  const root = newObj("Fallback_" + k, null);
  const rnd = makeRng((opts.seed || hashStr(k)) + 17);
  const food = itemMat(colour, 0.55, 0.0, 0.14);
  switch (k) {
    case "BOARD": {
      const a = slabMesh(7.5, 5.0, 1.2, 0, 0.8, 0.25);
      meshObj(root, "Board_Top", a, hwMat("endgrain"));
      break;
    }
    case "ROLLING_PIN": {
      // pin along +X: body r 1.0 x 13 cm, tapered handles; tip = centre of the roller (pin centre)
      const a = new MeshAcc();
      a.setXform(0, 1.0, 0, 0, 0, -Math.PI / 2);
      a.lathe([[0, -9.5], [0.42, -9.4], [0.5, -8.4], [0.42, -7.0], [0.62, -6.8], [1.0, -6.5], [1.02, 0], [1.0, 6.5], [0.62, 6.8], [0.42, 7.0], [0.5, 8.4], [0.42, 9.4], [0, 9.5]], 14);
      a.clearXform();
      meshObj(root, "RollingPin", a, hwMat("woodLight"));
      break;
    }
    case "SKIMMER": {
      const head = new MeshAcc();
      head.lathe([[0, 0.1], [1.9, 0.28], [2.1, 0.42], [1.95, 0.44], [0, 0.22]], 18);
      head.torus(0, 0.42, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 2.05, 0.08, 0.07, 20, 3);
      meshObj(root, "SkimmerHead", head, hwMat("chrome"));
      meshObj(root, "SkimmerHandle", chain([[2.0, 0.42, 0], [6, 0.9, 0], [11, 1.2, 0], [16, 1.25, 0]], [0.18, 0.16, 0.2, 0.22], [0.1, 0.1, 0.14, 0.16], 6), hwMat("steel"));
      break;
    }
    case "SPOON": {
      const b = new MeshAcc();
      b.ellipsoid(0, 0.28, 0, 1.25, 0.28, 0.85, 12, 4);
      meshObj(root, "SpoonBowl", b, hwMat("woodLight"));
      meshObj(root, "SpoonHandle", chain([[1.1, 0.35, 0], [5, 0.6, 0], [10, 0.8, 0], [13.5, 0.85, 0]], [0.26, 0.24, 0.3, 0.32], [0.16, 0.16, 0.2, 0.22], 6), hwMat("woodLight"));
      break;
    }
    case "BRUSH": {
      const t = new MeshAcc();
      t.ellipsoid(0.9, 0.4, 0, 1.1, 0.32, 0.75, 8, 4);
      meshObj(root, "BrushBristles", t, hwMat("bristle"));
      meshObj(root, "BrushHandle", chain([[1.8, 0.45, 0], [4, 0.55, 0], [8, 0.7, 0], [11, 0.75, 0]], [0.55, 0.32, 0.3, 0.3], [0.3, 0.26, 0.26, 0.26], 6), hwMat("wood"));
      break;
    }
    case "CURRY_LEAF_SPRIG":
    case "HERB_SPRIG": {
      const n = Math.max(1, opts.count || 2);
      for (let s = 0; s < n; s++) {
        const a = new MeshAcc();
        const L = 5.5 * (opts.size || 1);
        const pts: [number, number, number][] = [[0, 0.12, 0], [L * 0.35, 0.2, 0.15], [L * 0.7, 0.24, 0.1], [L, 0.22, -0.1]];
        a.sweep(pts, pts.map(() => 0.06), pts.map(() => 0.06), 4, true);
        const leaves = k === "CURRY_LEAF_SPRIG" ? 7 : 5;
        for (let i = 0; i < leaves; i++) {
          const t = 0.18 + (i / leaves) * 0.8;
          const side = i % 2 === 0 ? 1 : -1;
          const yaw = side * (0.9 + rnd() * 0.3);
          a.ellipsoid(L * t + Math.cos(yaw) * 0.45, 0.24, side * 0.55, 0.62, 0.05, 0.24, 6, 3, yaw, 0);
        }
        const p = piece(root, "Piece_" + s, a, food);
        p.getTransform().setLocalPosition(new vec3(-L / 2, 0, (s - (n - 1) / 2) * 1.5));
        p.getTransform().setLocalRotation(quat.angleAxis((rnd() - 0.5) * 0.6, vec3.up()));
      }
      break;
    }
    case "LEMON_WEDGE": {
      const n = Math.max(1, opts.count || 2);
      const flesh = itemMat(lighten(lift(colour), 0.45), 0.3, 0, 0.16);
      for (let s = 0; s < n; s++) {
        const holder = newObj("Piece_" + s, root);
        const R = 1.45;
        const prof: [number, number][] = [];
        for (let i = 0; i <= 6; i++) {
          const t = (i / 6) * Math.PI;
          prof.push([Math.sin(t) * R, R - Math.cos(t) * R * 0.9]);
        }
        const peel = new MeshAcc();
        peel.lathe(prof, 6, 0, 0, -0.55, 0.55);
        meshObj(holder, "Peel", peel, food);
        const face = new MeshAcc();
        for (const ph of [-0.55, 0.55]) {
          const c = Math.cos(ph), sn = Math.sin(ph);
          const nx = -sn * (ph < 0 ? -1 : 1), nz = c * (ph < 0 ? -1 : 1);
          const ids: number[] = [];
          for (const [r, y] of prof) ids.push(face.v(0, y, 0, nx, 0, nz, 0, 0), face.v(r * c * 0.98, y, r * sn * 0.98, nx, 0, nz, 1, 0));
          for (let j = 0; j < prof.length - 1; j++) face.quad(ids[j * 2], ids[j * 2 + 1], ids[j * 2 + 3], ids[j * 2 + 2]);
        }
        meshObj(holder, "Flesh", face, flesh);
        // lie the wedge on its side
        holder.getTransform().setLocalRotation(quat.angleAxis(Math.PI / 2, vec3.forward()).multiply(quat.angleAxis(s * 2.2, vec3.up())));
        holder.getTransform().setLocalPosition(new vec3((s - (n - 1) / 2) * 2.2, R * 0.95, 0));
      }
      break;
    }
    case "FLOUR_DISH":
    case "GRAIN_HEAP": {
      containerObj(root, "Container", [[0, 0], [2.0, 0], [2.4, 0.2], [2.75, 0.72], [2.62, 0.76], [2.25, 0.32], [0, 0.28]], 20, hwMat("ceramic"));
      const m = new MeshAcc();
      m.lathe([[0, 0.3], [2.1, 0.3], [1.6, 0.72], [0.9, 1.08], [0, 1.24]], 16, k === "GRAIN_HEAP" ? 9 : 5, 0.05);
      piece(root, "Piece_0", m, food);
      break;
    }
    case "DOUGH_BALL": {
      const n = Math.max(1, opts.count || 1);
      for (let s = 0; s < n; s++) {
        const a = new MeshAcc();
        const r = 1.6 * (opts.size || 1);
        a.ellipsoid(0, r * 0.78, 0, r, r * 0.8, r, 12, 6, 0, 0, 3, 0.03);
        const p = piece(root, "Piece_" + s, a, food);
        p.getTransform().setLocalPosition(new vec3((s - (n - 1) / 2) * r * 2.3, 0, 0));
      }
      break;
    }
    case "FLATBREAD_DISC": {
      const a = new MeshAcc();
      const r = 3.2 * (opts.size || 1);
      a.lathe([[0, 0], [r * 0.95, 0.02], [r, 0.12], [r * 0.95, 0.22], [r * 0.5, 0.26], [0, 0.27]], 24, 7, 0.02);
      piece(root, "Piece_0", a, food);
      break;
    }
    case "IRREGULAR_CHICKEN_CHUNKS": {
      const n = Math.max(1, opts.count || 12);
      const size = 0.95 * (opts.size || 1);
      for (let i = 0; i < n; i++) {
        const p = piece(root, "Piece_" + i, lobedChunk(rnd, size * (0.8 + rnd() * 0.4)), food);
        const [x, y, z] = heapLayout(n, 2.4, i);
        p.getTransform().setLocalPosition(new vec3(x, y, z));
        p.getTransform().setLocalRotation(quat.fromEulerAngles((rnd() - 0.5) * 0.6, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6));
      }
      break;
    }
    case "PROTEIN_SLAB": {
      const n = Math.max(1, opts.count || 2);
      for (let i = 0; i < n; i++) {
        const a = new MeshAcc();
        a.ellipsoid(0, 0.62, 0, 3.0, 0.62, 1.9, 12, 5, 0, 0, 3, 0.06);
        const p = piece(root, "Piece_" + i, a, food);
        p.getTransform().setLocalPosition(new vec3(0, i * 1.1, (i - (n - 1) / 2) * 0.8));
        p.getTransform().setLocalRotation(quat.angleAxis(i * 0.5, vec3.up()));
      }
      break;
    }
    case "PROTEIN_BALLS": {
      const n = Math.max(1, opts.count || 8);
      for (let i = 0; i < n; i++) {
        const a = new MeshAcc();
        const r = 0.9 + rnd() * 0.15;
        a.ellipsoid(0, r * 0.95, 0, r, r * 0.95, r, 8, 5, rnd() * 3, 0, 3, 0.08);
        const p = piece(root, "Piece_" + i, a, food);
        const [x, y, z] = heapLayout(n, 2.3, i);
        p.getTransform().setLocalPosition(new vec3(x, y * 1.3, z));
      }
      break;
    }
    case "PRAWNS": {
      const n = Math.max(1, opts.count || 8);
      for (let i = 0; i < n; i++) {
        const a = new MeshAcc();
        const pts: [number, number, number][] = [];
        for (let j = 0; j <= 6; j++) {
          const t = (j / 6) * Math.PI * 1.25;
          pts.push([Math.cos(t) * 1.2, 0.45, Math.sin(t) * 1.2]);
        }
        a.sweep(pts, pts.map((_p, j) => 0.48 - j * 0.05), pts.map((_p, j) => 0.42 - j * 0.04), 7, true);
        const p = piece(root, "Piece_" + i, a, food);
        const [x, y, z] = heapLayout(n, 2.4, i);
        p.getTransform().setLocalPosition(new vec3(x, y * 0.8, z));
        p.getTransform().setLocalRotation(quat.angleAxis(rnd() * Math.PI * 2, vec3.up()));
      }
      break;
    }
    case "SPICE_RAMEKIN": {
      containerObj(root, "Container", [[0, 0], [1.02, 0], [1.34, 0.14], [1.44, 1.14], [1.3, 1.18], [1.2, 1.08], [1.18, 0.34], [0, 0.3]], 16, hwMat("ramekin"));
      const m = new MeshAcc();
      m.lathe([[0, 1.0], [1.14, 1.0], [0.84, 1.16], [0.42, 1.28], [0, 1.34]], 12);
      piece(root, "Piece_0", m, itemMat(colour, 0.85, 0, 0.16));
      break;
    }
    case "LIQUID_CUP":
    case "DAIRY_CUP": {
      containerObj(root, "Container", [[0, 0], [1.2, 0], [1.42, 0.2], [1.62, 2.3], [1.5, 2.34], [1.4, 0.4], [0, 0.34]], 12, hwMat(k === "LIQUID_CUP" ? "glassCup" : "ramekin"));
      const m = new MeshAcc();
      if (k === "DAIRY_CUP") m.lathe([[0, 1.7], [1.5, 1.7], [1.2, 1.95], [0.6, 2.1], [0, 2.14]], 14);
      else m.disc(0, 1.85, 0, 1.52, 16, 0.02);
      piece(root, "Piece_0", m, itemMat(colour, k === "LIQUID_CUP" ? 0.08 : 0.5, 0, 0.18));
      break;
    }
    default: {
      // GENERIC_PIECE: a small lobed heap (never a cube)
      const n = Math.max(1, opts.count || 3);
      for (let i = 0; i < n; i++) {
        const p = piece(root, "Piece_" + i, lobedChunk(rnd, 0.75), food);
        const [x, y, z] = heapLayout(n, 1.2, i);
        p.getTransform().setLocalPosition(new vec3(x, y * 0.7, z));
      }
    }
  }
  return root;
}
