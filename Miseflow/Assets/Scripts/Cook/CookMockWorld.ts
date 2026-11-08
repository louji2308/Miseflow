/**
 * CookMockWorld.ts  (Chef Director v6, W4)  *** DEV ONLY: never part of the shipped flow ***
 *
 * A throwaway CookWorld built from primitive MeshAcc shapes so CookRuntime / CookActions / CookStepCard can run in
 * Preview without CookStage. Attach to a temporary scene object (or call CookMockWorld.run from a test), set
 * `autoRun`. It hides the legacy StationsRoot (scale 0.0001) while it runs and restores it on stop / destroy.
 *   planName: "all" (synthetic plan exercising every action) | a PlanLibrary alias ("chicken 65", "chapathi")
 *   only:     run a single action of the synthetic plan (e.g. "DEEP_FRY", "ROLL_DOUGH")
 * StationPropsBuilder exports are only touched inside functions (import-cycle note in ToolGenerators.ts:12).
 */

import { MiseFlowEventBus, MiseFlowEventType } from "../MiseFlowEventBus";
import { CookPlan, CookStep } from "./CookPlanSchema";
import { CookEvents, CookWorld, EquipmentHandle, HeatLevel, ItemHandle, ToolHandle } from "./CookWorld";
import { MeshAcc, makePbrMaterial } from "../StationPropsBuilder";
import { lookupPlan } from "./PlanLibrary";
import { CookRuntime, CookRuntimeEvents } from "./CookRuntime";

const DEG = Math.PI / 180;

function ev(name: string): MiseFlowEventType {
  return name as unknown as MiseFlowEventType;
}

function emis(m: Material, r: number, g: number, b: number): void {
  try {
    (m.mainPass as any).Port_Emissive_N006 = new vec3(r, g, b);
  } catch (e) {
    // no emissive port
  }
}

function mat(r: number, g: number, b: number, metal: number = 0.1, rough: number = 0.45, glow: number = 0.08): Material {
  const m = makePbrMaterial(r, g, b, metal, rough);
  emis(m, r * glow, g * glow, b * glow);
  return m;
}

function meshObj(parent: SceneObject, name: string, acc: MeshAcc, m: Material, local: vec3 = vec3.zero()): SceneObject {
  const o = global.scene.createSceneObject(name);
  o.setParent(parent);
  o.getTransform().setLocalPosition(local);
  const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  rmv.mesh = acc.toMesh();
  rmv.mainMaterial = m;
  return o;
}

function findByName(o: SceneObject, name: string): SceneObject | null {
  if (o.name === name) return o;
  for (let i = 0; i < o.getChildrenCount(); i++) {
    const f = findByName(o.getChild(i), name);
    if (f) return f;
  }
  return null;
}

function findInScene(name: string): SceneObject | null {
  for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
    const f = findByName(global.scene.getRootObject(i), name);
    if (f) return f;
  }
  return null;
}

interface MockEq {
  h: EquipmentHandle;
  oil: SceneObject;
  oilMat: Material;
  fill: SceneObject;
  fillMat: Material;
  ring: SceneObject | null;
  ringMat: Material | null;
  steam: SceneObject[];
  oilLevel: number;
  bubbling: number;
  steamAmt: number;
  t: number;
}

const HEAT_RGB: { [h: string]: number[] } = { OFF: [0.35, 0.37, 0.42], LOW: [1.0, 0.55, 0.2], MED: [1.0, 0.42, 0.12], HIGH: [1.0, 0.3, 0.08] };

/** Primitive CookWorld for a plan (bench-local cm under `parent`). */
export function buildMockWorld(plan: CookPlan, parent: SceneObject, eqs: MockEq[]): CookWorld {
  const root = global.scene.createSceneObject("CookMockWorld_Root");
  root.setParent(parent);
  const equipment: { [id: string]: EquipmentHandle } = {};
  const tools: { [id: string]: ToolHandle } = {};
  const items: { [id: string]: ItemHandle } = {};
  const nEq = plan.equipment.length;
  let plate: EquipmentHandle | null = null;
  // equipment row across the bench
  for (let i = 0; i < nEq; i++) {
    const e = plan.equipment[i];
    const x = nEq <= 1 ? 0 : -15 + (30 * i) / (nEq - 1);
    const z = e.kind === "PLATE" ? 3 : -3;
    const o = global.scene.createSceneObject(`MockEq_${e.id}`);
    o.setParent(root);
    o.getTransform().setLocalPosition(new vec3(x, 0, z));
    const k = e.kind;
    let r = 3.4;
    let depth = 2.6;
    const acc = new MeshAcc();
    let m = mat(0.78, 0.8, 0.84, 0.6, 0.3, 0.1);
    if (k === "BOARD") {
      r = 4.2;
      depth = 0;
      acc.box(0, 0.4, 0, 4.6, 0.4, 3.4);
      m = mat(0.72, 0.5, 0.3, 0.0, 0.6, 0.1);
    } else if (k === "PLATE") {
      r = 4.4;
      depth = 0.25;
      acc.lathe([[0, 0], [3.8, 0], [4.8, 0.5], [4.9, 0.55], [3.9, 0.25], [0, 0.25]], 28);
      m = mat(0.9, 0.9, 0.88, 0.0, 0.5, 0.12);
    } else if (k === "TAWA") {
      r = 4.4;
      depth = 0.3;
      acc.lathe([[0, 0], [4.6, 0], [4.9, 0.5], [4.6, 0.55], [4.3, 0.3], [0, 0.3]], 28);
      m = mat(0.5, 0.5, 0.54, 0.5, 0.4, 0.12);
    } else {
      const deep = k === "POT" || k === "SAUCEPAN" || k === "HANDI" || k === "STEAMER";
      const wide = k === "KADAI" || k === "WOK" || k === "FRYER_PAN";
      const flat = k === "SKILLET";
      r = wide ? 4.4 : flat ? 3.4 : deep ? 3.2 : 3.4;
      depth = deep ? 4.6 : flat ? 1.0 : wide ? 3.0 : 2.6;
      acc.lathe([[0, 0], [r * 0.6, 0], [r * 0.95, depth * 0.45], [r * 1.12, depth], [r * 1.05, depth + 0.05], [r * 0.9, depth * 0.45], [r * 0.55, 0.25], [0, 0.25]], 28);
    }
    meshObj(o, `MockEq_${e.id}_Body`, acc, m);
    const floorY = k === "BOARD" ? 0.8 : 0.28;
    const rimY = k === "BOARD" ? 0.8 : depth;
    // oil + fill discs
    const disc = new MeshAcc();
    disc.disc(0, 0, 0, 1, 20, 0.05);
    const oilMat = mat(1.0, 0.8, 0.3, 0.2, 0.05, 0.25);
    const oil = meshObj(o, `MockEq_${e.id}_Oil`, disc, oilMat);
    oil.enabled = false;
    const fillMat = mat(0.9, 0.6, 0.3, 0.0, 0.3, 0.2);
    const fill = meshObj(o, `MockEq_${e.id}_Fill`, disc, fillMat);
    fill.enabled = false;
    let ring: SceneObject | null = null;
    let ringMat: Material | null = null;
    if (e.burner > 0) {
      const ra = new MeshAcc();
      ra.arc(0, -0.15, 0, r + 0.6, 0.5, 0, 360, 36);
      ringMat = mat(0.35, 0.37, 0.42, 0, 0.4, 0.3);
      ring = meshObj(o, `MockEq_${e.id}_Burner`, ra, ringMat);
    }
    const steam: SceneObject[] = [];
    const sa = new MeshAcc();
    sa.ellipsoid(0, 0, 0, 0.5, 0.5, 0.5, 8, 5);
    const sm = mat(0.92, 0.95, 1.0, 0, 0.9, 0.5);
    for (let s = 0; s < 6; s++) {
      const so = meshObj(o, `MockEq_${e.id}_Steam_${s}`, sa, sm);
      so.enabled = false;
      steam.push(so);
    }
    const ot = o.getTransform();
    const w2 = (lx: number, ly: number, lz: number) => ot.getWorldTransform().multiplyPoint(new vec3(lx, ly, lz));
    const me: MockEq = {
      h: null as any, oil, oilMat, fill, fillMat, ring, ringMat, steam, oilLevel: 0, bubbling: 0, steamAmt: 0, t: 0,
    };
    const h: EquipmentHandle = {
      id: e.id,
      kind: k,
      obj: o,
      radiusCm: r,
      rimWorld: () => w2(0, rimY, 0),
      floorWorld: () => w2(0, floorY, 0),
      setHeat: (lvl: HeatLevel) => {
        const c = HEAT_RGB[lvl] || HEAT_RGB.OFF;
        if (me.ringMat) {
          me.ringMat.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
          emis(me.ringMat, c[0] * (lvl === "OFF" ? 0.1 : 0.9), c[1] * (lvl === "OFF" ? 0.1 : 0.9), c[2] * (lvl === "OFF" ? 0.1 : 0.9));
        }
      },
      setOil: (lv: number, bub: number) => {
        me.oilLevel = Math.max(0, Math.min(1, lv));
        me.bubbling = Math.max(0, Math.min(1, bub));
      },
      setSteam: (a: number) => {
        me.steamAmt = Math.max(0, Math.min(1, a));
      },
      setFill: (lv: number, c: vec3) => {
        const l = Math.max(0, Math.min(1, lv));
        fill.enabled = l > 0.01;
        const y = floorY + Math.max(0.05, (rimY - floorY) * l * 0.9) + 0.02;
        const rr = r * (0.55 + 0.4 * l);
        fill.getTransform().setLocalPosition(new vec3(0, y, 0));
        fill.getTransform().setLocalScale(new vec3(rr, 1, rr));
        fillMat.mainPass.baseColor = new vec4(c.x, c.y, c.z, 1);
        emis(fillMat, c.x * 0.2, c.y * 0.2, c.z * 0.2);
      },
    };
    me.h = h;
    (me as any).floorY = floorY;
    (me as any).rimY = rimY;
    eqs.push(me);
    equipment[e.id] = h;
    if (e.kind === "PLATE" || e.id === plan.plateEquipmentId) plate = h;
  }
  if (!plate) plate = equipment[plan.equipment[nEq - 1].id];
  // tools: long axis local +X, tip at +X end (pin: centre)
  for (let i = 0; i < plan.tools.length; i++) {
    const t = plan.tools[i];
    const o = global.scene.createSceneObject(`MockTool_${t.id}`);
    o.setParent(root);
    const acc = new MeshAcc();
    let tip = new vec3(3, 0, 0);
    if (t.kind === "ROLLING_PIN") {
      acc.sweep([[-4, 0, 0], [4, 0, 0]], [0.45, 0.45], [0.45, 0.45], 10);
      acc.sweep([[-5.6, 0, 0], [-4, 0, 0]], [0.22, 0.22], [0.22, 0.22], 8);
      acc.sweep([[4, 0, 0], [5.6, 0, 0]], [0.22, 0.22], [0.22, 0.22], 8);
      tip = vec3.zero();
    } else if (t.kind === "KNIFE") {
      acc.box(1.5, 0.6, 0, 2.5, 0.6, 0.05);
      acc.box(-2.2, 0.4, 0, 1.3, 0.25, 0.25);
      tip = new vec3(2.5, 0, 0);
    } else if (t.kind === "SKIMMER" || t.kind === "SPATULA") {
      acc.sweep([[-4.5, 0.8, 0], [1.2, 0.2, 0]], [0.15, 0.15], [0.15, 0.15], 6);
      acc.ellipsoid(2.2, 0, 0, 1.2, 0.1, 1.0, 12, 3);
      tip = new vec3(2.2, 0, 0);
    } else {
      acc.sweep([[-4.5, 0.6, 0], [1.4, 0.3, 0]], [0.13, 0.13], [0.13, 0.13], 6);
      acc.ellipsoid(2.2, 0.2, 0, 0.8, 0.3, 0.55, 10, 4);
      tip = new vec3(2.2, 0.1, 0);
    }
    meshObj(o, `MockTool_${t.id}_Mesh`, acc, mat(0.85, 0.86, 0.9, 0.6, 0.25, 0.12));
    o.getTransform().setLocalPosition(new vec3(-10 + i * 9, 0.5, 9));
    tools[t.id] = { id: t.id, kind: t.kind, obj: o, restPos: o.getTransform().getWorldPosition(), restRot: o.getTransform().getWorldRotation(), tipLocal: tip };
  }
  // items along the back
  const nIt = plan.ingredients.length;
  for (let i = 0; i < nIt; i++) {
    const g = plan.ingredients[i];
    const c = g.colorRaw && g.colorRaw.length >= 3 ? g.colorRaw : [0.8, 0.8, 0.8];
    const m = mat(c[0], c[1], c[2], 0.0, 0.6, 0.1);
    const o = global.scene.createSceneObject(`MockItem_${g.id}`);
    o.setParent(root);
    const x = nIt <= 1 ? 0 : -17 + (34 * i) / (nIt - 1);
    o.getTransform().setLocalPosition(new vec3(x, 0, -11));
    const pieces: SceneObject[] = [];
    const role = g.role;
    if (role === "PROTEIN" || role === "VEG" || role === "GARNISH") {
      const n = role === "PROTEIN" ? 10 : role === "VEG" ? 4 : 5;
      for (let p = 0; p < n; p++) {
        const acc = new MeshAcc();
        const s = role === "PROTEIN" ? 0.55 + 0.2 * ((p * 37) % 7) / 7 : 0.4;
        if (role === "PROTEIN") acc.ellipsoid(0, s * 0.7, 0, s * 1.2, s * 0.75, s, 9, 5, p, 0.2, 3, 0.18);
        else if (role === "VEG") acc.ellipsoid(0, 0.25, 0, 1.4, 0.25, 0.28, 8, 4);
        else acc.ellipsoid(0, 0.08, 0, 0.6, 0.08, 0.3, 8, 3);
        const a = p * 2.4;
        const d = 0.5 + 0.35 * p;
        pieces.push(meshObj(o, `MockItem_${g.id}_P${p}`, acc, m, new vec3(Math.cos(a) * d * 0.6, 0, Math.sin(a) * d * 0.6)));
      }
    } else if (role === "DOUGH") {
      const acc = new MeshAcc();
      acc.ellipsoid(0, 1.0, 0, 1.2, 1.0, 1.2, 14, 8);
      meshObj(o, `MockItem_${g.id}_Ball`, acc, m);
    } else {
      const cup = new MeshAcc();
      cup.lathe([[0, 0], [0.9, 0], [1.1, 1.3], [1.0, 1.35], [0.8, 0.2], [0, 0.2]], 16);
      meshObj(o, `MockItem_${g.id}_Cup`, cup, mat(0.9, 0.9, 0.88, 0, 0.3, 0.1));
      const dome = new MeshAcc();
      dome.ellipsoid(0, 1.05, 0, 0.85, 0.3, 0.85, 12, 4);
      meshObj(o, `MockItem_${g.id}_Content`, dome, m);
    }
    const ot = o.getTransform();
    items[g.id] = {
      id: g.id,
      name: g.name,
      role: role,
      obj: o,
      pieces: pieces,
      homePos: ot.getWorldPosition(),
      paint: (col: vec3, rough: number, em: number) => {
        m.mainPass.baseColor = new vec4(col.x, col.y, col.z, 1);
        try {
          (m.mainPass as any).roughness = rough;
        } catch (e) {
          // ignore
        }
        emis(m, col.x * em, col.y * em, col.z * em);
      },
      setVisible: (on: boolean) => {
        o.enabled = on;
      },
      setScale: (s: vec3) => ot.setLocalScale(s),
    };
  }
  const pl = plate as EquipmentHandle;
  return {
    plan: plan,
    root: root,
    equipment: equipment,
    tools: tools,
    items: items,
    plate: pl,
    platingSpot: () => pl.floorWorld().add(new vec3(0, 0.05, 0)),
    dispose: () => {
      if (!isNull(root)) root.destroy();
    },
  };
}

function step(id: string, action: string, eq: string, tool: string, ids: string[], after: string[], extra: Partial<CookStep> = {}): CookStep {
  const s: CookStep = {
    id: id, action: action, title: action.replace("_", " ").toLowerCase(), whatWhy: `Mock step exercising ${action}.`, equipmentId: eq, toolId: tool,
    ingredientIds: ids, fromId: "", toId: "", durationSec: 0, heat: "OFF", count: 0, after: after,
  };
  for (const k in extra) (s as any)[k] = (extra as any)[k];
  return s;
}

/** Synthetic plan that runs every action at least once (with a parallel branch). */
export function mockPlanAllActions(): CookPlan {
  return {
    found: true, notFoundMessage: "", dishTitle: "Mock: every action", cuisineTag: "dev",
    equipment: [
      { id: "board", kind: "BOARD", role: "board", burner: 0 },
      { id: "bowl", kind: "BOWL", role: "bowl", burner: 0 },
      { id: "kadai", kind: "KADAI", role: "kadai", burner: 1 },
      { id: "pan", kind: "SKILLET", role: "pan", burner: 2 },
      { id: "pot", kind: "POT", role: "pot", burner: 3 },
      { id: "tawa", kind: "TAWA", role: "tawa", burner: 0 },
      { id: "plate", kind: "PLATE", role: "plate", burner: 0 },
    ],
    tools: [
      { id: "knife", kind: "KNIFE" }, { id: "spoon", kind: "SPOON" }, { id: "skimmer", kind: "SKIMMER" }, { id: "spatula", kind: "SPATULA" },
      { id: "pin", kind: "ROLLING_PIN" }, { id: "whisk", kind: "WHISK" },
    ],
    ingredients: [
      { id: "chicken", name: "chicken", role: "PROTEIN", form: "chunks", catalogueHint: 0, colorRaw: [0.95, 0.78, 0.7], colorDone: [0.88, 0.38, 0.12], amount: "" },
      { id: "chilli", name: "green chilli", role: "VEG", form: "slit", catalogueHint: 0, colorRaw: [0.3, 0.75, 0.25], colorDone: [0.35, 0.6, 0.2], amount: "" },
      { id: "spice", name: "spice", role: "SPICE", form: "powder", catalogueHint: 0, colorRaw: [0.85, 0.2, 0.1], colorDone: [0.8, 0.3, 0.1], amount: "" },
      { id: "curd", name: "curd", role: "DAIRY", form: "curd", catalogueHint: 0, colorRaw: [0.97, 0.96, 0.9], colorDone: [0.95, 0.9, 0.8], amount: "" },
      { id: "flour", name: "flour", role: "FLOUR", form: "flour", catalogueHint: 0, colorRaw: [0.97, 0.95, 0.88], colorDone: [0.95, 0.85, 0.6], amount: "" },
      { id: "oil", name: "oil", role: "OIL", form: "oil", catalogueHint: 0, colorRaw: [0.95, 0.8, 0.25], colorDone: [0.9, 0.65, 0.15], amount: "" },
      { id: "water", name: "water", role: "LIQUID", form: "water", catalogueHint: 0, colorRaw: [0.6, 0.8, 0.95], colorDone: [0.6, 0.8, 0.95], amount: "" },
      { id: "leaves", name: "curry leaves", role: "GARNISH", form: "leaves", catalogueHint: 0, colorRaw: [0.3, 0.7, 0.3], colorDone: [0.25, 0.6, 0.2], amount: "" },
      { id: "dough", name: "dough", role: "DOUGH", form: "ball", catalogueHint: 0, colorRaw: [0.92, 0.8, 0.58], colorDone: [0.85, 0.6, 0.3], amount: "" },
    ],
    steps: [
      step("cut", "CUT", "board", "knife", ["chilli"], []),
      step("marinate", "MARINATE", "bowl", "spoon", ["chicken", "spice", "curd"], ["cut"]),
      step("coat", "COAT", "bowl", "spoon", ["chicken", "flour"], ["marinate"]),
      step("heat_oil", "HEAT_OIL", "kadai", "", ["oil"], ["cut"], { heat: "HIGH" }),
      step("deep_fry", "DEEP_FRY", "kadai", "skimmer", ["chicken"], ["coat", "heat_oil"], { heat: "HIGH", count: 2 }),
      step("temper", "TEMPER", "pan", "spoon", ["leaves", "chilli"], ["heat_oil"], { heat: "MED" }),
      step("saute", "SAUTE_TOSS", "kadai", "spatula", ["chicken", "leaves", "chilli"], ["deep_fry", "temper"], { heat: "HIGH", count: 2 }),
      step("shallow", "SHALLOW_FRY", "pan", "spatula", ["chilli"], ["saute"], { heat: "MED" }),
      step("boil", "BOIL", "pot", "spoon", ["water"], ["cut"], { heat: "HIGH" }),
      step("simmer", "SIMMER", "pot", "spoon", ["spice"], ["boil"], { heat: "LOW" }),
      step("whisk", "WHISK", "bowl", "whisk", ["curd"], ["saute"]),
      step("pour", "POUR", "pot", "", [], ["simmer", "whisk"], { fromId: "pot", toId: "bowl" }),
      step("steam", "STEAM_DUM", "pot", "spoon", ["water"], ["pour"], { heat: "LOW" }),
      step("season", "SEASON", "kadai", "", ["spice"], ["shallow"]),
      step("mix", "MIX", "bowl", "spoon", ["flour", "water"], ["pour"]),
      step("knead", "KNEAD", "board", "", ["dough"], ["mix"]),
      step("rest", "REST", "board", "", ["dough"], ["knead"]),
      step("roll", "ROLL_DOUGH", "board", "pin", ["dough"], ["rest"], { count: 4 }),
      step("cook_flat", "COOK_FLAT", "tawa", "", ["dough"], ["roll"], { heat: "MED" }),
      step("flip", "FLIP", "tawa", "spatula", ["dough"], ["cook_flat"]),
      step("plate", "PLATE", "plate", "spatula", ["chicken", "dough"], ["flip", "season", "steam"]),
      step("garnish", "GARNISH", "plate", "", ["leaves"], ["plate"]),
      step("unknown", "DANCE", "pot", "spoon", [], ["garnish"], { durationSec: 2 }),
    ],
    plateEquipmentId: "plate",
    garnishIds: ["leaves"],
  };
}

/** Synthetic plan reduced to one action (its usual prerequisites become instant-free: the action runs alone). */
export function mockPlanOnly(action: string): CookPlan {
  const p = mockPlanAllActions();
  const s = p.steps.filter((x) => x.action === action.toUpperCase())[0];
  p.steps = s ? [s] : [p.steps[0]];
  p.steps[0].after = [];
  p.dishTitle = `Mock: ${p.steps[0].action}`;
  return p;
}

@component
export class CookMockWorld extends BaseScriptComponent {
  @input
  autoRun: boolean = false;

  @input
  planName: string = "all";

  @input
  only: string = "";

  @input
  speed: number = 2;

  private static instance: CookMockWorld | null = null;
  private world: CookWorld | null = null;
  private eqs: MockEq[] = [];
  private legacy: SceneObject | null = null;
  private legacyScale: vec3 | null = null;

  public static getInstance(): CookMockWorld | null {
    return CookMockWorld.instance;
  }

  onAwake(): void {
    CookMockWorld.instance = this;
    this.createEvent("OnStartEvent").bind(() => {
      if (this.autoRun) this.run(this.only ? `only:${this.only}` : this.planName, this.speed);
    });
    this.createEvent("UpdateEvent").bind(() => this.tick(getDeltaTime()));
    this.createEvent("OnDestroyEvent").bind(() => {
      this.stop();
      if (CookMockWorld.instance === this) CookMockWorld.instance = null;
    });
  }

  /** "all" | "only:ACTION" | PlanLibrary alias. AUTO on, at `speed`. */
  public run(name: string, speed: number = 2): void {
    this.stop();
    let plan: CookPlan | null = null;
    if (name.indexOf("only:") === 0) plan = mockPlanOnly(name.substring(5));
    else if (name === "all" || name === "") plan = mockPlanAllActions();
    else plan = lookupPlan(name);
    if (!plan) {
      print(`[CookMockWorld] no plan for "${name}"`);
      return;
    }
    const bench = global.scene.createSceneObject("CookMockWorld_Bench");
    bench.setParent(this.getSceneObject());
    this.legacy = findInScene("StationsRoot");
    if (this.legacy) {
      const t = this.legacy.getTransform();
      bench.getTransform().setWorldPosition(t.getWorldPosition());
      bench.getTransform().setWorldRotation(t.getWorldRotation());
      this.legacyScale = t.getLocalScale();
      t.setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    } else {
      bench.getTransform().setWorldPosition(new vec3(0, -6, -62));
    }
    this.eqs = [];
    this.world = buildMockWorld(plan, bench, this.eqs);
    const rt = CookRuntime.getInstance();
    if (rt) rt.setSpeed(speed);
    const bus = MiseFlowEventBus.getInstance();
    bus.emit(ev(CookEvents.WORLD_READY), { world: this.world });
    bus.emit(ev(CookRuntimeEvents.AUTO), { on: true });
    print(`[CookMockWorld] running "${plan.dishTitle}" (${plan.steps.length} steps) at ${speed}x`);
  }

  public stop(): void {
    if (this.world) {
      MiseFlowEventBus.getInstance().emit(ev(CookEvents.EXIT), {});
      const bench = this.world.root.hasParent() ? this.world.root.getParent() : null;
      this.world.dispose();
      if (bench && !isNull(bench)) bench.destroy();
      this.world = null;
    }
    this.eqs = [];
    if (this.legacy && !isNull(this.legacy) && this.legacyScale) this.legacy.getTransform().setLocalScale(this.legacyScale);
    this.legacy = null;
    this.legacyScale = null;
  }

  public getWorld(): CookWorld | null {
    return this.world;
  }

  private tick(dt: number): void {
    for (const e of this.eqs) {
      e.t += dt;
      const fy = (e as any).floorY as number;
      const ry = (e as any).rimY as number;
      if (isNull(e.oil)) continue;
      e.oil.enabled = e.oilLevel > 0.01;
      if (e.oil.enabled) {
        const y = fy + Math.max(0.05, (ry - fy) * e.oilLevel * 0.9);
        const r = e.h.radiusCm * (0.6 + 0.35 * e.oilLevel) * (1 + 0.02 * e.bubbling * Math.sin(e.t * 40));
        e.oil.getTransform().setLocalPosition(new vec3(0, y + 0.03 * e.bubbling * Math.sin(e.t * 31), 0));
        e.oil.getTransform().setLocalScale(new vec3(r, 1, r));
        const g = 0.25 + 0.5 * e.bubbling * (0.5 + 0.5 * Math.sin(e.t * 23));
        emis(e.oilMat, g, g * 0.75, g * 0.3);
      }
      for (let i = 0; i < e.steam.length; i++) {
        const s = e.steam[i];
        const on = e.steamAmt > i / e.steam.length + 0.01;
        s.enabled = on;
        if (!on) continue;
        const u = (e.t * 0.5 + i / e.steam.length) % 1;
        s.getTransform().setLocalPosition(new vec3(Math.sin(i * 2.1 + e.t) * 1.2, ry + 1 + u * 6, Math.cos(i * 1.7) * 1.0));
        const sc = (0.5 + u) * (1 - u) * 2 * e.steamAmt;
        s.getTransform().setLocalScale(new vec3(sc, sc, sc));
      }
    }
    void DEG;
  }
}
