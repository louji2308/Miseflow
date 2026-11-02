import { ChoreographyDAG } from "./ChoreographyDAG";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { makeEmissiveMaterial } from "./StationPropsBuilder";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";

// ─── StationsRoot-local layout (mirrors StationPropsBuilder.ts constants) ───
const LINE_Y = -0.03; // just above the slab top (-0.23)
// Prep -> Sauce conduit geometry (cm). Wide enough to read from the director camera ~70 cm away.
const BASE_W = 0.12; // v5: hairline light strips
const DASH_W = 0.3;
const DASH_COUNT = 9;
const LOCK_R = 0.9;
const SKILLET_XZ = new vec2(-11.2, -1.5);
const SAUCIER_XZ = new vec2(0.0, -10.5);
const BOARD_XZ = new vec2(10.5, -3.0);
const PLATE_XZ = new vec2(0.0, 4.5);

// Additive-display palette (bright, luminous)
const CYAN: [number, number, number] = [0.0, 0.94, 1.0]; // #00F0FF
const AMBER: [number, number, number] = [1.0, 0.69, 0.0]; // #FFB000
const EMERALD: [number, number, number] = [0.0, 1.0, 0.616]; // #00FF9D
const LOCK_RED: [number, number, number] = [1.0, 0.42, 0.24];
const WHITE_HOT: [number, number, number] = [1.0, 0.95, 0.75];

type ConduitState = "LOCKED" | "DRIFT" | "DONE";

interface Seg {
  obj: SceneObject;
  mat: Material;
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

/** Flat unit quad (x -0.5..0.5, z -0.5..0.5) facing +Y; scaled per segment. */
export function buildUnitQuadMesh(): RenderMesh {
  const b = createBuilder();
  const n = [0, 1, 0];
  const v = (x: number, z: number, u: number, w: number): number[] => [x, 0, z, n[0], n[1], n[2], u, w, 1, 1, 1, 1];
  b.appendVerticesInterleaved([
    ...v(-0.5, 0.5, 0, 0),
    ...v(0.5, 0.5, 1, 0),
    ...v(0.5, -0.5, 1, 1),
    ...v(-0.5, -0.5, 0, 1),
  ]);
  b.appendIndices([0, 1, 2, 0, 2, 3]);
  b.updateMesh();
  return b.getMesh();
}

/** Flat annulus facing +Y. */
export function buildAnnulusMesh(rIn: number, rOut: number, steps: number): RenderMesh {
  const b = createBuilder();
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const s = Math.sin(a);
    const c = Math.cos(a);
    verts.push(s * rIn, 0, c * rIn, 0, 1, 0, i / steps, 0, 1, 1, 1, 1);
    verts.push(s * rOut, 0, c * rOut, 0, 1, 0, i / steps, 1, 1, 1, 1, 1);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    // Orientation verified against the box top-face winding used in StationPropsBuilder (normal +Y).
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  b.appendVerticesInterleaved(verts);
  b.appendIndices(idx);
  b.updateMesh();
  return b.getMesh();
}

export function tint(m: Material, c: [number, number, number], k: number): void {
  m.mainPass.baseColor = new vec4(c[0] * k, c[1] * k, c[2] * k, 1.0);
  try {
    (m.mainPass as any).Port_Emissive_N006 = new vec3(c[0] * k, c[1] * k, c[2] * k);
  } catch (e) {
    // shader without emissive port: base colour already drives the additive display
  }
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Director-camera pose in StationsRoot-local space (mirrors MiseFlowSpatialUI CAM_LOCAL). */
export const DIRECTOR_CAM_LOCAL = new vec3(0, 42.6, 54.6);

/** Rotation that turns a Canvas/Text (+Z normal) toward the director camera. */
export function faceDirectorCamera(pos: vec3): quat {
  const d = DIRECTOR_CAM_LOCAL.sub(pos);
  const yaw = Math.atan2(d.x, d.z);
  const horiz = Math.sqrt(d.x * d.x + d.z * d.z);
  const pitch = -Math.atan2(d.y, horiz);
  return quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(pitch, vec3.right()));
}

/**
 * World-space text label. Text components only render under a Canvas, so the label root
 * carries the Canvas and the Text lives on a child. Returns the root (move/rotate it) and Text.
 */
export function createWorldLabel(
  parent: SceneObject,
  name: string,
  content: string,
  size: number,
  color: vec4,
  width: number,
  height: number
): { root: SceneObject; text: Text } {
  const root = global.scene.createSceneObject(name);
  root.setParent(parent);
  root.createComponent("Component.Canvas");
  const o = global.scene.createSceneObject(`${name}_Text`);
  o.setParent(root);
  const txt = o.createComponent("Component.Text") as Text;
  txt.text = content;
  txt.size = size;
  (txt as Text & { weight?: number }).weight = 800;
  txt.textFill.mode = TextFillMode.Solid;
  txt.textFill.color = color;
  txt.horizontalAlignment = HorizontalAlignment.Center;
  txt.verticalAlignment = VerticalAlignment.Center;
  txt.horizontalOverflow = HorizontalOverflow.Shrink;
  txt.verticalOverflow = VerticalOverflow.Overflow;
  txt.depthTest = true;
  txt.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2);
  return { root, text: txt };
}

const IMAGE_MAT = requireAsset("../Materials/ImageMaterial.mat") as Material;
const ICON_LOCK = requireAsset("../Icons/lock.png") as Texture;

/** World-space icon (Component.Image, unit quad scaled to `size` cm). Needs a Canvas ancestor. */
export function createWorldIcon(parent: SceneObject, name: string, tex: Texture, size: number, pos: vec3, tintColor: vec4): Image {
  const o = global.scene.createSceneObject(name);
  o.setParent(parent);
  o.getTransform().setLocalPosition(pos);
  o.getTransform().setLocalScale(new vec3(size, size, 1));
  const img = o.createComponent("Component.Image") as Image;
  const m = IMAGE_MAT.clone();
  m.mainPass.baseTex = tex;
  m.mainPass.baseColor = tintColor;
  m.mainPass.depthTest = true;
  m.mainPass.depthWrite = false;
  img.clearMaterials();
  img.addMaterial(m);
  return img;
}

/** "SEAR 01:00" -> ["SEAR", "01:00"]; the value starts at the first token containing a digit. */
export function splitMetric(s: string): [string, string] {
  const tokens = s.split(" ");
  let idx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/[0-9]/.test(tokens[i])) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return [s, ""];
  return [tokens.slice(0, idx).join(" "), tokens.slice(idx).join(" ")];
}

/**
 * Lays out a two-colour "LABEL value" line centred on `centerX`: the label is right-aligned to a
 * pivot and the value left-aligned after it, so the two runs never overlap even when the
 * glyph-width estimate is off (only the centring is approximate).
 */
export function layoutSplitText(
  label: Text,
  value: Text,
  l: string,
  v: string,
  size: number,
  centerX: number,
  y: number,
  z: number,
  maxW: number = 1000
): number {
  let cw = (size / 43.886) * 0.64;
  const est = (l.length + v.length * 0.95 + (l.length > 0 && v.length > 0 ? 0.75 : 0)) * cw;
  // shrink long runs (e.g. "CRUST OPTIMAL 0.94") so they stay inside their capsule
  const k = est > maxW ? maxW / est : 1;
  label.size = Math.round(size * k);
  value.size = Math.round(size * k);
  cw *= k;
  const gap = l.length > 0 && v.length > 0 ? cw * 0.75 : 0;
  const wl = l.length * cw;
  const wv = v.length * cw * 0.95;
  const start = centerX - (wl + gap + wv) / 2;
  const pivot = start + wl;
  if (label.text !== l) label.text = l;
  if (value.text !== v) value.text = v;
  label.horizontalAlignment = HorizontalAlignment.Right;
  label.horizontalOverflow = HorizontalOverflow.Overflow;
  label.layoutRect = Rect.create(-20, 0, -1, 1);
  label.getSceneObject().getTransform().setLocalPosition(new vec3(pivot, y, z));
  value.horizontalAlignment = HorizontalAlignment.Left;
  value.horizontalOverflow = HorizontalOverflow.Overflow;
  value.layoutRect = Rect.create(0, 20, -1, 1);
  value.getSceneObject().getTransform().setLocalPosition(new vec3(pivot + gap, y, z));
  return wl + gap + wv;
}

/**
 * DAGCounterConduit.ts
 * Flush countertop "light strips" that make the DAG causality visible:
 *  - Conduit_PrepToSauce: board -> saucier. Dashed cyan pulse + [LOCKED] node while prep is incomplete,
 *    amber (#FFB000) flash + shockwave on DRIFT_RECORDED, solid emerald (#00FF9D) once the transfer lands.
 *  - Conduit_Convergence: skillet + saucier + board -> plate, brightening as plating convergence nears.
 * Event bus + read-only ChoreographyDAG getters only.
 */
@component
export class DAGCounterConduit extends BaseScriptComponent {
  @input
  dagController?: ChoreographyDAG;

  private quadMesh!: RenderMesh;
  private ringMesh!: RenderMesh;
  private root!: SceneObject;

  // Prep -> Sauce
  private pPath: { a: vec2; yaw: number; len: number; start: number }[] = [];
  private pTo: vec2 = new vec2(0, 0);
  private pLen: number = 1;
  private pBase: Seg[] = [];
  private pDashes: Seg[] = [];
  private pShock!: Seg;
  private lockNode!: Seg;
  private lockText?: SceneObject;
  private lockLabelText?: Text;
  private lockGlass?: RoundedRectangle;
  private lockShapes: RoundedRectangle[] = [];
  private lockIcon?: Image;
  private lockStyleKey: string = "";
  private lockWarm: number = 0;
  private state: ConduitState = "LOCKED";
  private driftT: number = 0; // seconds of amber flash remaining
  private shockT: number = -1; // 0..1 shock travel, -1 inactive
  private readonly driftFlashSeconds: number = 2.0;
  private readonly shockSeconds: number = 1.1;

  // Convergence
  private convLines: { base: Seg; dashes: Seg[]; a: vec2; b: vec2; len: number; yaw: number }[] = [];
  private converged: boolean = false;
  private timeWarpOn: boolean = false;
  private warpFlashT: number = 0;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.resolveReferences();
      this.build();
      this.initListeners();
      this.applyReset();
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
    });
  }

  private resolveReferences(): void {
    if (this.dagController) return;
    // Walk up from this object, probing each ancestor's subtree for the ChoreographyDAG component.
    let o: SceneObject | null = this.getSceneObject();
    while (o && !this.dagController) {
      this.dagController = this.findDag(o);
      o = o.hasParent() ? o.getParent() : null;
    }
  }

  private findDag(o: SceneObject): ChoreographyDAG | undefined {
    const c = o.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    if (c) return c;
    const n = o.getChildrenCount();
    for (let i = 0; i < n; i++) {
      const f = this.findDag(o.getChild(i));
      if (f) return f;
    }
    return undefined;
  }

  // ───────────────────────── build ─────────────────────────

  private makeSeg(parent: SceneObject, name: string, mesh: RenderMesh): Seg {
    const obj = global.scene.createSceneObject(name);
    obj.setParent(parent);
    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    const mat = makeEmissiveMaterial(1, 1, 1, 1.0);
    rmv.mesh = mesh;
    rmv.mainMaterial = mat;
    return { obj, mat };
  }

  /** Lay a quad along a 2D line: `at` = distance from `a`, `len`/`width` in cm. */
  private placeAlong(seg: Seg, a: vec2, yaw: number, at: number, len: number, width: number, y: number = LINE_Y): void {
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const mid = at + len * 0.5;
    const t = seg.obj.getTransform();
    t.setLocalPosition(new vec3(a.x + dx * mid, y, a.y + dz * mid));
    t.setLocalRotation(quat.fromEulerAngles(0, yaw, 0));
    t.setLocalScale(new vec3(width, 1, Math.max(0.001, len)));
  }

  /** Place a quad at path distance `at` (clipped to the leg it starts in). */
  private placeOnPath(seg: Seg, at: number, len: number, width: number, y: number): void {
    let leg = this.pPath[this.pPath.length - 1];
    for (const l of this.pPath) {
      if (at < l.start + l.len) {
        leg = l;
        break;
      }
    }
    const local = Math.max(0, at - leg.start);
    this.placeAlong(seg, leg.a, leg.yaw, local, Math.max(0.01, Math.min(len, leg.len - local)), width, y);
  }

  private build(): void {
    const parent = this.getSceneObject();
    const old = findByName(parent, "DAGCounterConduitRoot");
    if (old) old.destroy();
    this.root = global.scene.createSceneObject("DAGCounterConduitRoot");
    this.root.setParent(parent);

    this.quadMesh = buildUnitQuadMesh();
    this.ringMesh = buildAnnulusMesh(0.86, 1.0, 64);

    // ── Conduit_PrepToSauce: board edge -> saucier ring (R ~ 6.3)
    const prepRoot = global.scene.createSceneObject("Conduit_PrepToSauce");
    prepRoot.setParent(this.root);
    // L-shaped route over open slab: out of the board's rear edge (right of the shallot bulbs,
    // x <= 11.1, and left of the ramekins, x >= 13.8), back behind the bulbs, then left into the
    // saucier ring (R ~6.6 outside the chrono ticks). Clear of every prop as seen from the
    // director camera.
    const pts: vec2[] = [new vec2(12.4, -7.4), new vec2(12.4, -13.4), new vec2(5.8, -13.4)];
    this.pTo = pts[2];
    this.pPath = [];
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const ex = pts[i + 1].x - pts[i].x;
      const ez = pts[i + 1].y - pts[i].y;
      const len = Math.sqrt(ex * ex + ez * ez);
      this.pPath.push({ a: pts[i], yaw: Math.atan2(ex, ez), len, start: acc });
      acc += len;
    }
    this.pLen = acc;
    for (let i = 0; i < this.pPath.length; i++) {
      const base = this.makeSeg(prepRoot, `Conduit_PrepToSauce_Base_${i}`, this.quadMesh);
      const leg = this.pPath[i];
      // extend each leg by half the line width so the elbow has no notch
      this.placeAlong(base, leg.a, leg.yaw, 0, leg.len + BASE_W * 0.5, BASE_W);
      this.pBase.push(base);
    }
    for (let i = 0; i < DASH_COUNT; i++) {
      this.pDashes.push(this.makeSeg(prepRoot, `Conduit_PrepToSauce_Dash_${i}`, this.quadMesh));
    }
    this.pShock = this.makeSeg(prepRoot, "Conduit_PrepToSauce_Shockwave", this.quadMesh);

    // [LOCKED] node at the saucier end
    this.lockNode = this.makeSeg(prepRoot, "Conduit_LockNode", this.ringMesh);
    const lt = this.lockNode.obj.getTransform();
    lt.setLocalPosition(new vec3(this.pTo.x, LINE_Y + 0.02, this.pTo.y));
    lt.setLocalScale(new vec3(LOCK_R, 1, LOCK_R));
    this.buildLockText(prepRoot);

    // ── Conduit_Convergence: three lines converging on the plate
    const convRoot = global.scene.createSceneObject("Conduit_Convergence");
    convRoot.setParent(this.root);
    const sources: { name: string; p: vec2; ring: number }[] = [
      { name: "Skillet", p: SKILLET_XZ, ring: 8.2 },
      { name: "Saucier", p: SAUCIER_XZ, ring: 6.4 },
      { name: "Board", p: BOARD_XZ, ring: 3.8 },
    ];
    for (const s of sources) {
      const vx = PLATE_XZ.x - s.p.x;
      const vz = PLATE_XZ.y - s.p.y;
      const total = Math.sqrt(vx * vx + vz * vz);
      const ux = vx / total;
      const uz = vz / total;
      const startD = Math.min(s.ring, total * 0.5);
      const endD = total - Math.min(4.6, total * 0.3);
      const a = new vec2(s.p.x + ux * startD, s.p.y + uz * startD);
      const len = Math.max(0.5, endD - startD);
      const yaw = Math.atan2(vx, vz);
      const base = this.makeSeg(convRoot, `Conduit_Convergence_${s.name}`, this.quadMesh);
      this.placeAlong(base, a, yaw, 0, len, 0.1);
      const dashes: Seg[] = [];
      for (let i = 0; i < 3; i++) {
        dashes.push(this.makeSeg(convRoot, `Conduit_Convergence_${s.name}_Dash_${i}`, this.quadMesh));
      }
      this.convLines.push({ base, dashes, a, b: new vec2(a.x + ux * len, a.y + uz * len), len, yaw });
    }
  }

  private buildLockText(parent: SceneObject): void {
    try {
      // v5: small orange lock capsule (dark glass + hairline outline + lock icon) floating above the
      // board's knife, joined to the board by a thin leader line ending in a dot.
      const pos = new vec3(4.9, 4.3, -3.9);
      const root = global.scene.createSceneObject("Conduit_LockLabel");
      root.setParent(parent);
      root.createComponent("Component.Canvas");
      root.getTransform().setLocalPosition(pos);
      root.getTransform().setLocalRotation(faceDirectorCamera(pos));
      const orange = new vec4(LOCK_RED[0], LOCK_RED[1], LOCK_RED[2], 1.0);

      const leaderLen = pos.y - 1.32; // down to the board top
      const leader = global.scene.createSceneObject("Conduit_LockLeader");
      leader.setParent(root);
      leader.getTransform().setLocalPosition(new vec3(0, -leaderLen / 2 - 0.55, -0.02));
      const lrr = leader.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle;
      lrr.size = new vec2(0.045, leaderLen - 1.1);
      const dot = global.scene.createSceneObject("Conduit_LockLeaderDot");
      dot.setParent(root);
      dot.getTransform().setLocalPosition(new vec3(0, -leaderLen + 0.12, -0.02));
      const drr = dot.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle;
      drr.size = new vec2(0.3, 0.3);

      const bg = global.scene.createSceneObject("Conduit_LockGlass");
      bg.setParent(root);
      const rr = bg.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle;
      rr.size = new vec2(5.6, 1.15);
      this.lockGlass = rr;
      this.lockShapes = [lrr, drr];

      const icon = createWorldIcon(root, "Conduit_LockIcon", ICON_LOCK, 0.7, new vec3(-2.1, 0, 0.03), orange);
      this.lockIcon = icon;
      const label = global.scene.createSceneObject("Conduit_LockLabel_Text");
      label.setParent(root);
      label.getTransform().setLocalPosition(new vec3(0.35, 0, 0.03));
      const txt = label.createComponent("Component.Text") as Text;
      txt.text = "[LOCKED]";
      txt.size = 34;
      (txt as Text & { weight?: number }).weight = 700;
      txt.textFill.mode = TextFillMode.Solid;
      txt.textFill.color = orange;
      txt.horizontalAlignment = HorizontalAlignment.Center;
      txt.verticalAlignment = VerticalAlignment.Center;
      txt.horizontalOverflow = HorizontalOverflow.Overflow;
      txt.verticalOverflow = VerticalOverflow.Overflow;
      txt.depthTest = true;
      txt.layoutRect = Rect.create(-2.2, 2.2, -0.5, 0.5);
      this.lockText = root;
      this.lockLabelText = txt;
      this.styleLock(LOCK_RED);
    } catch (e) {
      this.lockText = undefined;
    }
  }

  private styleLock(c: [number, number, number]): void {
    const col = new vec4(c[0], c[1], c[2], 1.0);
    if (this.lockGlass) {
      const rr = this.lockGlass;
      rr.gradient = false;
      rr.backgroundColor = new vec4(0.05, 0.04, 0.035, 0.9);
      rr.border = true;
      rr.borderColor = col;
      rr.borderSize = 0.06;
      rr.cornerRadius = 0.55;
      const wide = !!this.lockLabelText && this.lockLabelText.text.length > 8;
      rr.size = new vec2(wide ? 7.6 : 5.6, 1.15);
      if (this.lockIcon) this.lockIcon.getSceneObject().getTransform().setLocalPosition(new vec3(wide ? -3.1 : -2.1, 0, 0.03));
      if (this.lockLabelText) this.lockLabelText.getSceneObject().getTransform().setLocalPosition(new vec3(0.4, 0, 0.03));
    }
    for (const sh of this.lockShapes) {
      sh.gradient = false;
      sh.backgroundColor = col;
      sh.border = false;
      sh.cornerRadius = Math.min(sh.size.x, sh.size.y) / 2;
    }
    if (this.lockIcon) this.lockIcon.mainMaterial.mainPass.baseColor = col;
  }

  /** Test/introspection hook: "LOCKED" | "DRIFT" | "DONE". */
  public getPrepConduitState(): string {
    return this.state;
  }

  // ───────────────────────── events ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  private initListeners(): void {
    this.listen("DRIFT_RECORDED", () => {
      if (this.state === "DONE") return;
      this.state = "DRIFT";
      this.driftT = this.driftFlashSeconds;
      this.shockT = 0;
    });
    // Amber persists while the slip is unresolved; the cook's acknowledgement returns it to cyan.
    this.listen("HOLD_CONFIRMED", () => {
      if (this.state === "DRIFT") this.state = "LOCKED";
      this.driftT = 0;
    });
    this.listen("TASK_COMPLETED", (d: any) => {
      if (d && d.taskId === "prep_shallots") this.markDone();
    });
    // The "Transfer" button emits STATION_STEP_COMPLETED(PREP); the DAG converts it to prep_shallots COMPLETE.
    this.listen("STATION_STEP_COMPLETED", (d: any) => {
      if (d && d.stationId === "PREP") this.markDone();
    });
    this.listen("PLATING_CONVERGENCE", () => {
      this.converged = true;
    });
    this.listen("TIME_WARP_TOGGLED", (d: any) => {
      this.timeWarpOn = !!(d && d.multiplier > 1.0);
      this.warpFlashT = 0.8;
    });
    this.listen("RESET_REQUESTED", () => this.applyReset());
  }

  private markDone(): void {
    this.state = "DONE";
    this.driftT = 0;
    this.shockT = -1;
  }

  private applyReset(): void {
    this.state = "LOCKED";
    this.driftT = 0;
    this.shockT = -1;
    this.converged = false;
    this.timeWarpOn = false;
    this.warpFlashT = 0;
  }

  // ───────────────────────── per-frame ─────────────────────────

  private onUpdate(): void {
    if (!this.root) return;
    const dt = getDeltaTime();
    const time = getTime();
    this.updatePrepConduit(dt, time);
    this.updateConvergence(dt, time);
  }

  private setVisible(seg: Seg, on: boolean): void {
    if (seg.obj.enabled !== on) seg.obj.enabled = on;
  }

  private updatePrepConduit(dt: number, time: number): void {
    if (this.driftT > 0) this.driftT = Math.max(0, this.driftT - dt);
    const flash = this.driftT / this.driftFlashSeconds; // 1 -> 0 over the initial flash
    if (this.shockT >= 0) {
      this.shockT += dt / this.shockSeconds;
      if (this.shockT > 1.0) this.shockT = -1;
    }

    const pulse = 0.5 + 0.5 * Math.sin(time * 7.0);
    let color = CYAN;
    let k = 0.42 + 0.08 * pulse; // dim cyan rail under bright travelling dashes
    if (this.state === "DONE") {
      color = EMERALD;
      k = 1.0;
    } else if (this.state === "DRIFT") {
      color = flash > 0 && pulse > 0.5 ? WHITE_HOT : AMBER;
      k = 0.7 + 0.3 * Math.max(flash, pulse * 0.5);
    }
    for (const bs of this.pBase) tint(bs.mat, color, k);

    // Travelling dashes (hidden once the conduit is solid emerald)
    const showDashes = this.state !== "DONE";
    const spacing = this.pLen / this.pDashes.length;
    const speed = this.state === "DRIFT" ? 11.0 : 5.0;
    const dashLen = Math.min(1.1, spacing * 0.5);
    for (let i = 0; i < this.pDashes.length; i++) {
      const d = this.pDashes[i];
      this.setVisible(d, showDashes);
      if (!showDashes) continue;
      const s = (time * speed + i * spacing) % this.pLen;
      const len = Math.min(dashLen, this.pLen - s);
      this.placeOnPath(d, s, len, DASH_W, LINE_Y + 0.02);
      tint(d.mat, this.state === "DRIFT" ? (flash > 0 ? WHITE_HOT : AMBER) : CYAN, 1.0);
    }

    // Travelling shockwave board -> saucier
    const shockOn = this.shockT >= 0;
    this.setVisible(this.pShock, shockOn);
    if (shockOn) {
      const slen = 2.2;
      const s = this.shockT * (this.pLen + slen) - slen;
      const from = Math.max(0, s);
      const to = Math.min(this.pLen, s + slen);
      this.placeOnPath(this.pShock, from, Math.max(0.01, to - from), 0.6 + 0.4 * this.shockT, LINE_Y + 0.04);
      tint(this.pShock.mat, AMBER, 1.0);
    }

    // [LOCKED] node: visible until the transfer completes, then the label confirms the unlock briefly
    const locked = this.state !== "DONE";
    this.setVisible(this.lockNode, locked);
    if (this.lockText) this.lockText.enabled = locked;
    if (this.lockLabelText) {
      const want = this.state === "DRIFT" ? "[LOCKED] +25s" : "[LOCKED]";
      if (this.lockLabelText.text !== want) this.lockLabelText.text = want;
      const c = this.state === "DRIFT" ? AMBER : LOCK_RED;
      this.lockLabelText.textFill.color = new vec4(c[0], c[1], c[2], 1.0);
      // UIKit shapes initialise on OnStart: re-assert the capsule style for a few frames + on change
      const key = want;
      if (key !== this.lockStyleKey || this.lockWarm < 8) {
        this.lockStyleKey = key;
        this.lockWarm++;
        this.styleLock(c);
      }
    }
    if (locked) {
      const nodeColor = this.state === "DRIFT" ? AMBER : LOCK_RED;
      tint(this.lockNode.mat, nodeColor, 0.6 + 0.4 * pulse);
      const sc = LOCK_R + 0.12 * pulse;
      this.lockNode.obj.getTransform().setLocalScale(new vec3(sc, 1, sc));
    }
  }

  private convergenceProgress(): number {
    if (!this.dagController) return 0;
    const s = clamp01(this.dagController.getSkilletProgress());
    const p = clamp01(this.dagController.getSaucepotProgress());
    return (s + p) * 0.5;
  }

  private updateConvergence(dt: number, time: number): void {
    if (this.warpFlashT > 0) this.warpFlashT -= dt;
    const prog = this.converged ? 1.0 : this.convergenceProgress();
    let k = 0.3 + 0.55 * prog;
    if (this.timeWarpOn) k += 0.15;
    if (this.warpFlashT > 0) k += 0.35 * (this.warpFlashT / 0.8);
    if (this.converged) k = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(time * 6.0));
    k = Math.min(1.0, k);
    const color = this.warpFlashT > 0 ? WHITE_HOT : EMERALD;
    const speed = 3.0 + 9.0 * prog + (this.timeWarpOn ? 5.0 : 0);

    for (const line of this.convLines) {
      tint(line.base.mat, color, k);
      const spacing = line.len / line.dashes.length;
      for (let i = 0; i < line.dashes.length; i++) {
        const d = line.dashes[i];
        const s = (time * speed + i * spacing) % line.len;
        const len = Math.min(0.9, line.len - s);
        this.placeAlong(d, line.a, line.yaw, s, len, 0.24, LINE_Y + 0.02);
        tint(d.mat, color, Math.min(1.0, k + 0.2));
      }
    }
  }
}
