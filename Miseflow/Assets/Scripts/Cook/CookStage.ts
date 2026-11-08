/**
 * CookStage.ts  (Chef Director v6, W3)
 *
 * buildCookWorld(plan, parent, opts) builds ONLY what a CookPlan lists on a dynamic bench and returns the CookWorld
 * handles (Cook/CookWorld.ts) the runtime / actions animate:
 *  - layout (Cook/CookLayout.ts): burners 1..3 along the back row (plan.equipment[].burner), prep bowls left, board
 *    centre-front, plate front-right, tools next to the vessel they are first used on, ingredients staged next to the
 *    equipment of their first step; every footprint is collision-checked (no overlaps, nothing off the slab).
 *  - hardware: the catalogue generators where they are exported (#302 wok/kadai buildWok, #307 buildTawa, #305
 *    buildStockpot, #303 buildHandi, #332 buildLadleMesh), CookProps for the private ones (#301/#304/#325/#341/#331/
 *    #321/#334/#335/#336), W2 ShapeRecipeBuilder for board, rolling pin, skimmer, spoon, brush, curry leaves, lemon,
 *    flour dish, dough ball and the irregular protein chunks (never cubes); CookProps.makeFallbackProp if W2 throws.
 *  - ingredients: catalogueHint (veg #101-#130 via VegGenerators, #161 powders, #162/#164 dairy, #165 oil, #120
 *    dough ...) else by role/name (parametricIngredient for unknown veg).
 *  - reveal: one item built per frame (hidden), then popped in one by one (ease-out-back) with a StudioCardKit loading
 *    panel; CookEvents.LOAD_PROGRESS {index,total,label} per revealed item (index 1-based), CookEvents.WORLD_READY
 *    {world} at the end.
 * The @component CookStage listens to CookEvents.PLAN_READY {plan} (builds) and CookEvents.EXIT / RESET_REQUESTED
 * (disposes). It never touches StationsRoot: DishStudio owns hiding / restoring the legacy setup.
 */
import { MiseFlowEventBus, MiseFlowEventType } from "../MiseFlowEventBus";
import { MeshAcc, SteamPlume } from "../StationPropsBuilder";
import { buildHandi, buildLadleMesh, buildWok, HANDI_INNER } from "../VesselGenerators";
import { buildStockpot, buildTawa, STOCK_INNER } from "../ToolGenerators";
import { buildVegStages } from "../VegGenerators";
import { getCatalogEntry, parametricIngredient } from "../AI/AssetPageTable";
import { PrepSlotEntry } from "../AI/UniversalDishSchema";
import { CookEquipment, CookIngredient, CookPlan, CookTool } from "./CookPlanSchema";
import { CookEvents, CookWorld, EquipmentHandle, HeatLevel, ItemHandle, ToolHandle } from "./CookWorld";
import { SHAPE_RECIPES } from "./ShapeRecipe";
import { ShapeRecipeBuilder } from "./ShapeRecipeBuilder";
import { BENCH, LayoutViolation } from "./CookLayout";
import { HEATED, planBench, pieceCountFor, firstStepOf } from "./CookBenchPlan";
import { CookLoadingPanel } from "./CookLoadingPanel";
import {
  buildBowl, buildCatalogueTool, buildKnife, buildPlate, buildSaucepan, buildSkillet, buildSpatula, burnerArcMesh, collectRmvs,
  countTree, DEG, hashStr, hwMat, itemMat, lift, makeFallbackProp, meshObj, mixRgb, newObj, paintMat, Rgb3, setEmissive,
  slabMesh, ToolBuild,
} from "./CookProps";

// ───────────────────────────── options / stats ─────────────────────────────

export interface CookStageOptions {
  /** bench origin in parent-local cm (default 0,0,0) */
  origin?: vec3;
  /** seconds between two reveals (default 0.15) */
  revealGapSec?: number;
  /** pop-in duration (default 0.25) */
  popSec?: number;
  /** show the loading panel (default true) */
  showPanel?: boolean;
  /** emit LOAD_PROGRESS / WORLD_READY on MiseFlowEventBus (default true) */
  emitEvents?: boolean;
  /** reveal starts once this returns true (default: immediately); building continues meanwhile */
  canReveal?: () => boolean;
  /** called synchronously with the world (before it is ready) so the caller can dispose a build in progress */
  onCreated?: (w: CookWorld) => void;
}

export interface CookWorldStats {
  objects: number;
  tris: number;
  violations: LayoutViolation[];
  layout: { key: string; x: number; z: number; angDeg: number }[];
}

/** CookWorld plus diagnostics (extra members only; the frozen contract is unchanged). */
export interface CookWorldEx extends CookWorld {
  stats(): CookWorldStats;
  isReady(): boolean;
}

const HEAT_K: { [k: string]: number } = { OFF: 0, LOW: 0.35, MED: 0.7, HIGH: 1 };
const BURNER_COL: { [k: string]: Rgb3 } = { OFF: [0.42, 0.5, 0.6], LOW: [1.0, 0.74, 0.32], MED: [1.0, 0.56, 0.16], HIGH: [1.0, 0.36, 0.1] };
const BURNER_EMI: { [k: string]: number } = { OFF: 0.18, LOW: 0.55, MED: 0.85, HIGH: 1.1 };
const HIDE = 0.001;

function bus(): MiseFlowEventBus {
  return MiseFlowEventBus.getInstance();
}

function emit(ev: string, data: any): void {
  bus().emit(ev as MiseFlowEventType, data);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1, u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

function clamp01(v: number): number {
  return !(v > 0) ? 0 : v > 1 ? 1 : v;
}

function v3(c: Rgb3): vec3 {
  return new vec3(c[0], c[1], c[2]);
}

function innerR(inner: [number, number][], y: number): number {
  if (!inner || inner.length === 0) return 1;
  if (y <= inner[0][0]) return inner[0][1];
  for (let i = 1; i < inner.length; i++) {
    const a = inner[i - 1], b = inner[i];
    if (y <= b[0]) return a[1] + ((b[1] - a[1]) * (y - a[0])) / Math.max(1e-4, b[0] - a[0]);
  }
  return inner[inner.length - 1][1];
}

// ───────────────────────────── W2 shape swap point ─────────────────────────────

/** kind -> W2 recipe id + scale that brings W2's real-size recipes to the bench scale (~0.6 of life size). */
const W2_KIND: { [k: string]: { id: string; scale: number } } = {
  BOARD: { id: "WOODEN_BOARD", scale: 0.5 },
  ROLLING_PIN: { id: "ROLLING_PIN", scale: 0.36 },
  SKIMMER: { id: "SKIMMER", scale: 0.45 },
  SPOON: { id: "WOODEN_SPOON", scale: 0.48 },
  BRUSH: { id: "BRUSH", scale: 0.6 },
  CURRY_LEAF_SPRIG: { id: "CURRY_LEAF_SPRIG", scale: 0.5 },
  LEMON_WEDGE: { id: "LEMON_WEDGE", scale: 0.45 },
  FLOUR_DISH: { id: "FLOUR_DISH", scale: 0.27 },
  DOUGH_BALL: { id: "DOUGH_BALL", scale: 0.55 },
  FLATBREAD_DISC: { id: "FLATBREAD_DISC", scale: 0.35 },
  IRREGULAR_CHICKEN_CHUNKS: { id: "IRREGULAR_CHICKEN_CHUNKS", scale: 0.5 },
};

/**
 * Every non-catalogue shape goes through here: W2 ShapeRecipeBuilder when it has a recipe for the kind, else
 * CookProps.makeFallbackProp. Returns an unparented holder whose food parts are "Main" / "Piece_k" descendants.
 */
export function shapeProp(kind: string, colour: Rgb3 | null, opts: { count?: number; seed?: number } = {}): SceneObject {
  const w = W2_KIND[kind];
  if (w && SHAPE_RECIPES[w.id]) {
    try {
      let recipe: any = SHAPE_RECIPES[w.id];
      if (opts.count && kind === "IRREGULAR_CHICKEN_CHUNKS") {
        recipe = JSON.parse(JSON.stringify(recipe));
        if (recipe.ops[0] && recipe.ops[0].scatter) recipe.ops[0].scatter.count = Math.max(4, Math.min(16, opts.count));
      }
      const holder = newObj("Shape_" + kind, null);
      const n = kind === "LEMON_WEDGE" ? Math.max(1, Math.min(3, opts.count || 2)) : 1;
      for (let i = 0; i < n; i++) {
        const b = ShapeRecipeBuilder.build(recipe, colour ? { body: v3(colour) } : null, w.id, holder);
        b.getTransform().setLocalScale(new vec3(w.scale, w.scale, w.scale));
        if (n > 1) {
          b.getTransform().setLocalPosition(new vec3(0, 0, (i - (n - 1) / 2) * 1.5));
          b.getTransform().setLocalRotation(quat.angleAxis((i - (n - 1) / 2) * 0.35, vec3.up()));
        }
      }
      return holder;
    } catch (e) {
      print(`[CookStage] W2 shape ${kind} failed (${e}), using fallback`);
    }
  }
  return makeFallbackProp(kind, colour || [0.8, 0.7, 0.5], opts);
}

function collectPieces(o: SceneObject, out: SceneObject[] = []): SceneObject[] {
  for (let i = 0; i < o.getChildrenCount(); i++) {
    const c = o.getChild(i);
    if (c.name === "Main" || c.name.indexOf("Piece_") === 0) out.push(c);
    else collectPieces(c, out);
  }
  return out;
}

// ───────────────────────────── handles ─────────────────────────────

class EqImpl implements EquipmentHandle {
  id: string;
  kind: string;
  obj: SceneObject;
  radiusCm: number;
  rimY: number = 1;
  floorY: number = 0.2;
  inner: [number, number][] = [[0, 1]];
  burnerMat: Material | null = null;
  burnerObj: SceneObject | null = null;
  heat: string = "OFF";
  private t: number = 0;
  private steam: SteamPlume | null = null;
  private steamAmt: number = 0;
  private oilObj: SceneObject | null = null;
  private oilMat: Material | null = null;
  private oilLevel: number = 0;
  private bubbling: number = 0;
  private bubbles: { o: SceneObject; ph: number; a0: number }[] = [];
  private fillObj: SceneObject | null = null;
  private fillMat: Material | null = null;
  private fillLevel: number = 0;
  private unitDisc: () => RenderMesh;

  constructor(id: string, kind: string, obj: SceneObject, radiusCm: number, unitDisc: () => RenderMesh) {
    this.id = id;
    this.kind = kind;
    this.obj = obj;
    this.radiusCm = radiusCm;
    this.unitDisc = unitDisc;
  }

  rimWorld(): vec3 {
    return this.obj.getTransform().getWorldTransform().multiplyPoint(new vec3(0, this.rimY, 0));
  }

  floorWorld(): vec3 {
    return this.obj.getTransform().getWorldTransform().multiplyPoint(new vec3(0, this.floorY, 0));
  }

  setHeat(level: HeatLevel): void {
    const l = String(level || "OFF").toUpperCase();
    this.heat = HEAT_K[l] !== undefined ? l : "OFF";
    this.applyBurner(1);
  }

  private applyBurner(pulse: number): void {
    if (!this.burnerMat) return;
    const c = BURNER_COL[this.heat];
    this.burnerMat.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
    setEmissive(this.burnerMat, c, BURNER_EMI[this.heat] * pulse);
  }

  private discObj(name: string, mat: Material): SceneObject {
    const o = newObj(name, this.obj);
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = this.unitDisc();
    rmv.mainMaterial = mat;
    o.enabled = false;
    return o;
  }

  private placeDisc(o: SceneObject, level: number, depth: number, lift0: number): void {
    const y = this.floorY + lift0 + level * depth;
    const r = Math.max(0.3, innerR(this.inner, y) * 0.97);
    o.getTransform().setLocalPosition(new vec3(0, y, 0));
    o.getTransform().setLocalScale(new vec3(r, 1, r));
  }

  setOil(level01: number, bubbling01: number): void {
    this.oilLevel = clamp01(level01);
    this.bubbling = clamp01(bubbling01);
    if (this.oilLevel <= 0.001) {
      if (this.oilObj) this.oilObj.enabled = false;
      for (const b of this.bubbles) b.o.enabled = false;
      return;
    }
    if (!this.oilObj) {
      this.oilMat = itemMat([0.95, 0.72, 0.2], 0.06, 0.25, 0.3);
      this.oilObj = this.discObj(`Cook_${this.id}_Oil`, this.oilMat);
    }
    this.oilObj.enabled = true;
    this.placeDisc(this.oilObj, this.oilLevel, (this.rimY - this.floorY) * 0.45, 0.04);
    if (this.bubbling > 0.01 && this.bubbles.length === 0) {
      const acc = new MeshAcc();
      acc.ellipsoid(0, 0, 0, 0.22, 0.14, 0.22, 6, 3);
      const mesh = acc.toMesh();
      const m = itemMat([1.0, 0.9, 0.55], 0.1, 0, 0.35);
      for (let i = 0; i < 5; i++) {
        const o = newObj(`Cook_${this.id}_Bubble_${i}`, this.obj);
        const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        rmv.mesh = mesh;
        rmv.mainMaterial = m;
        this.bubbles.push({ o, ph: i / 5, a0: i * 2.399 });
      }
    }
    for (const b of this.bubbles) b.o.enabled = this.bubbling > 0.01;
  }

  setSteam(amount01: number): void {
    this.steamAmt = clamp01(amount01);
    if (this.steamAmt > 0.001 && !this.steam) {
      const r = this.radiusCm;
      this.steam = new SteamPlume(this.obj, `Cook_${this.id}_SteamRoot`, `Cook_${this.id}_Steam`, {
        count: 3, spread: Math.max(0.8, r * 0.3), baseY: this.rimY * 0.8, rise: 5.5, size0: Math.max(1.6, r * 0.4), size1: 2.6,
        alpha: 0.75, speed: 0.45, sway: 0.5, z: 0.2, fadeIn: 0.5, fadeOut: 1.0,
      });
    }
  }

  setFill(level01: number, color: vec3): void {
    this.fillLevel = clamp01(level01);
    if (this.fillLevel <= 0.001) {
      if (this.fillObj) this.fillObj.enabled = false;
      return;
    }
    const c = lift([color.x, color.y, color.z], 0.2);
    if (!this.fillObj) {
      this.fillMat = itemMat(c, 0.25, 0, 0.18);
      this.fillObj = this.discObj(`Cook_${this.id}_Fill`, this.fillMat);
    }
    if (this.fillMat) paintMat(this.fillMat, v3(c), 0.25, 0.25);
    this.fillObj.enabled = true;
    this.placeDisc(this.fillObj, this.fillLevel, (this.rimY - this.floorY) * 0.85, 0.06);
  }

  update(dt: number): void {
    this.t += dt;
    const hk = HEAT_K[this.heat] || 0;
    if (this.burnerMat && hk > 0) this.applyBurner(1 + 0.18 * hk * Math.sin(this.t * (3 + 3 * hk)));
    if (this.steam) {
      this.steam.target = this.steamAmt * (0.55 + 0.45 * hk);
      this.steam.update(dt);
    }
    if (this.oilObj && this.oilObj.enabled && this.oilMat) {
      setEmissive(this.oilMat, [0.95, 0.72, 0.2], 0.22 + 0.25 * hk + 0.1 * hk * Math.sin(this.t * 9));
      if (this.bubbling > 0.01) {
        const y = this.oilObj.getTransform().getLocalPosition().y;
        const rr = this.oilObj.getTransform().getLocalScale().x * 0.8;
        for (const b of this.bubbles) {
          const k = (this.t * (0.5 + this.bubbling) + b.ph) % 1;
          const ang = b.a0 + this.t * 0.3;
          const rad = rr * (0.2 + 0.8 * ((b.ph * 3.7 + Math.floor(this.t * (0.5 + this.bubbling) + b.ph) * 0.37) % 1));
          const sc = this.bubbling * (k < 0.8 ? 0.4 + k : Math.max(0.01, ((1 - k) / 0.2) * 1.2));
          b.o.getTransform().setLocalPosition(new vec3(Math.cos(ang) * rad, y + 0.05, Math.sin(ang) * rad));
          b.o.getTransform().setLocalScale(new vec3(Math.max(0.01, sc), Math.max(0.01, sc), Math.max(0.01, sc)));
        }
      }
    }
  }
}

function underObj(o: SceneObject, anc: SceneObject): boolean {
  let cur: SceneObject | null = o;
  while (cur) {
    if (cur === anc) return true;
    cur = cur.hasParent() ? cur.getParent() : null;
  }
  return false;
}

interface PaintRec {
  m: Material;
  base: Rgb3;
  k: number;
}

class ItemImpl implements ItemHandle {
  id: string;
  name: string;
  role: string;
  obj: SceneObject;
  pieces: SceneObject[] = [];
  homePos: vec3 = vec3.zero();
  paints: PaintRec[] = [];

  constructor(id: string, name: string, role: string, obj: SceneObject) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.obj = obj;
  }

  paint(color: vec3, rough01: number, emissive01: number): void {
    for (const p of this.paints) {
      const c = p.k >= 0.999 ? [color.x, color.y, color.z] : mixRgb(p.base, [color.x, color.y, color.z], p.k);
      paintMat(p.m, v3(c), rough01, emissive01);
    }
  }

  setVisible(on: boolean): void {
    if (this.obj && !isNull(this.obj)) this.obj.enabled = on;
    // pieces the runtime re-parented into a vessel no longer follow obj.enabled
    for (const p of this.pieces) if (p && !isNull(p) && !underObj(p, this.obj)) p.enabled = on;
  }

  setScale(s: vec3): void {
    if (this.obj && !isNull(this.obj)) this.obj.getTransform().setLocalScale(s);
  }
}

/** Paint records for the pieces: the first mesh of each piece is the body (full colour), the rest follow at 50 %. */
function paintRecs(pieces: SceneObject[], skipFirst: boolean): PaintRec[] {
  const out: PaintRec[] = [];
  const seen: Material[] = [];
  for (const p of pieces) {
    const rmvs = collectRmvs(p);
    for (let i = 0; i < rmvs.length; i++) {
      const m = rmvs[i].mainMaterial;
      if (!m || seen.indexOf(m) >= 0) continue;
      seen.push(m);
      if (skipFirst && i === 0) continue;
      const b = m.mainPass.baseColor;
      out.push({ m, base: [b.r, b.g, b.b], k: (skipFirst ? i === 1 : i === 0) ? 1 : 0.5 });
    }
  }
  return out;
}

function vegPiece(ing: CookIngredient, n: number, holder: SceneObject): void {
  const col = lift(ing.colorRaw);
  let entry: PrepSlotEntry;
  const cat = n > 0 ? getCatalogEntry(n) : null;
  if (cat) {
    entry = { accessNumber: cat.accessNumber, name: ing.name || cat.name, archetype: cat.archetype, colorRgb: [col[0], col[1], col[2]], scaleMultiplier: 1 };
    if (cat.stemColorRgb) entry.stemColorRgb = cat.stemColorRgb;
  } else {
    entry = parametricIngredient({ accessNumber: 200, name: ing.name, archetype: "" as any, colorRgb: [col[0], col[1], col[2]], scaleMultiplier: 1 });
  }
  const set = buildVegStages(entry, () => new MeshAcc());
  const parts = set.parts[0];
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of parts) {
    if (!p) continue;
    const q = p.bounds();
    for (let i = 0; i < 3; i++) {
      b[i] = Math.min(b[i], q[i]);
      b[i + 3] = Math.max(b[i + 3], q[i + 3]);
    }
  }
  const half = Math.max(0.05, (b[3] - b[0]) / 2, (b[5] - b[2]) / 2);
  const s = 1.3 / half;
  const pieceObj = newObj("Piece_0", holder);
  const inner = newObj("Veg", pieceObj);
  inner.getTransform().setLocalScale(new vec3(s, s, s));
  inner.getTransform().setLocalPosition(new vec3((-(b[0] + b[3]) / 2) * s, -b[1] * s, (-(b[2] + b[5]) / 2) * s));
  const cols = [set.bodyRgb, set.accentRgb, set.detailRgb];
  for (let i = 0; i < 3; i++) {
    const p = parts[i];
    if (!p || p.count() === 0) continue;
    meshObj(inner, ["Body", "Accent", "Detail"][i], p, itemMat(cols[i], set.rough, set.metal, 0.12));
  }
}

// ───────────────────────────── tools ─────────────────────────────

function buildTool(t: CookTool): ToolBuild {
  const kind = String(t.kind || "SPOON").toUpperCase();
  const name = "Cook_Tool_" + t.id;
  switch (kind) {
    case "SPATULA": return buildSpatula(name);
    case "KNIFE": return buildKnife(name);
    case "TONGS": return buildCatalogueTool("tongs", name, 0.62);
    case "CHOPSTICKS": return buildCatalogueTool("chopsticks", name, 0.62);
    case "WHISK": return buildCatalogueTool("whisk", name, 0.72);
    case "LADLE": {
      const root = newObj(name, null);
      const l = buildLadleMesh(root);
      l.name = name + "_Ladle";
      l.enabled = true;
      const s = 0.7;
      l.getTransform().setLocalScale(new vec3(s, s, s));
      l.getTransform().setLocalRotation(quat.angleAxis(-Math.PI / 2, vec3.forward()));
      l.getTransform().setLocalPosition(new vec3(0, 1.42 * s, 0));
      return { root, tipLocal: new vec3(0, 1.42 * s, 0), length: 16.3 * s, halfWidth: 1.42 * s };
    }
    case "ROLLING_PIN": {
      const root = newObj(name, null);
      const p = shapeProp("ROLLING_PIN", null);
      p.setParent(root);
      const half = 18.7 * 0.36;
      p.getTransform().setLocalPosition(new vec3(half, 0, 0));
      return { root, tipLocal: new vec3(half, 2.25 * 0.36, 0), length: half * 2, halfWidth: 1.0 };
    }
    case "SKIMMER": {
      const root = newObj(name, null);
      shapeProp("SKIMMER", null).setParent(root);
      return { root, tipLocal: new vec3(0, 0.3, 0), length: 27 * 0.45, halfWidth: 5 * 0.45 };
    }
    case "BRUSH": {
      const root = newObj(name, null);
      shapeProp("BRUSH", null).setParent(root);
      return { root, tipLocal: new vec3(0.3, 0.45, 0), length: 18 * 0.6, halfWidth: 1.1 * 0.6 };
    }
    default: {
      // SPOON and anything unknown
      const root = newObj(name, null);
      shapeProp("SPOON", null).setParent(root);
      return { root, tipLocal: new vec3(0, 0.4, 0), length: 26 * 0.48, halfWidth: 2.2 * 0.48 };
    }
  }
}

// ───────────────────────────── world build ─────────────────────────────

interface Job {
  label: string;
  build: () => SceneObject[];
  built: boolean;
  targets: { obj: SceneObject; orig: vec3 }[];
  after?: () => void;
}

/**
 * Builds the bench for `plan` under `parent` and resolves once every item is revealed (WORLD_READY emitted).
 * Rejects if the world is disposed before it is ready.
 */
export function buildCookWorld(plan: CookPlan, parent: SceneObject, opts: CookStageOptions = {}): Promise<CookWorld> {
  const gap = opts.revealGapSec !== undefined ? opts.revealGapSec : 0.15;
  const popSec = opts.popSec !== undefined ? opts.popSec : 0.25;
  const emitEvents = opts.emitEvents !== false;
  const canReveal = opts.canReveal || (() => true);

  const root = newObj("CookWorld", parent);
  root.getTransform().setLocalPosition(opts.origin || vec3.zero());
  const equipment: { [id: string]: EquipmentHandle } = {};
  const tools: { [id: string]: ToolHandle } = {};
  const items: { [id: string]: ItemHandle } = {};
  const eqImpls: EqImpl[] = [];
  let disposed = false;
  let ready = false;
  let panel: CookLoadingPanel | null = null;
  let discMesh: RenderMesh | null = null;
  const unitDisc = (): RenderMesh => {
    if (!discMesh) {
      const a = new MeshAcc();
      a.disc(0, 0, 0, 1, 24, 0.02);
      discMesh = a.toMesh();
    }
    return discMesh;
  };
  const toWorld = (x: number, y: number, z: number): vec3 => root.getTransform().getWorldTransform().multiplyPoint(new vec3(x, y, z));

  let resolveFn: (w: CookWorld) => void = () => {};
  let rejectFn: (e: any) => void = () => {};
  const promise = new Promise<CookWorld>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });

  // ── 1. layout (pure, Cook/CookBenchPlan.ts) ──
  const bp = planBench(plan);
  const { eqList, plateEq, burnerOf, row, specOf, poseOf, hostOf, hosted, looks, ingPose, toolPose, violations, layoutLog } = bp;
  const ingList: CookIngredient[] = (plan.ingredients || []).slice();
  const toolList: CookTool[] = (plan.tools || []).slice();
  const toolBuilds: { [id: string]: ToolBuild } = {};
  if (violations.length > 0) print(`[CookStage] layout violations: ${JSON.stringify(violations)}`);

  // ── 2. jobs (one built per frame, revealed one by one) ──
  const jobs: Job[] = [];
  jobs.push({
    label: "BENCH",
    built: false,
    targets: [],
    build: () => {
      const slab = meshObj(root, "Cook_Bench", slabMesh((BENCH.maxX - BENCH.minX) / 2, (BENCH.maxZ - BENCH.minZ) / 2, 0, -BENCH.thick, 2.2, 0.9), hwMat("slab"));
      slab.getTransform().setLocalPosition(new vec3((BENCH.minX + BENCH.maxX) / 2, BENCH.topY, (BENCH.minZ + BENCH.maxZ) / 2));
      return [slab];
    },
  });

  const buildEquipment = (e: CookEquipment): SceneObject[] => {
    const s = specOf[e.id];
    const p = poseOf[e.id];
    const obj = newObj("Cook_Eq_" + e.id, root);
    obj.getTransform().setLocalPosition(new vec3(p.x, BENCH.topY, p.z));
    const body = newObj("Cook_Eq_" + e.id + "_Body", obj);
    let rimY = 1, floorY = 0.3, radius = s.footR, inner: [number, number][] = [[0.3, s.footR * 0.6], [1, s.footR]];
    let yawDeg = s.genHandleDeg - p.ang / DEG; // maps the generator handle onto the layout direction
    let scale = 1;
    const sc = (pts: [number, number][], k: number): [number, number][] => pts.map(([y, r]) => [y * k, r * k] as [number, number]);
    const rescale = (k: number) => (scale = k);
    switch (s.kind) {
      case "WOK":
      case "KADAI":
      case "FRYER_PAN": {
        const w = s.footR / 9.98;
        rescale(w);
        const g = buildWok(body);
        g.root.name = "Cook_Wok_" + e.id;
        g.root.enabled = true;
        g.root.getTransform().setLocalRotation(quat.quatIdentity());
        if (s.kind === "WOK") g.kadaiLoops.destroy();
        else {
          g.kadaiLoops.enabled = true;
          g.wokHandle.destroy();
        }
        rimY = 4.7 * w; floorY = 0.45 * w; radius = 9.5 * w;
        inner = sc([[0.45, 0], [0.85, 4.0], [2.95, 7.6], [4.6, 9.5]], w);
        break;
      }
      case "TAWA": {
        const w = s.footR / 9.45;
        rescale(w);
        const g = buildTawa(body);
        g.name = "Cook_Tawa_" + e.id;
        g.enabled = true;
        g.getTransform().setLocalRotation(quat.quatIdentity());
        rimY = 0.68 * w; floorY = 0.32 * w; radius = 7.4 * w;
        inner = [[0.3 * w, 8.2 * w], [0.62 * w, 9.25 * w]];
        break;
      }
      case "POT":
      case "STEAMER": {
        const w = s.footR / 5.0;
        rescale(w);
        const sp = buildStockpot(body);
        const g = sp.getObject();
        g.name = "Cook_Pot_" + e.id;
        g.enabled = true;
        for (let i = g.getChildrenCount() - 1; i >= 0; i--) {
          const c = g.getChild(i);
          if (c.name !== "StockpotEars") c.destroy(); // own fill / steam / bubbles instead (object budget)
        }
        rimY = 7.0 * w; floorY = 0.46 * w; radius = 4.5 * w;
        inner = STOCK_INNER.map(([y, r]) => [y * w, r * w] as [number, number]);
        break;
      }
      case "HANDI": {
        const w = s.footR / 5.8;
        rescale(w);
        const g = buildHandi(body);
        g.root.name = "Cook_Handi_" + e.id;
        g.root.enabled = true;
        const keepLid = (plan.steps || []).some((st) => st.equipmentId === e.id && st.action === "STEAM_DUM");
        for (let i = g.root.getChildrenCount() - 1; i >= 0; i--) {
          const c = g.root.getChild(i);
          if (c.name === "HandiDumSteamRoot" || c.name === "HandiDoughSeal" || (!keepLid && c.name === "HandiDumLid")) c.destroy();
        }
        rimY = 5.42 * w; floorY = 0.48 * w; radius = 4.65 * w;
        inner = HANDI_INNER.map(([y, r]) => [y * w, r * w] as [number, number]);
        break;
      }
      case "SKILLET": {
        const w = s.footR / 6.15;
        const v = buildSkillet("Cook_Skillet_" + e.id);
        v.root.setParent(body);
        rescale(w);
        rimY = v.rimY * w; floorY = v.floorY * w; radius = v.floorR * w; inner = v.inner.map(([y, r]) => [y * w, r * w] as [number, number]);
        break;
      }
      case "SAUCEPAN": {
        const w = s.footR / 4.22;
        const v = buildSaucepan("Cook_Saucepan_" + e.id, 1);
        v.root.setParent(body);
        rescale(w);
        rimY = v.rimY * w; floorY = v.floorY * w; radius = v.floorR * w; inner = v.inner.map(([y, r]) => [y * w, r * w] as [number, number]);
        break;
      }
      case "PLATE": {
        const v = buildPlate("Cook_Plate_" + e.id, s.footR);
        v.root.setParent(body);
        rimY = v.rimY; floorY = v.floorY; radius = v.floorR * 1.25; inner = v.inner;
        yawDeg = 0;
        break;
      }
      case "BOARD": {
        const b = shapeProp("BOARD", null);
        b.setParent(body);
        rimY = 1.0; floorY = 1.0; radius = 4.6; inner = [[1.0, 6.5]];
        yawDeg = -p.ang / DEG;
        break;
      }
      default: {
        const v = buildBowl("Cook_Bowl_" + e.id, s.footR);
        v.root.setParent(body);
        rimY = v.rimY; floorY = v.floorY; radius = v.floorR * 1.2; inner = v.inner;
        yawDeg = 0;
      }
    }
    body.getTransform().setLocalScale(new vec3(scale, scale, scale));
    body.getTransform().setLocalRotation(quat.angleAxis(yawDeg * DEG, vec3.up()));
    const h = new EqImpl(e.id, s.kind, obj, radius, unitDisc);
    h.rimY = rimY;
    h.floorY = floorY;
    h.inner = inner;
    equipment[e.id] = h;
    eqImpls.push(h);
    const out: SceneObject[] = [obj];
    if (burnerOf[e.id]) {
      const m = itemMat(BURNER_COL.OFF, 0.3, 0, BURNER_EMI.OFF);
      const ring = meshObj(root, `Cook_Burner_${burnerOf[e.id]}_${e.id}`, burnerArcMesh(s.footR * (s.kind === "TAWA" ? 0.95 : 0.98)), m);
      ring.getTransform().setLocalPosition(new vec3(p.x, BENCH.topY + 0.015, p.z));
      h.burnerMat = m;
      h.burnerObj = ring;
      h.setHeat("OFF");
      out.unshift(ring);
    }
    return out;
  };

  const orderedEq = row.concat(eqList.filter((e) => !burnerOf[e.id] && e.id !== plateEq!.id)).concat([plateEq]);
  for (const e of orderedEq) {
    jobs.push({ label: String(e.kind).toUpperCase(), built: false, targets: [], build: () => buildEquipment(e) });
  }

  for (const t of toolList) {
    jobs.push({
      label: String(t.kind).toUpperCase().replace("_", " "),
      built: false,
      targets: [],
      build: () => {
        const tb = buildTool(t);
        toolBuilds[t.id] = tb;
        tb.root.setParent(root);
        const p = toolPose[t.id];
        const tr = tb.root.getTransform();
        tr.setLocalPosition(new vec3(p.x, BENCH.topY, p.z));
        tr.setLocalRotation(quat.angleAxis(-p.ang, vec3.up()));
        tools[t.id] = { id: t.id, kind: String(t.kind).toUpperCase(), obj: tb.root, restPos: toWorld(p.x, BENCH.topY, p.z), restRot: tr.getWorldRotation(), tipLocal: tb.tipLocal };
        return [tb.root];
      },
    });
  }

  // does a DOUGH item get produced from a FLOUR in the plan? (starts hidden, shown by the runtime at KNEAD / divide)
  const flourIds = ingList.filter((i) => String(i.role).toUpperCase() === "FLOUR").map((i) => i.id);
  const producedDough = (ing: CookIngredient): boolean => {
    if (String(ing.role).toUpperCase() !== "DOUGH" || flourIds.length === 0) return false;
    const steps = plan.steps || [];
    const iDough = steps.findIndex((s) => (s.ingredientIds || []).indexOf(ing.id) >= 0);
    const iFlour = steps.findIndex((s) => (s.ingredientIds || []).some((id) => flourIds.indexOf(id) >= 0));
    return iFlour >= 0 && (iDough < 0 || iFlour < iDough);
  };

  const buildIngredient = (ing: CookIngredient): SceneObject[] => {
    const look = looks[ing.id];
    const obj = newObj("Cook_Item_" + ing.id, root);
    const raw = lift(ing.colorRaw);
    const host = hostOf[ing.id];
    let containerFirst = false;
    if (host) {
      const he = equipment[host] as EqImpl;
      const hp = poseOf[host];
      const dough = String(ing.role).toUpperCase() === "DOUGH" && (hosted[host] || []).length > 1;
      obj.getTransform().setLocalPosition(new vec3(hp.x + (dough ? 0.4 : 0), BENCH.topY + (he ? he.floorY : 0.3) + (dough ? 0.35 : 0), hp.z));
    } else {
      const p = ingPose[ing.id];
      obj.getTransform().setLocalPosition(new vec3(p.x, BENCH.topY, p.z));
      obj.getTransform().setLocalRotation(quat.angleAxis(-p.ang, vec3.up()));
    }
    let content: SceneObject;
    if (look.t === "veg") {
      content = newObj("Veg_" + ing.id, null);
      vegPiece(ing, look.n, content);
    } else if (look.t === "shape") {
      content = shapeProp(look.kind, raw, { count: look.count, seed: hashStr(ing.id) });
      containerFirst = !!look.containerFirst;
    } else if (look.kind === "FLOUR_MOUND") {
      content = makeFallbackProp("FLOUR_DISH", raw, { seed: hashStr(ing.id) });
      const c = content.getChildrenCount() > 0 ? content.getChild(0) : null;
      if (c && c.name === "Container") c.destroy();
      content.getTransform().setLocalPosition(new vec3(0, -0.25, 0));
    } else {
      content = makeFallbackProp(look.kind, raw, { count: look.count, seed: hashStr(ing.id) });
    }
    content.setParent(obj);
    // proteins staged on the bench (not in a bowl) sit on their own small tray
    if (!host && String(ing.role).toUpperCase() === "PROTEIN") {
      const tray = buildPlate("Cook_Tray_" + ing.id, 3.4);
      tray.root.setParent(obj);
      content.getTransform().setLocalPosition(new vec3(0, tray.floorY, 0));
    }
    const h = new ItemImpl(ing.id, ing.name, String(ing.role).toUpperCase(), obj);
    h.pieces = collectPieces(content);
    if (h.pieces.length === 0) h.pieces = [content];
    h.paints = paintRecs(h.pieces, containerFirst);
    h.homePos = obj.getTransform().getWorldPosition();
    items[ing.id] = h;
    return [obj];
  };
  for (const ing of ingList) {
    jobs.push({
      label: String(ing.name || ing.id).toUpperCase(),
      built: false,
      targets: [],
      build: () => buildIngredient(ing),
      after: producedDough(ing) ? () => items[ing.id] && items[ing.id].setVisible(false) : undefined,
    });
  }

  // ── 3. world object ──
  const world: CookWorldEx = {
    plan: plan,
    root: root,
    equipment: equipment,
    tools: tools,
    items: items,
    plate: null as any,
    platingSpot: (): vec3 => {
      const p = world.plate || equipment[plateEq!.id];
      return p ? p.floorWorld().add(new vec3(0, 0.25, 0)) : toWorld(14.6, 0.3, 5);
    },
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      if (panel) panel.destroy();
      panel = null;
      if (root && !isNull(root)) root.destroy();
      if (!ready) rejectFn(new Error("CookWorld disposed before it was ready"));
    },
    stats: (): CookWorldStats => {
      const c = root && !isNull(root) ? countTree(root) : { objects: 0, tris: 0 };
      return { objects: c.objects, tris: c.tris, violations: violations, layout: layoutLog };
    },
    isReady: () => ready,
  };
  if (opts.onCreated) opts.onCreated(world);

  if (opts.showPanel !== false) {
    try {
      panel = new CookLoadingPanel(plan.dishTitle || "your dish", jobs.map((j) => j.label));
    } catch (e) {
      print(`[CookStage] loading panel failed: ${e}`);
      panel = null;
    }
  }

  // ── 4. ticker: build one job per frame, reveal one by one, animate handles ──
  let nextBuild = 0;
  let nextReveal = 0;
  let clock = 0;
  let nextPopAt = 0;
  const pops: { obj: SceneObject; orig: vec3; t: number }[] = [];
  const ticker = root.createComponent("Component.ScriptComponent") as ScriptComponent;
  ticker.createEvent("UpdateEvent").bind(() => {
    if (disposed) return;
    const dt = getDeltaTime();
    clock += dt;
    try {
      if (nextBuild < jobs.length) {
        const j = jobs[nextBuild];
        const objs = j.build();
        for (const o of objs) {
          const orig = o.getTransform().getLocalScale();
          j.targets.push({ obj: o, orig });
          o.getTransform().setLocalScale(orig.uniformScale(HIDE));
        }
        j.built = true;
        if (j.after) j.after();
        if (panel) panel.setState(nextBuild, 1);
        nextBuild++;
      }
      if (!ready && nextReveal < jobs.length && jobs[nextReveal].built && clock >= nextPopAt && canReveal()) {
        const j = jobs[nextReveal];
        for (const t of j.targets) pops.push({ obj: t.obj, orig: t.orig, t: 0 });
        if (panel) panel.setState(nextReveal, 2);
        nextReveal++;
        nextPopAt = clock + gap;
        if (emitEvents) emit(CookEvents.LOAD_PROGRESS, { index: nextReveal, total: jobs.length, label: j.label });
      }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.t = Math.min(1, p.t + dt / popSec);
        const k = p.t >= 1 ? 1 : Math.max(HIDE, easeOutBack(p.t));
        if (p.obj && !isNull(p.obj)) p.obj.getTransform().setLocalScale(p.orig.uniformScale(k));
        if (p.t >= 1) pops.splice(i, 1);
      }
      if (!ready && nextReveal >= jobs.length && pops.length === 0) {
        ready = true;
        world.plate = equipment[plateEq!.id];
        // tool rest poses are final now (pops done)
        for (const id in tools) {
          const tr = tools[id].obj.getTransform();
          tools[id].restPos = tr.getWorldPosition();
          tools[id].restRot = tr.getWorldRotation();
        }
        for (const id in items) (items[id] as ItemImpl).homePos = items[id].obj.getTransform().getWorldPosition();
        if (panel) {
          panel.setStatus("Bench ready. Only what your steps need.");
          panel.close();
        }
        const st = world.stats();
        print(`[CookStage] ${plan.dishTitle}: ${jobs.length} items revealed, ${st.objects} objects, ${st.tris} tris, ${st.violations.length} layout violations`);
        if (emitEvents) emit(CookEvents.WORLD_READY, { world: world });
        resolveFn(world);
      }
      for (const h of eqImpls) h.update(dt);
      if (panel && !panel.update(dt)) panel = null;
    } catch (e) {
      print(`[CookStage] tick error: ${e}`);
    }
  });
  world.plate = equipment[plateEq.id] || (null as any);
  return promise;
}

// ───────────────────────────── component ─────────────────────────────

/**
 * Listens to CookEvents.PLAN_READY {plan} and builds the world under a scene-root "CookStageRoot" placed where the
 * legacy StationsRoot sits (so the director camera pose frames it). CookEvents.EXIT / RESET_REQUESTED dispose it.
 * It does NOT hide or restore the legacy setup (DishStudio owns that).
 */
@component
export class CookStage extends BaseScriptComponent {
  private static instance: CookStage | null = null;
  private handlers: { ev: string; cb: (d?: any) => void }[] = [];
  private world: CookWorld | null = null;
  private stageRoot: SceneObject | null = null;
  private token: number = 0;
  private studioOpen: boolean = false;

  public static getInstance(): CookStage | null {
    return CookStage.instance;
  }

  onAwake(): void {
    CookStage.instance = this;
    this.createEvent("OnStartEvent").bind(() => {
      this.listen(CookEvents.PLAN_READY, (d?: any) => {
        if (d && d.plan && d.plan.found !== false) this.enter(d.plan as CookPlan);
      });
      this.listen(CookEvents.EXIT, () => this.exit());
      this.listen("RESET_REQUESTED", () => this.exit());
      this.listen("STUDIO_STATE_CHANGED", (d?: any) => {
        this.studioOpen = !!(d && d.open);
      });
    });
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) MiseFlowEventBus.getInstance().off(h.ev as MiseFlowEventType, h.cb);
      this.handlers = [];
      this.exit();
      if (CookStage.instance === this) CookStage.instance = null;
    });
  }

  /** The current world (also while it is still revealing), null when Cook mode is off. */
  public getWorld(): CookWorld | null {
    return this.world;
  }

  public isActive(): boolean {
    return this.world !== null;
  }

  /** Build `plan` (disposing any previous world). The reveal waits while the Dish Studio is open. */
  public enter(plan: CookPlan): Promise<CookWorld> {
    this.disposeWorld();
    const token = ++this.token;
    const root = global.scene.createSceneObject("CookStageRoot"); // scene root: never inside the hidden StationsRoot
    const anchor = findSceneObject("StationsRoot");
    if (anchor) {
      root.getTransform().setWorldPosition(anchor.getTransform().getWorldPosition());
      root.getTransform().setWorldRotation(anchor.getTransform().getWorldRotation());
    } else root.getTransform().setWorldPosition(new vec3(0, -17.5, -76));
    this.stageRoot = root;
    const p = buildCookWorld(plan, root, {
      canReveal: () => !this.studioOpen,
      onCreated: (w) => {
        if (token === this.token) this.world = w;
      },
    });
    p.catch((e) => print(`[CookStage] build ended: ${e}`));
    return p;
  }

  /** Dispose the world (idempotent). */
  public exit(): void {
    this.token++;
    this.disposeWorld();
  }

  private disposeWorld(): void {
    if (this.world) {
      try {
        this.world.dispose();
      } catch (e) {
        print(`[CookStage] dispose error: ${e}`);
      }
    }
    this.world = null;
    if (this.stageRoot && !isNull(this.stageRoot)) this.stageRoot.destroy();
    this.stageRoot = null;
  }

  private listen(ev: string, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[CookStage] ${ev} handler error: ${e}`);
      }
    };
    MiseFlowEventBus.getInstance().on(ev as MiseFlowEventType, safe);
    this.handlers.push({ ev, cb: safe });
  }
}

function findIn(o: SceneObject, name: string, depth: number): SceneObject | null {
  if (o.name === name) return o;
  if (depth <= 0) return null;
  for (let i = 0; i < o.getChildrenCount(); i++) {
    const f = findIn(o.getChild(i), name, depth - 1);
    if (f) return f;
  }
  return null;
}

function findSceneObject(name: string): SceneObject | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const f = findIn(global.scene.getRootObject(i), name, 4);
    if (f) return f;
  }
  return null;
}
