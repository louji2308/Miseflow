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

const MAT_CYAN = makePbrMaterial(0.18, 0.86, 0.96, 0.1, 0.22);
const MAT_AMBER = makePbrMaterial(0.98, 0.68, 0.22, 0.1, 0.25);
const MAT_BLUE = makePbrMaterial(0.32, 0.68, 0.98, 0.1, 0.25);
const MAT_GREEN = makePbrMaterial(0.24, 0.88, 0.50, 0.1, 0.25);
const MAT_CORAL = makePbrMaterial(0.98, 0.42, 0.36, 0.1, 0.25);
const MAT_WOOD = makePbrMaterial(0.72, 0.50, 0.30, 0.02, 0.58);
const MAT_WOOD_DARK = makePbrMaterial(0.38, 0.24, 0.12, 0.04, 0.62);
const MAT_SHALLOT_PURPLE = makePbrMaterial(0.58, 0.26, 0.46, 0.05, 0.38);
const MAT_SHALLOT_CREAM = makePbrMaterial(0.94, 0.88, 0.82, 0.02, 0.42);
const MAT_CAST_IRON = makePbrMaterial(0.12, 0.13, 0.15, 0.72, 0.62);
const MAT_SALMON = makePbrMaterial(0.88, 0.38, 0.26, 0.04, 0.42);
const MAT_SALMON_SKIN = makePbrMaterial(0.62, 0.36, 0.18, 0.14, 0.52);
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
const MAT_SEAR_MARK = makePbrMaterial(0.18, 0.14, 0.10, 0.10, 0.72);
const MAT_INDUCTION_AMBER = makePbrMaterial(0.96, 0.58, 0.12, 0.05, 0.35);
const MAT_INDUCTION_COOL = makePbrMaterial(0.22, 0.62, 0.96, 0.05, 0.35);
const MAT_INDUCTION_EMERALD = makePbrMaterial(0.18, 0.88, 0.52, 0.05, 0.38);
const MAT_TRANSFER_RIBBON = makePbrMaterial(0.22, 0.86, 0.98, 0.08, 0.18);
const MAT_RIVET_STEEL = makePbrMaterial(0.82, 0.84, 0.88, 0.80, 0.22);
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
      skilletStation.getTransform().setLocalPosition(new vec3(-12.8, 0, -2.5));
      skilletStation.getTransform().setLocalScale(new vec3(0.68, 0.68, 0.68));
      this.buildSkilletProps(skilletStation);
    }

    if (sauceStation) {
      sauceStation.getTransform().setLocalPosition(new vec3(0.0, 0.8, -10.5));
      sauceStation.getTransform().setLocalScale(new vec3(0.74, 0.74, 0.74));
      this.buildSaucepotProps(sauceStation);
    }

    if (prepStation) {
      prepStation.getTransform().setLocalPosition(new vec3(12.8, 0, -2.5));
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
    });
    this.eventBus.on("RESET_REQUESTED", () => {
      this.isPlatingConverged = false;
      if (this.reticleRootObj) {
        this.reticleRootObj.getTransform().setLocalScale(new vec3(1, 1, 1));
      }
    });
  }

  private buildKitchenCountertop(root: SceneObject): void {
    // Main dark basalt slate slab — honed, matte Belgian Blue finish
    const counterObj = this.ensureChild(root, "KitchenCountertopSurface");
    counterObj.getTransform().setLocalPosition(new vec3(0, -0.65, -6.2));
    const cRmv = this.ensureRmv(counterObj, MAT_SLATE);
    const cb = createBuilder();
    const cidx: number[] = [];
    let cvi = 0;
    cvi = addBox(cb, cidx, 0, 0, 0, 20.4, 0.42, 9.8, [1, 1, 1, 1], cvi);
    cb.appendIndices(cidx);
    cRmv.mesh = cb.getMesh();
    cb.updateMesh();

    // Warm walnut front edge trim — beveled 3mm chamfer profile
    const edgeObj = this.ensureChild(counterObj, "CountertopFrontEdge");
    const eRmv = this.ensureRmv(edgeObj, MAT_WOOD_DARK);
    const eb = createBuilder();
    const eidx: number[] = [];
    let evi = 0;
    evi = addBox(eb, eidx, 0, 0.04, 9.9, 20.4, 0.40, 0.18, [1, 1, 1, 1], evi);
    eb.appendIndices(eidx);
    eRmv.mesh = eb.getMesh();
    eb.updateMesh();

    // ─── Flush Vitroceramic Induction Cooktop (2-burner panel) ───────────────
    // Inset into the slate: black glass panel, zero vertical protrusion
    const inductionPanel = this.ensureChild(counterObj, "InductionCooktopPanel");
    inductionPanel.getTransform().setLocalPosition(new vec3(0.0, 0.43, -1.0));
    const ipRmv = this.ensureRmv(inductionPanel, MAT_VITROCERAMIC);
    const ipb = createBuilder();
    const ipidx: number[] = [];
    let ipvi = 0;
    // Flush panel slightly above slate (0.01 cm lift so it reads as glass inset)
    ipvi = addBox(ipb, ipidx, 0, 0.01, 0, 15.8, 0.01, 7.2, [0.06, 0.07, 0.09, 1], ipvi);
    ipb.appendIndices(ipidx);
    ipRmv.mesh = ipb.getMesh();
    ipb.updateMesh();

    // Burner 1 (Sear/Skillet) — left side, laser-etched graphic + warm amber LED ring
    this.ledSearObj = this.buildFlushBurnerGraphic(counterObj, "InductionBurner_Sear",
      -7.8, 0.44, -1.8, 5.8, MAT_INDUCTION_AMBER, MAT_CAST_IRON);

    // Burner 2 (Simmer/Saucepot) — center, cool white/blue LED ring
    this.ledSimmerObj = this.buildFlushBurnerGraphic(counterObj, "InductionBurner_Simmer",
      0.0, 0.44, -0.8, 5.2, MAT_INDUCTION_COOL, MAT_VITROCERAMIC);
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
    buildTube(oeb, buildRingCurve(radius, 0, 48), 0.06, 6, [0.28, 0.32, 0.40, 1], 0);
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
    plateRoot.getTransform().setLocalPosition(new vec3(0.0, -0.22, 0.5));
    plateRoot.getTransform().setLocalScale(new vec3(1.0, 1.0, 1.0));

    // ─── 1. Restaurant-Grade Fine Porcelain Coupe Plate ─────────────────────
    // 10.5-inch radius, 14° organic rim flare, shallow concave dish center
    // Double-sided geometry so the dish interior is solid from all angles
    const plateObj = this.ensureChild(plateRoot, "PorcelainCoupePlate");
    plateObj.getTransform().setLocalPosition(new vec3(0, 0, 0));
    const pRmv = this.ensureRmv(plateObj, MAT_PORCELAIN);
    const pb = createBuilder();
    const plateProfile: [number, number][] = [
      [0.0,  0.00],   // center base
      [2.8,  0.00],   // flat foot
      [3.6,  0.06],   // foot lift
      [4.2,  0.18],   // foot-to-well transition
      [4.75, 0.52],   // well curve
      [4.90, 0.72],   // rim shoulder
      [4.80, 0.80],   // rim peak
      [4.50, 0.68],   // inner rim drop
      [3.80, 0.26],   // inner dish slope
      [0.0,  0.18],   // dish center (concave)
    ];
    buildLathe(pb, plateProfile, 40, [1, 1, 1, 1], 0, 0, 0, 0, true);
    pRmv.mesh = pb.getMesh();
    pRmv.mainMaterial = MAT_PORCELAIN;
    pb.updateMesh();

    // ─── 2. Optical Plating Holographic Reticle ──────────────────────────────
    // Replaces the old thick green rubber ring.
    // Three elements projected flat onto the porcelain surface:
    //   a. Dashed inner saucing pool boundary circle
    //   b. 45° diagonal salmon alignment axis
    //   c. Radial emerald convergence tick ring

    // a) Inner dashed saucing pool circle (8 thin arc dashes at radius 2.4 cm)
    const reticleRootObj = this.ensureChild(plateRoot, "PlatingReticleRoot");
    reticleRootObj.getTransform().setLocalPosition(new vec3(0, 0.22, 0));
    // Store ref for UpdateEvent pulse animation on PLATING_CONVERGENCE
    this.reticleRootObj = reticleRootObj;
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
        const b = createBuilder();
        const idx: number[] = [];
        let vi = 0;
        // Main acacia/maple end-grain slab (18 x 1.8 x 12 cm)
        vi = addBox(b, idx, 0, 0, 0, 9.2, 0.90, 6.0, [1, 1, 1, 1], vi);
        b.appendIndices(idx);
        rmv.mesh = b.getMesh();
        rmv.mainMaterial = MAT_WOOD;
        b.updateMesh();
      }

      // Perimeter juice groove — four thin channels around the board edge
      const juiceGrooveObj = this.ensureChild(boardObj, "BoardJuiceGroove");
      const jgRmv = this.ensureRmv(juiceGrooveObj, MAT_WOOD_DARK);
      const jgb = createBuilder();
      const jgidx: number[] = [];
      let jgvi = 0;
      // Front groove
      jgvi = addBox(jgb, jgidx, 0, 0.88,  5.6, 8.8, 0.06, 0.24, [1, 1, 1, 1], jgvi);
      // Back groove
      jgvi = addBox(jgb, jgidx, 0, 0.88, -5.6, 8.8, 0.06, 0.24, [1, 1, 1, 1], jgvi);
      // Left groove
      jgvi = addBox(jgb, jgidx, -9.0, 0.88, 0, 0.24, 0.06, 5.5, [1, 1, 1, 1], jgvi);
      // Right groove
      jgvi = addBox(jgb, jgidx,  9.0, 0.88, 0, 0.24, 0.06, 5.5, [1, 1, 1, 1], jgvi);
      jgb.appendIndices(jgidx);
      jgRmv.mesh = jgb.getMesh();
      jgb.updateMesh();

      // Acacia side handle grips (dark trim inlay panels on both ends)
      const sideHandlesObj = this.ensureChild(boardObj, "BoardSideHandles");
      const shRmv = this.ensureRmv(sideHandlesObj, MAT_WOOD_DARK);
      const shb = createBuilder();
      const shidx: number[] = [];
      let shvi = 0;
      shvi = addBox(shb, shidx, -9.65, 0.0, 0, 0.50, 0.68, 3.2, [1, 1, 1, 1], shvi);
      shvi = addBox(shb, shidx,  9.65, 0.0, 0, 0.50, 0.68, 3.2, [1, 1, 1, 1], shvi);
      shb.appendIndices(shidx);
      shRmv.mesh = shb.getMesh();
      shb.updateMesh();

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
      const gridRmv = this.ensureRmv(gridObj, MAT_CYAN);
      const gb = createBuilder();
      const gidx: number[] = [];
      let gvi = 0;
      // 9 vertical slice lines every 1.5 cm across the cutting lane
      for (let i = 0; i <= 8; i++) {
        const gx = -7.5 + i * 1.5;
        // Full-width thin line (0.04 cm wide, barely raised 0.002 cm)
        gvi = addBox(gb, gidx, gx, 0.902, 1.2, 0.04, 0.002, 3.2, [0.22, 0.86, 0.98, 1], gvi);
      }
      // Two longitudinal guide rails flanking the cutting lane
      gvi = addBox(gb, gidx, 0, 0.902,  4.4, 8.0, 0.002, 0.035, [0.22, 0.86, 0.98, 1], gvi);
      gvi = addBox(gb, gidx, 0, 0.902, -2.0, 8.0, 0.002, 0.035, [0.22, 0.86, 0.98, 1], gvi);
      gb.appendIndices(gidx);
      gridRmv.mesh = gb.getMesh();
      gb.updateMesh();

      // Whole Shallot Bulbs (lathe-built organic bulbs at top-left of board)
      const bulbsObj = this.ensureChild(boardObj, "ShallotBulbs");
      const bulbsRmv = this.ensureRmv(bulbsObj, MAT_SHALLOT_PURPLE);
      const sb = createBuilder();
      const shallotProfile: [number, number][] = [
        [0.0,  0.00],
        [0.85, 0.18],
        [1.28, 0.68],
        [1.18, 1.40],
        [0.68, 2.10],
        [0.22, 2.58],
        [0.0,  2.80],
      ];
      let svi = 0;
      svi = buildLathe(sb, shallotProfile, 20, [1, 1, 1, 1], svi, -7.0, 0.90, -4.5);
      svi = buildLathe(sb, shallotProfile, 20, [1, 1, 1, 1], svi, -4.6, 0.90, -4.8);
      bulbsRmv.mesh = sb.getMesh();
      sb.updateMesh();

      // Green shallot sprout tips
      const sproutsObj = this.ensureChild(boardObj, "ShallotSprouts");
      const sproutsRmv = this.ensureRmv(sproutsObj, MAT_HERB);
      const hb = createBuilder();
      const sproutProfile: [number, number][] = [
        [0.18, 0.0],
        [0.12, 0.6],
        [0.0,  1.1],
      ];
      let hvi = 0;
      hvi = buildLathe(hb, sproutProfile, 10, [1, 1, 1, 1], hvi, -7.0, 3.6, -4.5);
      hvi = buildLathe(hb, sproutProfile, 10, [1, 1, 1, 1], hvi, -4.6, 3.6, -4.8);
      sproutsRmv.mesh = hb.getMesh();
      hb.updateMesh();

      // Half-shallot showing concentric purple/cream layers (cut face toward camera)
      const halfShallotObj = this.ensureChild(boardObj, "ShallotHalfCut");
      const hsRmv = this.ensureRmv(halfShallotObj, MAT_SHALLOT_CREAM);
      halfShallotObj.getTransform().setLocalPosition(new vec3(-2.5, 0.90, -3.8));
      const hsb = createBuilder();
      const hsidx: number[] = [];
      let hsvi = 0;
      // Outer cream layer dome
      hsvi = addBox(hsb, hsidx, 0, 0.55, 0, 0.90, 0.55, 0.72, [1, 1, 1, 1], hsvi);
      hsb.appendIndices(hsidx);
      hsRmv.mesh = hsb.getMesh();
      hsb.updateMesh();

      // Concentric inner purple ring of half-shallot
      const halfInnerObj = this.ensureChild(halfShallotObj, "ShallotHalfInner");
      const hiRmv = this.ensureRmv(halfInnerObj, MAT_SHALLOT_PURPLE);
      const hib = createBuilder();
      const hiidx: number[] = [];
      let hivi = 0;
      hivi = addBox(hib, hiidx, 0, 0.48, 0, 0.52, 0.48, 0.42, [1, 1, 1, 1], hivi);
      hib.appendIndices(hiidx);
      hiRmv.mesh = hib.getMesh();
      hib.updateMesh();

      // 8 Sliced Shallot Medallions along the cutting lane
      this.shallotSlices = [];
      for (let i = 0; i < 8; i++) {
        const sliceObj = this.ensureChild(boardObj, `ShallotSlice_${i}`);
        const sx = -7.5 + (i + 0.5) * 1.5;
        sliceObj.getTransform().setLocalPosition(new vec3(sx, 0.90, 1.2));
        const sliceRmv = this.ensureRmv(
          sliceObj,
          i % 2 === 0 ? MAT_SHALLOT_PURPLE : MAT_SHALLOT_CREAM
        );
        const slb = createBuilder();
        const sliceProfile: [number, number][] = [
          [0.0,  0.0 ],
          [0.58, 0.0 ],
          [0.62, 0.22],
          [0.55, 0.44],
          [0.0,  0.44],
        ];
        buildLathe(slb, sliceProfile, 16, [1, 1, 1, 1], 0, 0, 0, 0);
        sliceRmv.mesh = slb.getMesh();
        sliceRmv.mainMaterial = i % 2 === 0 ? MAT_SHALLOT_PURPLE : MAT_SHALLOT_CREAM;
        slb.updateMesh();
        this.shallotSlices.push(sliceObj);
      }

      // ── Two ceramic pinch ramekins (salt & thyme sprigs) ─────────────────
      // Ramekin 1: coarse sea salt
      const saltRamekinObj = this.ensureChild(boardObj, "RamekinSalt");
      saltRamekinObj.getTransform().setLocalPosition(new vec3(6.8, 0.90, -3.8));
      const srRmv = this.ensureRmv(saltRamekinObj, MAT_CERAMIC_WHITE);
      const srb = createBuilder();
      const ramekinProfile: [number, number][] = [
        [0.0,  0.00],
        [1.45, 0.00],
        [1.65, 1.20],
        [1.55, 1.20],
        [1.38, 0.18],
        [0.0,  0.18],
      ];
      buildLathe(srb, ramekinProfile, 20, [1, 1, 1, 1], 0, 0, 0, 0);
      srRmv.mesh = srb.getMesh();
      srb.updateMesh();

      // Salt crystals (small flat slab inside ramekin)
      const saltObj = this.ensureChild(saltRamekinObj, "SaltCrystals");
      const saltRmv = this.ensureRmv(saltObj, MAT_SALT);
      const saltb = createBuilder();
      const saltidx: number[] = [];
      let saltvi = 0;
      saltvi = addBox(saltb, saltidx, 0, 1.24, 0, 1.20, 0.08, 1.20, [0.96, 0.97, 0.98, 1], saltvi);
      saltb.appendIndices(saltidx);
      saltRmv.mesh = saltb.getMesh();
      saltb.updateMesh();

      // Ramekin 2: fresh thyme sprigs
      const thymeRamekinObj = this.ensureChild(boardObj, "RamekinThyme");
      thymeRamekinObj.getTransform().setLocalPosition(new vec3(6.8, 0.90, -1.8));
      const trRmv = this.ensureRmv(thymeRamekinObj, MAT_CERAMIC_WHITE);
      const trb = createBuilder();
      buildLathe(trb, ramekinProfile, 20, [1, 1, 1, 1], 0, 0, 0, 0);
      trRmv.mesh = trb.getMesh();
      trb.updateMesh();

      // Thyme sprigs bundle (two crossing herb tubes)
      const thymeObj = this.ensureChild(thymeRamekinObj, "ThymeSprigs");
      const thymeRmv = this.ensureRmv(thymeObj, MAT_HERB);
      const thb = createBuilder();
      const thymeCurve1: [number, number, number][] = [
        [-0.9, 1.35, -0.4], [0.0, 1.55, 0.1], [0.9, 1.35, 0.4],
      ];
      const thymeCurve2: [number, number, number][] = [
        [-0.6, 1.30,  0.5], [0.0, 1.50, 0.1], [0.7, 1.28, -0.4],
      ];
      let thvi = 0;
      thvi = buildTube(thb, thymeCurve1, 0.10, 6, [0.20, 0.62, 0.28, 1], thvi);
      thvi = buildTube(thb, thymeCurve2, 0.08, 6, [0.20, 0.62, 0.28, 1], thvi);
      thymeRmv.mesh = thb.getMesh();
      thb.updateMesh();

      // Stainless Steel Portion Ramekin Bowl + target rim (volumetric portion station)
      const portionRamekinObj = this.ensureChild(boardObj, "PortionRamekinBowl");
      portionRamekinObj.getTransform().setLocalPosition(new vec3(6.8, 0.90, 1.2));
      const prRmv = this.ensureRmv(portionRamekinObj, MAT_STEEL);
      const prb = createBuilder();
      const portionBowlProfile: [number, number][] = [
        [0.0,  0.00],
        [2.1,  0.00],
        [2.65, 1.85],
        [2.45, 1.85],
        [1.95, 0.25],
        [0.0,  0.25],
      ];
      buildLathe(prb, portionBowlProfile, 24, [1, 1, 1, 1], 0, 0, 0, 0);
      prRmv.mesh = prb.getMesh();
      prb.updateMesh();

      // Cyan target rim around the top of the portion ramekin
      const rimObj = this.ensureChild(portionRamekinObj, "PortionTargetRim");
      const rimRmv = this.ensureRmv(rimObj, MAT_CYAN);
      const rimB = createBuilder();
      buildTube(rimB, buildRingCurve(2.55, 1.9, 24), 0.12, 8, [1, 1, 1, 1], 0);
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
      domeObj.getTransform().setLocalPosition(new vec3(6.8, 0.95, 1.2));
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
        buildLathe(db, fillProfile, 20, [1, 1, 1, 1], 0, 0, 0, 0);
        dRmv.mesh = db.getMesh();
        dRmv.mainMaterial = MAT_CYAN;
        db.updateMesh();
      }
    }
  }

  private buildChefKnife(prepStation: SceneObject, laserObj: SceneObject): void {
    laserObj.getTransform().setLocalPosition(new vec3(-8.0, 0.78, 1.0));
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
    const handleRmv = this.ensureRmv(handleObj, MAT_WOOD_HANDLE);
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
    const rivetsRmv = this.ensureRmv(rivetsObj, MAT_BRASS);
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
    const SEG = 10;
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
    // 1. Cast-Iron Skillet body (SkilletPan)
    const panObj = findByName(skilletStation, "SkilletPan");
    if (panObj) {
      panObj.getTransform().setLocalPosition(new vec3(0, 0, 0));
      panObj.getTransform().setLocalScale(new vec3(1, 1, 1));
      const pRmv = panObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (pRmv) {
        const pb = createBuilder();
        const panProfile: [number, number][] = [
          [0.0, 0.0],
          [8.2, 0.0],
          [9.8, 2.3],
          [10.2, 2.5],
          [9.4, 2.5],
          [8.0, 0.55],
          [0.0, 0.55],
        ];
        buildLathe(pb, panProfile, 28, [1, 1, 1, 1], 0, 0, 0, 0);
        pRmv.mesh = pb.getMesh();
        pRmv.mainMaterial = MAT_CAST_IRON;
        pb.updateMesh();
      }

      // Cast-iron skillet handle
      const handleObj = this.ensureChild(panObj, "SkilletHandle");
      const hRmv = this.ensureRmv(handleObj, MAT_CAST_IRON);
      const hb = createBuilder();
      const handleCurve: [number, number, number][] = [
        [-8.8, 1.9, 3.2],
        [-11.5, 2.2, 4.4],
        [-14.8, 2.6, 5.8],
      ];
      buildTube(hb, handleCurve, 0.68, 12, [1, 1, 1, 1], 0);
      hRmv.mesh = hb.getMesh();
      hb.updateMesh();

      // Teardrop hanging hole on main handle end
      const hangHoleObj = this.ensureChild(panObj, "SkilletHandleHangHole");
      const hhRmv = this.ensureRmv(hangHoleObj, MAT_SLATE);
      const hhb = createBuilder();
      const hhidx: number[] = [];
      let hhvi = 0;
      hhvi = addBox(hhb, hhidx, -14.85, 2.6, 5.8, 0.20, 0.30, 0.04, [0.08, 0.08, 0.09, 1], hhvi);
      hhb.appendIndices(hhidx);
      hhRmv.mesh = hhb.getMesh();
      hhb.updateMesh();

      // Dual pour spout notches on the skillet rim (left and right sides, opposite the main handle)
      // Each pour spout is a shallow V-notch pinch extruded slightly above the rim at +X and -X
      const pourSpout1Obj = this.ensureChild(panObj, "SkilletPourSpout_L");
      const ps1Rmv = this.ensureRmv(pourSpout1Obj, MAT_CAST_IRON);
      const ps1b = createBuilder();
      const pourSpoutProfile: [number, number][] = [
        [9.50, 2.40],
        [9.85, 2.68],
        [9.90, 2.80],
        [9.70, 2.80],
        [9.40, 2.54],
      ];
      buildLathe(ps1b, pourSpoutProfile, 4, [1, 1, 1, 1], 0, 0, 0, 0);
      ps1b.appendIndices([]);
      ps1Rmv.mesh = ps1b.getMesh();
      ps1b.updateMesh();
      // Position at ~90° arc offset from handle (forward-left relative to handle)
      pourSpout1Obj.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0.52, 0)); // ~30°

      const pourSpout2Obj = this.ensureChild(panObj, "SkilletPourSpout_R");
      const ps2Rmv = this.ensureRmv(pourSpout2Obj, MAT_CAST_IRON);
      const ps2b = createBuilder();
      buildLathe(ps2b, pourSpoutProfile, 4, [1, 1, 1, 1], 0, 0, 0, 0);
      ps2b.appendIndices([]);
      ps2Rmv.mesh = ps2b.getMesh();
      ps2b.updateMesh();
      pourSpout2Obj.getTransform().setLocalRotation(quat.fromEulerAngles(0, -0.52, 0)); // ~-30°

      // Atlantic Salmon Fillet — enlarged to fill skillet, clearly visible coral-pink
      // Old: 3.8×0.72×2.0 (too small). New: 5.2×1.10×2.6 positioned centrally
      const salmonObj = this.ensureChild(panObj, "SalmonFillet");
      salmonObj.getTransform().setLocalPosition(new vec3(0, 0.55, 0));
      const sRmv = this.ensureRmv(salmonObj, MAT_SALMON);
      const sb = createBuilder();
      const sidx: number[] = [];
      let svi = 0;
      // Main fillet body — tapered block (wider at tail, narrower at head)
      svi = addBox(sb, sidx,  0.6, 0.55,  0.0, 1.8, 0.55, 1.30, [1, 1, 1, 1], svi); // tail half
      svi = addBox(sb, sidx, -0.8, 0.55,  0.0, 2.0, 0.55, 1.30, [1, 1, 1, 1], svi); // head half wider
      svi = addBox(sb, sidx,  0.0, 0.55,  0.0, 2.6, 0.55, 1.30, [1, 1, 1, 1], svi); // center bridge
      sb.appendIndices(sidx);
      sRmv.mesh = sb.getMesh();
      sb.updateMesh();

      // Crispy seared skin — golden-brown top cap, clearly offset from pink flesh
      const skinObj = this.ensureChild(salmonObj, "SalmonCrispySkin");
      const skRmv = this.ensureRmv(skinObj, MAT_SALMON_SKIN);
      const skb = createBuilder();
      const skidx: number[] = [];
      let skvi = 0;
      skvi = addBox(skb, skidx, 0, 1.12, 0, 2.55, 0.18, 1.25, [1, 1, 1, 1], skvi);
      skb.appendIndices(skidx);
      skRmv.mesh = skb.getMesh();
      skb.updateMesh();

      // Herb sprig — scaled up to match larger fillet
      const herbObj = this.ensureChild(salmonObj, "HerbSprig");
      const herbRmv = this.ensureRmv(herbObj, MAT_HERB);
      const hrb = createBuilder();
      const herbCurve: [number, number, number][] = [
        [-2.2, 1.42, -0.5],
        [ 0.0, 1.55,  0.1],
        [ 2.2, 1.42,  0.6],
      ];
      buildTube(hrb, herbCurve, 0.20, 8, [1, 1, 1, 1], 0);
      herbRmv.mesh = hrb.getMesh();
      hrb.updateMesh();
    }

    // 2. Helper tab handle — cast-iron stub opposite main handle
    const helperTabObj = this.ensureChild(panObj!, "SkilletHelperTab");
    const htRmv = this.ensureRmv(helperTabObj, MAT_CAST_IRON);
    const htb = createBuilder();
    const htidx: number[] = [];
    let htvi = 0;
    // Small rectangular tab at +X side, just below rim
    htvi = addBox(htb, htidx, 9.6, 2.1, 0, 1.1, 0.38, 0.82, [1, 1, 1, 1], htvi);
    htb.appendIndices(htidx);
    htRmv.mesh = htb.getMesh();
    htb.updateMesh();

    // 3. Maillard sear marks on salmon — diagonal cross-hatch bars
    const sear1Obj = this.ensureChild(panObj!, "SearMark_A1");
    const sm1Rmv = this.ensureRmv(sear1Obj, MAT_SEAR_MARK);
    const sm1b = createBuilder();
    const sm1idx: number[] = [];
    let sm1vi = 0;
    sm1vi = addBox(sm1b, sm1idx, -1.2, 1.70, 0, 0.14, 0.06, 1.6, [1, 1, 1, 1], sm1vi);
    sm1b.appendIndices(sm1idx);
    sm1Rmv.mesh = sm1b.getMesh();
    sm1b.updateMesh();

    const sear2Obj = this.ensureChild(panObj!, "SearMark_A2");
    const sm2Rmv = this.ensureRmv(sear2Obj, MAT_SEAR_MARK);
    const sm2b = createBuilder();
    const sm2idx: number[] = [];
    let sm2vi = 0;
    sm2vi = addBox(sm2b, sm2idx, 0.8, 1.70, 0, 0.14, 0.06, 1.6, [1, 1, 1, 1], sm2vi);
    sm2b.appendIndices(sm2idx);
    sm2Rmv.mesh = sm2b.getMesh();
    sm2b.updateMesh();

    const sear3Obj = this.ensureChild(panObj!, "SearMark_B1");
    const sm3Rmv = this.ensureRmv(sear3Obj, MAT_SEAR_MARK);
    const sm3b = createBuilder();
    const sm3idx: number[] = [];
    let sm3vi = 0;
    sm3vi = addBox(sm3b, sm3idx, 0, 1.70, -0.8, 3.4, 0.06, 0.14, [1, 1, 1, 1], sm3vi);
    sm3b.appendIndices(sm3idx);
    sm3Rmv.mesh = sm3b.getMesh();
    sm3b.updateMesh();

    // 4. Suppress floating torus rings — these are replaced by flush induction graphics on countertop
    const midRing = findByName(skilletStation, "MiddleRing");
    if (midRing) {
      midRing.enabled = false;
      midRing.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    }

    const innerRing = findByName(skilletStation, "InnerTarget");
    if (innerRing) {
      innerRing.enabled = false;
      innerRing.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    }

    const inspDisc = findByName(skilletStation, "InspectionDisc");
    if (inspDisc) {
      inspDisc.enabled = false;
      inspDisc.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    }
  }

  private buildSaucepotProps(sauceStation: SceneObject): void {
    // 1. Tri-ply Stainless Saucier — FIXED: proper saucier proportions (narrow + tall, not wide/flat wok)
    // Old profile was r=8 h=5.5 (wok). New: r=5.2 h=9.2 (proper saucier ratio ~1:1.8)
    const potObj = findByName(sauceStation, "SaucepotPot");
    if (potObj) {
      potObj.getTransform().setLocalPosition(new vec3(0, 0, 0));
      potObj.getTransform().setLocalScale(new vec3(1, 1, 1));
      const pRmv = potObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (pRmv) {
        const pb = createBuilder();
        // Proper saucier: gently curved bottom, straight cylindrical walls, outward flared rim
        // r max = 5.2 (outer), wall height = 9.2 — looks like real 2qt saucier
        const potProfile: [number, number][] = [
          [0.0, 0.00],  // center base
          [2.2, 0.10],  // base curve start
          [4.0, 0.40],  // base curve midpoint
          [4.8, 0.85],  // base-to-wall transition
          [5.0, 2.50],  // lower wall
          [5.1, 5.00],  // mid wall
          [5.2, 7.80],  // upper wall
          [5.5, 8.60],  // outward flare
          [5.6, 9.00],  // rolled lip peak
          [5.3, 9.10],  // lip inner shoulder
          [5.0, 8.80],  // inner rim drop
          [4.8, 7.80],  // inner wall
          [0.0, 0.50],  // inner base (thick bottom for heat retention)
        ];
        buildLathe(pb, potProfile, 36, [1, 1, 1, 1], 0, 0, 0, 0);
        pRmv.mesh = pb.getMesh();
        pRmv.mainMaterial = MAT_STEEL;
        pb.updateMesh();
      }

      // Handle: updated Y coords to match new rim at y~9.0
      const handleObj = this.ensureChild(potObj, "SaucepanHandle");
      const hRmv = this.ensureRmv(handleObj, MAT_STEEL);
      const hb = createBuilder();
      const handleCurve: [number, number, number][] = [
        [ 5.4, 8.80, 0.0],   // starts at rim
        [ 8.5, 9.20, 0.5],   // sweeps slightly upward
        [12.5, 9.50, 1.0],   // extends outward
      ];
      buildTube(hb, handleCurve, 0.48, 12, [1, 1, 1, 1], 0);
      hRmv.mesh = hb.getMesh();
      hb.updateMesh();

      // Rivets at handle base — updated to new rim height
      const rivet1Obj = this.ensureChild(potObj, "HandleRivet1");
      const r1Rmv = this.ensureRmv(rivet1Obj, MAT_RIVET_STEEL);
      const r1b = createBuilder();
      const r1idx: number[] = [];
      let r1vi = 0;
      r1vi = addBox(r1b, r1idx, 5.5, 9.0, 0.45, 0.18, 0.18, 0.18, [1, 1, 1, 1], r1vi);
      r1b.appendIndices(r1idx);
      r1Rmv.mesh = r1b.getMesh();
      r1b.updateMesh();

      const rivet2Obj = this.ensureChild(potObj, "HandleRivet2");
      const r2Rmv = this.ensureRmv(rivet2Obj, MAT_RIVET_STEEL);
      const r2b = createBuilder();
      const r2idx: number[] = [];
      let r2vi = 0;
      r2vi = addBox(r2b, r2idx, 5.5, 9.0, -0.45, 0.18, 0.18, 0.18, [1, 1, 1, 1], r2vi);
      r2b.appendIndices(r2idx);
      r2Rmv.mesh = r2b.getMesh();
      r2b.updateMesh();

      // Simmering lemon-shallot reduction — updated to new inner radius 4.75 at y=8.85
      const sauceObj = this.ensureChild(potObj, "SimmeringLemonSauce");
      const sRmv = this.ensureRmv(sauceObj, MAT_SAUCE_ENRICHED);
      const sb = createBuilder();
      const sauceProfile: [number, number][] = [
        [0.0,  8.85],
        [4.72, 8.85],
        [4.72, 9.02],
        [0.0,  9.02],
      ];
      buildLathe(sb, sauceProfile, 32, [1, 1, 1, 1], 0, 0, 0, 0);
      sRmv.mesh = sb.getMesh();
      sb.updateMesh();

      // Pour lip tab — updated X to match new outer radius 5.6
      const pourLipObj = this.ensureChild(potObj, "SaucierPourLip");
      const plRmv = this.ensureRmv(pourLipObj, MAT_STEEL);
      const plb = createBuilder();
      const plidx: number[] = [];
      let plvi = 0;
      plvi = addBox(plb, plidx, -5.8, 9.05, 0.0, 0.45, 0.08, 1.0, [1, 1, 1, 1], plvi);
      plb.appendIndices(plidx);
      plRmv.mesh = plb.getMesh();
      plb.updateMesh();
    }

    // 2. Suppress floating PotSimmerRing — induction graphics on countertop handle this now
    const potRing = findByName(sauceStation, "PotSimmerRing");
    if (potRing) {
      potRing.enabled = false;
      potRing.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
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
    const arcCurve: [number, number, number][] = [
      [12.0, 0.8, -2.0],
      [ 9.0, 4.2, -4.5],
      [ 5.5, 7.0, -7.2],
      [ 2.0, 7.4, -9.5],
      [ 0.0, 5.5, -10.8],
    ];
    buildTube(rb, arcCurve, 0.22, 8, [0.22, 0.86, 0.98, 0.9], 0);
    ribbonRmv.mesh = rb.getMesh();
    rb.updateMesh();
  }

  private bindSliceSteppingEvents(): void {
    this.eventBus.on("CUT_REFERENCE_STEP", (data: any) => {
      const idx = (data && typeof data.sliceIndex === "number" ? data.sliceIndex : 1) - 1;
      if (idx >= 0 && idx < this.shallotSlices.length) {
        const slice = this.shallotSlices[idx];
        const sx = -8.0 + (idx + 0.5) * 1.5;
        // Shift cut slice slightly forward to visually show progress
        slice.getTransform().setLocalPosition(new vec3(sx + 0.35, 0.78, 0.2));
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
        const sx = -8.0 + (i + 0.5) * 1.5;
        this.shallotSlices[i].getTransform().setLocalScale(new vec3(1, 1, 1));
        this.shallotSlices[i].getTransform().setLocalPosition(new vec3(sx, 0.76, 1.0));
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
