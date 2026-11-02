import { MiseFlowEventBus } from "./MiseFlowEventBus";

const BASE_PBR_TEMPLATE = requireAsset("../Materials/Mat_DarkSlate.mat") as Material;

export function makePbrMaterial(
  r: number,
  g: number,
  b: number,
  metallic: number = 0.08,
  roughness: number = 0.35
): Material {
  const m = BASE_PBR_TEMPLATE.clone();
  m.mainPass.baseColor = new vec4(r, g, b, 1.0);
  (m.mainPass as any).metallic = metallic;
  (m.mainPass as any).roughness = roughness;
  return m;
}

/**
 * Emissive variant for the additive Spectacles display (black = invisible).
 * simple_pbr exposes its unconnected Emissive port as `Port_Emissive_N006`.
 */
export function makeEmissiveMaterial(
  r: number,
  g: number,
  b: number,
  intensity: number = 0.85,
  metallic: number = 0.0,
  roughness: number = 0.3
): Material {
  const m = makePbrMaterial(r, g, b, metallic, roughness);
  try {
    (m.mainPass as any).Port_Emissive_N006 = new vec3(r * intensity, g * intensity, b * intensity);
  } catch (e) {
    // Shader without emissive port: bright base colour still reads on additive display.
  }
  return m;
}

const MAT_CYAN = makePbrMaterial(0.18, 0.86, 0.96, 0.1, 0.22);
// v4 additive-display palette
const MAT_LASER_CYAN = makeEmissiveMaterial(0.0, 0.94, 1.0, 1.0);          // #00F0FF cut lines + stove bevel
const MAT_COUNTER_RIM = makePbrMaterial(0.353, 0.384, 0.439, 0.25, 0.48);  // #5A6270 outer rim / slab body
const MAT_COUNTER_FIELD = makePbrMaterial(0.235, 0.262, 0.305, 0.30, 0.42); // #3C434E honed top field
const MAT_STOVE_INSET = makePbrMaterial(0.055, 0.067, 0.086, 0.35, 0.08);  // #0E1116 vitroceramic inset
const MAT_RIM_AMBER = makeEmissiveMaterial(0.90, 0.58, 0.26, 0.75, 0.6, 0.25); // warm bronze rim light
const MAT_LED_SEAR = makeEmissiveMaterial(1.0, 0.56, 0.16, 0.9);           // amber sear burner LED
const MAT_LED_SIMMER = makeEmissiveMaterial(0.30, 0.78, 1.0, 0.9);         // cool simmer burner LED
const MAT_AMBER = makePbrMaterial(0.98, 0.68, 0.22, 0.1, 0.25);
const MAT_BLUE = makePbrMaterial(0.32, 0.68, 0.98, 0.1, 0.25);
const MAT_GREEN = makePbrMaterial(0.24, 0.88, 0.50, 0.1, 0.25);
const MAT_CORAL = makePbrMaterial(0.98, 0.42, 0.36, 0.1, 0.25);
const MAT_WOOD = makePbrMaterial(0.72, 0.50, 0.30, 0.02, 0.58);
const MAT_WOOD_DARK = makePbrMaterial(0.38, 0.24, 0.12, 0.04, 0.62);
const MAT_SHALLOT_PURPLE = makePbrMaterial(0.58, 0.26, 0.46, 0.05, 0.38);
const MAT_SHALLOT_CREAM = makePbrMaterial(0.94, 0.88, 0.82, 0.02, 0.42);
const MAT_CAST_IRON = makePbrMaterial(0.26, 0.27, 0.30, 0.62, 0.55);
const MAT_SALMON = makeEmissiveMaterial(1.0, 0.42, 0.32, 0.22, 0.04, 0.42);      // #FF6B52 coral flesh
const MAT_SALMON_SKIN = makeEmissiveMaterial(0.85, 0.51, 0.17, 0.18, 0.14, 0.40); // #D9822B golden skin
const MAT_STEEL = makePbrMaterial(0.90, 0.92, 0.94, 0.88, 0.18);
const MAT_STEEL_BLADE = makePbrMaterial(0.96, 0.97, 0.99, 0.72, 0.12);
const MAT_STEEL_BOLSTER = makePbrMaterial(0.85, 0.87, 0.90, 0.78, 0.20);
const MAT_WOOD_HANDLE = makePbrMaterial(0.42, 0.22, 0.10, 0.04, 0.48);
const MAT_SAUCE = makePbrMaterial(0.98, 0.82, 0.28, 0.06, 0.08);
const MAT_SAUCE_ENRICHED = makePbrMaterial(0.96, 0.74, 0.20, 0.06, 0.08);
const MAT_HERB = makePbrMaterial(0.20, 0.62, 0.28, 0.04, 0.52);
const MAT_SLATE = makePbrMaterial(0.10, 0.11, 0.14, 0.40, 0.55);
const MAT_VITROCERAMIC = makePbrMaterial(0.05, 0.06, 0.08, 0.35, 0.06);
const MAT_BRASS = makePbrMaterial(1.00, 0.84, 0.35, 0.85, 0.18);
const MAT_PORCELAIN = makePbrMaterial(0.98, 0.99, 1.00, 0.02, 0.12);
const MAT_CERAMIC_WHITE = makePbrMaterial(0.94, 0.95, 0.96, 0.02, 0.20);
const MAT_SALT = makePbrMaterial(0.96, 0.97, 0.98, 0.02, 0.10);
const MAT_RUBBER_FOOT = makePbrMaterial(0.08, 0.08, 0.09, 0.02, 0.92);
const MAT_SEAR_MARK = makePbrMaterial(0.22, 0.10, 0.04, 0.10, 0.72); // dark Maillard bars
const MAT_INDUCTION_AMBER = makePbrMaterial(0.96, 0.58, 0.12, 0.05, 0.35);
const MAT_INDUCTION_COOL = makePbrMaterial(0.22, 0.62, 0.96, 0.05, 0.35);
const MAT_INDUCTION_EMERALD = makePbrMaterial(0.18, 0.88, 0.52, 0.05, 0.38);
const MAT_TRANSFER_RIBBON = makePbrMaterial(0.22, 0.86, 0.98, 0.08, 0.18);
const MAT_RIVET_STEEL = makePbrMaterial(0.82, 0.84, 0.88, 0.80, 0.22);

// ─── v5 "premium render" pass: procedural albedo maps (Assets/Textures, generated offline) ───
const TEX_SLAB = requireAsset("../Textures/Tex_SlabBrushed.png") as Texture;
const TEX_ENDGRAIN = requireAsset("../Textures/Tex_EndGrainWood.png") as Texture;
const TEX_SALMON = requireAsset("../Textures/Tex_SalmonCrust.png") as Texture;
const TEX_SAUCE = requireAsset("../Textures/Tex_SauceHerb.png") as Texture;
const TEX_CAST_IRON = requireAsset("../Textures/Tex_CastIron.png") as Texture;
const TEX_STEAM = requireAsset("../Textures/Tex_Steam.png") as Texture;

export function makeTexturedPbr(
  tex: Texture,
  metallic: number,
  roughness: number,
  r: number = 1,
  g: number = 1,
  b: number = 1
): Material {
  const m = makePbrMaterial(r, g, b, metallic, roughness);
  m.mainPass.baseTex = tex;
  return m;
}

// Additive display: the slab must stay mid-grey to read as solid (dark = see-through on Specs)
const MAT_SLAB = makeTexturedPbr(TEX_SLAB, 0.35, 0.28, 1.45, 1.5, 1.6);          // brushed charcoal steel
const MAT_CAST_IRON_TEX = makeTexturedPbr(TEX_CAST_IRON, 0.4, 0.42, 1.55, 1.55, 1.6); // seasoned cast iron
const MAT_SALMON_SEARED = makeTexturedPbr(TEX_SALMON, 0.0, 0.32);                    // crust + grill marks
const MAT_SAUCE_TOMATO = makeTexturedPbr(TEX_SAUCE, 0.05, 0.1);                      // red-orange reduction
const MAT_ENDGRAIN = makeTexturedPbr(TEX_ENDGRAIN, 0.0, 0.62);                       // end-grain block top
const MAT_WOOD_SIDE = makePbrMaterial(0.56, 0.34, 0.17, 0.0, 0.6);
const MAT_CHROME = makePbrMaterial(0.95, 0.96, 0.97, 0.55, 0.2);
const MAT_PLATE_MATTE = makePbrMaterial(0.76, 0.76, 0.74, 0.0, 0.34);
const MAT_POLY_HANDLE = makePbrMaterial(0.12, 0.12, 0.13, 0.15, 0.32);
const MAT_PAN_OIL = makePbrMaterial(0.24, 0.14, 0.05, 0.3, 0.03);
const MAT_ROSEMARY = makePbrMaterial(0.17, 0.36, 0.15, 0.0, 0.5);
const MAT_RED_ONION = makePbrMaterial(0.66, 0.30, 0.50, 0.0, 0.3);
const MAT_GARLIC = makePbrMaterial(0.96, 0.92, 0.78, 0.0, 0.35);
const MAT_PARSLEY = makePbrMaterial(0.16, 0.50, 0.14, 0.0, 0.45);
const MAT_RED_PEPPER = makePbrMaterial(0.90, 0.13, 0.07, 0.05, 0.18);
const MAT_YELLOW_PEPPER = makePbrMaterial(1.0, 0.80, 0.08, 0.05, 0.18);
const MAT_ARC_AMBER = makeEmissiveMaterial(1.0, 0.68, 0.12, 1.0);
const MAT_ARC_CYAN = makeEmissiveMaterial(0.25, 0.85, 1.0, 1.0);
const MAT_GUIDE_LINE = makeEmissiveMaterial(0.75, 0.95, 1.0, 0.9);

/** Small indexed-mesh accumulator; triangles auto-orient to their stored vertex normals. */
class MeshAcc {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uvs: number[] = [];
  private idx: number[] = [];

  count(): number {
    return this.pos.length / 3;
  }

  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number): number {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.pos.push(x, y, z);
    this.nrm.push(nx / l, ny / l, nz / l);
    this.uvs.push(u, w);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const n = this.nrm;
    const nx = n[a * 3] + n[b * 3] + n[c * 3];
    const ny = n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1];
    const nz = n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2];
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Oriented box (yaw/pitch in radians) with flat-shaded faces. */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number = 0, pitch: number = 0): void {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = (x: number, y: number, z: number): [number, number, number] => {
      const y1 = y * cp - z * sp;
      const z1 = y * sp + z * cp;
      return [x * cyw + z1 * syw, y1, -x * syw + z1 * cyw];
    };
    const faces: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const f of faces) {
      const n = rot(f[0], f[1], f[2]);
      // two tangents
      const t1: [number, number, number] = f[0] !== 0 ? [0, 1, 0] : [1, 0, 0];
      const t2: [number, number, number] = [f[1] * t1[2] - f[2] * t1[1], f[2] * t1[0] - f[0] * t1[2], f[0] * t1[1] - f[1] * t1[0]];
      const ids: number[] = [];
      for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = f[0] * hx + s1 * t1[0] * hx + s2 * t2[0] * hx;
        const ly = f[1] * hy + s1 * t1[1] * hy + s2 * t2[1] * hy;
        const lz = f[2] * hz + s1 * t1[2] * hz + s2 * t2[2] * hz;
        const p = rot(lx, ly, lz);
        ids.push(this.v(cx + p[0], cy + p[1], cz + p[2], n[0], n[1], n[2], (s1 + 1) / 2, (s2 + 1) / 2));
      }
      this.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }

  /** Flat annulus sector facing +Y (angles in degrees, 0 = +X, CCW seen from above). */
  arc(cx: number, y: number, cz: number, r: number, width: number, a0: number, a1: number, segs: number): void {
    const base = this.count();
    for (let i = 0; i <= segs; i++) {
      const a = ((a0 + (a1 - a0) * (i / segs)) * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a);
      this.v(cx + c * (r - width / 2), y, cz - s * (r - width / 2), 0, 1, 0, i / segs, 0);
      this.v(cx + c * (r + width / 2), y, cz - s * (r + width / 2), 0, 1, 0, i / segs, 1);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      this.quad(a, a + 1, a + 3, a + 2);
    }
  }

  /** Flat disc facing +Y with planar UVs (texture spans the disc). */
  disc(cx: number, y: number, cz: number, r: number, segs: number, dome: number = 0): void {
    const c = this.v(cx, y + dome, cz, 0, 1, 0, 0.5, 0.5);
    const ring = this.count();
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      this.v(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, 1, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let i = 0; i < segs; i++) this.tri(c, ring + i, ring + i + 1);
  }

  apply(rmv: RenderMeshVisual): void {
    const b = createBuilder();
    const verts: number[] = [];
    const n = this.count();
    for (let i = 0; i < n; i++) {
      verts.push(
        this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2],
        this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2],
        this.uvs[i * 2], this.uvs[i * 2 + 1],
        1, 1, 1, 1
      );
    }
    b.appendVerticesInterleaved(verts);
    b.appendIndices(this.idx);
    rmv.mesh = b.getMesh();
    b.updateMesh();
  }
}

/** Deterministic PRNG so the diced veg piles look identical every run. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Rounded, bevelled slab: rounded-rectangle footprint (corner radius cr), quarter-round top bevel
 * (radius br), vertical sides down to `bottom`. Top uses planar UVs spanning the whole slab.
 */
function buildRoundedSlab(acc: MeshAcc, hx: number, hz: number, top: number, bottom: number, cr: number, br: number): void {
  const CS = 10; // segments per corner
  const BS = 6; // bevel segments
  const per: { x: number; z: number; nx: number; nz: number }[] = [];
  const corners = [
    { cx: hx - cr, cz: hz - cr, a0: 0 },
    { cx: hx - cr, cz: -(hz - cr), a0: 270 },
    { cx: -(hx - cr), cz: -(hz - cr), a0: 180 },
    { cx: -(hx - cr), cz: hz - cr, a0: 90 },
  ];
  // walk the perimeter clockwise seen from above (+X+Z corner -> +X-Z -> ...)
  const order = [0, 1, 2, 3];
  for (const k of order) {
    const c = corners[k];
    for (let i = 0; i <= CS; i++) {
      // angle decreasing within each corner keeps the walk monotonic
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
  const ringStart = acc.count();
  for (let i = 0; i < N; i++) {
    const p = per[i];
    for (let j = 0; j < P; j++) {
      const q = prof[j];
      const x = p.x - p.nx * q.d;
      const z = p.z - p.nz * q.d;
      const u = x / (2 * hx) + 0.5;
      const w = j <= BS ? z / (2 * hz) + 0.5 : 0.02 + (top - q.y) * 0.05;
      acc.v(x, q.y, z, p.nx * q.h, q.vy, p.nz * q.h, u, w);
    }
  }
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let j = 0; j < P - 1; j++) {
      acc.quad(ringStart + i * P + j, ringStart + i2 * P + j, ringStart + i2 * P + j + 1, ringStart + i * P + j + 1);
    }
  }
  // Top cap: fan from the centre to the innermost bevel ring (convex)
  const c = acc.v(0, top, 0, 0, 1, 0, 0.5, 0.5);
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    acc.tri(c, ringStart + i * P, ringStart + i2 * P);
  }
  // Bottom cap
  const cb = acc.v(0, bottom, 0, 0, -1, 0, 0.5, 0.5);
  const bot: number[] = [];
  for (let i = 0; i < N; i++) bot.push(acc.v(per[i].x, bottom, per[i].z, 0, -1, 0, 0.5, 0.5));
  for (let i = 0; i < N; i++) acc.tri(cb, bot[i], bot[(i + 1) % N]);
}
// ─── v4 Z-zoned layout (StationsRoot-local cm; root sits at (0,-17.5,-76)) ───
// Counter slab top is at y = -0.23. Rear row: saucier on the simmer burner.
// Middle row: skillet (left) + butcher block (right). Front-centre: plate.
// Compact enough (x -19..18) to fit the narrow Spectacles display crop.
// Director camera (preview pose) looks down ~36 deg from in front of the counter, pitch -30.
// v5: thick bevelled slab (3.2 cm) whose top stays at y = -0.23 (every flush overlay depends on it)
const COUNTER_CENTER = new vec3(0, -1.83, -3.25);
const COUNTER_HALF = new vec3(20.0, 1.6, 13.75); // slab x -20..20, z -17..10.5
const COOKWARE_Y = -0.22;
const SKILLET_POS = new vec3(-11.2, COOKWARE_Y, -1.5);
const SKILLET_YAW = -66 * (Math.PI / 180); // swings the long handle to the rear-left
const SAUCIER_POS = new vec3(0.0, COOKWARE_Y, -10.5);
const PREP_POS = new vec3(10.5, 0.64, -3.0); // board feet (local -1.27 * 0.68) rest on slab top
const PLATE_POS = new vec3(0.0, COOKWARE_Y, 4.5);
// Knife edge sits on cut line 0; MetricPrepBlueprint steps +1.5 per chop (8 chops -> x +3.5),
// so everything else on the board lives at x >= 4.3 to stay out of the blade sweep.
const KNIFE_REST_X = -8.5;
const SLICE_RADIUS = 0.5;

function sliceRestX(i: number): number {
  return KNIFE_REST_X + 0.75 + i * 1.5; // centred between cut lines i and i+1
}

const BASE_KNIFE_PITCH = 0.0;
const BASE_KNIFE_YAW = 10 * (Math.PI / 180);
const BASE_KNIFE_ROLL = -10 * (Math.PI / 180);

function getKnifeRotation(rockPitch: number = 0): quat {
  return quat.fromEulerAngles(
    BASE_KNIFE_PITCH + rockPitch,
    BASE_KNIFE_YAW,
    BASE_KNIFE_ROLL
  );
}

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

function createBuilder(): MeshBuilder {
  const builder = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
    { name: "texture0", components: 2 },
    { name: "color", components: 4 },
  ]);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;
  return builder;
}

function addBox(
  builder: MeshBuilder,
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  hw: number,
  hh: number,
  hd: number,
  color: [number, number, number, number],
  baseIdx: number
): number {
  const x0 = cx - hw;
  const x1 = cx + hw;
  const y0 = cy - hh;
  const y1 = cy + hh;
  const z0 = cz - hd;
  const z1 = cz + hd;

  const verts: number[] = [];
  let vi = baseIdx;

  const face = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    n: [number, number, number]
  ) => {
    verts.push(
      ...p0,
      ...n,
      0,
      0,
      ...color,
      ...p1,
      ...n,
      1,
      0,
      ...color,
      ...p2,
      ...n,
      1,
      1,
      ...color,
      ...p3,
      ...n,
      0,
      1,
      ...color
    );
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };

  face([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
  face([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]);
  face([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
  face([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]);
  face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);

  builder.appendVerticesInterleaved(verts);
  return vi;
}

function buildLathe(
  builder: MeshBuilder,
  profile: [number, number][],
  segments: number,
  color: [number, number, number, number],
  baseIdx: number = 0,
  offsetX: number = 0,
  offsetY: number = 0,
  offsetZ: number = 0,
  doubleSided: boolean = false
): number {
  const P = profile.length;
  let vi = baseIdx;
  const startIdx = vi;
  const indices: number[] = [];

  const prof2dN: [number, number][] = [];
  for (let j = 0; j < P; j++) {
    const prev = profile[Math.max(0, j - 1)];
    const next = profile[Math.min(P - 1, j + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dy, -dx) || 1;
    prof2dN.push([dy / len, -dx / len]);
  }

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const theta = u * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let j = 0; j < P; j++) {
      const v = P > 1 ? j / (P - 1) : 0.5;
      const [r, y] = profile[j];
      const [n2x, n2y] = prof2dN[j];
      builder.appendVerticesInterleaved([
        offsetX + r * c,
        offsetY + y,
        offsetZ + r * s,
        n2x * c,
        n2y,
        n2x * s,
        u,
        v,
        ...color,
      ]);
      vi++;
    }
  }

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < P - 1; j++) {
      const bl = startIdx + i * P + j;
      const br = startIdx + i * P + (j + 1);
      const tl = startIdx + (i + 1) * P + j;
      const tr = startIdx + (i + 1) * P + (j + 1);
      indices.push(bl, br, tr, bl, tr, tl);
      if (doubleSided) {
        indices.push(bl, tr, br, bl, tl, tr);
      }
    }
  }

  if (profile[0][0] > 1e-6) {
    const y = profile[0][1];
    const r = profile[0][0];
    const center = vi;
    builder.appendVerticesInterleaved([offsetX, offsetY + y, offsetZ, 0, -1, 0, 0.5, 0.5, ...color]);
    vi++;
    const ring = vi;
    for (let i = 0; i <= segments; i++) {
      const th = (i / segments) * Math.PI * 2;
      builder.appendVerticesInterleaved([
        offsetX + r * Math.cos(th),
        offsetY + y,
        offsetZ + r * Math.sin(th),
        0,
        -1,
        0,
        0.5,
        0.5,
        ...color,
      ]);
      vi++;
    }
    for (let i = 0; i < segments; i++) {
      indices.push(center, ring + i, ring + i + 1);
      if (doubleSided) {
        indices.push(center, ring + i + 1, ring + i);
      }
    }
  }

  if (profile[P - 1][0] > 1e-6) {
    const y = profile[P - 1][1];
    const r = profile[P - 1][0];
    const center = vi;
    builder.appendVerticesInterleaved([offsetX, offsetY + y, offsetZ, 0, 1, 0, 0.5, 0.5, ...color]);
    vi++;
    const ring = vi;
    for (let i = 0; i <= segments; i++) {
      const th = (i / segments) * Math.PI * 2;
      builder.appendVerticesInterleaved([
        offsetX + r * Math.cos(th),
        offsetY + y,
        offsetZ + r * Math.sin(th),
        0,
        1,
        0,
        0.5,
        0.5,
        ...color,
      ]);
      vi++;
    }
    for (let i = 0; i < segments; i++) {
      indices.push(center, ring + i + 1, ring + i);
      if (doubleSided) {
        indices.push(center, ring + i, ring + i + 1);
      }
    }
  }

  builder.appendIndices(indices);
  return vi;
}

function buildTube(
  builder: MeshBuilder,
  curve: [number, number, number][],
  radius: number,
  radialSegments: number,
  color: [number, number, number, number],
  baseIdx: number = 0
): number {
  const N = curve.length;
  if (N < 2) return baseIdx;
  let vi = baseIdx;
  const startIdx = vi;

  const T: [number, number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = curve[Math.max(0, i - 1)];
    const b = curve[Math.min(N - 1, i + 1)];
    const t: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(t[0], t[1], t[2]) || 1;
    T.push([t[0] / len, t[1] / len, t[2] / len]);
  }

  const ax: [number, number, number] = Math.abs(T[0][0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d0 = ax[0] * T[0][0] + ax[1] * T[0][1] + ax[2] * T[0][2];
  let Nf: [number, number, number] = [
    ax[0] - d0 * T[0][0],
    ax[1] - d0 * T[0][1],
    ax[2] - d0 * T[0][2],
  ];
  const nl = Math.hypot(Nf[0], Nf[1], Nf[2]) || 1;
  Nf = [Nf[0] / nl, Nf[1] / nl, Nf[2] / nl];

  const frames: { n: [number, number, number]; b: [number, number, number] }[] = [];
  for (let i = 0; i < N; i++) {
    if (i > 0) {
      const tp = T[i - 1];
      const tc = T[i];
      const kx = tp[1] * tc[2] - tp[2] * tc[1];
      const ky = tp[2] * tc[0] - tp[0] * tc[2];
      const kz = tp[0] * tc[1] - tp[1] * tc[0];
      const kl = Math.hypot(kx, ky, kz);
      if (kl > 1e-6) {
        const cosA = Math.max(-1, Math.min(1, tp[0] * tc[0] + tp[1] * tc[1] + tp[2] * tc[2]));
        const ang = Math.acos(cosA);
        const s = Math.sin(ang);
        const c = Math.cos(ang);
        const k: [number, number, number] = [kx / kl, ky / kl, kz / kl];
        const kxn: [number, number, number] = [
          k[1] * Nf[2] - k[2] * Nf[1],
          k[2] * Nf[0] - k[0] * Nf[2],
          k[0] * Nf[1] - k[1] * Nf[0],
        ];
        const kdn = k[0] * Nf[0] + k[1] * Nf[1] + k[2] * Nf[2];
        Nf = [
          Nf[0] * c + kxn[0] * s + k[0] * kdn * (1 - c),
          Nf[1] * c + kxn[1] * s + k[1] * kdn * (1 - c),
          Nf[2] * c + kxn[2] * s + k[2] * kdn * (1 - c),
        ];
      }
    }
    const t = T[i];
    const Bf: [number, number, number] = [
      t[1] * Nf[2] - t[2] * Nf[1],
      t[2] * Nf[0] - t[0] * Nf[2],
      t[0] * Nf[1] - t[1] * Nf[0],
    ];
    frames.push({ n: [Nf[0], Nf[1], Nf[2]], b: Bf });
  }

  const R = radialSegments + 1;
  for (let i = 0; i < N; i++) {
    const u = i / Math.max(1, N - 1);
    const p = curve[i];
    const { n, b } = frames[i];
    for (let j = 0; j < R; j++) {
      const v = j / radialSegments;
      const th = v * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const nx = n[0] * c + b[0] * s;
      const ny = n[1] * c + b[1] * s;
      const nz = n[2] * c + b[2] * s;
      builder.appendVerticesInterleaved([
        p[0] + nx * radius,
        p[1] + ny * radius,
        p[2] + nz * radius,
        nx,
        ny,
        nz,
        u,
        v,
        ...color,
      ]);
      vi++;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const bl = startIdx + i * R + j;
      const br = startIdx + i * R + (j + 1);
      const tl = startIdx + (i + 1) * R + j;
      const tr = startIdx + (i + 1) * R + (j + 1);
      indices.push(bl, br, tr, bl, tr, tl);
    }
  }
  builder.appendIndices(indices);
  return vi;
}

function buildRingCurve(radius: number, y: number, steps: number = 32): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  return pts;
}

/**
 * StationPropsBuilder.ts
 * Transforms the 3 stations from primitive graybox blocks into recognizable,
 * credible 3D culinary stations:
 * 1. PrepStation: Butcher-block cutting board with walnut inlay, whole & sliced shallots,
 *    restrained cyan cutting guide + tick marks, and a stainless steel portion ramekin bowl.
 * 2. SkilletStation: Flared cast-iron skillet with handle, Atlantic salmon fillet with
 *    seared crispy skin & herb sprig, and a sleek concentric status ring.
 * 3. SaucepotStation: Brushed stainless steel saucepan with long handle, golden simmering
 *    lemon-shallot reduction, and a sleek blue countdown status ring.
 */
@component
export class StationPropsBuilder extends BaseScriptComponent {
  private shallotSlices: SceneObject[] = [];
  private knifeRoot?: SceneObject;
  private isKnifeChopping: boolean = false;
  private knifeAnimTimer: number = 0.0;
  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  // Thermal LED pulse refs — filled during buildKitchenCountertop
  private ledSearObj?: SceneObject;
  private ledSimmerObj?: SceneObject;
  private reticleRootObj?: SceneObject;
  private isPlatingConverged: boolean = false;
  private elapsedTime: number = 0.0;
  private steamWisps: { obj: SceneObject; mat: Material; phase: number; x: number }[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.upgradeAllStations();
      this.bindSliceSteppingEvents();
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
    });
  }

  private onUpdate(): void {
    this.elapsedTime += getDeltaTime();

    // Knife rock-chop animation
    if (this.isKnifeChopping && this.knifeRoot) {
      this.knifeAnimTimer += getDeltaTime();
      const progress = this.knifeAnimTimer / 0.18; // 180ms total rock-chop duration
      if (progress >= 1.0) {
        this.isKnifeChopping = false;
        this.knifeAnimTimer = 0.0;
        this.knifeRoot.getTransform().setLocalRotation(getKnifeRotation(0));
      } else {
        // Rock-chop: knife handle presses down and smoothly springs back up
        const rockAngle = Math.sin(progress * Math.PI) * (-4.5 * (Math.PI / 180));
        this.knifeRoot.getTransform().setLocalRotation(getKnifeRotation(rockAngle));
      }
    }

    // Steam wisps: slow rise + sway + fade loop above the saucier
    for (const w of this.steamWisps) {
      const t = (this.elapsedTime * 0.28 + w.phase) % 1.0;
      const tr = w.obj.getTransform();
      tr.setLocalPosition(new vec3(w.x + Math.sin((t + w.phase) * 6.0) * 0.5, 4.2 + t * 4.5, -0.5 + w.x * 0.2));
      const s = 2.6 + t * 2.2;
      tr.setLocalScale(new vec3(s, s * 1.5, 1));
      const a = Math.sin(t * Math.PI) * 0.75;
      w.mat.mainPass.baseColor = new vec4(1, 1, 1, a);
    }

    // Thermal LED pulse — SKIPPED: LED glow objects disabled (rendered as floating wires)
    // Kept as no-op so refs remain valid if re-enabled later

    // Optical plating reticle convergence pulse — soft green throb when plating complete
    if (this.reticleRootObj && this.isPlatingConverged) {
      const convergePulse = 1.0 + 0.08 * Math.sin(this.elapsedTime * 4.2);
      this.reticleRootObj.getTransform().setLocalScale(new vec3(convergePulse, 1.0, convergePulse));
    }
  }

  private upgradeAllStations(): void {
    const root = this.getSceneObject();
    root.getTransform().setLocalPosition(new vec3(0, -17.5, -76.0));

    // 0. Build cohesive dark-slate kitchen countertop surface beneath the 3 stations
    this.buildKitchenCountertop(root);
    this.buildPlatingServingStation(root);

    // 1. Reposition & scale the 3 stations for balanced, non-overlapping framing inside SPECS FOV
    const prepStation = findByName(root, "PrepBoardStation");
    const skilletStation = findByName(root, "SkilletStation");
    const sauceStation = findByName(root, "SaucepotStation");

    if (skilletStation) {
      skilletStation.getTransform().setLocalPosition(SKILLET_POS);
      skilletStation.getTransform().setLocalScale(new vec3(0.68, 0.68, 0.68));
      this.buildSkilletProps(skilletStation);
    }

    if (sauceStation) {
      sauceStation.getTransform().setLocalPosition(SAUCIER_POS);
      sauceStation.getTransform().setLocalScale(new vec3(0.74, 0.74, 0.74));
      this.buildSaucepotProps(sauceStation);
    }

    if (prepStation) {
      prepStation.getTransform().setLocalPosition(PREP_POS);
      prepStation.getTransform().setLocalScale(new vec3(0.68, 0.68, 0.68));
      this.buildPrepBoardProps(prepStation);
    }

    // 2. Upgrade SpatialTransferArc conduit
    const arcRoot = findByName(root, "SpatialTransferArc");
    if (arcRoot) {
      this.buildTransferConduit(arcRoot);
    }

    // 3. Bind PLATING_CONVERGENCE → enable reticle pulse; RESET_REQUESTED → clear it
    this.eventBus.on("PLATING_CONVERGENCE", () => {
      this.isPlatingConverged = true;
      if (this.reticleRootObj) this.reticleRootObj.enabled = true;
    });
    this.eventBus.on("RESET_REQUESTED", () => {
      this.isPlatingConverged = false;
      if (this.reticleRootObj) this.reticleRootObj.enabled = false;
      if (this.reticleRootObj) {
        this.reticleRootObj.getTransform().setLocalScale(new vec3(1, 1, 1));
      }
    });
  }

  private buildKitchenCountertop(root: SceneObject): void {
    // Main dark basalt slate slab — honed, matte Belgian Blue finish
    // Slab body uses the light #5A6270 rim colour (visible sides + 1.1 cm top border);
    // a slightly darker honed field sits inset on top. Additive display: nothing near-black.
    // v5: one dark brushed-steel slab with rounded corners and a soft rolled top bevel.
    const counterObj = this.ensureChild(root, "KitchenCountertopSurface");
    counterObj.getTransform().setLocalPosition(COUNTER_CENTER);
    const cRmv = this.ensureRmv(counterObj, MAT_SLAB);
    const slab = new MeshAcc();
    buildRoundedSlab(slab, COUNTER_HALF.x, COUNTER_HALF.z, COUNTER_HALF.y, -COUNTER_HALF.y, 2.2, 0.9);
    slab.apply(cRmv);

    // Legacy single wide induction panel replaced by burner arcs
    const legacyPanel = findByName(counterObj, "InductionCooktopPanel");
    if (legacyPanel) legacyPanel.enabled = false;

    // Thin broken glowing arcs under each burner (amber = sear, cyan = simmer); the live
    // 24-dash countdown ring (DiegeticChronoRing) sits between these two static bands.
    const arcY = -0.215; // StationsRoot-local, just above the slab top (-0.23)
    const sear = new MeshAcc();
    const sx = SKILLET_POS.x, sz = SKILLET_POS.z;
    for (const [a0, a1] of [[12, 78], [102, 168], [192, 258], [282, 348]]) sear.arc(sx, arcY, sz, 7.45, 0.1, a0, a1, 24);
    for (const [a0, a1] of [[-35, 55], [145, 235]]) sear.arc(sx, arcY, sz, 9.55, 0.07, a0, a1, 30);
    for (const [a0, a1] of [[70, 110], [250, 290]]) sear.arc(sx, arcY, sz, 10.05, 0.16, a0, a1, 12);
    this.ensureRmv(this.ensureChild(root, "BurnerArcs_Sear"), MAT_ARC_AMBER);
    sear.apply(this.ensureChild(root, "BurnerArcs_Sear").getComponent("Component.RenderMeshVisual") as RenderMeshVisual);

    const sim = new MeshAcc();
    const px = SAUCIER_POS.x, pz = SAUCIER_POS.z;
    for (const [a0, a1] of [[15, 75], [105, 165], [195, 255], [285, 345]]) sim.arc(px, arcY, pz, 4.75, 0.09, a0, a1, 20);
    for (const [a0, a1] of [[-40, 40], [140, 220]]) sim.arc(px, arcY, pz, 6.95, 0.06, a0, a1, 24);
    for (const [a0, a1] of [[200, 240], [300, 340]]) sim.arc(px, arcY, pz, 7.4, 0.14, a0, a1, 12);
    this.ensureRmv(this.ensureChild(root, "BurnerArcs_Simmer"), MAT_ARC_CYAN);
    sim.apply(this.ensureChild(root, "BurnerArcs_Simmer").getComponent("Component.RenderMeshVisual") as RenderMeshVisual);
  }

  /** Round vitroceramic induction inset (dark glass) framed by a thin emissive cyan bevel. */
  private buildStoveInset(parent: SceneObject, name: string, cx: number, topY: number, cz: number, radius: number): void {
    const insetObj = this.ensureChild(parent, name);
    insetObj.getTransform().setLocalPosition(new vec3(cx, topY, cz));
    const iRmv = this.ensureRmv(insetObj, MAT_STOVE_INSET);
    const ib = createBuilder();
    const discProfile: [number, number][] = [
      [0.0, 0.002],
      [radius, 0.002],
      [radius, 0.010],
      [0.0, 0.010],
    ];
    buildLathe(ib, discProfile, 56, [1, 1, 1, 1], 0, 0, 0, 0);
    iRmv.mesh = ib.getMesh();
    ib.updateMesh();

    const bevelObj = this.ensureChild(insetObj, `${name}_CyanBevel`);
    const bRmv = this.ensureRmv(bevelObj, MAT_LASER_CYAN);
    const bb = createBuilder();
    buildTube(bb, buildRingCurve(radius, 0.010, 64), 0.075, 6, [1, 1, 1, 1], 0);
    bRmv.mesh = bb.getMesh();
    bb.updateMesh();
  }

  /**
   * Builds a realistic flush induction burner graphic:
   * - Outer precision-etched concentric ring (very thin, flush with glass)
   * - Four cardinal tick marks (N/S/E/W alignment)
   * - Subtle inner LED glow ring (thin torus tube, very low profile)
   */
  private buildFlushBurnerGraphic(
    parent: SceneObject,
    name: string,
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    ledMat: Material,
    etchMat: Material
  ): SceneObject {
    const burnerRoot = this.ensureChild(parent, name);
    burnerRoot.getTransform().setLocalPosition(new vec3(cx, cy, cz));

    // Outer etched ring — flat disc segment, essentially a flat line ring
    const outerEtchObj = this.ensureChild(burnerRoot, `${name}_OuterEtch`);
    const oeRmv = this.ensureRmv(outerEtchObj, etchMat);
    const oeb = createBuilder();
    buildTube(oeb, buildRingCurve(radius, 0, 48), 0.09, 6, [1, 1, 1, 1], 0);
    oeRmv.mesh = oeb.getMesh();
    oeb.updateMesh();

    // Inner etched ring at 60% radius
    const innerEtchObj = this.ensureChild(burnerRoot, `${name}_InnerEtch`);
    const ieRmv = this.ensureRmv(innerEtchObj, etchMat);
    const ieb = createBuilder();
    buildTube(ieb, buildRingCurve(radius * 0.58, 0, 36), 0.04, 6, [0.24, 0.28, 0.36, 1], 0);
    ieRmv.mesh = ieb.getMesh();
    ieb.updateMesh();

    // Four cardinal tick marks (N/S/E/W alignment lines)
    const ticksObj = this.ensureChild(burnerRoot, `${name}_CardinalTicks`);
    const tkRmv = this.ensureRmv(ticksObj, etchMat);
    const tkb = createBuilder();
    const tkidx: number[] = [];
    let tkvi = 0;
    const tickLen = radius * 0.22;
    const tickIn = radius * 0.70;
    // North tick
    tkvi = addBox(tkb, tkidx,  0,              0.005, -(tickIn + tickLen / 2), 0.08, 0.005, tickLen / 2, [1,1,1,1], tkvi);
    // South tick
    tkvi = addBox(tkb, tkidx,  0,              0.005,  (tickIn + tickLen / 2), 0.08, 0.005, tickLen / 2, [1,1,1,1], tkvi);
    // East tick
    tkvi = addBox(tkb, tkidx,  (tickIn + tickLen / 2), 0.005, 0, tickLen / 2, 0.005, 0.08, [1,1,1,1], tkvi);
    // West tick
    tkvi = addBox(tkb, tkidx, -(tickIn + tickLen / 2), 0.005, 0, tickLen / 2, 0.005, 0.08, [1,1,1,1], tkvi);
    tkb.appendIndices(tkidx);
    tkRmv.mesh = tkb.getMesh();
    tkb.updateMesh();

    // LED thermal glow ring — DISABLED: tube rings render as floating colored wires in-scene
    // The etched rings above are sufficient and flush with the surface
    const ledObj = this.ensureChild(burnerRoot, `${name}_LedGlow`);
    ledObj.enabled = false;

    // Return ledObj ref (kept disabled; UpdateEvent pulse skipped when disabled)
    return ledObj;
  }

  private buildPlatingServingStation(root: SceneObject): void {
    const plateRoot = this.ensureChild(root, "PlatingServingStation");
    plateRoot.getTransform().setLocalPosition(PLATE_POS); // front-centre, clear of the saucier
    plateRoot.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));

    // ─── 1. Restaurant-Grade Fine Porcelain Coupe Plate ─────────────────────
    // 10.5-inch radius, 14° organic rim flare, shallow concave dish center
    // Double-sided geometry so the dish interior is solid from all angles
    const plateObj = this.ensureChild(plateRoot, "PorcelainCoupePlate");
    plateObj.getTransform().setLocalPosition(new vec3(0, 0, 0));
    const pRmv = this.ensureRmv(plateObj, MAT_PLATE_MATTE);
    const pb = createBuilder();
    // v5: matte stoneware plate — foot ring, broad gently-rising rim, rolled edge.
    const plateProfile: [number, number][] = [
      [0.0,  0.02],
      [3.0,  0.02],
      [3.25, 0.00],
      [3.55, 0.12],
      [4.05, 0.52],
      [5.20, 0.92],
      [5.80, 1.08],
      [5.95, 1.18],
      [5.82, 1.27],
      [5.20, 1.10],
      [4.00, 0.70],
      [3.45, 0.36],
      [3.00, 0.30],
      [0.0,  0.30],
    ];
    buildLathe(pb, plateProfile, 72, [1, 1, 1, 1], 0, 0, 0, 0);
    pRmv.mesh = pb.getMesh();
    pRmv.mainMaterial = MAT_PLATE_MATTE;
    pb.updateMesh();

    // ─── 2. Optical Plating Holographic Reticle ──────────────────────────────
    // Replaces the old thick green rubber ring.
    // Three elements projected flat onto the porcelain surface:
    //   a. Dashed inner saucing pool boundary circle
    //   b. 45° diagonal salmon alignment axis
    //   c. Radial emerald convergence tick ring

    // a) Inner dashed saucing pool circle (8 thin arc dashes at radius 2.4 cm)
    const reticleRootObj = this.ensureChild(plateRoot, "PlatingReticleRoot");
    reticleRootObj.getTransform().setLocalPosition(new vec3(0, 0.34, 0)); // v5: just above the 0.30 plate floor
    // Store ref for UpdateEvent pulse animation on PLATING_CONVERGENCE
    this.reticleRootObj = reticleRootObj;
    // v5: the plate reads as a clean empty plate until plating converges.
    reticleRootObj.enabled = false;
    const dashCount = 10;
    for (let d = 0; d < dashCount; d++) {
      const dashObj = this.ensureChild(reticleRootObj, `PlatingDash_${d}`);
      const angle = (d / dashCount) * Math.PI * 2;
      const dx = Math.cos(angle) * 2.4;
      const dz = Math.sin(angle) * 2.4;
      const dashRmv = this.ensureRmv(dashObj, MAT_INDUCTION_EMERALD);
      const db = createBuilder();
      const didx: number[] = [];
      let dvi = 0;
      // Each dash is a tiny flat bar tangential to the circle
      const tangX = -Math.sin(angle);
      const tangZ = Math.cos(angle);
      dvi = addBox(db, didx, dx, 0.005, dz, Math.abs(tangX) * 0.28 + 0.02, 0.004, Math.abs(tangZ) * 0.28 + 0.02, [0.18, 0.88, 0.52, 1], dvi);
      db.appendIndices(didx);
      dashRmv.mesh = db.getMesh();
      db.updateMesh();
    }

    // b) 45° diagonal salmon alignment crosshair (two thin flat bars rotated 45°)
    const crossObj = this.ensureChild(reticleRootObj, "PlatingAlignmentCross");
    const crRmv = this.ensureRmv(crossObj, MAT_INDUCTION_EMERALD);
    const crb = createBuilder();
    const cridx: number[] = [];
    let crvi = 0;
    // Build axis-aligned bars then rotate the parent 45° around Y to achieve diagonal axis
    crvi = addBox(crb, cridx,  0.0, 0.006, 0.0, 2.0, 0.003, 0.04, [0.18, 0.88, 0.52, 1], crvi);
    crvi = addBox(crb, cridx,  0.0, 0.006, 0.0, 0.04, 0.003, 2.0, [0.18, 0.88, 0.52, 1], crvi);
    crb.appendIndices(cridx);
    crRmv.mesh = crb.getMesh();
    crb.updateMesh();
    // Rotate 45° around Y-axis so the crosshair aligns diagonally for salmon placement
    crossObj.getTransform().setLocalRotation(quat.fromEulerAngles(0, Math.PI * 0.25, 0));

    // c) Outer radial convergence ring (very thin tube, ~3.8 cm radius)
    const convRingObj = this.ensureChild(reticleRootObj, "PlatingConvergenceRing");
    const cvRmv = this.ensureRmv(convRingObj, MAT_INDUCTION_EMERALD);
    const cvb = createBuilder();
    buildTube(cvb, buildRingCurve(3.8, 0, 36), 0.04, 6, [0.18, 0.88, 0.52, 1], 0);
    cvRmv.mesh = cvb.getMesh();
    cvb.updateMesh();
  }

  private buildPrepBoardProps(prepStation: SceneObject): void {
    // 1. End-Grain Butcher Block board with juice groove & rubber corner feet
    const boardObj = findByName(prepStation, "BoardMesh");
    if (boardObj) {
      boardObj.getTransform().setLocalPosition(new vec3(0, 0, 0));
      boardObj.getTransform().setLocalScale(new vec3(1, 1, 1));
      const rmv = boardObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (rmv) {
        // v5: rounded end-grain block — warm side grain body + textured end-grain top
        const body = new MeshAcc();
        buildRoundedSlab(body, 9.2, 6.0, 0.9, -0.9, 0.7, 0.35);
        body.apply(rmv);
        rmv.mainMaterial = MAT_WOOD_SIDE;
      }

      const topObj = this.ensureChild(boardObj, "BoardEndGrainTop");
      const topRmv = this.ensureRmv(topObj, MAT_ENDGRAIN);
      const topAcc = new MeshAcc();
      const tw = 8.82, td = 5.62, ty = 0.904;
      const t0 = topAcc.v(-tw, ty, -td, 0, 1, 0, 0, 1);
      const t1 = topAcc.v(tw, ty, -td, 0, 1, 0, 1, 1);
      const t2 = topAcc.v(tw, ty, td, 0, 1, 0, 1, 0);
      const t3 = topAcc.v(-tw, ty, td, 0, 1, 0, 0, 0);
      topAcc.quad(t0, t1, t2, t3);
      topAcc.apply(topRmv);

      // Four black rubber non-slip feet (elevate board 0.3 cm above slate)
      const feetObj = this.ensureChild(boardObj, "BoardRubberFeet");
      const ftRmv = this.ensureRmv(feetObj, MAT_RUBBER_FOOT);
      const ftb = createBuilder();
      const ftidx: number[] = [];
      let ftvi = 0;
      // Corner positions: inner from edges
      ftvi = addBox(ftb, ftidx, -7.8, -0.95, -4.8, 0.50, 0.32, 0.50, [1, 1, 1, 1], ftvi);
      ftvi = addBox(ftb, ftidx,  7.8, -0.95, -4.8, 0.50, 0.32, 0.50, [1, 1, 1, 1], ftvi);
      ftvi = addBox(ftb, ftidx, -7.8, -0.95,  4.8, 0.50, 0.32, 0.50, [1, 1, 1, 1], ftvi);
      ftvi = addBox(ftb, ftidx,  7.8, -0.95,  4.8, 0.50, 0.32, 0.50, [1, 1, 1, 1], ftvi);
      ftb.appendIndices(ftidx);
      ftRmv.mesh = ftb.getMesh();
      ftb.updateMesh();

      // ── Surface AR laser cutting guide grid (flush projected onto board face) ──
      const gridObj = this.ensureChild(boardObj, "CuttingGridLaser");
      const gridRmv = this.ensureRmv(gridObj, MAT_GUIDE_LINE);
      const gb = createBuilder();
      const gidx: number[] = [];
      let gvi = 0;
      // 9 thin luminous slice guides every 1.5 cm across the cutting lane (v5: hairline width)
      for (let i = 0; i <= 8; i++) {
        const gx = KNIFE_REST_X + i * 1.5;
        gvi = addBox(gb, gidx, gx, 0.912, 1.2, 0.032, 0.006, 3.4, [1, 1, 1, 1], gvi);
      }
      // Two longitudinal guide rails flanking the cutting lane
      gvi = addBox(gb, gidx, KNIFE_REST_X + 6.0, 0.910,  4.6, 6.1, 0.005, 0.022, [1, 1, 1, 1], gvi);
      gvi = addBox(gb, gidx, KNIFE_REST_X + 6.0, 0.910, -2.2, 6.1, 0.005, 0.022, [1, 1, 1, 1], gvi);
      gb.appendIndices(gidx);
      gridRmv.mesh = gb.getMesh();
      gb.updateMesh();

      // v5: no whole bulbs / salt + thyme ramekins — the board reads as a clean mise-en-place
      // with diced rows between the guide lines (red onion, garlic, parsley, red + yellow pepper).
      const strayCube = findByName(boardObj, "ShallotHalfCut");
      if (strayCube) strayCube.enabled = false;

      // 8 diced piles, centred between cut lines (never under the blade). Same objects / events
      // as the old shallot medallions: CUT_REFERENCE_STEP nudges pile i, transfer clears them.
      const vegMats = [MAT_RED_ONION, MAT_RED_ONION, MAT_GARLIC, MAT_PARSLEY, MAT_PARSLEY, MAT_RED_PEPPER, MAT_RED_PEPPER, MAT_YELLOW_PEPPER];
      const vegDie = [0.3, 0.3, 0.22, 0.14, 0.14, 0.32, 0.32, 0.32];
      this.shallotSlices = [];
      for (let i = 0; i < 8; i++) {
        const sliceObj = this.ensureChild(boardObj, `ShallotSlice_${i}`);
        sliceObj.getTransform().setLocalPosition(new vec3(sliceRestX(i), 0.90, 1.2));
        const sliceRmv = this.ensureRmv(sliceObj, vegMats[i]);
        const pile = new MeshAcc();
        const rnd = makeRng(1337 + i * 97);
        const d = vegDie[i];
        const flake = d < 0.15; // parsley: thin chopped flakes
        const n = flake ? 60 : 26;
        for (let k = 0; k < n; k++) {
          const px = (rnd() - 0.5) * 0.95;
          const pz = (rnd() - 0.5) * 3.6;
          // mound: higher in the middle of the row
          const mound = Math.max(0, 1 - (px * px) / 0.3 - (pz * pz) / 4.2);
          const py = d * 0.9 + mound * (flake ? 0.35 : 0.5) * rnd();
          const s = d * (0.75 + 0.5 * rnd());
          pile.box(px, py, pz, s, flake ? s * 0.35 : s * 0.85, s * (flake ? 1.3 : 1.0), rnd() * Math.PI, (rnd() - 0.5) * 0.7);
        }
        pile.apply(sliceRmv);
        sliceRmv.mainMaterial = vegMats[i];
        this.shallotSlices.push(sliceObj);
      }
      // Stainless Steel Portion Ramekin Bowl + target rim (volumetric portion station)
      const portionRamekinObj = this.ensureChild(boardObj, "PortionRamekinBowl");
      portionRamekinObj.getTransform().setLocalPosition(new vec3(6.95, 0.90, 3.1));
      const prRmv = this.ensureRmv(portionRamekinObj, MAT_CHROME);
      const prb = createBuilder();
      const portionBowlProfile: [number, number][] = [
        [0.0,  0.00],
        [2.1,  0.00],
        [2.65, 1.85],
        [2.45, 1.85],
        [1.95, 0.25],
        [0.0,  0.25],
      ];
      buildLathe(prb, portionBowlProfile, 48, [1, 1, 1, 1], 0, 0, 0, 0);
      prRmv.mesh = prb.getMesh();
      prb.updateMesh();

      // Cyan target rim around the top of the portion ramekin
      const rimObj = this.ensureChild(portionRamekinObj, "PortionTargetRim");
      const rimRmv = this.ensureRmv(rimObj, MAT_ARC_CYAN);
      const rimB = createBuilder();
      buildTube(rimB, buildRingCurve(2.62, 1.9, 48), 0.045, 6, [1, 1, 1, 1], 0);
      rimRmv.mesh = rimB.getMesh();
      rimB.updateMesh();
    }

    // 2. Realistic Santoku Chef's Knife with pakkawood handle (LaserCutCurtain host)
    const laserObj = findByName(prepStation, "LaserCutCurtain");
    if (laserObj) {
      this.buildChefKnife(prepStation, laserObj);
    }

    // 3. Portion Fill Level inside Ramekin (VolumetricPortionDome)
    const domeObj = findByName(prepStation, "VolumetricPortionDome");
    if (domeObj) {
      domeObj.getTransform().setLocalPosition(new vec3(6.95, 0.95, 3.1)); // inside PortionRamekinBowl
      domeObj.getTransform().setLocalScale(new vec3(0.4, 0.2, 0.4));
      const dRmv = domeObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (dRmv) {
        const db = createBuilder();
        const fillProfile: [number, number][] = [
          [0.0,  0.0 ],
          [1.8,  0.0 ],
          [2.25, 1.5 ],
          [1.6,  1.85],
          [0.0,  1.95],
        ];
        buildLathe(db, fillProfile, 40, [1, 1, 1, 1], 0, 0, 0, 0);
        dRmv.mesh = db.getMesh();
        dRmv.mainMaterial = MAT_PARSLEY; // v5: bowl of chopped herbs
        db.updateMesh();
      }
    }
  }

  private buildChefKnife(prepStation: SceneObject, laserObj: SceneObject): void {
    // Edge lifted to rest just above the board top (0.90) instead of sinking into it.
    // Rest x = KNIFE_REST_X = cut line 0 (matches MetricPrepBlueprint.startPositionX in Scene.scene).
    laserObj.getTransform().setLocalPosition(new vec3(KNIFE_REST_X, 0.93, 1.0));
    laserObj.getTransform().setLocalRotation(quat.quatIdentity());
    laserObj.getTransform().setLocalScale(new vec3(1, 1, 1));
    const lRmv = laserObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (lRmv) lRmv.enabled = false;

    // KnifeRoot contains the knife hierarchy and allows pivot rotation for rocking chop
    const knifeRoot = this.ensureChild(laserObj, "KnifeRoot");
    knifeRoot.getTransform().setLocalPosition(new vec3(0, 0, 0));
    knifeRoot.getTransform().setLocalRotation(getKnifeRotation(0));
    knifeRoot.getTransform().setLocalScale(new vec3(1, 1, 1));
    this.knifeRoot = knifeRoot;

    // 1. Blade: Forged Stainless Steel Japanese/German Chef's Blade (Length 7.6cm, Height 2.4cm)
    const bladeObj = this.ensureChild(knifeRoot, "KnifeBlade");
    const bladeRmv = this.ensureRmv(bladeObj, MAT_STEEL_BLADE);
    this.buildBladeMesh(bladeRmv);

    // 2. Bolster: Solid Heavy Forged Steel Collar (z = 1.8 to 2.2)
    const bolsterObj = this.ensureChild(knifeRoot, "KnifeBolster");
    const bolsterRmv = this.ensureRmv(bolsterObj, MAT_STEEL_BOLSTER);
    const bb = createBuilder();
    const bidx: number[] = [];
    addBox(bb, bidx, 0, 1.51, 2.00, 0.18, 0.81, 0.20, [1, 1, 1, 1], 0);
    bb.appendIndices(bidx);
    bolsterRmv.mesh = bb.getMesh();
    bb.updateMesh();

    // 3. Ergonomic Contoured Pakkawood Handle (extends toward user in +Z from z = 2.2 to 6.8)
    const handleObj = this.ensureChild(knifeRoot, "KnifeHandle");
    const handleRmv = this.ensureRmv(handleObj, MAT_POLY_HANDLE); // v5: black chef-knife handle
    this.buildHandleMesh(handleRmv);

    // 4. Exposed Steel Tang along the handle spine (z = 2.2 to 6.8)
    const tangObj = this.ensureChild(knifeRoot, "KnifeTangSpine");
    const tangRmv = this.ensureRmv(tangObj, MAT_STEEL_BOLSTER);
    const tb = createBuilder();
    const tidx: number[] = [];
    addBox(tb, tidx, 0, 2.30, 4.50, 0.05, 0.03, 2.30, [1, 1, 1, 1], 0);
    tb.appendIndices(tidx);
    tangRmv.mesh = tb.getMesh();
    tb.updateMesh();

    // 5. Triple Solid Brass Compression Rivets
    const rivetsObj = this.ensureChild(knifeRoot, "KnifeRivets");
    const rivetsRmv = this.ensureRmv(rivetsObj, MAT_RIVET_STEEL);
    this.buildRivetsMesh(rivetsRmv);

    // 6. Stainless Steel Butt Cap / Exposed End Tang at z = 6.84
    const buttObj = this.ensureChild(knifeRoot, "KnifeButtCap");
    const buttRmv = this.ensureRmv(buttObj, MAT_STEEL_BOLSTER);
    const cb = createBuilder();
    const cidx: number[] = [];
    addBox(cb, cidx, 0, 1.48, 6.84, 0.28, 0.85, 0.04, [1, 1, 1, 1], 0);
    cb.appendIndices(cidx);
    buttRmv.mesh = cb.getMesh();
    cb.updateMesh();

    // 7. Restrained Cyan Laser Cutting Guide Line along the board surface
    const guideObj = this.ensureChild(knifeRoot, "KnifeLaserGuide");
    const guideRmv = this.ensureRmv(guideObj, MAT_CYAN);
    const gb = createBuilder();
    const gidx: number[] = [];
    addBox(gb, gidx, 0, 0.02, -2.0, 0.04, 0.015, 3.8, [1, 1, 1, 1], 0);
    gb.appendIndices(gidx);
    guideRmv.mesh = gb.getMesh();
    gb.updateMesh();
  }

  private buildBladeMesh(rmv: RenderMeshVisual): void {
    const b = createBuilder();
    const indices: number[] = [];
    const verts: number[] = [];

    // Authentic sleek chef's blade cross-sections from tip (z = -5.8) to bolster (z = 1.8)
    // Razor edge rests at y = 0.0 on board at shallot cutting lane
    const sections = [
      // 0: Drop-point tip (z = -5.8)
      { z: -5.8, yEdge: 0.25, yBevel: 0.38, ySpine: 0.50, hwEdge: 0.012, hwBevel: 0.025, hwSpine: 0.035 },
      // 1: Tip curve (z = -5.0)
      { z: -5.0, yEdge: 0.14, yBevel: 0.55, ySpine: 1.05, hwEdge: 0.014, hwBevel: 0.038, hwSpine: 0.055 },
      // 2: Front belly (z = -3.8)
      { z: -3.8, yEdge: 0.04, yBevel: 0.80, ySpine: 1.65, hwEdge: 0.016, hwBevel: 0.050, hwSpine: 0.075 },
      // 3: Mid-belly (z = -2.4)
      { z: -2.4, yEdge: 0.01, yBevel: 0.92, ySpine: 2.05, hwEdge: 0.018, hwBevel: 0.060, hwSpine: 0.095 },
      // 4: Sweet-spot flat (z = -0.8)
      { z: -0.8, yEdge: 0.00, yBevel: 0.96, ySpine: 2.30, hwEdge: 0.018, hwBevel: 0.068, hwSpine: 0.115 },
      // 5: Shallot cutting lane (z = 0.8)
      { z:  0.8, yEdge: 0.00, yBevel: 0.96, ySpine: 2.40, hwEdge: 0.018, hwBevel: 0.075, hwSpine: 0.130 },
      // 6: Blade heel (z = 1.5)
      { z:  1.5, yEdge: 0.02, yBevel: 0.94, ySpine: 2.40, hwEdge: 0.020, hwBevel: 0.080, hwSpine: 0.138 },
      // 7: Choil finger cutout curve (z = 1.7)
      { z:  1.7, yEdge: 0.35, yBevel: 0.92, ySpine: 2.36, hwEdge: 0.028, hwBevel: 0.088, hwSpine: 0.140 },
      // 8: Choil meets forged bolster (z = 1.8)
      { z:  1.8, yEdge: 0.70, yBevel: 0.92, ySpine: 2.32, hwEdge: 0.045, hwBevel: 0.095, hwSpine: 0.142 },
    ];

    const S = sections.length;
    for (let i = 0; i < S; i++) {
      const s = sections[i];
      const u = i / (S - 1);
      // 6 vertices per cross section:
      // 0: Left cutting edge
      verts.push(-s.hwEdge, s.yEdge, s.z,  -0.94, -0.34, 0,  u, 0.0,  1, 1, 1, 1);
      // 1: Left grind bevel
      verts.push(-s.hwBevel, s.yBevel, s.z, -0.98,  0.20, 0,  u, 0.4,  1, 1, 1, 1);
      // 2: Left spine top
      verts.push(-s.hwSpine, s.ySpine, s.z, -0.65,  0.76, 0,  u, 1.0,  1, 1, 1, 1);
      // 3: Right spine top
      verts.push( s.hwSpine, s.ySpine, s.z,  0.65,  0.76, 0,  u, 1.0,  1, 1, 1, 1);
      // 4: Right grind bevel
      verts.push( s.hwBevel, s.yBevel, s.z,  0.98,  0.20, 0,  u, 0.4,  1, 1, 1, 1);
      // 5: Right cutting edge
      verts.push( s.hwEdge, s.yEdge, s.z,   0.94, -0.34, 0,  u, 0.0,  1, 1, 1, 1);
    }

    const addQuad = (i0: number, i1: number, i2: number, i3: number) => {
      indices.push(i0, i1, i2, i0, i2, i3);
    };

    for (let i = 0; i < S - 1; i++) {
      const a = i * 6;
      const b = (i + 1) * 6;
      // Left cutting bevel
      addQuad(a + 0, b + 0, b + 1, a + 1);
      // Left primary face
      addQuad(a + 1, b + 1, b + 2, a + 2);
      // Spine top
      addQuad(a + 2, b + 2, b + 3, a + 3);
      // Right primary face
      addQuad(a + 3, b + 3, b + 4, a + 4);
      // Right cutting bevel
      addQuad(a + 4, b + 4, b + 5, a + 5);
      // Razor edge bottom
      addQuad(a + 5, b + 5, b + 0, a + 0);
    }

    // Tip end cap (pointing in -Z)
    indices.push(0, 2, 1,  0, 3, 2,  0, 4, 3,  0, 5, 4);

    // Heel end cap (pointing in +Z)
    const h = (S - 1) * 6;
    indices.push(h + 0, h + 1, h + 2,  h + 0, h + 2, h + 3,  h + 0, h + 3, h + 4,  h + 0, h + 4, h + 5);

    b.appendVerticesInterleaved(verts);
    b.appendIndices(indices);
    rmv.mesh = b.getMesh();
    b.updateMesh();
  }

  private buildHandleMesh(rmv: RenderMeshVisual): void {
    const b = createBuilder();
    const indices: number[] = [];
    const verts: number[] = [];

    // Contoured ergonomic Pakkawood handle extending toward user in +Z from z = 2.2 to 6.8
    const handleSecs = [
      // 0: Neck pinch behind bolster
      { z: 2.2, cy: 1.51, hw: 0.18, hh: 0.72 },
      // 1: Index finger choil groove
      { z: 2.8, cy: 1.52, hw: 0.20, hh: 0.68 },
      // 2: Front brass rivet
      { z: 3.5, cy: 1.54, hw: 0.24, hh: 0.74 },
      // 3: Mid-handle palm swell
      { z: 4.6, cy: 1.56, hw: 0.28, hh: 0.82 },
      // 4: Rear finger groove
      { z: 5.8, cy: 1.52, hw: 0.25, hh: 0.75 },
      // 5: Ergonomic butt hook flare
      { z: 6.8, cy: 1.48, hw: 0.27, hh: 0.84 },
    ];

    const H = handleSecs.length;
    const SEG = 18;
    for (let i = 0; i < H; i++) {
      const s = handleSecs[i];
      const u = i / (H - 1);
      for (let j = 0; j < SEG; j++) {
        const v = j / SEG;
        const th = v * Math.PI * 2;
        const cos = Math.cos(th);
        const sin = Math.sin(th);
        const x = cos * s.hw;
        const y = s.cy + sin * s.hh;
        const nx = cos;
        const ny = sin;
        verts.push(x, y, s.z, nx, ny, 0, u, v, 1, 1, 1, 1);
      }
    }

    for (let i = 0; i < H - 1; i++) {
      for (let j = 0; j < SEG; j++) {
        const nextJ = (j + 1) % SEG;
        const bl = i * SEG + j;
        const br = i * SEG + nextJ;
        const tl = (i + 1) * SEG + j;
        const tr = (i + 1) * SEG + nextJ;
        indices.push(bl, br, tr, bl, tr, tl);
      }
    }

    // Rear butt cap center fan
    const buttCenterIdx = H * SEG;
    verts.push(0, handleSecs[H - 1].cy, handleSecs[H - 1].z, 0, 0, 1, 0.5, 0.5, 1, 1, 1, 1);
    const lastRow = (H - 1) * SEG;
    for (let j = 0; j < SEG; j++) {
      const nextJ = (j + 1) % SEG;
      indices.push(buttCenterIdx, lastRow + nextJ, lastRow + j);
    }

    b.appendVerticesInterleaved(verts);
    b.appendIndices(indices);
    rmv.mesh = b.getMesh();
    b.updateMesh();
  }

  private buildRivetsMesh(rmv: RenderMeshVisual): void {
    const b = createBuilder();
    const indices: number[] = [];
    let vi = 0;

    const rivetPositions = [
      { z: 3.5, y: 1.54, hw: 0.24 },
      { z: 4.6, y: 1.56, hw: 0.28 },
      { z: 5.8, y: 1.52, hw: 0.25 },
    ];

    for (const r of rivetPositions) {
      // Left and right flush brass compression rivets
      vi = addBox(b, indices, -r.hw - 0.015, r.y, r.z, 0.015, 0.10, 0.10, [1, 1, 1, 1], vi);
      vi = addBox(b, indices,  r.hw + 0.015, r.y, r.z, 0.015, 0.10, 0.10, [1, 1, 1, 1], vi);
    }

    b.appendIndices(indices);
    rmv.mesh = b.getMesh();
    b.updateMesh();
  }

  private buildSkilletProps(skilletStation: SceneObject): void {
    // 1. Seasoned cast-iron skillet (SkilletPan) — v5: smooth 72-seg lathe, rolled rim, speckled iron
    const panObj = findByName(skilletStation, "SkilletPan");
    if (!panObj) return;
    panObj.getTransform().setLocalPosition(new vec3(0, 0, 0));
    panObj.getTransform().setLocalRotation(quat.fromEulerAngles(0, SKILLET_YAW, 0));
    panObj.getTransform().setLocalScale(new vec3(1, 1, 1));
    const pRmv = panObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (pRmv) {
      const pb = createBuilder();
      const panProfile: [number, number][] = [
        [0.0, 0.0],
        [7.9, 0.0],
        [8.45, 0.1],
        [9.3, 0.72],
        [9.85, 1.42],
        [10.06, 1.70],
        [10.02, 1.84],
        [9.84, 1.86],
        [9.62, 1.62],
        [8.85, 0.78],
        [8.05, 0.5],
        [0.0, 0.48],
      ];
      buildLathe(pb, panProfile, 72, [1, 1, 1, 1], 0, 0, 0, 0);
      pRmv.mesh = pb.getMesh();
      pRmv.mainMaterial = MAT_CAST_IRON_TEX;
      pb.updateMesh();
    }

    // Long cast-iron handle (smooth sampled curve) with a rounded end cap
    const handleObj = this.ensureChild(panObj, "SkilletHandle");
    const hRmv = this.ensureRmv(handleObj, MAT_CAST_IRON_TEX);
    const hb = createBuilder();
    const handleCurve: [number, number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const u = 1 - t;
      handleCurve.push([
        u * u * -9.2 + 2 * u * t * -12.0 + t * t * -15.6,
        u * u * 1.45 + 2 * u * t * 1.75 + t * t * 2.35,
        u * u * 3.3 + 2 * u * t * 4.6 + t * t * 6.15,
      ]);
    }
    let hvi = buildTube(hb, handleCurve, 0.6, 16, [1, 1, 1, 1], 0);
    // end knob
    const end = handleCurve[handleCurve.length - 1];
    hvi = buildLathe(hb, [[0, -0.6], [0.45, -0.45], [0.6, 0], [0.45, 0.45], [0, 0.6]], 16, [1, 1, 1, 1], hvi, end[0], end[1], end[2]);
    hRmv.mesh = hb.getMesh();
    hb.updateMesh();

    // (v4) legacy pour spouts read as a wireframe box over the salmon; keep them off.
    for (const legacy of ["SkilletPourSpout_L", "SkilletPourSpout_R"]) {
      const o = findByName(panObj, legacy);
      if (o) o.enabled = false;
    }

    // Glossy rendered fat pooling on the pan floor
    const oilObj = this.ensureChild(panObj, "SkilletOilPool");
    const oilRmv = this.ensureRmv(oilObj, MAT_PAN_OIL);
    const oil = new MeshAcc();
    oil.disc(0, 0.5, 0, 6.6, 64, 0.02);
    oil.apply(oilRmv);

    // Seared salmon fillet — rounded "pillow" with a tapered tail, crust + grill-mark texture
    const salmonObj = this.ensureChild(panObj, "SalmonFillet");
    salmonObj.getTransform().setLocalPosition(new vec3(0, 0.5, 0));
    salmonObj.getTransform().setLocalRotation(quat.fromEulerAngles(0, 18 * (Math.PI / 180) - SKILLET_YAW, 0));
    salmonObj.getTransform().setLocalScale(new vec3(1, 1, 1));
    const sRmv = this.ensureRmv(salmonObj, MAT_SALMON_SEARED);
    this.buildSalmonMesh(sRmv, 5.3, 2.7, 1.9);

    // Rosemary sprig laid across the fillet
    const herbObj = this.ensureChild(salmonObj, "HerbSprig");
    const herbRmv = this.ensureRmv(herbObj, MAT_ROSEMARY);
    this.buildRosemaryMesh(herbRmv);

    // 2. Helper handle — rounded cast-iron loop opposite the main handle, at rim height
    const helperTabObj = this.ensureChild(panObj, "SkilletHelperTab");
    const htRmv = this.ensureRmv(helperTabObj, MAT_CAST_IRON_TEX);
    const htb = createBuilder();
    const helperCurve: [number, number, number][] = [
      [ 9.6, 1.55, -1.1],
      [10.8, 1.66, -0.8],
      [11.25, 1.7,  0.0],
      [10.8, 1.66,  0.8],
      [ 9.6, 1.55,  1.1],
    ];
    buildTube(htb, helperCurve, 0.26, 10, [1, 1, 1, 1], 0);
    htRmv.mesh = htb.getMesh();
    htb.updateMesh();

    // 3. Suppress floating torus rings — replaced by flush burner arcs on the slab
    for (const n of ["MiddleRing", "InnerTarget", "InspectionDisc"]) {
      const o = findByName(skilletStation, n);
      if (o) {
        o.enabled = false;
        o.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      }
    }
  }

  /** Rounded fillet: superellipse footprint, flat-topped dome, tail tapering toward +X. */
  private buildSalmonMesh(rmv: RenderMeshVisual, a: number, b0: number, H: number): void {
    const K = 10;
    const M = 64;
    const P = 4.0;
    const halfW = (x: number): number => {
      const t = Math.max(0, Math.min(1, (x / a + 1) / 2));
      return b0 * (1 - 0.3 * Math.pow(t, 1.6));
    };
    const pt = (s: number, th: number): [number, number, number] => {
      const c = Math.cos(th), sn = Math.sin(th);
      const bx = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / P);
      const x = s * bx;
      const z = s * halfW(x) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / P);
      const y = H * Math.pow(Math.max(0, 1 - Math.pow(s, 5)), 0.42) * (1 - 0.12 * Math.max(0, x / a));
      return [x, y, z];
    };
    const acc = new MeshAcc();
    const grid: number[][] = [];
    for (let k = 0; k <= K; k++) {
      const s = k / K;
      const row: number[] = [];
      for (let m = 0; m < M; m++) {
        const th = (m / M) * Math.PI * 2;
        const p = pt(s, th);
        const e = 0.004;
        const ps = pt(Math.min(1, s + e), th), ms = pt(Math.max(0, s - e), th);
        const pa = pt(Math.max(s, 0.02), th + e), ma = pt(Math.max(s, 0.02), th - e);
        const ds = [ps[0] - ms[0], ps[1] - ms[1], ps[2] - ms[2]];
        const da = [pa[0] - ma[0], pa[1] - ma[1], pa[2] - ma[2]];
        let nx = ds[1] * da[2] - ds[2] * da[1];
        let ny = ds[2] * da[0] - ds[0] * da[2];
        let nz = ds[0] * da[1] - ds[1] * da[0];
        if (nx * p[0] + ny * (p[1] + 2.0) + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (k === 0) { nx = 0; ny = 1; nz = 0; }
        row.push(acc.v(p[0], p[1], p[2], nx, ny, nz, p[0] / (2 * a) + 0.5, p[2] / (2 * b0) + 0.5));
      }
      grid.push(row);
    }
    for (let k = 0; k < K; k++) {
      for (let m = 0; m < M; m++) {
        const m2 = (m + 1) % M;
        acc.quad(grid[k][m], grid[k][m2], grid[k + 1][m2], grid[k + 1][m]);
      }
    }
    acc.apply(rmv);
  }

  /** Rosemary: arched stem with paired needles (thin tubes). */
  private buildRosemaryMesh(rmv: RenderMeshVisual): void {
    const b = createBuilder();
    const stem: [number, number, number][] = [];
    const A: [number, number, number] = [-3.2, 1.86, -1.3];
    const B: [number, number, number] = [3.0, 1.8, 1.25];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      stem.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t + Math.sin(t * Math.PI) * 0.22, A[2] + (B[2] - A[2]) * t]);
    }
    let vi = buildTube(b, stem, 0.06, 6, [1, 1, 1, 1], 0);
    const dx = B[0] - A[0], dz = B[2] - A[2];
    const dl = Math.hypot(dx, dz);
    const tx = dx / dl, tz = dz / dl;
    const rnd = makeRng(4242);
    for (let i = 1; i < 22; i++) {
      const t = 0.04 + (i / 22) * 0.92;
      const sx = A[0] + dx * t;
      const sy = A[1] + (B[1] - A[1]) * t + Math.sin(t * Math.PI) * 0.22;
      const sz = A[2] + dz * t;
      for (const side of [-1, 1]) {
        const ang = (side * (48 + rnd() * 20) * Math.PI) / 180;
        // rotate the stem tangent around Y by ang, lean slightly toward the tip and up
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const ux = tx * ca - tz * sa;
        const uz = tx * sa + tz * ca;
        const len = 0.55 + rnd() * 0.25;
        vi = buildTube(b, [[sx, sy, sz], [sx + ux * len * 0.5, sy + 0.07, sz + uz * len * 0.5], [sx + ux * len, sy + 0.04, sz + uz * len]], 0.035, 4, [1, 1, 1, 1], vi);
      }
    }
    rmv.mesh = b.getMesh();
    b.updateMesh();
  }

  private buildSaucepotProps(sauceStation: SceneObject): void {
    // 1. Polished tri-ply stainless saucier — v5: 72-seg lathe, chrome PBR, rolled lip
    const potObj = findByName(sauceStation, "SaucepotPot");
    if (potObj) {
      potObj.getTransform().setLocalPosition(new vec3(0, 0, 0));
      potObj.getTransform().setLocalScale(new vec3(1, 1, 1));
      const pRmv = potObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (pRmv) {
        const pb = createBuilder();
        const potProfile: [number, number][] = [
          [0.0, 0.00],
          [2.4, 0.04],
          [4.0, 0.26],
          [4.8, 0.85],
          [5.05, 2.00],
          [5.12, 3.70],
          [5.30, 4.70],
          [5.52, 5.02],
          [5.50, 5.16],
          [5.30, 5.14],
          [5.00, 4.86],
          [4.84, 3.80],
          [4.64, 1.20],
          [3.60, 0.62],
          [0.0, 0.48],
        ];
        buildLathe(pb, potProfile, 72, [1, 1, 1, 1], 0, 0, 0, 0);
        pRmv.mesh = pb.getMesh();
        pRmv.mainMaterial = MAT_CHROME;
        pb.updateMesh();
      }

      // Long stainless handle angled rear-right (never crosses the butcher block)
      const handleObj = this.ensureChild(potObj, "SaucepanHandle");
      const hRmv = this.ensureRmv(handleObj, MAT_CHROME);
      const hb = createBuilder();
      const HANDLE_YAW = 35 * (Math.PI / 180);
      const hc = Math.cos(HANDLE_YAW);
      const hs = Math.sin(HANDLE_YAW);
      const handleCurve: [number, number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const r = 5.25 + t * 7.4;
        handleCurve.push([r * hc, 4.55 + t * 1.25 + Math.sin(t * Math.PI) * 0.25, -r * hs]);
      }
      let hvi = buildTube(hb, handleCurve, 0.4, 16, [1, 1, 1, 1], 0);
      const he = handleCurve[handleCurve.length - 1];
      hvi = buildLathe(hb, [[0, -0.4], [0.3, -0.3], [0.4, 0], [0.3, 0.3], [0, 0.4]], 16, [1, 1, 1, 1], hvi, he[0], he[1], he[2]);
      hRmv.mesh = hb.getMesh();
      hb.updateMesh();

      // Domed rivets either side of the handle root
      const rbx = 5.4 * hc;
      const rbz = -5.4 * hs;
      const rivetObj = this.ensureChild(potObj, "HandleRivet1");
      const rRmv = this.ensureRmv(rivetObj, MAT_CHROME);
      const rb = createBuilder();
      const dome: [number, number][] = [[0, -0.22], [0.16, -0.16], [0.22, 0], [0.16, 0.16], [0, 0.22]];
      let rvi = buildLathe(rb, dome, 12, [1, 1, 1, 1], 0, rbx + 0.5 * hs, 4.55, rbz + 0.5 * hc);
      rvi = buildLathe(rb, dome, 12, [1, 1, 1, 1], rvi, rbx - 0.5 * hs, 4.55, rbz - 0.5 * hc);
      rRmv.mesh = rb.getMesh();
      rb.updateMesh();

      // Simmering tomato reduction flecked with herbs (textured, glossy, slightly domed)
      const sauceObj = this.ensureChild(potObj, "SimmeringLemonSauce");
      const sRmv = this.ensureRmv(sauceObj, MAT_SAUCE_TOMATO);
      const sauce = new MeshAcc();
      sauce.disc(0, 3.86, 0, 4.83, 64, 0.08);
      sauce.apply(sRmv);

      // Soft steam wisps rising off the reduction
      this.buildSteam(potObj);
    }

    // 2. Suppress floating PotSimmerRing — burner arcs on the slab handle this now
    const potRing = findByName(sauceStation, "PotSimmerRing");
    if (potRing) {
      potRing.enabled = false;
      potRing.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    }
  }

  private buildSteam(potObj: SceneObject): void {
    const quad = new MeshAcc();
    const q0 = quad.v(-0.5, 0, 0, 0, 0, 1, 0, 0);
    const q1 = quad.v(0.5, 0, 0, 0, 0, 1, 1, 0);
    const q2 = quad.v(0.5, 1, 0, 0, 0, 1, 1, 1);
    const q3 = quad.v(-0.5, 1, 0, 0, 0, 1, 0, 1);
    quad.quad(q0, q1, q2, q3);
    this.steamWisps = [];
    for (let i = 0; i < 3; i++) {
      const o = this.ensureChild(potObj, `SaucierSteam_${i}`);
      const m = makeTexturedPbr(TEX_STEAM, 0.0, 1.0, 1, 1, 1);
      m.mainPass.blendMode = BlendMode.Normal;
      m.mainPass.depthWrite = false;
      m.mainPass.twoSided = true;
      try {
        (m.mainPass as any).Port_Emissive_N006 = new vec3(0.55, 0.55, 0.58);
      } catch (e) {
        // no emissive port
      }
      const rmv = this.ensureRmv(o, m);
      quad.apply(rmv);
      this.steamWisps.push({ obj: o, mat: m, phase: i / 3, x: (i - 1) * 1.6 });
    }
  }

  private buildTransferConduit(arcRoot: SceneObject): void {
    // CRITICAL: Keep TransferArcTube — LEAF test asserts findSceneObjectByName("TransferArcTube") is truthy
    // and enabled=true after transfer tap. SpatialTransferArc.ts re-enables it on trigger.
    const arcTube = findByName(arcRoot, "TransferArcTube");
    if (arcTube) {
      // Scale to near-invisible but keep enabled=false at rest; SpatialTransferArc.ts sets enabled=true on trigger
      arcTube.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      arcTube.enabled = false;
    }

    // Hide legacy stick conduit
    const conduit = findByName(arcRoot, "CountertopConduit");
    if (conduit) {
      conduit.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      conduit.enabled = false;
    }

    // Build luminous parabolic transfer ribbon — sibling of TransferArcTube
    // Visible only during transfer (SpatialTransferArc.ts or eventBus enables this)
    const ribbonObj = this.ensureChild(arcRoot, "TransferParabolicRibbon");
    ribbonObj.enabled = false; // hidden at rest; enabled on transfer trigger
    const ribbonRmv = this.ensureRmv(ribbonObj, MAT_TRANSFER_RIBBON);
    const rb = createBuilder();
    // Parabolic arc: prep board (X~+12, Y~1, Z~-2) → saucepot (X~0, Y~+5, Z~-10)
    // Sampled from the same quadratic Bezier the flying shallots use in SpatialTransferArc
    // (P0 board (11.5,1.2,-2.5) -> P1 (5.5,6.2,-6.5) -> P2 saucier mouth (0,1.6,-10.5)),
    // so the ribbon and the pieces coincide.
    // The ribbon lives under SpatialTransferArc (offset from StationsRoot), the pieces under
    // StationsRoot, so convert into arcRoot-local space.
    const o = arcRoot.getTransform().getLocalPosition();
    const arcCurve: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      arcCurve.push([
        u * u * 11.5 + 2 * u * t * 5.5 + t * t * 0.0 - o.x,
        u * u * 1.2 + 2 * u * t * 6.2 + t * t * 1.6 - o.y,
        u * u * -2.5 + 2 * u * t * -6.5 + t * t * -10.5 - o.z,
      ]);
    }
    buildTube(rb, arcCurve, 0.22, 8, [0.22, 0.86, 0.98, 0.9], 0);
    ribbonRmv.mesh = rb.getMesh();
    rb.updateMesh();
  }

  private bindSliceSteppingEvents(): void {
    this.eventBus.on("CUT_REFERENCE_STEP", (data: any) => {
      const idx = (data && typeof data.sliceIndex === "number" ? data.sliceIndex : 1) - 1;
      if (idx >= 0 && idx < this.shallotSlices.length) {
        const slice = this.shallotSlices[idx];
        // Cut slice falls away from the advancing blade (left) and toward the chef,
        // staying on the board surface (y 0.90) so nothing sinks into the wood.
        slice.getTransform().setLocalPosition(new vec3(sliceRestX(idx) - 0.3, 0.90, 2.1));
      }
      this.isKnifeChopping = true;
      this.knifeAnimTimer = 0.0;
    });

    this.eventBus.on("STATION_STEP_COMPLETED", (data: any) => {
      if (data && data.stationId === "PREP") {
        // Shallots transferred into saucepot: clear cutting board slices
        for (let i = 0; i < this.shallotSlices.length; i++) {
          this.shallotSlices[i].getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001));
        }
        // Enrich saucepot reduction surface color
        const root = this.getSceneObject();
        const saucePlane = findByName(root, "SauceReductionPlane");
        if (saucePlane) {
          const rmv = saucePlane.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
          if (rmv) rmv.mainMaterial = MAT_SAUCE;
        }
      }
    });

    this.eventBus.on("RESET_REQUESTED", () => {
      for (let i = 0; i < this.shallotSlices.length; i++) {
        this.shallotSlices[i].getTransform().setLocalScale(new vec3(1, 1, 1));
        this.shallotSlices[i].getTransform().setLocalPosition(new vec3(sliceRestX(i), 0.90, 1.2));
      }
      if (this.knifeRoot) {
        this.isKnifeChopping = false;
        this.knifeAnimTimer = 0.0;
        this.knifeRoot.getTransform().setLocalRotation(getKnifeRotation(0));
      }
    });
  }

  private ensureChild(parent: SceneObject, name: string): SceneObject {
    const count = parent.getChildrenCount();
    for (let i = 0; i < count; i++) {
      const ch = parent.getChild(i);
      if (ch.name === name) return ch;
    }
    const created = global.scene.createSceneObject(name);
    created.setParent(parent);
    return created;
  }

  private ensureRmv(obj: SceneObject, mat: Material): RenderMeshVisual {
    let rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!rmv) {
      rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    }
    if (mat) {
      rmv.mainMaterial = mat;
    }
    return rmv;
  }
}
