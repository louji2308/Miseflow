import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { KitchenAnchorRoot } from "./KitchenAnchorRoot";
import { DishAssetBuilders, IDishAssetBuilder, PantryContext, ProteinSpec, StagedDishItem, StarchTint } from "./AI/IDishAssetBuilder";
import { getPreset } from "./AI/DishLibraryConfig";
import { canonicalProteinNumber, getCatalogEntry, PROTEIN_REGISTRY } from "./AI/AssetPageTable";
import { VesselSlotId } from "./AI/SpatialSlotAllocator";
import { PrepSlotEntry, Rgb, UniversalDishBlueprint } from "./AI/UniversalDishSchema";
import { buildVegStages, resolveVeg } from "./VegGenerators";
import { StarchProp, starchGenFor } from "./StarchGenerators";
import { ProteinProp, ProteinRegistry, ProteinTint, proteinGenFor, registerPanFloor } from "./ProteinGenerators";
import { HeroWareController, warePlanFor, WarePlan } from "./VesselGenerators";
import { ToolWareController } from "./ToolGenerators";
import { PantryController } from "./PantryGenerators";
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
// WS10: tint nudged from cool blue-slate (1.45,1.50,1.60) to a slightly warmer, deeper graphite-slate.
const MAT_SLAB = makeTexturedPbr(TEX_SLAB, 0.35, 0.28, 1.44, 1.42, 1.43);        // brushed graphite-slate steel
const MAT_CAST_IRON_TEX = makeTexturedPbr(TEX_CAST_IRON, 0.4, 0.42, 1.55, 1.55, 1.6); // seasoned cast iron
const MAT_SALMON_SEARED = makeTexturedPbr(TEX_SALMON, 0.0, 0.32);                    // crust + grill marks
// WS9-P2: pan-side crispy skin (hidden until the spatula flips the fillet); the vision stand-in
// re-tints it through its "SalmonCrispySkin" binding.
const MAT_SALMON_CRISP = makeTexturedPbr(TEX_SALMON, 0.0, 0.18, 0.95, 1.0, 0.45);   // golden-brown crisp skin
export const MAT_SAUCE_TOMATO = makeTexturedPbr(TEX_SAUCE, 0.05, 0.1);               // red-orange reduction
const MAT_ENDGRAIN = makeTexturedPbr(TEX_ENDGRAIN, 0.0, 0.62);                       // end-grain block top
const MAT_WOOD_SIDE = makePbrMaterial(0.56, 0.34, 0.17, 0.0, 0.6);
const MAT_CHROME = makePbrMaterial(0.95, 0.96, 0.97, 0.55, 0.2);
const MAT_PLATE_MATTE = makePbrMaterial(0.80, 0.80, 0.78, 0.0, 0.62); // WS9: solid matte light grey
const MAT_PLATE_RIM = makePbrMaterial(0.56, 0.57, 0.58, 0.05, 0.5);
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
export class MeshAcc {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uvs: number[] = [];
  private idx: number[] = [];

  // Optional placement transform (M = R*S for positions, R*S^-1 for normals) applied in v().
  private xm: number[] | null = null;
  private xn: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private xt: number[] = [0, 0, 0];

  count(): number {
    return this.pos.length / 3;
  }

  /** Place subsequent geometry: scale (sx,sy,sz), then rotate Ry(yaw)*Rx(pitch)*Rz(roll), then translate. */
  setXform(tx: number, ty: number, tz: number, yaw: number = 0, pitch: number = 0, roll: number = 0, sx: number = 1, sy: number = 1, sz: number = 1): void {
    const cy = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const mul = (a: number[], b: number[]): number[] => {
      const o: number[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
      return o;
    };
    const R = mul(mul([cy, 0, sy_, 0, 1, 0, -sy_, 0, cy], [1, 0, 0, 0, cp, -sp, 0, sp, cp]), [cr, -sr, 0, sr, cr, 0, 0, 0, 1]);
    this.xm = mul(R, [sx, 0, 0, 0, sy, 0, 0, 0, sz]);
    this.xn = mul(R, [1 / sx, 0, 0, 0, 1 / sy, 0, 0, 0, 1 / sz]);
    this.xt = [tx, ty, tz];
  }

  clearXform(): void {
    this.xm = null;
  }

  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number): number {
    if (this.xm) {
      const m = this.xm, q = this.xn, t = this.xt;
      const px = m[0] * x + m[1] * y + m[2] * z + t[0];
      const py = m[3] * x + m[4] * y + m[5] * z + t[1];
      const pz = m[6] * x + m[7] * y + m[8] * z + t[2];
      const qx = q[0] * nx + q[1] * ny + q[2] * nz;
      const qy = q[3] * nx + q[4] * ny + q[5] * nz;
      const qz = q[6] * nx + q[7] * ny + q[8] * nz;
      x = px; y = py; z = pz; nx = qx; ny = qy; nz = qz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    this.pos.push(x, y, z);
    this.nrm.push(nx / l, ny / l, nz / l);
    this.uvs.push(u, w);
    return this.pos.length / 3 - 1;
  }

  /**
   * Surface of revolution around +Y. Profile [r, y] runs bottom -> top. `lobes`/`amp` modulate the
   * radius around the axis (garlic cloves, tomato ribs); phi0..phi1 allows half shells (cut veg).
   */
  lathe(profile: [number, number][], segs: number, lobes: number = 0, amp: number = 0, phi0: number = 0, phi1: number = Math.PI * 2): void {
    const P = profile.length;
    const n2: [number, number][] = [];
    for (let j = 0; j < P; j++) {
      const a = profile[Math.max(0, j - 1)], b = profile[Math.min(P - 1, j + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      n2.push([dy / l, -dx / l]);
    }
    const base = this.count();
    for (let i = 0; i <= segs; i++) {
      const ph = phi0 + (phi1 - phi0) * (i / segs);
      const c = Math.cos(ph), s = Math.sin(ph);
      const k = 1 + amp * Math.cos(lobes * ph);
      for (let j = 0; j < P; j++) {
        const r = profile[j][0] * k;
        this.v(r * c, profile[j][1], r * s, n2[j][0] * c, n2[j][1], n2[j][0] * s, i / segs, j / (P - 1));
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < P - 1; j++) {
        const a = base + i * P + j;
        this.quad(a, a + 1, a + P + 1, a + P);
      }
    }
  }

  /** Flat cut face in the x = 0 plane spanning the profile (pairs with a half lathe phi -90..90). */
  cutFace(profile: [number, number][], nx: number = -1): void {
    const ids: number[] = [];
    for (const [r, y] of profile) {
      ids.push(this.v(0, y, -r, nx, 0, 0, 0, 0), this.v(0, y, r, nx, 0, 0, 1, 0));
    }
    for (let j = 0; j < profile.length - 1; j++) this.quad(ids[j * 2], ids[j * 2 + 1], ids[j * 2 + 3], ids[j * 2 + 2]);
  }

  /** Thin slice (cross-section of a lathe profile scaled by k) of thickness th, faces along +-X. */
  crossSlab(profile: [number, number][], k: number, th: number): void {
    const P = profile.length;
    let yc = 0;
    for (const p of profile) yc += p[1];
    yc /= P;
    const per: [number, number][] = [];
    for (let j = 0; j < P; j++) per.push([profile[j][1], profile[j][0] * k]);
    for (let j = P - 1; j >= 0; j--) per.push([profile[j][1], -profile[j][0] * k]);
    for (const side of [-1, 1]) {
      const c = this.v((side * th) / 2, yc, 0, side, 0, 0, 0.5, 0.5);
      const ring: number[] = [];
      for (const [y, z] of per) ring.push(this.v((side * th) / 2, y, z, side, 0, 0, 0, 0));
      for (let j = 0; j < ring.length; j++) this.tri(c, ring[j], ring[(j + 1) % ring.length]);
    }
    const N = per.length;
    const ids: number[] = [];
    for (const [y, z] of per) {
      ids.push(this.v(-th / 2, y, z, 0, y - yc, z, 0, 0), this.v(th / 2, y, z, 0, y - yc, z, 1, 0));
    }
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      this.quad(ids[j * 2], ids[j * 2 + 1], ids[j2 * 2 + 1], ids[j2 * 2]);
    }
  }

  /** Ellipsoid centred at (cx,cy,cz) with optional lobes (frilly leaves, garlic cloves). */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, segs: number, rings: number, yaw: number = 0, pitch: number = 0, lobes: number = 0, amp: number = 0): void {
    const prof: [number, number][] = [];
    for (let i = 0; i <= rings; i++) {
      const t = (i / rings) * Math.PI;
      prof.push([Math.sin(t), -Math.cos(t)]);
    }
    this.setXform(cx, cy, cz, yaw, pitch, 0, rx, ry, rz);
    this.lathe(prof, segs, lobes, amp);
    this.clearXform();
  }

  /**
   * Swept tube with an elliptical, per-point cross-section (rw = side half-width, rh = up half-height).
   * Frame: side = T x up, up = side x T (good for handles / stems that are not vertical).
   */
  sweep(curve: [number, number, number][], rw: number[], rh: number[], segs: number, caps: boolean = true): void {
    const N = curve.length;
    const base = this.count();
    const frames: { s: number[]; u: number[] }[] = [];
    for (let i = 0; i < N; i++) {
      const a = curve[Math.max(0, i - 1)], b = curve[Math.min(N - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const hint = Math.abs(ty) > 0.95 ? [1, 0, 0] : [0, 1, 0];
      let sx = ty * hint[2] - tz * hint[1], sy = tz * hint[0] - tx * hint[2], sz = tx * hint[1] - ty * hint[0];
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      const ux = sy * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy * tx;
      frames.push({ s: [sx, sy, sz], u: [ux, uy, uz] });
    }
    for (let i = 0; i < N; i++) {
      const p = curve[i], f = frames[i];
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const ox = f.s[0] * c * rw[i] + f.u[0] * s * rh[i];
        const oy = f.s[1] * c * rw[i] + f.u[1] * s * rh[i];
        const oz = f.s[2] * c * rw[i] + f.u[2] * s * rh[i];
        const nx = (f.s[0] * c) / rw[i] + (f.u[0] * s) / rh[i];
        const ny = (f.s[1] * c) / rw[i] + (f.u[1] * s) / rh[i];
        const nz = (f.s[2] * c) / rw[i] + (f.u[2] * s) / rh[i];
        this.v(p[0] + ox, p[1] + oy, p[2] + oz, nx, ny, nz, j / segs, i / (N - 1));
      }
    }
    const R = segs + 1;
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = base + i * R + j;
        this.quad(a, a + 1, a + R + 1, a + R);
      }
    }
    if (caps) {
      for (const [ci, dir] of [[0, -1], [N - 1, 1]]) {
        const a = curve[Math.max(0, ci - 1)], b = curve[Math.min(N - 1, ci + 1)];
        const p = curve[ci];
        const cIdx = this.v(p[0], p[1], p[2], (b[0] - a[0]) * dir, (b[1] - a[1]) * dir, (b[2] - a[2]) * dir, 0.5, 0.5);
        for (let j = 0; j < segs; j++) {
          // reuse ring positions, but give the cap its own flat normal
          const r0 = base + ci * R + j;
          const p0 = this.pos.slice(r0 * 3, r0 * 3 + 3);
          const p1 = this.pos.slice((r0 + 1) * 3, (r0 + 1) * 3 + 3);
          const nn = this.nrm.slice(cIdx * 3, cIdx * 3 + 3);
          const saved = this.xm;
          this.xm = null; // positions already transformed
          const i0 = this.v(p0[0], p0[1], p0[2], nn[0], nn[1], nn[2], 0, 0);
          const i1 = this.v(p1[0], p1[1], p1[2], nn[0], nn[1], nn[2], 1, 0);
          this.xm = saved;
          this.tri(cIdx, i0, i1);
        }
      }
    }
  }

  /** Torus around axis `ax` through (cx,cy,cz); e1/e2 span the loop plane. a = in-plane tube radius, b = along-axis. */
  torus(cx: number, cy: number, cz: number, e1: number[], e2: number[], ax: number[], R: number, a: number, b: number, segM: number, segN: number): void {
    const base = this.count();
    for (let i = 0; i <= segM; i++) {
      const t = (i / segM) * Math.PI * 2;
      const rx = e1[0] * Math.cos(t) + e2[0] * Math.sin(t);
      const ry = e1[1] * Math.cos(t) + e2[1] * Math.sin(t);
      const rz = e1[2] * Math.cos(t) + e2[2] * Math.sin(t);
      for (let j = 0; j <= segN; j++) {
        const p = (j / segN) * Math.PI * 2;
        const c = Math.cos(p), s = Math.sin(p);
        this.v(
          cx + rx * (R + a * c) + ax[0] * b * s,
          cy + ry * (R + a * c) + ax[1] * b * s,
          cz + rz * (R + a * c) + ax[2] * b * s,
          (rx * c) / a + (ax[0] * s) / b, (ry * c) / a + (ax[1] * s) / b, (rz * c) / a + (ax[2] * s) / b,
          i / segM, j / segN
        );
      }
    }
    const S = segN + 1;
    for (let i = 0; i < segM; i++) {
      for (let j = 0; j < segN; j++) {
        const q = base + i * S + j;
        this.quad(q, q + 1, q + S + 1, q + S);
      }
    }
  }

  /** Low domed rivet head of radius r and height h, facing normal n. */
  dome(cx: number, cy: number, cz: number, n: number[], r: number, h: number, segs: number = 10): void {
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const N = [n[0] / nl, n[1] / nl, n[2] / nl];
    const hint = Math.abs(N[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ex = [N[1] * hint[2] - N[2] * hint[1], N[2] * hint[0] - N[0] * hint[2], N[0] * hint[1] - N[1] * hint[0]];
    const el = Math.hypot(ex[0], ex[1], ex[2]) || 1;
    ex = [ex[0] / el, ex[1] / el, ex[2] / el];
    const ey = [N[1] * ex[2] - N[2] * ex[1], N[2] * ex[0] - N[0] * ex[2], N[0] * ex[1] - N[1] * ex[0]];
    const base = this.count();
    const K = 3;
    for (let k = 0; k <= K; k++) {
      const al = (k / K) * (Math.PI / 2);
      const rr = r * Math.cos(al) + 1e-4, hh = h * Math.sin(al);
      for (let i = 0; i <= segs; i++) {
        const t = (i / segs) * Math.PI * 2;
        const c = Math.cos(t), s = Math.sin(t);
        const dx = ex[0] * c + ey[0] * s, dy = ex[1] * c + ey[1] * s, dz = ex[2] * c + ey[2] * s;
        this.v(cx + dx * rr + N[0] * hh, cy + dy * rr + N[1] * hh, cz + dz * rr + N[2] * hh,
          dx * Math.cos(al) * h + N[0] * Math.sin(al) * r, dy * Math.cos(al) * h + N[1] * Math.sin(al) * r, dz * Math.cos(al) * h + N[2] * Math.sin(al) * r,
          i / segs, k / K);
      }
    }
    const S = segs + 1;
    for (let k = 0; k < K; k++) for (let i = 0; i < segs; i++) {
      const q = base + k * S + i;
      this.quad(q, q + 1, q + S + 1, q + S);
    }
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

  triCount(): number {
    return this.idx.length / 3;
  }

  /** Axis-aligned bounds of the stored (already transformed) positions: [minX, minY, minZ, maxX, maxY, maxZ]. */
  bounds(): number[] {
    const o = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (let i = 0; i < this.pos.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        o[c] = Math.min(o[c], this.pos[i + c]);
        o[c + 3] = Math.max(o[c + 3], this.pos[i + c]);
      }
    }
    return o;
  }

  /** Uniform scale about the origin, then lift by dy (normals unchanged). */
  scaleShift(s: number, dy: number): void {
    for (let i = 0; i < this.pos.length; i += 3) {
      this.pos[i] *= s;
      this.pos[i + 1] = this.pos[i + 1] * s + dy;
      this.pos[i + 2] *= s;
    }
  }

  apply(rmv: RenderMeshVisual): void {
    rmv.mesh = this.toMesh();
  }

  toMesh(): RenderMesh {
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
    const mesh = b.getMesh();
    b.updateMesh();
    return mesh;
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
// ─── v4 Z-zoned layout (StationsRoot-local cm) ───
// v7 S1: StationsRoot sits at local (0,0.23,0) under KitchenAnchorRoot (P0 world (0,-17.73,-76)), so its world
// pose stays (0,-17.5,-76) and the slab top (y = -0.23 here) is the kitchen counter plane y = 0.
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
// WS9-P2 salmon fillet dims (pan-local units): dome height above the pan side, and the gentle
// bulge of the seared skin below it. SpatulaFlipRig pivots the flip on these.
export const SALMON_DOME_H = 1.9;
export const SALMON_SKIN_BULGE = 0.22;
// A3: skillet inner floor (pan-local): contact height (oil pool / fillet rest y) and usable flat radius of the
// lathe floor ([7.9, 0] .. [8.05, 0.5]); proteins query it through ProteinGenerators.queryPanFloor("SkilletPan").
export const SKILLET_FLOOR_Y = 0.5;
export const SKILLET_FLOOR_R = 7.9;
const SAUCIER_POS = new vec3(0.0, COOKWARE_Y, -10.5);
const PREP_POS = new vec3(10.5, 0.64, -3.0); // board feet (local -1.27 * 0.68) rest on slab top
const PLATE_POS = new vec3(0.0, COOKWARE_Y, 4.5);
// WS9 burner-arc radii (StationsRoot cm). Skillet: inner dashes / outer hairline / accents; the live
// chrono ring (DiegeticChronoRing SKILLET_R 7.75, SAUCIER_R 4.85) sits between inner and outer.
const SEAR_ARC_R = [7.2, 8.3, 8.6];
const SIMMER_ARC_R = [4.4, 5.3, 5.6];
// WS9: plate ~25% smaller (rim radius 5.95 -> ~4.46 cm); heights unchanged.
const PLATE_SCALE = 0.75;
// Knife edge sits on cut line 0; MetricPrepBlueprint steps +1.5 per chop (8 chops -> x +3.5),
// so everything else on the board lives at x >= 4.3 to stay out of the blade sweep.
const KNIFE_REST_X = -8.5;
// K1a: knife stop / lane pitch (MetricPrepBlueprint LANE_STEP_CM), independent of the dish's cut spacing
const LANE_PITCH = 1.5;

// ─── WS9 progressive chop (board-local units; board top y = 0.905) ───
// Five whole veg sit left->right across the 8 cutting lanes (lane i = x -8.5+1.5i .. +1.5). After
// cut n the knife rests on line n, so each veg spans exactly the lanes of the cuts that convert it.
const VEG_NAMES = ["RedOnion", "Garlic", "Parsley", "Tomato", "YellowChilli"];
const VEG_X = [-7.0, -4.75, -2.5, 0.5, 2.75];
const VEG_Z = 1.2;
const VEG_TOP_Y = 0.905;
/** Step Cut n (1..8) -> [veg index, new stage] (stage 0 whole, 1 partly cut, 2 diced). */
const CUT_MAP: [number, number][] = [[0, 1], [0, 2], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2], [4, 2]];
// Prep bowl on the slab in front of the board's right end (board-local; slab top = -1.279)
const BOWL_LOCAL = new vec3(6.2, -1.279, 11.0);
const BOWL_FLOOR_Y = BOWL_LOCAL.y + 0.32;
const BOWL_SLOTS: [number, number][] = [[-0.75, -0.45], [0.75, -0.5], [0.0, 0.1], [-0.5, 0.75], [0.55, 0.7]];
const BOWL_FILL_SCALE = 0.6;
const POUR_SECONDS = 0.75;
const POUR_STAGGER = 0.1;
// WS9-P3 bowl -> saucier pour (seconds; board-local units). The bowl lifts off the slab, travels to
// the saucier's board-side rim, tips its mouth toward the pot so the diced veg slide into the sauce,
// tips back and returns home. Parsley (garnish) stays in the bowl for plating.
// WS10: the trip runs TWICE - pour 1 = measured portion (golden stock base), pour 2 = diced veg
// (sauce turns red + herb-flecked). Each pour keeps the bowl tipped over the pot for ~2.2 s.
const BOWL_POUR_DELAY = 0.3;
const BOWL_TRAVEL_SEC = 1.2;
const BOWL_TIP_SEC = 0.6;
const BOWL_SLIDE_SEC = 0.75;
const BOWL_HOLD_SEC = 1.1;
const BOWL_TIPBACK_SEC = 0.5;
const BOWL_RETURN_SEC = 1.1;
const BOWL_TIP_ANGLE = 65 * (Math.PI / 180);
const POUR_GAP_SEC = 0.5; // pause between the two pours (bowl home, veg hop into it)
const GARNISH_VEG = 2; // parsley
// WS10 saucier contents (pot-local y; pot lathe inner wall as [y, r])
export const POT_INNER: [number, number][] = [[0.48, 0.0], [0.62, 3.6], [1.2, 4.64], [3.8, 4.84], [4.86, 5.0]];
const SAUCE_Y_FLOOR = 0.72;
const SAUCE_Y_BASE = 2.3; // after the portion pour
const SAUCE_Y_FULL = 3.86; // after the veg pour
const SAUCE_Y_SERVED = 3.3; // after the plating pour
const STREAM_DROPS = 6;

let potInner: [number, number][] = POT_INNER; // A4a: the handi swaps in its own inner wall (same fill levels)

function potInnerR(y: number): number {
  if (y <= potInner[0][0]) return 0;
  for (let i = 1; i < potInner.length; i++) {
    const a = potInner[i - 1];
    const b = potInner[i];
    if (y <= b[0]) return a[1] + ((b[1] - a[1]) * (y - a[0])) / (b[0] - a[0]);
  }
  return potInner[potInner.length - 1][1];
}

/** v5 A1: one lane's stage meshes [stage 0..2][part 0 body, 1 _Stem accent, 2 _Detail] + their materials. */
export interface VegLaneMeshes {
  meshes: (RenderMesh | null)[][];
  mats: Material[];
}

interface VegItem {
  root: SceneObject;
  stages: SceneObject[]; // [whole, partial, diced]
  stage: number;
  home: vec3;
}

interface VegCutAnim {
  veg: number;
  from: number;
  to: number;
  t: number;
  step: number; // 0 = waiting for knife dip, 1 = partial shown (two-step flash), 2 = done
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

export interface SteamOpts {
  count: number;
  spread: number; // x spacing between wisps
  baseY: number; // wisp start height (parent-local)
  rise: number; // height gained over one loop
  size0: number; // quad width at birth
  size1: number; // width gained over one loop
  alpha: number; // peak opacity
  speed: number; // loops per second
  sway: number;
  z: number;
  fadeIn: number; // seconds 0 -> 1 intensity
  fadeOut: number; // seconds 1 -> 0 intensity
}

/**
 * WS10: soft rising steam (Tex_Steam quads, normal blend, no depth write) with a fade-able
 * intensity. Callers set `target` (0..1) and tick update(dt); the root is disabled while silent.
 */
export class SteamPlume {
  public readonly root: SceneObject;
  public target: number = 0;
  public baseY: number;
  private level: number = 0;
  private time: number = 0;
  private opts: SteamOpts;
  private wisps: { obj: SceneObject; mat: Material; phase: number; x: number }[] = [];

  constructor(parent: SceneObject, rootName: string, wispPrefix: string, opts: SteamOpts) {
    this.opts = opts;
    this.baseY = opts.baseY;
    this.root = global.scene.createSceneObject(rootName);
    this.root.setParent(parent);
    const quad = new MeshAcc();
    const q0 = quad.v(-0.5, 0, 0, 0, 0, 1, 0, 0);
    const q1 = quad.v(0.5, 0, 0, 0, 0, 1, 1, 0);
    const q2 = quad.v(0.5, 1, 0, 0, 0, 1, 1, 1);
    const q3 = quad.v(-0.5, 1, 0, 0, 0, 1, 0, 1);
    quad.quad(q0, q1, q2, q3);
    for (let i = 0; i < opts.count; i++) {
      const o = global.scene.createSceneObject(`${wispPrefix}_${i}`);
      o.setParent(this.root);
      const m = makeTexturedPbr(TEX_STEAM, 0.0, 1.0, 1, 1, 1);
      m.mainPass.blendMode = BlendMode.Normal;
      m.mainPass.depthWrite = false;
      m.mainPass.twoSided = true;
      try {
        (m.mainPass as any).Port_Emissive_N006 = new vec3(0.55, 0.55, 0.58);
      } catch (e) {
        // no emissive port
      }
      m.mainPass.baseColor = new vec4(1, 1, 1, 0);
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mainMaterial = m;
      quad.apply(rmv);
      this.wisps.push({ obj: o, mat: m, phase: i / opts.count, x: (i - (opts.count - 1) / 2) * opts.spread });
    }
    this.root.enabled = false;
  }

  public getLevel(): number {
    return this.level;
  }

  /** Jump straight to an intensity (used by Reset). */
  public setNow(v: number): void {
    this.level = v;
    this.target = v;
    if (v <= 0.001) this.root.enabled = false;
  }

  public update(dt: number): void {
    const o = this.opts;
    if (this.level < this.target) this.level = Math.min(this.target, this.level + dt / o.fadeIn);
    else if (this.level > this.target) this.level = Math.max(this.target, this.level - dt / o.fadeOut);
    if (this.level <= 0.001) {
      if (this.root.enabled) this.root.enabled = false;
      return;
    }
    if (!this.root.enabled) this.root.enabled = true;
    this.time += dt;
    for (const w of this.wisps) {
      const t = (this.time * o.speed + w.phase) % 1.0;
      const tr = w.obj.getTransform();
      tr.setLocalPosition(new vec3(w.x + Math.sin((t + w.phase) * 6.0) * o.sway, this.baseY + t * o.rise, o.z + w.x * 0.2));
      const s = o.size0 + t * o.size1;
      tr.setLocalScale(new vec3(s, s * 1.5, 1));
      w.mat.mainPass.baseColor = new vec4(1, 1, 1, Math.sin(t * Math.PI) * o.alpha * this.level);
    }
  }
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
  // WS10 steam windows: saucier (ingredients in -> plating), skillet (sear clock running -> salmon leaves)
  private saucierSteam?: SteamPlume;
  private skilletSteam?: SteamPlume;
  private dag: ChoreographyDAG | null = null;
  private platingStarted: boolean = false;
  // WS10 saucier contents: golden portion base + red veg sauce (both unit discs scaled to the wall)
  private stockObj?: SceneObject;
  private sauceObj?: SceneObject;
  private potLevel: number = 0; // pot-local y of the liquid surface (0 = empty)
  private redCover: number = 0; // 0..1 red sauce spread over the base
  private bowlLiquid?: SceneObject;
  private streamDrops: SceneObject[] = [];
  // WS10 two-pour transfer: 0 idle, 1 portion pour, 2 gap, 3 veg board->bowl, 4 veg pour, 5 done
  private seqStage: number = 0;
  private seqT: number = 0;
  private pourPayload: number = 0; // 0 portion, 1 veg
  private pourLevel0: number = 0; // pot level when the current pour started

  // WS9 progressive chop + prep bowl state (hook points for P2/P3: see public API below)
  private vegItems: VegItem[] = [];
  private vegOriginal: VegLaneMeshes[] = [];
  private vegAnims: VegCutAnim[] = [];
  private vegPops: { obj: SceneObject; t: number }[] = [];
  private chopCount: number = 0;
  private bowlObj?: SceneObject;
  private domeRmv?: RenderMeshVisual;
  private pourT: number = -1;
  private bowlFilled: boolean = false;
  private plateObj?: SceneObject;
  // WS9-P3 bowl -> saucier pour state (board-local frame = BoardMesh)
  private boardObj?: SceneObject;
  private potObj?: SceneObject;
  private saucierT: number = -1; // < -0.5 idle; >= -BOWL_POUR_DELAY running
  private saucierActive: boolean = false;
  private bowlPoured: boolean = false;
  private garnishTaken: boolean = false;
  private pourPose?: vec3;
  private pourDir?: vec3; // horizontal unit vector bowl -> pot (board-local)
  private sauceSurface?: vec3; // sauce surface centre (board-local)
  // v5 dish morph hooks (StationPropsDishBuilder): cut grid + saucier steam burst
  private cutGridObj?: SceneObject;
  private cutGridPos0: vec3 = vec3.zero();
  private cutGridRot0: quat = quat.quatIdentity();
  private cutSpacingCm: number = 1.5;
  private cutAngleDeg: number = 0;
  private steamBurstUntil: number = -1;
  // A4a service ware: active #342/#343 piece (null = the coupe plate) + plating reticle fit
  private servePiece: SceneObject | null = null;
  private serveFloorY: number = 0.3;
  private serveRimR: number = 0;
  private reticleFit: number = 1;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.upgradeAllStations();
      this.bindSliceSteppingEvents();
      // v5: real dish builder (existing meshes only: cut grid, sauce + protein tints)
      DishAssetBuilders.register(new StationPropsDishBuilder(this));
      registerPanFloor("SkilletPan", { y: SKILLET_FLOOR_Y, r: SKILLET_FLOOR_R, curve: 0 });
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
        // Rock-chop: knife handle presses down and smoothly springs back up; WS9 adds a short
        // vertical dip so the edge visibly passes through the veg.
        const rockAngle = Math.sin(progress * Math.PI) * (-4.5 * (Math.PI / 180));
        this.knifeRoot.getTransform().setLocalRotation(getKnifeRotation(rockAngle));
        this.knifeRoot.getTransform().setLocalPosition(new vec3(0, -0.14 * Math.sin(progress * Math.PI), 0));
      }
      if (!this.isKnifeChopping) this.knifeRoot.getTransform().setLocalPosition(vec3.zero());
    }

    this.updateVegAnimations(getDeltaTime());

    // WS10 steam windows. Saucier: only once ingredients are in, until plating takes the pot.
    // Skillet: only while the sear clock has run, until the salmon leaves for the plate.
    const dt = getDeltaTime();
    if (this.saucierSteam) {
      this.saucierSteam.target = (this.potLevel > SAUCE_Y_FLOOR + 0.2 && !this.platingStarted) || this.elapsedTime < this.steamBurstUntil ? 1 : 0;
      this.saucierSteam.update(dt);
    }
    if (this.skilletSteam) {
      if (!this.dag) this.dag = this.getSceneObject().getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
      const searing = !!this.dag && this.dag.getSkilletProgress() > 0.002;
      this.skilletSteam.target = searing && !this.platingStarted ? 1 : 0;
      this.skilletSteam.update(dt);
    }

    // Thermal LED pulse — SKIPPED: LED glow objects disabled (rendered as floating wires)
    // Kept as no-op so refs remain valid if re-enabled later

    // Optical plating reticle convergence pulse — soft green throb when plating complete
    if (this.reticleRootObj && this.isPlatingConverged) {
      const convergePulse = (1.0 + 0.08 * Math.sin(this.elapsedTime * 4.2)) * this.reticleFit;
      this.reticleRootObj.getTransform().setLocalScale(new vec3(convergePulse, 1.0, convergePulse));
    }
  }

  private upgradeAllStations(): void {
    const root = this.getSceneObject();
    // v7 S1: local (0,0.23,0) under KitchenAnchorRoot, else the legacy (0,-17.5,-76) (adoption runs one frame later)
    KitchenAnchorRoot.placeStationsRoot(root);

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
    // WS9-P3: once the dish is plated the alignment reticle has done its job
    this.eventBus.on("DISH_PLATED", () => {
      this.isPlatingConverged = false;
      if (this.reticleRootObj) this.reticleRootObj.enabled = false;
    });
    this.eventBus.on("RESET_REQUESTED", () => {
      this.isPlatingConverged = false;
      if (this.reticleRootObj) this.reticleRootObj.enabled = false;
      if (this.reticleRootObj) {
        this.reticleRootObj.getTransform().setLocalScale(new vec3(this.reticleFit, 1, this.reticleFit));
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
    // WS9: radii pulled in to hug the cookware (skillet rim ~6.84 cm, saucier rim ~4.08 cm) with
    // tight dash gaps. Keep in sync with DiegeticChronoRing (SKILLET_R / SAUCIER_R) and
    // DAGCounterConduit (convergence start radii + [LOCKED] node).
    const arcY = -0.215; // StationsRoot-local, just above the slab top (-0.23)
    const sear = new MeshAcc();
    const sx = SKILLET_POS.x, sz = SKILLET_POS.z;
    for (let k = 0; k < 6; k++) sear.arc(sx, arcY, sz, SEAR_ARC_R[0], 0.09, k * 60 + 4, k * 60 + 56, 16);
    for (const [a0, a1] of [[-40, 60], [140, 240]]) sear.arc(sx, arcY, sz, SEAR_ARC_R[1], 0.06, a0, a1, 30);
    for (const [a0, a1] of [[70, 110], [250, 290]]) sear.arc(sx, arcY, sz, SEAR_ARC_R[2], 0.13, a0, a1, 12);
    this.ensureRmv(this.ensureChild(root, "BurnerArcs_Sear"), MAT_ARC_AMBER);
    sear.apply(this.ensureChild(root, "BurnerArcs_Sear").getComponent("Component.RenderMeshVisual") as RenderMeshVisual);

    const sim = new MeshAcc();
    const px = SAUCIER_POS.x, pz = SAUCIER_POS.z;
    for (let k = 0; k < 6; k++) sim.arc(px, arcY, pz, SIMMER_ARC_R[0], 0.08, k * 60 + 5, k * 60 + 55, 14);
    for (const [a0, a1] of [[-40, 40], [140, 220]]) sim.arc(px, arcY, pz, SIMMER_ARC_R[1], 0.055, a0, a1, 24);
    for (const [a0, a1] of [[200, 240], [300, 340]]) sim.arc(px, arcY, pz, SIMMER_ARC_R[2], 0.12, a0, a1, 12);
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
    this.plateObj = plateObj;
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
    ].map(([r, y]) => [r * PLATE_SCALE, y] as [number, number]);
    buildLathe(pb, plateProfile, 72, [1, 1, 1, 1], 0, 0, 0, 0);
    pRmv.mesh = pb.getMesh();
    pRmv.mainMaterial = MAT_PLATE_MATTE;
    pb.updateMesh();

    // WS9: slightly darker rolled rim band so the (smaller) plate edge reads as solid stoneware
    const rimBand = this.ensureChild(plateObj, "PlateRimBand");
    const rbRmv = this.ensureRmv(rimBand, MAT_PLATE_RIM);
    const rbAcc = new MeshAcc();
    rbAcc.torus(0, 1.2, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 5.86 * PLATE_SCALE, 0.1, 0.075, 72, 6);
    rbAcc.apply(rbRmv);

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
      const dx = Math.cos(angle) * 2.4 * PLATE_SCALE;
      const dz = Math.sin(angle) * 2.4 * PLATE_SCALE;
      const dashRmv = this.ensureRmv(dashObj, MAT_INDUCTION_EMERALD);
      const db = createBuilder();
      const didx: number[] = [];
      let dvi = 0;
      // Each dash is a tiny flat bar tangential to the circle
      const tangX = -Math.sin(angle);
      const tangZ = Math.cos(angle);
      dvi = addBox(db, didx, dx, 0.005, dz, Math.abs(tangX) * 0.21 + 0.02, 0.004, Math.abs(tangZ) * 0.21 + 0.02, [0.18, 0.88, 0.52, 1], dvi);
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
    crvi = addBox(crb, cridx,  0.0, 0.006, 0.0, 2.0 * PLATE_SCALE, 0.003, 0.04, [0.18, 0.88, 0.52, 1], crvi);
    crvi = addBox(crb, cridx,  0.0, 0.006, 0.0, 0.04, 0.003, 2.0 * PLATE_SCALE, [0.18, 0.88, 0.52, 1], crvi);
    crb.appendIndices(cridx);
    crRmv.mesh = crb.getMesh();
    crb.updateMesh();
    // Rotate 45° around Y-axis so the crosshair aligns diagonally for salmon placement
    crossObj.getTransform().setLocalRotation(quat.fromEulerAngles(0, Math.PI * 0.25, 0));

    // c) Outer radial convergence ring (very thin tube, ~3.8 cm radius)
    const convRingObj = this.ensureChild(reticleRootObj, "PlatingConvergenceRing");
    const cvRmv = this.ensureRmv(convRingObj, MAT_INDUCTION_EMERALD);
    const cvb = createBuilder();
    buildTube(cvb, buildRingCurve(3.8 * PLATE_SCALE, 0, 36), 0.04, 6, [0.18, 0.88, 0.52, 1], 0);
    cvRmv.mesh = cvb.getMesh();
    cvb.updateMesh();
  }

  private buildPrepBoardProps(prepStation: SceneObject): void {
    // 1. End-Grain Butcher Block board with juice groove & rubber corner feet
    const boardObj = findByName(prepStation, "BoardMesh");
    if (boardObj) {
      this.boardObj = boardObj;
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
      this.cutGridObj = gridObj;
      this.cutGridPos0 = gridObj.getTransform().getLocalPosition();
      this.cutGridRot0 = gridObj.getTransform().getLocalRotation();
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

      const strayCube = findByName(boardObj, "ShallotHalfCut");
      if (strayCube) strayCube.enabled = false;

      // WS9: a row of WHOLE vegetables between the guide lines (red onion, garlic, parsley bunch,
      // tomato, yellow chilli). Each Step Cut converts one veg at a time (see CUT_MAP).
      this.buildVegRow(boardObj);

      // WS9 prep bowl: brushed-steel mixing bowl on the slab just in front of the board's right end.
      // Empty at start; Transfer pours the diced veg into it (see startBowlPour).
      const portionRamekinObj = this.ensureChild(boardObj, "PortionRamekinBowl");
      portionRamekinObj.getTransform().setLocalPosition(BOWL_LOCAL);
      const prRmv = this.ensureRmv(portionRamekinObj, MAT_CHROME);
      const bowlAcc = new MeshAcc();
      bowlAcc.lathe([[0, 0], [2.35, 0], [3.0, 2.15], [2.8, 2.15], [2.2, 0.3], [0, 0.3]], 56);
      bowlAcc.torus(0, 2.15, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 2.92, 0.11, 0.09, 56, 6); // rolled lip
      bowlAcc.apply(prRmv);
      this.bowlObj = portionRamekinObj;

      // Thin cyan target rim around the top of the bowl (portion reference cue)
      const rimObj = this.ensureChild(portionRamekinObj, "PortionTargetRim");
      const rimRmv = this.ensureRmv(rimObj, MAT_ARC_CYAN);
      const rimB = createBuilder();
      buildTube(rimB, buildRingCurve(3.06, 2.2, 56), 0.035, 6, [1, 1, 1, 1], 0);
      rimRmv.mesh = rimB.getMesh();
      rimB.updateMesh();

      // WS10: measured portion (golden stock base) the bowl carries on pour 1 + a short droplet
      // stream from the bowl lip into the pot while it pours.
      const liq = this.ensureChild(portionRamekinObj, "BowlPortionLiquid");
      const lAcc = new MeshAcc();
      lAcc.disc(0, 0, 0, 2.5, 40, 0.06);
      lAcc.apply(this.ensureRmv(liq, MAT_SAUCE));
      liq.getTransform().setLocalPosition(new vec3(0, 1.45, 0));
      liq.enabled = false;
      this.bowlLiquid = liq;
      const dropAcc = new MeshAcc();
      dropAcc.ellipsoid(0, 0, 0, 0.22, 0.34, 0.22, 10, 6);
      this.streamDrops = [];
      for (let i = 0; i < STREAM_DROPS; i++) {
        const d = this.ensureChild(boardObj, `PortionPourDrop_${i}`);
        dropAcc.apply(this.ensureRmv(d, MAT_SAUCE));
        d.enabled = false;
        this.streamDrops.push(d);
      }
    }

    // 2. Realistic Santoku Chef's Knife with pakkawood handle (LaserCutCurtain host)
    const laserObj = findByName(prepStation, "LaserCutCurtain");
    if (laserObj) {
      this.buildChefKnife(prepStation, laserObj);
    }

    // 3. Portion reference volume inside the prep bowl (VolumetricPortionDome). Scale/material are
    // driven by MetricPrepBlueprint (unchanged); WS9 only re-seats it in the bowl and keeps its
    // visual hidden while the bowl is empty (shown once Fill Portion starts, hidden by the pour).
    const domeObj = findByName(prepStation, "VolumetricPortionDome");
    if (domeObj) {
      domeObj.getTransform().setLocalPosition(new vec3(BOWL_LOCAL.x, BOWL_LOCAL.y + 0.32, BOWL_LOCAL.z));
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
        db.updateMesh();
        dRmv.enabled = false;
        this.domeRmv = dRmv;
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

    // WS9: tapered cast-iron handle (~half the pan diameter), flared riveted root, gently raised,
    // ending in a teardrop with a hanging hole. Points rear-left in world (clear of board + saucier).
    this.buildSkilletHandle(panObj);

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
    this.buildSalmonMesh(sRmv, 5.3, 2.7, SALMON_DOME_H);

    // WS9-P2: seared skin on the pan side (closes the fillet underneath); SpatulaFlipRig rolls the
    // fillet 180 deg about its long axis so this golden side ends up on top.
    const skinObj = this.ensureChild(salmonObj, "SalmonCrispySkin");
    const skinRmv = this.ensureRmv(skinObj, MAT_SALMON_CRISP);
    this.buildSalmonSkinMesh(skinRmv, 5.3, 2.7, SALMON_SKIN_BULGE);

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

    // WS10: gentle sear sizzle-steam over the fillet (station frame, so the quads face the viewer);
    // only while the sear clock runs, until the salmon leaves for the plate.
    this.skilletSteam = new SteamPlume(skilletStation, "SkilletSearSteamRoot", "SkilletSearSteam", {
      count: 3, spread: 2.0, baseY: 2.6, rise: 4.0, size0: 2.2, size1: 2.0, alpha: 0.62,
      speed: 0.34, sway: 0.45, z: 0.0, fadeIn: 1.2, fadeOut: 1.0,
    });
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

  /**
   * WS9-P2 seared skin: same superellipse footprint as the dome, bulging gently downward (y <= 0)
   * and meeting the dome edge at y = 0, so the fillet is a closed two-sided shape.
   */
  private buildSalmonSkinMesh(rmv: RenderMeshVisual, a: number, b0: number, B: number): void {
    const K = 6;
    const M = 48;
    const P = 4.0;
    const halfW = (x: number): number => {
      const t = Math.max(0, Math.min(1, (x / a + 1) / 2));
      return b0 * (1 - 0.3 * Math.pow(t, 1.6));
    };
    const pt = (s: number, th: number): [number, number, number] => {
      const c = Math.cos(th), sn = Math.sin(th);
      const x = s * a * Math.sign(c) * Math.pow(Math.abs(c), 2 / P);
      const z = s * halfW(x) * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / P);
      const y = -B * Math.sqrt(Math.max(0, 1 - Math.pow(s, 4)));
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
        if (nx * p[0] + ny * (p[1] - 2.0) + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (k === 0) { nx = 0; ny = -1; nz = 0; }
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
      this.potObj = potObj;
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

      // WS9: long curved stainless handle (rear-right, never crosses the butcher block) on a
      // riveted mounting plate, ending in a flared tip with a hanging hole.
      this.buildSaucierHandle(potObj);

      // Simmering tomato reduction flecked with herbs (textured, glossy, slightly domed)
      // WS10: the saucier starts EMPTY. Two unit discs are scaled to the inner wall at the current
      // level: golden portion base (pour 1) and the red herb-flecked sauce that spreads over it as
      // the diced veg go in (pour 2).
      const stockObj = this.ensureChild(potObj, "SaucierStockBase");
      const stRmv = this.ensureRmv(stockObj, MAT_SAUCE);
      const stock = new MeshAcc();
      stock.disc(0, 0, 0, 1, 64, 0.04);
      stock.apply(stRmv);
      this.stockObj = stockObj;
      const sauceObj = this.ensureChild(potObj, "SimmeringLemonSauce");
      const sRmv = this.ensureRmv(sauceObj, MAT_SAUCE_TOMATO);
      const sauce = new MeshAcc();
      sauce.disc(0, 0, 0, 1, 64, 0.08);
      sauce.apply(sRmv);
      this.sauceObj = sauceObj;
      this.applySauceVisual();

      // Soft steam wisps rising off the pot (silent until ingredients are in)
      this.saucierSteam = new SteamPlume(potObj, "SaucierSteamRoot", "SaucierSteam", {
        count: 3, spread: 1.6, baseY: 4.2, rise: 4.5, size0: 2.6, size1: 2.2, alpha: 0.75,
        speed: 0.28, sway: 0.5, z: -0.5, fadeIn: 1.6, fadeOut: 1.4,
      });
    }

    // 2. Suppress floating PotSimmerRing — burner arcs on the slab handle this now
    const potRing = findByName(sauceStation, "PotSimmerRing");
    if (potRing) {
      potRing.enabled = false;
      potRing.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    }
  }

  /** WS9 skillet handle (pan-local; the pan is yawed by SKILLET_YAW so +168 deg points rear-left in world). */
  private buildSkilletHandle(panObj: SceneObject): void {
    const phi = 168 * (Math.PI / 180);
    const d = [Math.cos(phi), 0, Math.sin(phi)];
    const s = [-d[2], 0, d[0]];
    const lerp = (a: number, b: number, k: number): number => a + (b - a) * Math.max(0, Math.min(1, k));
    const R0 = 9.5, R1 = 18.4;
    const yAt = (t: number): number => 1.32 + 1.2 * t + 0.12 * Math.sin(Math.PI * t);
    const curve: [number, number, number][] = [];
    const rw: number[] = [];
    const rh: number[] = [];
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = R0 + (R1 - R0) * t;
      curve.push([d[0] * r, yAt(t), d[2] * r]);
      rw.push(t < 0.12 ? lerp(1.0, 0.62, t / 0.12) : t < 0.75 ? lerp(0.62, 0.46, (t - 0.12) / 0.63) : lerp(0.46, 0.66, (t - 0.75) / 0.25));
      rh.push(t < 0.12 ? lerp(0.62, 0.42, t / 0.12) : t < 0.75 ? lerp(0.42, 0.3, (t - 0.12) / 0.63) : lerp(0.3, 0.26, (t - 0.75) / 0.25));
    }
    const handleObj = this.ensureChild(panObj, "SkilletHandle");
    const hRmv = this.ensureRmv(handleObj, MAT_CAST_IRON_TEX);
    const acc = new MeshAcc();
    acc.sweep(curve, rw, rh, 18, true);
    // teardrop end with a hanging hole
    const rl = 19.05;
    acc.torus(d[0] * rl, yAt(1), d[2] * rl, d, s, [0, 1, 0], 0.6, 0.22, 0.24, 28, 8);
    acc.apply(hRmv);

    // Two steel rivets on the flared root (top) + their heads on the inside wall of the pan
    const rivObj = this.ensureChild(panObj, "SkilletHandleRivets");
    const rRmv = this.ensureRmv(rivObj, MAT_RIVET_STEEL);
    const ra = new MeshAcc();
    for (const side of [-1, 1]) {
      const rr = 10.25;
      ra.dome(d[0] * rr + s[0] * side * 0.45, 1.82, d[2] * rr + s[2] * side * 0.45, [s[0] * side * 0.45, 1, s[2] * side * 0.45], 0.17, 0.09);
      const ri = 9.06;
      ra.dome(d[0] * ri + s[0] * side * 0.42, 1.06, d[2] * ri + s[2] * side * 0.42, [-d[0] * 0.74, 0.67, -d[2] * 0.74], 0.2, 0.1);
    }
    ra.apply(rRmv);
  }

  /** WS9 saucier handle (pot-local, pot not yawed): long curved strap, riveted plate, hanging hole. */
  private buildSaucierHandle(potObj: SceneObject): void {
    const yaw = 30 * (Math.PI / 180);
    const d = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const s = [-d[2], 0, d[0]];
    const lerp = (a: number, b: number, k: number): number => a + (b - a) * Math.max(0, Math.min(1, k));
    const R0 = 5.15, R1 = 14.75;
    const yAt = (t: number): number => 4.1 + 2.4 * (1 - Math.pow(1 - t, 2.2));
    const curve: [number, number, number][] = [];
    const rw: number[] = [];
    const rh: number[] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = R0 + (R1 - R0) * t;
      curve.push([d[0] * r, yAt(t), d[2] * r]);
      rw.push(t < 0.1 ? lerp(0.52, 0.36, t / 0.1) : t < 0.8 ? lerp(0.36, 0.42, (t - 0.1) / 0.7) : lerp(0.42, 0.6, (t - 0.8) / 0.2));
      rh.push(t < 0.1 ? lerp(0.3, 0.2, t / 0.1) : t < 0.8 ? lerp(0.2, 0.17, (t - 0.1) / 0.7) : lerp(0.17, 0.15, (t - 0.8) / 0.2));
    }
    const handleObj = this.ensureChild(potObj, "SaucepanHandle");
    const hRmv = this.ensureRmv(handleObj, MAT_CHROME);
    const acc = new MeshAcc();
    acc.sweep(curve, rw, rh, 16, true);
    const rl = 15.2;
    acc.torus(d[0] * rl, yAt(1), d[2] * rl, d, s, [0, 1, 0], 0.52, 0.16, 0.14, 28, 8);
    // riveted mounting plate on the outer wall
    acc.box(d[0] * 5.24, 4.15, d[2] * 5.24, 0.07, 0.55, 0.8, yaw, 0);
    acc.apply(hRmv);

    const rivetObj = this.ensureChild(potObj, "HandleRivet1");
    const rRmv = this.ensureRmv(rivetObj, MAT_RIVET_STEEL);
    const ra = new MeshAcc();
    for (const side of [-1, 1]) {
      ra.dome(d[0] * 5.31 + s[0] * side * 0.48, 4.15, d[2] * 5.31 + s[2] * side * 0.48, d, 0.16, 0.08);
      ra.dome(d[0] * 4.9 + s[0] * side * 0.48, 4.3, d[2] * 4.9 + s[2] * side * 0.48, [-d[0], 0, -d[2]], 0.17, 0.08);
    }
    ra.apply(rRmv);
  }

  /** WS10: place the base / red sauce discs for the current level + red spread (hidden when empty). */
  private applySauceVisual(): void {
    const y = this.potLevel;
    const r = Math.max(0.05, potInnerR(y) - 0.04);
    if (this.stockObj) {
      const show = y > 0.01 && this.redCover < 0.999;
      if (this.stockObj.enabled !== show) this.stockObj.enabled = show;
      if (show) {
        const tr = this.stockObj.getTransform();
        tr.setLocalPosition(new vec3(0, this.redCover > 0 ? y - 0.03 : y, 0));
        tr.setLocalScale(new vec3(r, 1, r));
      }
    }
    if (this.sauceObj) {
      const show = y > 0.01 && this.redCover > 0.001;
      if (this.sauceObj.enabled !== show) this.sauceObj.enabled = show;
      if (show) {
        const tr = this.sauceObj.getTransform();
        const rr = r * this.redCover;
        tr.setLocalPosition(new vec3(0, y, 0));
        tr.setLocalScale(new vec3(rr, 1, rr));
      }
    }
  }

  private buildTransferConduit(arcRoot: SceneObject): void {
    // CRITICAL: Keep TransferArcTube — LEAF test asserts findSceneObjectByName("TransferArcTube") is truthy
    // and enabled=true after transfer tap. SpatialTransferArc.ts re-enables it on trigger.
    // WS10: it must render nothing (the bowl carrying the food is the only transfer visual), so every
    // mesh in its subtree is switched off and it stays collapsed.
    const arcTube = findByName(arcRoot, "TransferArcTube");
    if (arcTube) {
      arcTube.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      arcTube.enabled = false;
      const hide = (o: SceneObject): void => {
        const vis = o.getComponents("Component.RenderMeshVisual") as RenderMeshVisual[];
        for (const v of vis) v.enabled = false;
        for (let i = 0; i < o.getChildrenCount(); i++) hide(o.getChild(i));
      };
      hide(arcTube);
    }

    // Hide legacy stick conduit
    const conduit = findByName(arcRoot, "CountertopConduit");
    if (conduit) {
      conduit.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      conduit.enabled = false;
    }

    // WS10: the luminous board -> saucier ribbon ("blue wire") is gone; no ribbon is built.
  }

  private bindSliceSteppingEvents(): void {
    this.eventBus.on("CUT_REFERENCE_STEP", (data: any) => {
      const cuts = data && typeof data.sliceIndex === "number" ? data.sliceIndex : this.chopCount + 1;
      this.applyChopCount(cuts, true);
      this.isKnifeChopping = true;
      this.knifeAnimTimer = 0.0;
    });

    this.eventBus.on("STATION_STEP_COMPLETED", (data: any) => {
      if (data && data.stationId === "PREP") {
        // WS10: prep transferred -> two pours into the saucier (portion, then the diced veg)
        this.startBowlPour();
      }
    });
    // The DAG re-emits the transfer as TASK_COMPLETED(prep_shallots); startBowlPour is idempotent.
    this.eventBus.on("TASK_COMPLETED", (data: any) => {
      if (data && data.taskId === "prep_shallots") this.startBowlPour();
    });

    // Portion reference volume only shows while the bowl is waiting for prep
    this.eventBus.on("VOLUME_DOME_UPDATED", (data: any) => {
      if (this.domeRmv && this.seqStage === 0) {
        this.domeRmv.enabled = !!data && data.fillRatio > 0.001;
      }
    });

    // WS10: plating takes the pot (saucier steam off, salmon leaves the pan). If plating starts before
    // the pours finished (manual time-warp path), land them immediately so the pot has its sauce.
    this.eventBus.on("PLATING_STARTED", () => {
      this.platingStarted = true;
      if (this.seqStage > 0 && this.seqStage < 5) this.finishPoursNow();
    });

    this.eventBus.on("RESET_REQUESTED", () => {
      this.resetPrepVisuals();
      if (this.knifeRoot) {
        this.isKnifeChopping = false;
        this.knifeAnimTimer = 0.0;
        this.knifeRoot.getTransform().setLocalRotation(getKnifeRotation(0));
        this.knifeRoot.getTransform().setLocalPosition(vec3.zero());
      }
    });
  }

  // ─────────────── WS9 public hook API (P2 spatula / P3 auto-cook + plating) ───────────────

  /** Current stage per veg (0 whole, 1 partly cut, 2 diced), order = VEG_NAMES. */
  public getVegStages(): number[] {
    return this.vegItems.map((v) => v.stage);
  }

  public getVegNames(): string[] {
    return VEG_NAMES.slice();
  }

  public getChopCount(): number {
    return this.chopCount;
  }

  public isBowlFilled(): boolean {
    return this.bowlFilled;
  }

  public isBowlPouring(): boolean {
    return this.pourT >= 0;
  }

  /** WS10 transfer stage: 0 idle, 1 portion pour, 2 gap, 3 veg board->bowl, 4 veg pour, 5 done. */
  public getTransferStage(): number {
    return this.seqStage;
  }

  /** WS10: saucier liquid surface (pot-local y, 0 = empty) and red-sauce spread (0..1). */
  public getSauceLevel(): number {
    return this.potLevel;
  }

  public getSauceRedCover(): number {
    return this.redCover;
  }

  /** WS10 plating pour: k 0..1 lowers the pot sauce from full to the served level. */
  public setSauceServed(k: number): void {
    if (this.potLevel <= 0.01) return;
    const c = Math.max(0, Math.min(1, k));
    this.potLevel = SAUCE_Y_FULL - (SAUCE_Y_FULL - SAUCE_Y_SERVED) * c;
    this.applySauceVisual();
  }

  /** Prep bowl SceneObject (child of BoardMesh, board-local scale 0.68). */
  public getBowlObject(): SceneObject | null {
    return this.bowlObj ? this.bowlObj : null;
  }

  /** Veg root SceneObjects (each holds _Whole/_Partial/_Diced children). In the bowl after the pour. */
  public getVegRoots(): SceneObject[] {
    return this.vegItems.map((v) => v.root);
  }

  /** Plate mesh object (PorcelainCoupePlate, under PlatingServingStation; plate floor at local y 0.30). */
  public getPlateObject(): SceneObject | null {
    if (this.servePiece && !isNull(this.servePiece)) return this.servePiece; // A4a: deep bowl / serving handi
    return this.plateObj ? this.plateObj : null;
  }

  public getPlateFloorLocalY(): number {
    return this.servePiece ? this.serveFloorY : 0.3;
  }

  public getPlateRimRadius(): number {
    return this.servePiece ? this.serveRimR : 5.95 * PLATE_SCALE;
  }

  /** The coupe plate itself (PorcelainCoupePlate), whatever service piece is active. */
  public getCoupePlate(): SceneObject | null {
    return this.plateObj ? this.plateObj : null;
  }

  /** A4a: make a service piece (sibling of the coupe, same frame) the plate; null restores the coupe + reticle exactly. */
  public setServicePiece(obj: SceneObject | null, floorY: number, rimR: number, fit: number): void {
    this.servePiece = obj;
    this.serveFloorY = floorY;
    this.serveRimR = rimR;
    this.reticleFit = obj ? fit : 1;
    if (this.reticleRootObj) {
      const tr = this.reticleRootObj.getTransform();
      tr.setLocalPosition(new vec3(0, obj ? floorY + 0.04 : 0.34, 0));
      tr.setLocalScale(new vec3(this.reticleFit, 1, this.reticleFit));
    }
  }

  /** A4a: inner wall [y, r] the saucier fill discs follow (handi volume); null = the saucier's own wall. */
  public setPotInnerProfile(profile: [number, number][] | null): void {
    potInner = profile && profile.length > 1 ? profile : POT_INNER;
    this.applySauceVisual();
  }

  /**
   * WS10 transfer (~12 s): pour 1 carries the measured portion (golden base) bowl -> saucier, short
   * gap, the diced veg hop board -> bowl, pour 2 tips them into the pot (red herb sauce builds up).
   * Safe to call repeatedly (only the first call starts the sequence).
   */
  public startBowlPour(): void {
    if (this.seqStage !== 0 || this.vegItems.length === 0) return;
    // finish any in-flight cut so the diced stage is what travels
    for (const a of this.vegAnims) this.showStage(this.vegItems[a.veg], a.to, false);
    this.vegAnims = [];
    for (const p of this.vegPops) {
      p.obj.getTransform().setLocalScale(vec3.one());
      p.obj.getTransform().setLocalPosition(vec3.zero());
    }
    this.vegPops = [];
    if (this.domeRmv) this.domeRmv.enabled = false;
    if (this.bowlLiquid) {
      this.bowlLiquid.enabled = true;
      this.bowlLiquid.getTransform().setLocalScale(vec3.one());
      this.bowlLiquid.getTransform().setLocalPosition(new vec3(0, 1.45, 0));
    }
    this.seqStage = 1;
    this.seqT = 0;
    if (!this.startSaucierPour(0)) {
      // pot/board geometry missing: skip straight to the veg leg
      this.potLevel = SAUCE_Y_BASE;
      this.applySauceVisual();
      if (this.bowlLiquid) this.bowlLiquid.enabled = false;
      this.seqStage = 3;
      this.pourT = 0;
    }
  }

  /** WS10: land both pours instantly (plating began before they finished). */
  private finishPoursNow(): void {
    if (this.pourT >= 0) {
      for (let i = 0; i < this.vegItems.length; i++) {
        const v = this.vegItems[i];
        v.root.getTransform().setLocalPosition(this.bowlSlot(i));
        v.root.getTransform().setLocalScale(new vec3(BOWL_FILL_SCALE, BOWL_FILL_SCALE, BOWL_FILL_SCALE));
      }
      this.pourT = -1;
    }
    if (!this.bowlFilled) {
      this.bowlFilled = true;
      this.eventBus.emit("PREP_BOWL_FILLED", { stages: this.getVegStages() });
    }
    for (let i = 0; i < this.vegItems.length; i++) {
      if (i === GARNISH_VEG) continue;
      this.vegItems[i].root.enabled = false;
    }
    const g = this.vegItems[GARNISH_VEG];
    if (g && !this.garnishTaken) {
      g.root.getTransform().setLocalPosition(this.bowlSlot(GARNISH_VEG));
      g.root.getTransform().setLocalRotation(quat.quatIdentity());
    }
    if (this.bowlObj) {
      this.bowlObj.getTransform().setLocalPosition(BOWL_LOCAL);
      this.bowlObj.getTransform().setLocalRotation(quat.quatIdentity());
    }
    if (this.bowlLiquid) this.bowlLiquid.enabled = false;
    for (const d of this.streamDrops) d.enabled = false;
    this.potLevel = SAUCE_Y_FULL;
    this.redCover = 1;
    this.applySauceVisual();
    this.saucierActive = false;
    this.seqStage = 5;
    if (!this.bowlPoured) {
      this.bowlPoured = true;
      this.eventBus.emit("PREP_BOWL_POURED", {});
    }
  }

  /** Hide the bowl contents (e.g. P3 garnish leaves the bowl for the plate). Reset restores. */
  public emptyBowl(): void {
    for (const v of this.vegItems) v.root.enabled = false;
  }

  /** WS9-P3: true once the bowl has tipped its diced veg into the saucier and returned home. */
  public isBowlPouredIntoSaucier(): boolean {
    return this.bowlPoured;
  }

  /** WS9-P3: true while the bowl is travelling to / pouring into / returning from the saucier. */
  public isSaucierPourActive(): boolean {
    return this.seqStage > 0 && this.seqStage < 5;
  }

  /**
   * WS9-P3 plating: the parsley left in the bowl leaves for the plate. Hides it and returns its
   * world position (start point of the garnish sprinkle), or the bowl's position if it is gone.
   */
  public takeGarnish(): vec3 | null {
    const bowlWorld = this.bowlObj ? this.bowlObj.getTransform().getWorldPosition() : null;
    const v = this.vegItems[GARNISH_VEG];
    if (!v) return bowlWorld;
    const p = v.root.getTransform().getWorldPosition();
    const wasVisible = v.root.enabled && !this.garnishTaken;
    v.root.enabled = false;
    this.garnishTaken = true;
    return wasVisible ? p : bowlWorld;
  }

  /** WS9-P3: saucier pot object (SaucepotPot) for the plating sauce tilt. */
  // ───────────── v5 dish morph API (used by StationPropsDishBuilder) ─────────────

  /** Rebuild the 9-line laser grid at spacingCm (0.4..2.0) rotated angleDeg about its centre. 1.5 / 0 = the original grid. */
  public rebuildCutGrid(spacingCm: number, angleDeg: number): void {
    const s = Math.max(0.4, Math.min(2.0, isFinite(spacingCm) ? spacingCm : 1.5));
    const a = isFinite(angleDeg) ? angleDeg : 0;
    this.cutSpacingCm = s;
    this.cutAngleDeg = a;
    const g = this.cutGridObj;
    if (!g) return;
    const rmv = g.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!rmv) return;
    const gb = createBuilder();
    const gidx: number[] = [];
    let gvi = 0;
    // K1a: the 9 lane lines stay on the knife's stops (lane pitch LANE_PITCH, one per cut) so every lane is reached
    // at any spacing; a finer spacing adds short guide ticks inside each lane (1.5 = the original grid exactly).
    for (let i = 0; i <= 8; i++) {
      gvi = addBox(gb, gidx, KNIFE_REST_X + i * LANE_PITCH, 0.912, 1.2, 0.032, 0.006, 3.4, [1, 1, 1, 1], gvi);
    }
    if (s < LANE_PITCH - 0.05) {
      for (let i = 0; i < 8; i++) {
        for (let k = 1; k * s < LANE_PITCH - 0.05; k++) {
          gvi = addBox(gb, gidx, KNIFE_REST_X + i * LANE_PITCH + k * s, 0.911, 1.2, 0.018, 0.005, 2.2, [1, 1, 1, 1], gvi);
        }
      }
    }
    const cx = KNIFE_REST_X + 4 * LANE_PITCH;
    const half = 4 * LANE_PITCH + 0.1;
    gvi = addBox(gb, gidx, cx, 0.910, 4.6, half, 0.005, 0.022, [1, 1, 1, 1], gvi);
    gvi = addBox(gb, gidx, cx, 0.910, -2.2, half, 0.005, 0.022, [1, 1, 1, 1], gvi);
    gb.appendIndices(gidx);
    rmv.mesh = gb.getMesh();
    gb.updateMesh();
    const tr = g.getTransform();
    if (Math.abs(a) < 0.01) {
      tr.setLocalRotation(this.cutGridRot0);
      tr.setLocalPosition(this.cutGridPos0);
    } else {
      // rotate about the grid centre (board-local y axis) so the bias lines stay over the lane
      const r = quat.angleAxis(a * (Math.PI / 180), vec3.up());
      const c = new vec3(cx, 0, 1.2);
      tr.setLocalRotation(r.multiply(this.cutGridRot0));
      tr.setLocalPosition(this.cutGridPos0.add(c.sub(r.multiplyVec3(c))));
    }
  }

  public getCutSpacingCm(): number {
    return this.cutSpacingCm;
  }

  public getCutAngleDeg(): number {
    return this.cutAngleDeg;
  }

  /** KINE_LADLE_ORBITAL_STIR: force the saucier steam plume on for a moment. */
  public pulseSaucierSteam(seconds: number): void {
    this.steamBurstUntil = this.elapsedTime + Math.max(0, seconds);
  }

  public getSaucierPot(): SceneObject | null {
    return this.potObj ? this.potObj : null;
  }

  /** Restore every veg to WHOLE on the board, empty the bowl, hide the portion volume. */
  public resetPrepVisuals(): void {
    this.vegAnims = [];
    this.vegPops = [];
    this.pourT = -1;
    this.bowlFilled = false;
    this.chopCount = 0;
    this.saucierT = -1;
    this.saucierActive = false;
    this.bowlPoured = false;
    this.garnishTaken = false;
    // WS10: saucier back to EMPTY, no steam anywhere, transfer sequence idle
    this.seqStage = 0;
    this.seqT = 0;
    this.platingStarted = false;
    this.potLevel = 0;
    this.redCover = 0;
    this.applySauceVisual();
    if (this.bowlLiquid) this.bowlLiquid.enabled = false;
    for (const d of this.streamDrops) d.enabled = false;
    if (this.saucierSteam) this.saucierSteam.setNow(0);
    if (this.skilletSteam) this.skilletSteam.setNow(0);
    if (this.bowlObj) {
      this.bowlObj.getTransform().setLocalPosition(BOWL_LOCAL);
      this.bowlObj.getTransform().setLocalRotation(quat.quatIdentity());
    }
    for (const v of this.vegItems) {
      v.root.enabled = true;
      v.root.getTransform().setLocalPosition(v.home);
      v.root.getTransform().setLocalRotation(quat.quatIdentity());
      v.root.getTransform().setLocalScale(vec3.one());
      for (const st of v.stages) {
        st.getTransform().setLocalScale(vec3.one());
        st.getTransform().setLocalPosition(vec3.zero());
      }
      v.stage = 0;
      this.showStage(v, 0, false);
    }
    if (this.domeRmv) this.domeRmv.enabled = false;
  }

  // ─────────────── WS9 progressive chop internals ───────────────

  private stageForCuts(veg: number, cuts: number): number {
    let st = 0;
    for (let i = 0; i < Math.min(cuts, CUT_MAP.length); i++) {
      if (CUT_MAP[i][0] === veg) st = Math.max(st, CUT_MAP[i][1]);
    }
    return st;
  }

  /** Converge every veg to the stage implied by `cuts` (idempotent); animate the ones that change. */
  private applyChopCount(cuts: number, animate: boolean): void {
    this.chopCount = cuts;
    if (this.seqStage !== 0) return;
    for (let i = 0; i < this.vegItems.length; i++) {
      const v = this.vegItems[i];
      const target = this.stageForCuts(i, cuts);
      if (target === v.stage) continue;
      if (animate) {
        this.vegAnims = this.vegAnims.filter((a) => a.veg !== i);
        this.vegAnims.push({ veg: i, from: v.stage, to: target, t: 0, step: 0 });
      } else {
        this.showStage(v, target, false);
      }
      v.stage = target; // logical state updates immediately; visuals follow the knife dip
    }
    this.eventBus.emit("PREP_VEG_STATE_CHANGED", { chopCount: cuts, stages: this.getVegStages(), names: VEG_NAMES.slice() });
  }

  private showStage(v: VegItem, stage: number, pop: boolean): void {
    for (let k = 0; k < v.stages.length; k++) v.stages[k].enabled = k === stage;
    if (pop) {
      const obj = v.stages[stage];
      this.vegPops = this.vegPops.filter((p) => p.obj !== obj);
      this.vegPops.push({ obj, t: 0 });
      obj.getTransform().setLocalScale(new vec3(0.55, 1, 0.55));
    }
  }

  private updateVegAnimations(dt: number): void {
    // Cut timeline: knife reaches the board at ~0.09 s -> new stage pops in. Single-cut veg
    // (garlic, chilli) flash the partly-cut stage first, then scatter into dice at ~0.3 s.
    if (this.vegAnims.length > 0) {
      for (const a of this.vegAnims) {
        a.t += dt;
        const v = this.vegItems[a.veg];
        const twoStep = a.from === 0 && a.to === 2;
        if (a.step === 0 && a.t >= 0.09) {
          if (twoStep) {
            this.showStage(v, 1, true);
            a.step = 1;
          } else {
            this.showStage(v, a.to, true);
            a.step = 2;
          }
        } else if (a.step === 1 && a.t >= 0.3) {
          this.showStage(v, 2, true);
          a.step = 2;
        }
      }
      this.vegAnims = this.vegAnims.filter((a) => a.step < 2);
    }

    // Scatter pop: pieces spread out from the cut (xz 0.55 -> 1) with a small hop
    if (this.vegPops.length > 0) {
      for (const p of this.vegPops) {
        p.t += dt;
        const k = Math.min(1, p.t / 0.32);
        const e = 1 - Math.pow(1 - k, 3);
        const s = 0.55 + 0.45 * e;
        const tr = p.obj.getTransform();
        tr.setLocalScale(new vec3(s, 1, s));
        tr.setLocalPosition(new vec3(0, 0.3 * Math.sin(Math.PI * k) * (1 - k), 0));
      }
      this.vegPops = this.vegPops.filter((p) => p.t < 0.32);
    }

    // Board -> bowl pour: each veg hops along a short arc into its bowl slot and shrinks to fit
    if (this.pourT >= 0) {
      this.pourT += dt;
      const n = this.vegItems.length;
      for (let i = 0; i < n; i++) {
        const v = this.vegItems[i];
        const k = Math.max(0, Math.min(1, (this.pourT - i * POUR_STAGGER) / POUR_SECONDS));
        const e = k * k * (3 - 2 * k);
        const tgt = this.bowlSlot(i);
        const p = vec3.lerp(v.home, tgt, e);
        v.root.getTransform().setLocalPosition(new vec3(p.x, p.y + 3.2 * Math.sin(Math.PI * e), p.z));
        const sc = 1 + (BOWL_FILL_SCALE - 1) * e;
        v.root.getTransform().setLocalScale(new vec3(sc, sc, sc));
      }
      if (this.pourT >= POUR_SECONDS + POUR_STAGGER * (n - 1) + 0.02) {
        this.pourT = -1;
        this.bowlFilled = true;
        this.eventBus.emit("PREP_BOWL_FILLED", { stages: this.getVegStages() });
        // WS10 pour 2: the diced veg go into the saucier
        this.seqStage = 4;
        if (!this.startSaucierPour(1)) this.finishPoursNow();
      }
    }

    if (this.saucierActive) this.updateSaucierPour(dt);

    // WS10 gap between pour 1 and the veg leg
    if (this.seqStage === 2) {
      this.seqT += dt;
      if (this.seqT >= POUR_GAP_SEC) {
        this.seqStage = 3;
        this.pourT = 0; // diced veg hop board -> bowl
      }
    }
  }

  // ─────────────── WS9-P3 bowl -> saucier pour ───────────────

  /** Board-local point of a pot-local point (pot = SaucepotPot). */
  private potToBoard(p: vec3): vec3 | null {
    if (!this.potObj || !this.boardObj) return null;
    const w = this.potObj.getTransform().getWorldTransform().multiplyPoint(p);
    return this.boardObj.getTransform().getInvertedWorldTransform().multiplyPoint(w);
  }

  /** Start one bowl trip to the saucier (payload 0 = portion base, 1 = diced veg). */
  private startSaucierPour(payload: number): boolean {
    if (this.saucierActive || this.bowlPoured || !this.bowlObj) return false;
    const rim = this.potToBoard(new vec3(0, 5.16, 0));
    const surf = this.potToBoard(new vec3(0, 3.9, 0));
    const edge = this.potToBoard(new vec3(5.5, 5.16, 0));
    if (!rim || !surf || !edge) return false;
    this.pourPayload = payload;
    this.pourLevel0 = this.potLevel;
    const rimR = Math.sqrt((edge.x - rim.x) * (edge.x - rim.x) + (edge.z - rim.z) * (edge.z - rim.z));
    const d0 = new vec3(rim.x - BOWL_LOCAL.x, 0, rim.z - BOWL_LOCAL.z);
    const dir = d0.length > 1e-3 ? d0.normalize() : new vec3(-1, 0, 0);
    this.pourDir = dir;
    this.sauceSurface = surf;
    // bowl origin just outside the rim on the board side, ~3 units above it: tipped 65 deg, the
    // bowl lip lands over the pot interior (see BOWL_TIP_ANGLE)
    this.pourPose = rim.sub(dir.uniformScale(rimR + 0.6)).add(new vec3(0, 3.0, 0));
    this.saucierT = -BOWL_POUR_DELAY;
    this.saucierActive = true;
    return true;
  }

  private bowlSlotOffset(i: number): vec3 {
    return this.bowlSlot(i).sub(BOWL_LOCAL);
  }

  private updateSaucierPour(dt: number): void {
    if (!this.bowlObj || !this.pourPose || !this.pourDir || !this.sauceSurface) {
      this.saucierActive = false;
      return;
    }
    this.saucierT += dt;
    const t = this.saucierT;
    if (t < 0) return;
    const smooth = (k: number): number => {
      const c = Math.max(0, Math.min(1, k));
      return c * c * (3 - 2 * c);
    };
    const tTip = BOWL_TRAVEL_SEC;
    const tSlide = tTip + BOWL_TIP_SEC * 0.6; // contents start to leave the bowl
    const tBack = tTip + BOWL_TIP_SEC + BOWL_HOLD_SEC;
    const tRet = tBack + BOWL_TIPBACK_SEC;
    const tEnd = tRet + BOWL_RETURN_SEC;
    const veg = this.pourPayload === 1;

    // bowl position: out (arc) -> hold -> back (arc)
    let pos: vec3;
    if (t < tTip) {
      const e = smooth(t / BOWL_TRAVEL_SEC);
      pos = vec3.lerp(BOWL_LOCAL, this.pourPose, e).add(new vec3(0, 4.0 * Math.sin(Math.PI * e), 0));
    } else if (t < tRet) {
      pos = this.pourPose;
    } else {
      const e = smooth((t - tRet) / BOWL_RETURN_SEC);
      pos = vec3.lerp(this.pourPose, BOWL_LOCAL, e).add(new vec3(0, 3.0 * Math.sin(Math.PI * e), 0));
    }
    // tip: mouth turns toward the pot (rotation axis up x dir takes +Y toward dir)
    let tip = 0;
    if (t >= tTip && t < tBack) tip = smooth((t - tTip) / BOWL_TIP_SEC);
    else if (t >= tBack && t < tRet) tip = 1 - smooth((t - tBack) / BOWL_TIPBACK_SEC);
    const axis = vec3.up().cross(this.pourDir).normalize();
    const rot = quat.angleAxis(BOWL_TIP_ANGLE * tip, axis);
    const bt = this.bowlObj.getTransform();
    bt.setLocalPosition(pos);
    bt.setLocalRotation(rot);

    // WS10 liquid in the pot: pour 1 fills the golden base, pour 2 spreads the red sauce + raises it
    const flowK = (tBack - tSlide);
    if (!veg) {
      const f = smooth((t - tSlide) / flowK);
      if (t >= tSlide) {
        this.potLevel = Math.max(this.pourLevel0, SAUCE_Y_FLOOR + (SAUCE_Y_BASE - SAUCE_Y_FLOOR) * f);
        this.applySauceVisual();
      }
      if (this.bowlLiquid) {
        const lt = this.bowlLiquid.getTransform();
        lt.setLocalScale(new vec3(1 - 0.8 * f, 1, 1 - 0.8 * f));
        lt.setLocalPosition(new vec3(0, 1.45 - 0.9 * f, 0));
        if (f >= 0.999 && this.bowlLiquid.enabled) this.bowlLiquid.enabled = false;
      }
      this.updatePourStream(t - tSlide, flowK, pos, rot);
    } else {
      const f = smooth((t - tSlide - 0.3) / flowK);
      if (f > 0) {
        const y0 = Math.max(this.pourLevel0, SAUCE_Y_BASE);
        this.potLevel = y0 + (SAUCE_Y_FULL - y0) * f;
        this.redCover = 0.18 + 0.82 * f;
        this.applySauceVisual();
      }
    }
    const surfNow = this.potToBoard(new vec3(0, Math.max(SAUCE_Y_FLOOR, this.potLevel), 0));
    if (surfNow) this.sauceSurface = surfNow;

    // contents ride in the bowl; everything but the parsley slides out into the sauce (pour 2 only)
    for (let i = 0; veg && i < this.vegItems.length; i++) {
      const v = this.vegItems[i];
      const tr = v.root.getTransform();
      const carried = pos.add(rot.multiplyVec3(this.bowlSlotOffset(i)));
      if (i === GARNISH_VEG) {
        if (!this.garnishTaken) {
          tr.setLocalPosition(carried);
          tr.setLocalRotation(rot);
        }
        continue;
      }
      const order = i < GARNISH_VEG ? i : i - 1;
      const k = (t - tSlide - order * 0.12) / BOWL_SLIDE_SEC;
      if (k <= 0) {
        tr.setLocalPosition(carried);
        tr.setLocalRotation(rot);
        continue;
      }
      if (k >= 1) {
        if (v.root.enabled) v.root.enabled = false; // sunk into the reduction
        continue;
      }
      const e = k * k; // accelerates out of the bowl
      const land = this.sauceSurface.add(this.pourDir.uniformScale(-1.2 + 0.6 * order)).add(new vec3(0, 0.1, 0));
      const p = vec3.lerp(carried, land, e).add(new vec3(0, 1.2 * Math.sin(Math.PI * k) * (1 - k), 0));
      tr.setLocalPosition(p);
      tr.setLocalRotation(quat.slerp(rot, quat.quatIdentity(), k));
      const sc = BOWL_FILL_SCALE * (1 - 0.75 * smooth((k - 0.6) / 0.4));
      tr.setLocalScale(new vec3(sc, sc, sc));
    }

    if (t >= tEnd) {
      bt.setLocalPosition(BOWL_LOCAL);
      bt.setLocalRotation(quat.quatIdentity());
      this.saucierActive = false;
      if (!veg) {
        // pour 1 done: golden base in the pot; short gap, then the veg leg
        if (this.bowlLiquid) this.bowlLiquid.enabled = false;
        for (const d of this.streamDrops) d.enabled = false;
        this.potLevel = Math.max(this.potLevel, SAUCE_Y_BASE);
        this.applySauceVisual();
        this.seqStage = 2;
        this.seqT = 0;
        return;
      }
      const g = this.vegItems[GARNISH_VEG];
      if (g && !this.garnishTaken) {
        g.root.getTransform().setLocalPosition(this.bowlSlot(GARNISH_VEG));
        g.root.getTransform().setLocalRotation(quat.quatIdentity());
      }
      this.potLevel = SAUCE_Y_FULL;
      this.redCover = 1;
      this.applySauceVisual();
      this.seqStage = 5;
      this.bowlPoured = true;
      this.eventBus.emit("PREP_BOWL_POURED", {});
    }
  }

  /** WS10: golden droplets running from the tipped bowl lip down into the pot during pour 1. */
  private updatePourStream(ft: number, dur: number, bowlPos: vec3, bowlRot: quat): void {
    const on = ft >= 0 && ft < dur && !!this.pourDir && !!this.sauceSurface;
    for (let i = 0; i < this.streamDrops.length; i++) {
      const d = this.streamDrops[i];
      const lead = (i / this.streamDrops.length) * 0.42;
      if (!on || ft < lead) {
        if (d.enabled) d.enabled = false;
        continue;
      }
      const u = ((ft - lead) / 0.42) % 1;
      const lip = bowlPos.add(bowlRot.multiplyVec3(this.pourDir!.uniformScale(2.95).add(new vec3(0, 2.15, 0))));
      const land = this.sauceSurface!.add(this.pourDir!.uniformScale(-1.0));
      const p = vec3.lerp(lip, land, u * u);
      if (!d.enabled) d.enabled = true;
      const tr = d.getTransform();
      tr.setLocalPosition(p);
      const s = 0.75 + 0.35 * u;
      tr.setLocalScale(new vec3(s * 0.85, s * 1.25, s * 0.85));
    }
  }

  private bowlSlot(i: number): vec3 {
    const s = BOWL_SLOTS[i % BOWL_SLOTS.length];
    // centre slot (parsley) sits highest so the mixed mound crowns just under the rim
    const lift = i === 2 ? 0.75 : 0.35 + 0.08 * i;
    return new vec3(BOWL_LOCAL.x + s[0], BOWL_FLOOR_Y + lift, BOWL_LOCAL.z + s[1]);
  }

  /**
   * Builds the five veg of the boot dish (Prebuilt Cookings #1) from VegGenerators, each with WHOLE / PARTIAL / DICED
   * stage children (+ _Stem accent child where the veg has one). The boot meshes are kept so dish 01 restores 1:1.
   */
  private buildVegRow(boardObj: SceneObject): void {
    const rowRoot = this.ensureChild(boardObj, "PrepVegRow");
    const mats = [MAT_RED_ONION, MAT_GARLIC, MAT_PARSLEY, MAT_RED_PEPPER, MAT_YELLOW_PEPPER];
    const labels = ["Whole", "Partial", "Diced"];
    const slots = getPreset(0).prepSlots;
    this.vegItems = [];
    this.vegOriginal = [];
    for (let i = 0; i < VEG_NAMES.length; i++) {
      const root = this.ensureChild(rowRoot, `Veg_${VEG_NAMES[i]}`);
      const home = new vec3(VEG_X[i], VEG_TOP_Y, VEG_Z);
      root.getTransform().setLocalPosition(home);
      const stages: SceneObject[] = [];
      const set = buildVegStages(slots[i], () => new MeshAcc());
      const orig: VegLaneMeshes = { meshes: [], mats: [mats[i], MAT_PARSLEY, mats[i]] };
      for (let k = 0; k < 3; k++) {
        const st = this.ensureChild(root, `Veg_${VEG_NAMES[i]}_${labels[k]}`);
        const rmv = this.ensureRmv(st, mats[i]);
        const p = set.parts[k];
        const body = p[0] ? p[0].toMesh() : null;
        if (body) rmv.mesh = body;
        let stem: RenderMesh | null = null;
        if (p[1]) {
          stem = p[1].toMesh();
          this.ensureRmv(this.ensureChild(st, `Veg_${VEG_NAMES[i]}_${labels[k]}_Stem`), MAT_PARSLEY).mesh = stem;
        }
        orig.meshes.push([body, stem, null]);
        stages.push(st);
      }
      this.vegOriginal.push(orig);
      const item: VegItem = { root, stages, stage: 0, home };
      this.showStage(item, 0, false);
      this.vegItems.push(item);
    }
  }


  /**
   * v5 A1: swap lane i (0..4) to another veg's stage meshes; null restores the boot (dish 01) meshes. Lane roots and
   * stage objects keep their names, stage state and pop/scatter animation, so chopping works for any loaded veg.
   */
  public setVegLaneMeshes(i: number, lane: VegLaneMeshes | null): void {
    const v = this.vegItems[i];
    const src = lane ? lane : this.vegOriginal[i];
    if (!v || !src) return;
    const suffix = ["", "_Stem", "_Detail"];
    for (let k = 0; k < v.stages.length && k < src.meshes.length; k++) {
      const st = v.stages[k];
      const row = src.meshes[k];
      const rmv = this.ensureRmv(st, src.mats[0]);
      rmv.enabled = !!row[0];
      if (row[0]) rmv.mesh = row[0];
      for (let p = 1; p < 3; p++) {
        const name = st.name + suffix[p];
        let ch: SceneObject | null = null;
        for (let c = 0; c < st.getChildrenCount(); c++) if (st.getChild(c).name === name) ch = st.getChild(c);
        if (!row[p]) {
          if (ch) ch.enabled = false;
          continue;
        }
        if (!ch) ch = this.ensureChild(st, name);
        ch.enabled = true;
        this.ensureRmv(ch, src.mats[p]).mesh = row[p] as RenderMesh;
      }
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// v5 StationPropsDishBuilder: the real IDishAssetBuilder for the CURRENT meshes.
// Does only what existing props allow: cut grid spacing/angle (+ knife step via MetricPrepBlueprint),
// sauce colours (bowl portion, saucier discs, plate pool/streak share MAT_SAUCE / MAT_SAUCE_TOMATO) and
// protein top/crust tints on the salmon materials. A1: veg lanes swap to VegGenerators meshes. Other mesh swaps
// (wok/handi, ladle, cubed protein) belong to the asset phase and only log once. Preset 0 restores the captured originals.
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedColor {
  mat: Material;
  color: vec4;
}

function sameRgb(a: Rgb | undefined, b: Rgb | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 0.002 && Math.abs(a[1] - b[1]) < 0.002 && Math.abs(a[2] - b[2]) < 0.002;
}

/** Hue-preserving tint for textured materials: scale so the brightest channel is 1. */
function tintOf(c: Rgb): vec4 {
  const m = Math.max(0.05, c[0], c[1], c[2]);
  return new vec4(c[0] / m, c[1] / m, c[2] / m, 1);
}

export class StationPropsDishBuilder implements IDishAssetBuilder {
  private props: StationPropsBuilder;
  private pendingLogged: boolean = false;
  private captured: CapturedColor[] = [];
  private def = getPreset(0);
  private vegCache: { [key: string]: VegLaneMeshes } = {};

  // A4a hero vessels / tools / service ware (VesselGenerators)
  private hw: HeroWareController;
  private tw: ToolWareController; // A4b stockpot basket / knives / ramekins / hand tools / whisk
  private pantry: PantryController; // A5 spices / dairy / oils / legumes (#160-#166)
  private warePlan: WarePlan | null = null;
  private wareClearOnReveal: boolean = false;
  private spatulaHidden: boolean = false;

  constructor(props: StationPropsBuilder) {
    this.props = props;
    this.hw = new HeroWareController(props);
    this.tw = new ToolWareController(props, this.hw);
    this.pantry = new PantryController(props, this.tw);
    this.pantry.setStarchProvider(() => this.starchCurrent.map((p) => p.getObject()));
    this.hw.onPanChanged = () => {
      // proteins follow the active pan (placeInPan: WokPan first, else SkilletPan)
      for (const p of [this.proteinCurrent, this.proteinPending]) if (p && p.isLive()) p.placeInPan();
    };
  }

  /** A4a controller (wok / handi + HandiLid / ladle / service ware). */
  getHeroWare(): HeroWareController {
    return this.hw;
  }

  /** A4b controller (strainer basket, knife variants, spice ramekins, wok chuan / chopsticks / tongs, whisk). */
  getToolWare(): ToolWareController {
    return this.tw;
  }

  /** A5 controller (garam masala, powders, butter, cheese, cream swirl, oil cruet, dal / chickpeas). */
  getPantry(): PantryController {
    return this.pantry;
  }

  /** A5: immediate pantry build for a non-staged apply; null (Reset) removes every pantry prop and restores the #326 powders. */
  rebuildPantry(entries: PrepSlotEntry[] | null, ctx?: PantryContext): void {
    this.pantry.rebuild(entries, ctx);
  }

  private pending(what: string): void {
    if (this.pendingLogged) return;
    this.pendingLogged = true;
    print(`[DishAssetBuilder] asset phase pending: ${what} (and other mesh swaps) keep the current meshes`);
  }

  private capture(m: Material): void {
    for (const c of this.captured) if (c.mat === m) return;
    this.captured.push({ mat: m, color: m.mainPass.baseColor });
  }

  private restore(m: Material): void {
    for (const c of this.captured) {
      if (c.mat === m) {
        m.mainPass.baseColor = c.color;
        return;
      }
    }
  }

  private setColor(m: Material | null, isDefault: boolean, color: vec4): void {
    if (!m) return;
    if (isDefault) {
      this.restore(m);
      return;
    }
    this.capture(m);
    m.mainPass.baseColor = color;
  }

  private matOf(name: string): Material | null {
    const o = findByName(this.props.getSceneObject(), name);
    const rmv = o ? (o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
    return rmv && rmv.mainMaterial ? rmv.mainMaterial : null;
  }

  /** Lane i would show exactly the boot dish's veg (same number, colour and generator): restore the original meshes. */
  private isBootVeg(i: number, e: PrepSlotEntry): boolean {
    const d = this.def.prepSlots[i];
    return !!d && e.accessNumber === d.accessNumber && sameRgb(e.colorRgb, d.colorRgb) && resolveVeg(e).gen === resolveVeg(d).gen;
  }

  /** Builds (or returns cached) one veg's three stage meshes + materials (A1 VegGenerators). Changes nothing visible. */
  private prebuildVeg(e: PrepSlotEntry): VegLaneMeshes {
    const f = (c: Rgb | undefined) => (c ? c.map((x) => x.toFixed(3)).join(",") : "-");
    const key = `${e.accessNumber}|${String(e.name || "").toLowerCase()}|${f(e.colorRgb)}|${f(e.stemColorRgb)}|${e.scaleMultiplier}`;
    const hit = this.vegCache[key];
    if (hit) return hit;
    const set = buildVegStages(e, () => new MeshAcc());
    const mat = (c: Rgb, metal: number, rough: number) => makePbrMaterial(c[0], c[1], c[2], metal, rough);
    const lane: VegLaneMeshes = {
      meshes: set.parts.map((row) => row.map((p) => (p ? p.toMesh() : null))),
      mats: [mat(set.bodyRgb, set.metal, set.rough), mat(set.accentRgb, 0.0, 0.45), mat(set.detailRgb, 0.0, 0.4)],
    };
    this.vegCache[key] = lane;
    print(`[VegGen] #${e.accessNumber} ${e.name} -> ${set.gen} tris ${set.tris.join("/")}`);
    return lane;
  }

  rebuildVegSlot(i: number, entry: PrepSlotEntry): void {
    if (!entry || i < 0 || i >= VEG_NAMES.length) return;
    if (this.isBootVeg(i, entry)) {
      this.props.setVegLaneMeshes(i, null); // dish 01 lane: the original meshes, 1:1
      return;
    }
    this.props.setVegLaneMeshes(i, this.prebuildVeg(entry));
  }

  rebuildProtein(protein: ProteinSpec): void {
    if (!protein) return;
    const isDefault = protein.accessNumber === this.def.protein.accessNumber;
    if (isDefault) {
      // dish 01 / Reset: every protein prop leaves, the salmon fillet is back exactly as built
      this.dropProteins();
    } else {
      // A3: the dish's own dual-surface protein in the pan (staged one adopted, else built now); salmon hidden
      const prop = this.takeProtein(protein);
      if (prop) {
        this.showProtein(prop);
        this.setColor(this.matOf("SalmonFillet"), true, tintOf(protein.rawTopRgb));
        this.setColor(this.matOf("SalmonCrispySkin"), true, tintOf(protein.searedCrustRgb));
        return;
      }
      this.dropProteins(); // no generator: legacy stand-in (tinted fillet)
    }
    if (!isDefault && protein.archetype !== "FILLET_SLAB") this.pending(`protein archetype ${protein.archetype}`);
    // raw top = SalmonFillet surface, seared crust = SalmonCrispySkin (rolled up by the flip / toss)
    this.setColor(this.matOf("SalmonFillet"), isDefault, tintOf(protein.rawTopRgb));
    this.setColor(this.matOf("SalmonCrispySkin"), isDefault, tintOf(protein.searedCrustRgb));
  }

  morphVessel(slot: VesselSlotId, accessNumber: number): void {
    // A4a: #302 wok/kadai <-> #301 skillet on the primary burner, #303 handi <-> #304/#311 saucier on the secondary
    if (slot === "SLOT_PRIMARY_BURNER") this.hw.showPrimary(accessNumber);
    else this.hw.showSecondary(accessNumber);
    if ([301, 302, 303, 304, 305, 307, 311].indexOf(accessNumber) < 0) this.pending(`vessel #${accessNumber} on ${slot}`);
  }

  enableTool(accessNumber: number, enabled: boolean): void {
    if (this.tw.handles(accessNumber)) {
      // A4b: #306 basket, #321/#322/#323 knife blade, #326 ramekins, #333-#336 hand tools / whisk
      this.tw.show(accessNumber, enabled);
      if (accessNumber === 306 && enabled) this.tw.holdStarches(this.starchCurrent.filter((p) => [117, 118].indexOf(p.getAccessNumber()) >= 0).map((p) => p.getObject()));
    } else if (accessNumber === 332) {
      this.hw.showLadle(enabled);
    } else if (accessNumber === 331) {
      // spatula: only ever hidden by an explicit disable; re-shown only if this builder hid it
      const sp = findByName(this.props.getSceneObject(), "SpatulaProp");
      if (sp && !enabled && sp.enabled) {
        sp.enabled = false;
        this.spatulaHidden = true;
      } else if (sp && enabled && this.spatulaHidden) {
        sp.enabled = true;
        this.spatulaHidden = false;
      }
    } else if ((accessNumber === 341 || accessNumber === 342 || accessNumber === 343) && enabled) {
      this.hw.showServe(accessNumber);
    }
  }

  /** A4a staging: the dish's hero props are built HIDDEN and become the targets of their items. */
  private stageWare(bp: UniversalDishBlueprint, items: StagedDishItem[]): void {
    const plan = warePlanFor(bp);
    this.warePlan = plan;
    this.wareClearOnReveal = true;
    this.hw.setKadai(plan.kadai);
    this.tw.setDishList(bp);
    for (const it of items) {
      const k = it.key;
      if (k === "vessel_305" || k === "vessel_307") {
        const o = this.hw.prepare(it.accessNumber);
        it.targets = o ? [o] : [];
        continue;
      }
      if (k === "vessel_326" || k === "tool_306" || (k.indexOf("tool_33") === 0 && it.accessNumber >= 333 && it.accessNumber <= 336)) {
        const o = this.tw.prepare(it.accessNumber);
        it.targets = o ? [o] : [];
        continue;
      }
      const hero = k === "vessel_302" || k === "vessel_303" || k === "serve_342" || k === "serve_343" || (k === "tool_332" && plan.ladle);
      if (!hero) continue;
      const o = this.hw.prepare(it.accessNumber);
      it.targets = o ? [o] : [];
    }
  }

  /** A4a reveal: the swap already ran (morphVessel / enableTool); returns the hero prop to pop in, null = not a ware key. */
  private revealWare(itemKey: string): SceneObject[] | null {
    if (this.wareClearOnReveal) {
      this.wareClearOnReveal = false;
      if (this.warePlan) this.hw.applyLeftovers(this.warePlan);
      this.tw.applyLeftovers();
    }
    const root = this.props.getSceneObject();
    if (itemKey === "vessel_302") return this.hw.getPrimary() === 302 ? this.found(root, "WokPan") : [];
    if (itemKey === "vessel_303") return this.hw.getSecondary() === 303 ? this.found(root, "BiryaniHandi") : [];
    if (itemKey === "tool_332") return this.hw.isLadleOn() ? this.found(root, "LadleProp") : [];
    if (itemKey === "vessel_305") return this.hw.getSecondary() === 305 ? this.found(root, "PastaStockpot") : [];
    if (itemKey === "vessel_307") return this.hw.getPrimary() === 307 ? this.found(root, "TawaPan") : [];
    if (itemKey === "tool_306" || itemKey === "vessel_326" || (itemKey.indexOf("tool_33") === 0 && itemKey.length === 8)) return this.tw.revealObjects(parseInt(itemKey.substring(itemKey.indexOf("_") + 1), 10));
    if (itemKey === "serve_341" || itemKey === "serve_342" || itemKey === "serve_343") {
      const o = this.props.getPlateObject();
      return o ? [o] : [];
    }
    return null;
  }

  private found(root: SceneObject, name: string): SceneObject[] {
    const o = findByName(root, name);
    return o ? [o] : [];
  }

  setCutGrid(spacingCm: number, angleDeg: number): void {
    this.props.rebuildCutGrid(spacingCm, angleDeg);
    const s = this.props.getCutSpacingCm();
    // knife step = MetricPrepBlueprint.spacingCm (duck-typed: MetricPrepBlueprint imports this module)
    const comps = this.props.getSceneObject().getComponents("Component.ScriptComponent") as any[];
    for (const c of comps) {
      if (c && typeof c.stepChop === "function" && typeof c.spacingCm === "number") c.spacingCm = s;
    }
  }

  /**
   * P5 staging: maps each item to the prop that represents it (veg lane roots, fillet, pan, pot, bowl, knife, spatula,
   * plate). A1: the new dish's veg meshes are built HIDDEN here (cache only, nothing visible changes); the lane swap
   * (rebuildVegSlot) runs at that item's reveal while its lane root is hidden, then the lane pops in.
   */
  stage(bp: UniversalDishBlueprint, items: StagedDishItem[]): void {
    const root = this.props.getSceneObject();
    const used: SceneObject[] = [];
    for (const it of items) {
      if (it.group !== "INGREDIENT" || it.lane < 0 || it.lane >= VEG_NAMES.length || !bp || !bp.prepSlots) continue;
      const e = bp.prepSlots[it.lane];
      if (!e || e.accessNumber !== it.accessNumber || this.isBootVeg(it.lane, e)) continue;
      try {
        this.prebuildVeg(e);
      } catch (err) {
        print(`[VegGen] prebuild failed for #${e.accessNumber}: ${err}`);
      }
    }
    for (const it of items) {
      let name = "";
      if (it.group === "INGREDIENT" && it.lane >= 0 && it.lane < VEG_NAMES.length) name = `Veg_${VEG_NAMES[it.lane]}`;
      else if (it.group === "PROTEIN") name = "SalmonFillet";
      else if (it.group === "VESSEL" || it.group === "TOOL" || it.group === "SERVEWARE") name = it.propName;
      const o = name ? findByName(root, name) : null;
      if (!o || used.indexOf(o) >= 0 || !o.isEnabledInHierarchy) {
        it.targets = [];
        continue;
      }
      used.push(o);
      it.targets = [o];
    }
    // A3: the dish's protein prop is built HIDDEN (disabled) in the pan; its reveal adopts it (rebuildProtein) + pops it.
    if (this.proteinPending) this.proteinPending.destroy();
    this.proteinPending = null;
    this.proteinClearOnReveal = true;
    for (const it of items) {
      if (it.group !== "PROTEIN" || !bp || !bp.protein || bp.protein.accessNumber === this.def.protein.accessNumber) continue;
      const p = this.makeProtein(bp.protein);
      if (!p) continue;
      p.getObject().enabled = false;
      this.proteinPending = p;
      it.targets = [p.getObject()];
    }
    // A2: the dish's starch props are built HIDDEN (disabled) at SLOT_STARCH; the reveal enables + pops them.
    this.dropStarch(this.starchPending);
    this.starchPending = [];
    this.starchClearOnReveal = true;
    const tint = bp && bp.sauce ? { baseRgb: bp.sauce.baseLiquidRgb, reducedRgb: bp.sauce.reducedSauceRgb } : undefined;
    for (const it of items) {
      if (it.group !== "STARCH") continue;
      const p = this.makeStarch(this.starchEntry(it.accessNumber, it.label), tint);
      if (!p) continue;
      p.getObject().enabled = false;
      this.starchPending.push(p);
      it.targets = [p.getObject()];
    }
    this.stageWare(bp, items);
    // A5: pantry props (#160-#166) built HIDDEN after the ware (the #326 ramekins decide how #161 integrates)
    this.pantry.stage(bp, items);
  }

  reveal(itemKey: string): SceneObject[] {
    if (this.proteinClearOnReveal) {
      // first reveal of a newly staged dish with its own protein: the previous protein (prop or salmon) leaves now
      this.proteinClearOnReveal = false;
      if (this.proteinPending) {
        if (this.proteinCurrent) this.proteinCurrent.destroy();
        this.proteinCurrent = null;
        ProteinRegistry.setActive(null);
        this.setSalmonVisible(false);
      }
    }
    if (this.starchClearOnReveal) {
      // first reveal of a newly staged dish: the previous dish's starch leaves
      this.starchClearOnReveal = false;
      this.dropStarch(this.starchCurrent);
      this.starchCurrent = [];
    }
    const pantry = this.pantry.reveal(itemKey);
    if (pantry) return pantry;
    const ware = this.revealWare(itemKey);
    if (ware) return ware;
    if (itemKey.indexOf("starch_") !== 0) return [];
    for (let i = 0; i < this.starchPending.length; i++) {
      const p = this.starchPending[i];
      if (p.getItemKey() !== itemKey) continue;
      this.starchPending.splice(i, 1);
      this.starchCurrent.push(p);
      p.setStage(0, false);
      p.getObject().enabled = true;
      return [p.getObject()];
    }
    return [];
  }

  // ── A3 protein props (ProteinGenerators) ──
  private proteinCurrent: ProteinProp | null = null;
  private proteinPending: ProteinProp | null = null;
  private proteinClearOnReveal: boolean = false;

  private proteinKey(p: ProteinSpec): string {
    const f = (c: Rgb | undefined) => (c ? c.map((x) => Number(x).toFixed(3)).join(",") : "-");
    return `${canonicalProteinNumber(p.accessNumber)}|${p.archetype}|${String(p.name || "").toLowerCase()}|${f(p.rawTopRgb)}|${f(p.searedCrustRgb)}|${p.lengthCm}x${p.widthCm}x${p.heightCm}`;
  }

  /** Builds a protein prop in the pan (raw face up, enabled). Catalogue colours = design palette, else dish tint. */
  private makeProtein(p: ProteinSpec): ProteinProp | null {
    const n = canonicalProteinNumber(p.accessNumber);
    const entry = { accessNumber: n, name: p.name, archetype: p.archetype, rawTopRgb: p.rawTopRgb, searedCrustRgb: p.searedCrustRgb, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm };
    if (!proteinGenFor(entry)) return null;
    let cat: (typeof PROTEIN_REGISTRY)[number] | null = null;
    for (const e of PROTEIN_REGISTRY) if (e.accessNumber === n) cat = e;
    const tint: ProteinTint | undefined = cat && sameRgb(cat.rawTopRgb, p.rawTopRgb) && sameRgb(cat.searedCrustRgb, p.searedCrustRgb)
      ? undefined
      : { rawRgb: p.rawTopRgb, searedRgb: p.searedCrustRgb };
    try {
      const prop = new ProteinProp(this.props, this.props.getSceneObject(), entry, tint, this.proteinKey(p));
      prop.placeInPan();
      return prop;
    } catch (err) {
      print(`[ProteinGen] build failed for #${n}: ${err}`);
      return null;
    }
  }

  /** The staged prop of this spec, else the live one (reset to raw), else a new one. */
  private takeProtein(p: ProteinSpec): ProteinProp | null {
    const key = this.proteinKey(p);
    const pend = this.proteinPending;
    if (pend && pend.isLive() && pend.getKey() === key) {
      this.proteinPending = null;
      return pend;
    }
    const cur = this.proteinCurrent;
    if (cur && cur.isLive() && cur.getKey() === key) {
      cur.resetToRaw();
      return cur;
    }
    return this.makeProtein(p);
  }

  private showProtein(prop: ProteinProp): void {
    if (this.proteinCurrent && this.proteinCurrent !== prop) this.proteinCurrent.destroy();
    this.proteinCurrent = prop;
    if (!prop.getPan()) prop.placeInPan();
    prop.getObject().enabled = true;
    ProteinRegistry.setActive(prop);
    this.setSalmonVisible(false);
  }

  /** Reset / dish 01: every protein prop leaves and the salmon fillet shows again. */
  private dropProteins(): void {
    if (this.proteinCurrent) this.proteinCurrent.destroy();
    if (this.proteinPending) this.proteinPending.destroy();
    this.proteinCurrent = null;
    this.proteinPending = null;
    this.proteinClearOnReveal = false;
    ProteinRegistry.setActive(null);
    this.setSalmonVisible(true);
  }

  private setSalmonVisible(on: boolean): void {
    const s = findByName(this.props.getSceneObject(), "SalmonFillet");
    if (s && s.enabled !== on) s.enabled = on;
  }

  /** Live protein prop of the current dish (null = the salmon fillet). Later kinematics drive doneness on it. */
  getProteinProp(): ProteinProp | null {
    return this.proteinCurrent && this.proteinCurrent.isLive() ? this.proteinCurrent : null;
  }

  // ── A2 starch props (StarchGenerators) ──
  private starchCurrent: StarchProp[] = [];
  private starchPending: StarchProp[] = [];
  private starchClearOnReveal: boolean = false;

  private starchEntry(n: number, label: string): PrepSlotEntry {
    const c = getCatalogEntry(n);
    if (c) return { accessNumber: c.accessNumber, name: c.name, archetype: c.archetype, colorRgb: c.colorRgb, scaleMultiplier: c.scaleMultiplier };
    return { accessNumber: n, name: label, archetype: "GRANULAR_MOUND", colorRgb: [NaN, NaN, NaN] as any, scaleMultiplier: 1 };
  }

  private makeStarch(e: PrepSlotEntry, tint?: StarchTint): StarchProp | null {
    if (!starchGenFor(e)) return null;
    try {
      return new StarchProp(this.props, this.props.getSceneObject(), e, tint);
    } catch (err) {
      print(`[StarchGen] build failed for #${e.accessNumber}: ${err}`);
      return null;
    }
  }

  private dropStarch(list: StarchProp[]): void {
    for (const p of list) p.destroy();
  }

  /** Live starch props of the current dish (later kinematics drive setStage / setStageProgress on these). */
  getStarchProps(): StarchProp[] {
    return this.starchCurrent.slice();
  }

  rebuildStarch(entry: PrepSlotEntry | null, stage: 0 | 1 | 2 = 0, tint?: StarchTint): void {
    if (!entry) {
      this.dropStarch(this.starchCurrent);
      this.dropStarch(this.starchPending);
      this.starchCurrent = [];
      this.starchPending = [];
      this.starchClearOnReveal = false;
      return;
    }
    let p: StarchProp | null = null;
    for (const q of this.starchCurrent) if (q.getAccessNumber() === entry.accessNumber) p = q;
    if (!p) {
      const e = entry.name ? entry : this.starchEntry(entry.accessNumber, "");
      p = this.makeStarch(e, tint);
      if (!p) return;
      this.starchCurrent.push(p);
    }
    p.getObject().enabled = true;
    p.setStage(stage, false);
  }

  setSauceColors(base: Rgb, reduced: Rgb): void {
    const baseDefault = sameRgb(base, this.def.sauce.baseLiquidRgb);
    const redDefault = sameRgb(reduced, this.def.sauce.reducedSauceRgb);
    this.setColor(MAT_SAUCE, baseDefault, new vec4(base[0], base[1], base[2], 1));
    this.setColor(MAT_SAUCE_TOMATO, redDefault, tintOf(reduced));
  }
}
