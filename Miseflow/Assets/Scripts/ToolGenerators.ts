/**
 * ToolGenerators.ts  (v5 A4b secondary vessels / tools)
 * Procedural low-poly meshes (MeshAcc, additive-display colours, <= 500 tris per mesh) + the controller that shows them:
 *   #305 pasta / ramen stockpot (+ boiling water, steam)  -> StockpotProp   (child of SaucepotPot, in place of the saucier)
 *   #306 strainer basket                                  -> StrainerBasket (lower / liftOut(onDone) / getObject / holdStarch)
 *   #307 cast tawa / griddle                              -> buildTawa      (SkilletStation, in place of the skillet; pan floor registered)
 *   #322 chef knife, #323 vegetable cleaver               -> blade-mesh swap on the existing KnifeBlade (santoku #321 stays default)
 *   #326 spice pinch ramekins (3, powders)                -> buildRamekins  (prep side, beside the prep bowl)
 *   #333 wok chuan, #334 chopsticks, #335 tongs           -> ToolProp  (liftSwirl / setHeld), rest at SLOT_TERTIARY_TOOL_REST
 *   #336 balloon whisk                                    -> WhiskProp (whiskEmulsion, hooks WHISK_REQUESTED), rest beside the ladle
 * #304 saucier / #325 prep bowl keep their existing meshes (aliases only). Dish 01 never builds any of this.
 * This module is imported (indirectly) by StationPropsBuilder: nothing here may touch imported values at load time.
 */
import { MeshAcc, makePbrMaterial, makeTexturedPbr, SteamPlume, StationPropsBuilder } from "./StationPropsBuilder";
import { registerPanFloor } from "./ProteinGenerators";
import { getSlot } from "./AI/SpatialSlotAllocator";
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { UniversalDishBlueprint } from "./AI/UniversalDishSchema";
import type { HeroWareController } from "./VesselGenerators";

const TEX_CAST_IRON = requireAsset("../Textures/Tex_CastIron.png") as Texture;
const DEG = Math.PI / 180;
const IDLE = "_Idle";

/** Tri counts of the last built meshes (summarised in the A4b report). */
export const TOOL_TRIS: { [k: string]: number } = {};

// ───────────────────────────── materials (lazy) ─────────────────────────────

const matCache: { [k: string]: Material } = {};

function glow(m: Material, r: number, g: number, b: number): Material {
  try {
    (m.mainPass as any).Port_Emissive_N006 = new vec3(r, g, b);
  } catch (_e) {
    // shader without the emissive port
  }
  return m;
}

function mat(key: string): Material {
  if (matCache[key]) return matCache[key];
  let m: Material;
  switch (key) {
    case "steel": m = glow(makePbrMaterial(0.86, 0.88, 0.92, 0.7, 0.26), 0.09, 0.09, 0.1); break;
    case "chrome": m = makePbrMaterial(0.93, 0.94, 0.96, 0.62, 0.17); break;
    case "water": m = glow(makePbrMaterial(0.40, 0.70, 0.92, 0.0, 0.08), 0.05, 0.13, 0.2); break;
    case "bubble": m = glow(makePbrMaterial(0.88, 0.96, 1.0, 0.0, 0.1), 0.12, 0.14, 0.16); break;
    case "iron": m = glow(makeTexturedPbr(TEX_CAST_IRON, 0.62, 0.38, 1.55, 1.5, 1.45), 0.09, 0.085, 0.08); break;
    case "wood": m = makePbrMaterial(0.62, 0.40, 0.22, 0.02, 0.55); break;
    case "bamboo": m = makePbrMaterial(0.90, 0.72, 0.40, 0.0, 0.5); break;
    case "bambooDark": m = makePbrMaterial(0.70, 0.48, 0.24, 0.0, 0.5); break;
    case "ramekin": m = makePbrMaterial(0.93, 0.91, 0.86, 0.0, 0.2); break;
    case "turmeric": m = glow(makePbrMaterial(0.96, 0.72, 0.0, 0.0, 0.85), 0.16, 0.11, 0.0); break; // #F5B700
    case "kashmiri": m = glow(makePbrMaterial(0.79, 0.10, 0.07, 0.0, 0.85), 0.1, 0.01, 0.01); break; // #C91A12
    case "cumin": m = glow(makePbrMaterial(0.43, 0.28, 0.13, 0.0, 0.85), 0.07, 0.045, 0.02); break; // #6E4720
    default: m = makePbrMaterial(0.8, 0.8, 0.8, 0.2, 0.4);
  }
  matCache[key] = m;
  return m;
}

/** A fading ring material (alpha through baseColor, like the steam wisps). */
function rippleMat(): Material {
  const m = makePbrMaterial(0.86, 0.95, 1.0, 0.0, 0.1);
  m.mainPass.blendMode = BlendMode.Normal;
  m.mainPass.depthWrite = false;
  m.mainPass.twoSided = true;
  glow(m, 0.12, 0.15, 0.17);
  m.mainPass.baseColor = new vec4(0.86, 0.95, 1.0, 0);
  return m;
}

function setRmv(o: SceneObject, acc: MeshAcc, matKey: string, triKey: string): void {
  const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  rmv.mesh = acc.toMesh();
  rmv.mainMaterial = mat(matKey);
  TOOL_TRIS[triKey] = (TOOL_TRIS[triKey] || 0) + acc.triCount();
}

function addMesh(parent: SceneObject, name: string, acc: MeshAcc, matKey: string, triKey: string): SceneObject {
  const o = global.scene.createSceneObject(name);
  o.setParent(parent);
  setRmv(o, acc, matKey, triKey);
  return o;
}

function smooth(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
}

function findByName(root: SceneObject, name: string): SceneObject | null {
  if (root.name === name) return root;
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const f = findByName(root.getChild(i), name);
    if (f) return f;
  }
  return null;
}

// ───────────────────────────── #305 pasta / ramen stockpot ─────────────────────────────

/** Water surface height (pot-local, SaucepotPot frame). */
export const POT_WATER_Y = 5.0;
/** Inner wall [y, r] for the saucier fill discs (StationPropsBuilder.setPotInnerProfile). */
export const STOCK_INNER: [number, number][] = [[0.46, 0.0], [0.95, 4.48], [6.4, 4.6], [6.6, 4.6]];
// tall straight-walled stainless pot (heightScale 1.35 vs the saucier): outer wall up to a rolled lip, down the inner wall
const STOCK_PROFILE: [number, number][] = [
  [0.0, 0.0], [4.0, 0.03], [4.72, 0.5], [4.76, 6.4], [5.0, 6.95], [4.82, 7.02], [4.6, 6.6], [4.48, 0.95], [0.0, 0.46],
];
const RING_COUNT = 3;
const BUBBLE_COUNT = 7;

export class StockpotProp {
  readonly root: SceneObject;
  private rings: { o: SceneObject; m: Material }[];
  private bubbles: { o: SceneObject; ph: number; a0: number }[];
  private steam: SteamPlume;
  private live: boolean = false;
  private boiling: boolean = true;
  private t: number = 0;

  constructor(root: SceneObject, rings: { o: SceneObject; m: Material }[], bubbles: { o: SceneObject; ph: number; a0: number }[], steam: SteamPlume) {
    this.root = root;
    this.rings = rings;
    this.bubbles = bubbles;
    this.steam = steam;
  }

  getObject(): SceneObject {
    return this.root;
  }

  isLive(): boolean {
    return this.live;
  }

  setLive(on: boolean): void {
    this.live = on;
    if (!on) this.steam.setNow(0);
  }

  /** Rolling boil + steam on/off. */
  setBoiling(on: boolean): void {
    this.boiling = on;
  }

  update(dt: number): void {
    if (!this.live) return;
    this.t += dt;
    const boil = this.boiling ? 1 : 0;
    for (let i = 0; i < this.rings.length; i++) {
      const k = (this.t * 0.45 + i / RING_COUNT) % 1;
      const s = 0.35 + k * 4.05;
      const r = this.rings[i];
      r.o.getTransform().setLocalScale(new vec3(s, 1, s));
      r.m.mainPass.baseColor = new vec4(0.86, 0.95, 1.0, Math.sin(k * Math.PI) * 0.75 * boil);
    }
    for (const b of this.bubbles) {
      const k = (this.t * 0.6 + b.ph) % 1;
      const rad = 0.5 + 3.3 * k;
      const ang = b.a0 + this.t * 0.25;
      const sc = boil * (k < 0.85 ? 0.45 + k * 0.9 : Math.max(0.01, ((1 - k) / 0.15) * 1.2));
      b.o.getTransform().setLocalPosition(new vec3(Math.cos(ang) * rad, POT_WATER_Y + 0.04 + 0.12 * sc, Math.sin(ang) * rad));
      b.o.getTransform().setLocalScale(new vec3(Math.max(0.01, sc), Math.max(0.01, sc), Math.max(0.01, sc)));
    }
    this.steam.target = boil;
    this.steam.update(dt);
  }
}

/** Builds the stockpot (child of the saucier pot, hidden, idle name): body 448 tris, D-handles, water, ripples, bubbles, steam. */
export function buildStockpot(potObj: SceneObject): StockpotProp {
  for (const k of ["305_body", "305_ears", "305_water"]) TOOL_TRIS[k] = 0;
  const root = global.scene.createSceneObject("PastaStockpot" + IDLE);
  root.setParent(potObj);
  const body = new MeshAcc();
  body.lathe(STOCK_PROFILE, 28);
  setRmv(root, body, "steel", "305_body");

  // two riveted side ears on the +-Z axis (the basket handle leaves toward rear-left, the saucier handle is rear-right)
  const ears = new MeshAcc();
  for (const sg of [1, -1]) {
    const c: [number, number, number][] = [
      [0, 6.3, sg * 4.78], [0, 6.55, sg * 6.0], [0, 6.0, sg * 6.9], [0, 5.3, sg * 6.9], [0, 4.9, sg * 6.0], [0, 5.1, sg * 4.76],
    ];
    ears.sweep(c, c.map(() => 0.3), c.map(() => 0.22), 6, true);
  }
  addMesh(root, "StockpotEars", ears, "steel", "305_ears");

  // water: a bright disc just under the rim of the contents + three expanding ripple rings + rolling bubbles
  const water = global.scene.createSceneObject("StockpotWater");
  water.setParent(root);
  water.getTransform().setLocalPosition(new vec3(0, POT_WATER_Y, 0));
  const wa = new MeshAcc();
  wa.disc(0, 0, 0, 4.5, 28, 0.04);
  setRmv(water, wa, "water", "305_water");

  const ringAcc = new MeshAcc();
  ringAcc.torus(0, 0, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 1.0, 0.07, 0.03, 20, 3);
  const ringMesh = ringAcc.toMesh();
  TOOL_TRIS["305_ripple"] = ringAcc.triCount();
  const rings: { o: SceneObject; m: Material }[] = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const o = global.scene.createSceneObject("StockpotRipple_" + i);
    o.setParent(root);
    o.getTransform().setLocalPosition(new vec3(0, POT_WATER_Y + 0.06, 0));
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = ringMesh;
    const m = rippleMat();
    rmv.mainMaterial = m;
    rings.push({ o: o, m: m });
  }
  const bubAcc = new MeshAcc();
  bubAcc.ellipsoid(0, 0, 0, 0.28, 0.2, 0.28, 6, 4);
  const bubMesh = bubAcc.toMesh();
  TOOL_TRIS["305_bubble"] = bubAcc.triCount();
  const bubbles: { o: SceneObject; ph: number; a0: number }[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const o = global.scene.createSceneObject("StockpotBubble_" + i);
    o.setParent(root);
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = bubMesh;
    rmv.mainMaterial = mat("bubble");
    bubbles.push({ o: o, ph: i / BUBBLE_COUNT, a0: i * 2.399 });
  }
  const steam = new SteamPlume(root, "StockpotSteamRoot", "StockpotSteam", {
    count: 4, spread: 1.8, baseY: 5.6, rise: 6.5, size0: 2.6, size1: 3.0, alpha: 0.8,
    speed: 0.32, sway: 0.6, z: 0.3, fadeIn: 0.6, fadeOut: 1.2,
  });
  root.enabled = false;
  print(`[ToolGen] #305 stockpot: body ${TOOL_TRIS["305_body"]} tris, ears ${TOOL_TRIS["305_ears"]}, water ${TOOL_TRIS["305_water"]}, ripple ${TOOL_TRIS["305_ripple"]}x${RING_COUNT}, bubble ${TOOL_TRIS["305_bubble"]}x${BUBBLE_COUNT}`);
  return new StockpotProp(root, rings, bubbles, steam);
}

// ───────────────────────────── #306 strainer basket ─────────────────────────────

const BASKET_DOWN_Y = 0.9;
const BASKET_UP_Y = 7.9; // basket floor clears the pot lip (7.0)
const BASKET_H = 5.4;
const LIFT_SEC = 1.2;
const DRAIN_SEC = 1.0;
const LOWER_SEC = 0.9;
const DRIP_COUNT = 6;

/** #306 wire strainer basket on a long handle, lowered into the stockpot; liftOut() raises it, dripping. */
export class StrainerBasket {
  private obj: SceneObject;
  private hold: SceneObject;
  private stockRoot: SceneObject;
  private drips: { o: SceneObject; ph: number; x: number; z: number }[] = [];
  private state: "down" | "lifting" | "draining" | "up" | "lowering" = "down";
  private t: number = 0;
  private fromY: number = BASKET_DOWN_Y;
  private onDone: (() => void) | null = null;
  private dripLeft: number = 0;
  private dripT: number = 0;

  constructor(obj: SceneObject, hold: SceneObject, stockRoot: SceneObject, drips: { o: SceneObject; ph: number; x: number; z: number }[]) {
    this.obj = obj;
    this.hold = hold;
    this.stockRoot = stockRoot;
    this.drips = drips;
    this.snap(false);
  }

  getObject(): SceneObject {
    return this.obj;
  }

  /** Child node (basket frame) a starch prop sits in; it rides the basket up and down. */
  getHoldNode(): SceneObject {
    return this.hold;
  }

  isLifted(): boolean {
    return this.state === "up" || this.state === "draining" || this.state === "lifting";
  }

  isBusy(): boolean {
    return this.state === "lifting" || this.state === "draining" || this.state === "lowering";
  }

  /** Seat the basket in the water (false) or hold it lifted (true) at once. */
  snap(lifted: boolean): void {
    this.state = lifted ? "up" : "down";
    this.onDone = null;
    this.dripLeft = 0;
    this.setPose(lifted ? BASKET_UP_Y : BASKET_DOWN_Y, 0);
    for (const d of this.drips) d.o.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001));
  }

  /** Lower the basket into the boiling water. */
  lower(onDone?: () => void): void {
    if (this.state === "down" || this.state === "lowering") {
      if (onDone && this.state === "down") onDone();
      return;
    }
    this.fromY = this.obj.getTransform().getLocalPosition().y;
    this.t = 0;
    this.state = "lowering";
    this.onDone = onDone || null;
  }

  /** Lift the boiled starch out of the water; it drips, then onDone() fires with the basket held up. */
  liftOut(onDone?: () => void): void {
    if (this.state === "up") {
      if (onDone) onDone();
      return;
    }
    if (this.state === "lifting" || this.state === "draining") {
      if (onDone) this.onDone = onDone;
      return;
    }
    this.fromY = this.obj.getTransform().getLocalPosition().y;
    this.t = 0;
    this.state = "lifting";
    this.onDone = onDone || null;
    this.dripLeft = 3.2;
  }

  /** Put a starch prop (A2 StarchProp root) into the basket: tray hidden, noodles/pasta sit in the water. null = nothing. */
  holdStarch(o: SceneObject | null): void {
    if (!o || isNull(o)) return;
    o.setParent(this.hold);
    const tr = o.getTransform();
    tr.setLocalPosition(vec3.zero());
    tr.setLocalRotation(quat.quatIdentity());
    const tray = findByName(o, "StarchTray");
    if (tray) tray.enabled = false;
  }

  private setPose(y: number, tilt: number): void {
    const tr = this.obj.getTransform();
    tr.setLocalPosition(new vec3(0, y, 0));
    tr.setLocalRotation(quat.angleAxis(tilt * DEG, vec3.forward()));
  }

  update(dt: number): void {
    if (!this.obj.isEnabledInHierarchy) return;
    this.t += dt;
    if (this.state === "lifting") {
      const k = this.t / LIFT_SEC;
      this.setPose(this.fromY + (BASKET_UP_Y - this.fromY) * smooth(k), 0);
      if (k >= 1) {
        this.state = "draining";
        this.t = 0;
      }
    } else if (this.state === "draining") {
      this.setPose(BASKET_UP_Y + 0.15 * Math.sin(this.t * 5), 3.5 * Math.sin(this.t * 3.1));
      if (this.t >= DRAIN_SEC) {
        this.state = "up";
        this.setPose(BASKET_UP_Y, 0);
        const cb = this.onDone;
        this.onDone = null;
        if (cb) cb();
      }
    } else if (this.state === "lowering") {
      const k = this.t / LOWER_SEC;
      this.setPose(this.fromY + (BASKET_DOWN_Y - this.fromY) * smooth(k), 0);
      if (k >= 1) {
        this.state = "down";
        this.setPose(BASKET_DOWN_Y, 0);
        const cb = this.onDone;
        this.onDone = null;
        if (cb) cb();
      }
    }
    // water drips fall from the basket floor back into the pot while it hangs above the water
    if (this.dripLeft > 0 && this.state !== "down" && this.state !== "lowering") {
      this.dripLeft -= dt;
      this.dripT += dt;
      const y0 = this.obj.getTransform().getLocalPosition().y;
      for (const d of this.drips) {
        const k = (this.dripT * 1.3 + d.ph) % 1;
        const y = y0 - (y0 - POT_WATER_Y) * k * k;
        const on = y0 > POT_WATER_Y + 0.6 ? 1 : 0.001;
        d.o.getTransform().setLocalPosition(new vec3(d.x, y, d.z));
        d.o.getTransform().setLocalScale(new vec3(on, on, on));
      }
      if (this.dripLeft <= 0) for (const d of this.drips) d.o.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001));
    }
  }
}

/** Builds the basket (child of the stockpot root, hidden with it): wire rods + hoops (464 tris), long handle with a wooden grip. */
export function buildBasket(stockRoot: SceneObject): StrainerBasket {
  for (const k of ["306_basket", "306_handle"]) TOOL_TRIS[k] = 0;
  const obj = global.scene.createSceneObject("StrainerBasketProp");
  obj.setParent(stockRoot);
  const a = new MeshAcc();
  const rb = 3.1, rt = 3.75;
  for (let i = 0; i < 12; i++) {
    const p = (i / 12) * Math.PI * 2;
    const c: [number, number, number][] = [[Math.cos(p) * rb, 0.05, Math.sin(p) * rb], [Math.cos(p) * rt, BASKET_H, Math.sin(p) * rt]];
    a.sweep(c, [0.07, 0.07], [0.07, 0.07], 4, true);
  }
  a.torus(0, BASKET_H, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], rt, 0.12, 0.1, 18, 4);
  a.torus(0, BASKET_H * 0.5, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 3.42, 0.07, 0.06, 16, 3);
  const bar1: [number, number, number][] = [[-rb, 0.06, 0], [rb, 0.06, 0]];
  const bar2: [number, number, number][] = [[0, 0.06, -rb], [0, 0.06, rb]];
  a.sweep(bar1, [0.08, 0.08], [0.08, 0.08], 4, true);
  a.sweep(bar2, [0.08, 0.08], [0.08, 0.08], 4, true);
  addMesh(obj, "StrainerBasketWire", a, "chrome", "306_basket");

  // long handle leaving the rim toward rear-left (195 deg), rising over the pot lip, wooden grip at the end
  const d = [Math.cos(195 * DEG), 0, Math.sin(195 * DEG)];
  const P = (r: number, y: number): [number, number, number] => [d[0] * r, y, d[2] * r];
  const ha = new MeshAcc();
  const steel = [P(3.7, 5.6), P(5.2, 6.5), P(7.6, 7.2), P(9.0, 7.6)];
  ha.sweep(steel, [0.24, 0.22, 0.2, 0.2], [0.13, 0.13, 0.12, 0.12], 8, true);
  addMesh(obj, "StrainerBasketHandle", ha, "chrome", "306_handle");
  const ga = new MeshAcc();
  const grip = [P(8.8, 7.55), P(10.2, 7.85), P(11.6, 8.1)];
  ga.sweep(grip, [0.4, 0.44, 0.4], [0.36, 0.4, 0.36], 8, true);
  addMesh(obj, "StrainerBasketGrip", ga, "wood", "306_handle");

  const hold = global.scene.createSceneObject("BasketStarchHold");
  hold.setParent(obj);
  hold.getTransform().setLocalPosition(new vec3(0, POT_WATER_Y - BASKET_DOWN_Y - 0.15, 0));
  hold.getTransform().setLocalScale(new vec3(1.5, 1.5, 1.5));

  const dripAcc = new MeshAcc();
  dripAcc.ellipsoid(0, 0, 0, 0.12, 0.2, 0.12, 5, 3);
  const dripMesh = dripAcc.toMesh();
  const drips: { o: SceneObject; ph: number; x: number; z: number }[] = [];
  for (let i = 0; i < DRIP_COUNT; i++) {
    const o = global.scene.createSceneObject("BasketDrip_" + i);
    o.setParent(stockRoot);
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = dripMesh;
    rmv.mainMaterial = mat("bubble");
    o.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001));
    const ang = i * 2.1;
    drips.push({ o: o, ph: i / DRIP_COUNT, x: Math.cos(ang) * 2.2, z: Math.sin(ang) * 2.2 });
  }
  print(`[ToolGen] #306 strainer basket: wire ${TOOL_TRIS["306_basket"]} tris, handle+grip ${TOOL_TRIS["306_handle"]}`);
  return new StrainerBasket(obj, hold, stockRoot, drips);
}

// ───────────────────────────── #307 tawa / griddle ─────────────────────────────

export const TAWA_FLOOR = { y: 0.32, r: 7.4, curve: 0 };
export const TAWA_YAW = -66 * DEG; // same yaw as the skillet / wok
const TAWA_PROFILE: [number, number][] = [
  [0.0, 0.0], [8.4, 0.02], [9.1, 0.18], [9.45, 0.62], [9.25, 0.68], [8.95, 0.4], [8.2, 0.3], [0.0, 0.3],
];

/** Builds the tawa under the skillet station (hidden, idle name): flat low-rim cast-iron disc, flat handle, helper loop. */
export function buildTawa(parent: SceneObject): SceneObject {
  for (const k of ["307_body", "307_handle", "307_loop"]) TOOL_TRIS[k] = 0;
  registerPanFloor("TawaPan", TAWA_FLOOR);
  const root = global.scene.createSceneObject("TawaPan" + IDLE);
  root.setParent(parent);
  root.getTransform().setLocalRotation(quat.fromEulerAngles(0, TAWA_YAW, 0));
  const body = new MeshAcc();
  body.lathe(TAWA_PROFILE, 32);
  setRmv(root, body, "iron", "307_body");

  const d = [Math.cos(168 * DEG), 0, Math.sin(168 * DEG)];
  const P = (r: number, y: number): [number, number, number] => [d[0] * r, y, d[2] * r];
  const ha = new MeshAcc();
  const iron = [P(9.1, 0.42), P(11.2, 0.46), P(13.2, 0.5)];
  ha.sweep(iron, [0.62, 0.58, 0.55], [0.2, 0.2, 0.2], 8, true);
  addMesh(root, "TawaHandle", ha, "iron", "307_handle");
  const wa = new MeshAcc();
  const sleeve = [P(12.9, 0.52), P(15.4, 0.56), P(17.8, 0.6)];
  wa.sweep(sleeve, [0.6, 0.62, 0.56], [0.42, 0.44, 0.4], 8, true);
  addMesh(root, "TawaHandleGrip", wa, "wood", "307_handle");
  // helper loop opposite the handle
  const e = [Math.cos(348 * DEG), 0, Math.sin(348 * DEG)];
  const s = [-e[2], 0, e[0]];
  const L = (rad: number, lat: number, y: number): [number, number, number] => [e[0] * rad + s[0] * lat, y, e[2] * rad + s[2] * lat];
  const loop = [L(9.3, -1.2, 0.4), L(10.4, -1.0, 0.5), L(11.2, 0, 0.52), L(10.4, 1.0, 0.5), L(9.3, 1.2, 0.4)];
  const la = new MeshAcc();
  la.sweep(loop, loop.map(() => 0.24), loop.map(() => 0.17), 8, true);
  addMesh(root, "TawaHelperLoop", la, "iron", "307_loop");
  root.enabled = false;
  print(`[ToolGen] #307 tawa: body ${TOOL_TRIS["307_body"]} tris, handle ${TOOL_TRIS["307_handle"]}, loop ${TOOL_TRIS["307_loop"]}`);
  return root;
}

// ───────────────────────────── #322 chef knife / #323 vegetable cleaver blades ─────────────────────────────

interface BladeSection {
  z: number;
  yEdge: number;
  yBevel: number;
  ySpine: number;
  hwEdge: number;
  hwBevel: number;
  hwSpine: number;
}

// same section layout as the santoku (tip z<0 .. bolster z=1.8, edge on y=0); chef: long curved belly + pointed tip
const CHEF_SECTIONS: BladeSection[] = [
  { z: -6.9, yEdge: 0.9, yBevel: 0.98, ySpine: 1.05, hwEdge: 0.012, hwBevel: 0.02, hwSpine: 0.03 },
  { z: -6.0, yEdge: 0.32, yBevel: 0.85, ySpine: 1.55, hwEdge: 0.014, hwBevel: 0.035, hwSpine: 0.06 },
  { z: -4.6, yEdge: 0.06, yBevel: 0.95, ySpine: 2.0, hwEdge: 0.016, hwBevel: 0.055, hwSpine: 0.09 },
  { z: -3.0, yEdge: 0.0, yBevel: 1.0, ySpine: 2.25, hwEdge: 0.018, hwBevel: 0.065, hwSpine: 0.11 },
  { z: -1.0, yEdge: 0.0, yBevel: 1.02, ySpine: 2.4, hwEdge: 0.018, hwBevel: 0.072, hwSpine: 0.125 },
  { z: 0.8, yEdge: 0.0, yBevel: 1.02, ySpine: 2.42, hwEdge: 0.018, hwBevel: 0.078, hwSpine: 0.135 },
  { z: 1.5, yEdge: 0.03, yBevel: 1.0, ySpine: 2.42, hwEdge: 0.02, hwBevel: 0.082, hwSpine: 0.14 },
  { z: 1.7, yEdge: 0.35, yBevel: 0.95, ySpine: 2.38, hwEdge: 0.028, hwBevel: 0.088, hwSpine: 0.142 },
  { z: 1.8, yEdge: 0.7, yBevel: 0.95, ySpine: 2.34, hwEdge: 0.045, hwBevel: 0.095, hwSpine: 0.144 },
];
// cleaver: short, tall rectangle, edge flat along its full length, thick spine
const CLEAVER_SECTIONS: BladeSection[] = [
  { z: -5.2, yEdge: 0.35, yBevel: 1.1, ySpine: 3.2, hwEdge: 0.02, hwBevel: 0.07, hwSpine: 0.15 },
  { z: -5.0, yEdge: 0.06, yBevel: 1.25, ySpine: 3.45, hwEdge: 0.022, hwBevel: 0.09, hwSpine: 0.17 },
  { z: -3.0, yEdge: 0.0, yBevel: 1.3, ySpine: 3.5, hwEdge: 0.024, hwBevel: 0.095, hwSpine: 0.18 },
  { z: -0.5, yEdge: 0.0, yBevel: 1.3, ySpine: 3.5, hwEdge: 0.024, hwBevel: 0.095, hwSpine: 0.18 },
  { z: 1.2, yEdge: 0.0, yBevel: 1.2, ySpine: 3.1, hwEdge: 0.024, hwBevel: 0.09, hwSpine: 0.17 },
  { z: 1.6, yEdge: 0.3, yBevel: 1.0, ySpine: 2.6, hwEdge: 0.03, hwBevel: 0.095, hwSpine: 0.17 },
  { z: 1.8, yEdge: 0.7, yBevel: 0.95, ySpine: 2.34, hwEdge: 0.045, hwBevel: 0.1, hwSpine: 0.17 },
];

function bladeMesh(sections: BladeSection[], triKey: string): RenderMesh {
  const acc = new MeshAcc();
  const S = sections.length;
  const ids: number[][] = [];
  for (let i = 0; i < S; i++) {
    const s = sections[i];
    const u = i / (S - 1);
    ids.push([
      acc.v(-s.hwEdge, s.yEdge, s.z, -0.94, -0.34, 0, u, 0.0),
      acc.v(-s.hwBevel, s.yBevel, s.z, -0.98, 0.2, 0, u, 0.4),
      acc.v(-s.hwSpine, s.ySpine, s.z, -0.65, 0.76, 0, u, 1.0),
      acc.v(s.hwSpine, s.ySpine, s.z, 0.65, 0.76, 0, u, 1.0),
      acc.v(s.hwBevel, s.yBevel, s.z, 0.98, 0.2, 0, u, 0.4),
      acc.v(s.hwEdge, s.yEdge, s.z, 0.94, -0.34, 0, u, 0.0),
    ]);
  }
  for (let i = 0; i < S - 1; i++) {
    const a = ids[i], b = ids[i + 1];
    for (let j = 0; j < 6; j++) acc.quad(a[j], b[j], b[(j + 1) % 6], a[(j + 1) % 6]);
  }
  for (const [si, nz] of [[0, -1], [S - 1, 1]]) {
    const s = sections[si];
    const pts = [[-s.hwEdge, s.yEdge], [-s.hwBevel, s.yBevel], [-s.hwSpine, s.ySpine], [s.hwSpine, s.ySpine], [s.hwBevel, s.yBevel], [s.hwEdge, s.yEdge]];
    const c = pts.map((p) => acc.v(p[0], p[1], s.z, 0, 0, nz, 0, 0));
    acc.quad(c[0], c[1], c[2], c[3]);
    acc.quad(c[0], c[3], c[4], c[5]);
  }
  TOOL_TRIS[triKey] = acc.triCount();
  return acc.toMesh();
}

// ───────────────────────────── #326 spice pinch ramekins ─────────────────────────────

const RAMEKIN_PROFILE: [number, number][] = [
  [0.0, 0.0], [0.85, 0.0], [1.12, 0.12], [1.2, 0.95], [1.08, 0.98], [1.0, 0.9], [0.98, 0.28], [0.0, 0.25],
];
const POWDER_PROFILE: [number, number][] = [[0.0, 0.84], [0.95, 0.84], [0.7, 0.97], [0.35, 1.07], [0.0, 1.12]];
// board-local z offsets of the three ramekins around SLOT_SPICE_RAMEKINS: one column just right of the prep bowl, the
// same column the A5 #161 pantry ramekins use (z 8.0 / 10.4 / 12.8 / 15.2), so none overhangs the slab's right edge
// (K1a: the middle one used to sit at x 11.9)
const RAMEKIN_DZ = [2.4, 0.0, -2.4];
const RAMEKIN_POWDERS = ["turmeric", "kashmiri", "cumin"];

/** Builds the three ramekins beside the prep bowl (children of the board object, hidden, idle name). */
export function buildRamekins(boardObj: SceneObject): SceneObject {
  for (const k of ["326_ramekin", "326_powder"]) TOOL_TRIS[k] = 0;
  const slot = getSlot("SLOT_SPICE_RAMEKINS");
  const root = global.scene.createSceneObject("SpiceRamekins" + IDLE);
  root.setParent(boardObj);
  root.getTransform().setLocalPosition(new vec3(0, slot.y, 0));
  const ra = new MeshAcc();
  ra.lathe(RAMEKIN_PROFILE, 18);
  const rm = ra.toMesh();
  const pa = new MeshAcc();
  pa.lathe(POWDER_PROFILE, 14);
  const pm = pa.toMesh();
  TOOL_TRIS["326_ramekin"] = ra.triCount();
  TOOL_TRIS["326_powder"] = pa.triCount();
  const names = ["RamekinTurmeric", "RamekinKashmiriRed", "RamekinCumin"];
  for (let i = 0; i < 3; i++) {
    const o = global.scene.createSceneObject(names[i]);
    o.setParent(root);
    o.getTransform().setLocalPosition(new vec3(slot.x, 0, slot.z + RAMEKIN_DZ[i]));
    const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    rmv.mesh = rm;
    rmv.mainMaterial = mat("ramekin");
    const p = global.scene.createSceneObject(names[i] + "Powder");
    p.setParent(o);
    const prmv = p.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    prmv.mesh = pm;
    prmv.mainMaterial = mat(RAMEKIN_POWDERS[i]);
  }
  root.enabled = false;
  print(`[ToolGen] #326 ramekins: ${TOOL_TRIS["326_ramekin"]} tris each x3, powder ${TOOL_TRIS["326_powder"]} each`);
  return root;
}

// ───────────────────────────── #333-#335 tools, #336 whisk ─────────────────────────────

export type ToolKind = "chuan" | "chopsticks" | "tongs" | "whisk";
// tool frame: the working tip is the origin, the handle runs along +X, y up; the tool lies on the slab at rest

function chain(pts: [number, number, number][], r: number[], rh: number[], segs: number, caps: boolean = true): MeshAcc {
  const a = new MeshAcc();
  a.sweep(pts, r, rh, segs, caps);
  return a;
}

/** Builds one lying tool under `parent` (name = page-table prop name, hidden). */
function buildToolMesh(kind: ToolKind, parent: SceneObject, name: string): SceneObject {
  const root = global.scene.createSceneObject(name);
  root.setParent(parent);
  const key = "tool_" + kind;
  TOOL_TRIS[key] = 0;
  if (kind === "chuan") {
    // flat-edged scoop head with a raised front lip, steel neck, long wooden grip
    const h = new MeshAcc();
    h.box(2.1, 0.11, 0, 2.1, 0.055, 1.3);
    h.box(0.08, 0.3, 0, 0.06, 0.2, 1.3);
    addMesh(root, "WokChuanHead", h, "steel", key);
    addMesh(root, "WokChuanNeck", chain([[4.0, 0.13, 0], [6.0, 0.3, 0], [8.5, 0.45, 0]], [0.28, 0.24, 0.22], [0.12, 0.12, 0.12], 8), "steel", key);
    addMesh(root, "WokChuanGrip", chain([[8.3, 0.45, 0], [11, 0.45, 0], [15, 0.45, 0], [19, 0.45, 0]], [0.36, 0.44, 0.44, 0.36], [0.36, 0.42, 0.42, 0.34], 8), "wood", key);
  } else if (kind === "chopsticks") {
    for (const sg of [-1, 1]) {
      const c: [number, number, number][] = [[0, 0.2, sg * 0.18], [6, 0.2, sg * 0.32], [12, 0.2, sg * 0.42], [18, 0.2, sg * 0.5]];
      const w = [0.1, 0.14, 0.18, 0.2];
      addMesh(root, sg < 0 ? "ChopstickA" : "ChopstickB", chain(c, w, w, 6), sg < 0 ? "bamboo" : "bambooDark", key);
    }
  } else if (kind === "tongs") {
    const arms = new MeshAcc();
    for (const sg of [-1, 1]) {
      const c: [number, number, number][] = [[0, 0.3, sg * 0.3], [4, 0.3, sg * 0.55], [9, 0.3, sg * 0.9], [14, 0.3, sg * 0.7], [18, 0.3, sg * 0.15]];
      arms.sweep(c, c.map(() => 0.28), c.map(() => 0.12), 8, true);
    }
    addMesh(root, "TongsArms", arms, "steel", key);
    const pads = new MeshAcc();
    for (const sg of [-1, 1]) pads.ellipsoid(0.9, 0.28, sg * 0.55, 1.1, 0.18, 0.5, 8, 4);
    pads.torus(18.4, 0.3, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 0.35, 0.12, 0.14, 10, 4);
    addMesh(root, "TongsPadsHinge", pads, "chrome", key);
  } else {
    // balloon whisk: 8 wire loops (22.5 deg apart around the X axis), ferrule + handle
    const wires = new MeshAcc();
    const prof: [number, number][] = [[5.2, 0], [3.9, 0.9], [2.2, 1.25], [0.9, 0.8], [0, 0], [0.9, -0.8], [2.2, -1.25], [3.9, -0.9], [5.2, 0]];
    for (let i = 0; i < 8; i++) {
      const th = i * 22.5 * DEG;
      const cy = Math.cos(th), sz = Math.sin(th);
      const c: [number, number, number][] = prof.map((p) => [p[0], p[1] * cy, p[1] * sz] as [number, number, number]);
      wires.sweep(c, c.map(() => 0.05), c.map(() => 0.05), 3, true);
    }
    addMesh(root, "WhiskWires", wires, "chrome", key);
    addMesh(root, "WhiskHandle", chain([[5.0, 0, 0], [6.8, 0, 0], [9, 0, 0], [12.5, 0, 0], [13.2, 0, 0]], [0.3, 0.5, 0.52, 0.5, 0.3], [0.3, 0.5, 0.52, 0.5, 0.3], 8), "steel", key);
  }
  root.enabled = false;
  print(`[ToolGen] ${name}: ${TOOL_TRIS[key]} tris`);
  return root;
}

type Pose = { p: vec3; q: quat };

/**
 * A lying hand tool (wok chuan / chopsticks / tongs). setHeld(bool) glides it to / from a hover pose over the cooking
 * vessel; liftSwirl(target?, onDone) dips the tip and lifts it out in a helical swirl (noodle / pasta toss for K1).
 */
export class ToolProp {
  protected obj: SceneObject;
  protected kind: ToolKind;
  protected restPos: vec3;
  protected restRot: quat;
  protected targetFn: () => vec3 | null;
  protected mode: "" | "swirl" | "toHeld" | "held" | "toRest" | "whisk" = "";
  protected t: number = 0;
  protected c: vec3 = vec3.zero();
  protected from: Pose = { p: vec3.zero(), q: quat.quatIdentity() };
  protected onDone: (() => void) | null = null;

  constructor(kind: ToolKind, obj: SceneObject, restPos: vec3, restRot: quat, targetFn: () => vec3 | null) {
    this.kind = kind;
    this.obj = obj;
    this.restPos = restPos;
    this.restRot = restRot;
    this.targetFn = targetFn;
    this.resetToRest();
  }

  getObject(): SceneObject {
    return this.obj;
  }

  getKind(): ToolKind {
    return this.kind;
  }

  isBusy(): boolean {
    return this.mode !== "" && this.mode !== "held";
  }

  isHeld(): boolean {
    return this.mode === "held" || this.mode === "toHeld";
  }

  resetToRest(): void {
    this.mode = "";
    this.onDone = null;
    const tr = this.obj.getTransform();
    tr.setLocalPosition(this.restPos);
    tr.setLocalRotation(this.restRot);
  }

  protected restWorld(): Pose {
    const par = this.obj.getParent();
    if (!par) return { p: this.restPos, q: this.restRot };
    const pt = par.getTransform();
    return { p: pt.getWorldTransform().multiplyPoint(this.restPos), q: pt.getWorldRotation().multiply(this.restRot) };
  }

  protected beginFrom(): void {
    const tr = this.obj.getTransform();
    this.from = { p: tr.getWorldPosition(), q: tr.getWorldRotation() };
    this.t = 0;
  }

  /** Tip-down orientation toward `c` (the tool's -X axis points at c + a little below). */
  protected aim(pos: vec3, c: vec3, down: number): quat {
    const dir = c.sub(pos).add(new vec3(0, -down, 0)).normalize();
    return quat.rotationFromTo(new vec3(-1, 0, 0), dir);
  }

  protected place(p: vec3, q: quat): void {
    const tr = this.obj.getTransform();
    tr.setWorldPosition(p);
    tr.setWorldRotation(q);
  }

  /** Glide to a hover pose over the cooking vessel (true) or back to the rest pose (false). */
  setHeld(held: boolean): void {
    if (!this.obj.isEnabledInHierarchy) return;
    if (held) {
      if (this.mode === "held" || this.mode === "toHeld") return;
      const c = this.targetFn();
      if (!c) return;
      this.c = c;
      this.beginFrom();
      this.mode = "toHeld";
    } else {
      if (this.mode === "" || this.mode === "toRest") return;
      this.beginFrom();
      this.mode = "toRest";
    }
    this.onDone = null;
  }

  /** Dip the tip into `target` (default: the active pot / pan), swirl up in a 1.25-turn helix, return to rest. */
  liftSwirl(target?: SceneObject, onDone?: () => void): boolean {
    if (this.isBusy() || !this.obj.isEnabledInHierarchy) return false;
    const c = target ? target.getTransform().getWorldPosition() : this.targetFn();
    if (!c) return false;
    this.c = c;
    this.beginFrom();
    this.mode = "swirl";
    this.onDone = onDone || null;
    return true;
  }

  protected finish(): void {
    this.resetToRest();
  }

  protected heldPose(): Pose {
    const p = this.c.add(new vec3(0, 3.2, 1.6));
    return { p: p, q: this.aim(p, this.c, 1.2) };
  }

  update(dt: number): void {
    if (this.mode === "" || !this.obj.isEnabledInHierarchy) return;
    this.t += dt;
    if (this.mode === "swirl") {
      const A = 0.7, B = 2.0, C = 0.8;
      const R = 1.5;
      const at = (k: number): Pose => {
        const ph = 2 * Math.PI * 1.25 * k;
        const p = this.c.add(new vec3(Math.cos(ph) * R, 0.25 + 3.0 * smooth(k), Math.sin(ph) * R));
        return { p: p, q: this.aim(p, this.c, 0.8) };
      };
      if (this.t < A) {
        const a = smooth(this.t / A);
        const s = at(0);
        this.place(vec3.lerp(this.from.p, s.p, a).add(new vec3(0, 2.0 * Math.sin(Math.PI * a), 0)), quat.slerp(this.from.q, s.q, a));
      } else if (this.t < A + B) {
        const s = at((this.t - A) / B);
        this.place(s.p, s.q);
      } else if (this.t < A + B + C) {
        const a = smooth((this.t - A - B) / C);
        const s = at(1);
        const r = this.restWorld();
        this.place(vec3.lerp(s.p, r.p, a).add(new vec3(0, 2.0 * Math.sin(Math.PI * a), 0)), quat.slerp(s.q, r.q, a));
      } else {
        const cb = this.onDone;
        this.finish();
        if (cb) cb();
      }
    } else if (this.mode === "toHeld") {
      const a = smooth(this.t / 0.6);
      const h = this.heldPose();
      this.place(vec3.lerp(this.from.p, h.p, a).add(new vec3(0, 1.5 * Math.sin(Math.PI * a), 0)), quat.slerp(this.from.q, h.q, a));
      if (this.t >= 0.6) this.mode = "held";
    } else if (this.mode === "toRest") {
      const a = smooth(this.t / 0.6);
      const r = this.restWorld();
      this.place(vec3.lerp(this.from.p, r.p, a).add(new vec3(0, 1.5 * Math.sin(Math.PI * a), 0)), quat.slerp(this.from.q, r.q, a));
      if (this.t >= 0.6) this.finish();
    } else {
      this.updateExtra(dt);
    }
  }

  protected updateExtra(_dt: number): void {
    // overridden by WhiskProp
  }
}

/** #336 balloon whisk. whiskEmulsion(onDone): figure-8 Lissajous (sin wt, sin 2wt) over ~2 s above the pot. */
export class WhiskProp extends ToolProp {
  whiskEmulsion(onDone?: () => void): boolean {
    if (this.isBusy() || !this.obj.isEnabledInHierarchy) return false;
    const c = this.targetFn();
    if (!c) return false;
    this.c = c;
    this.beginFrom();
    this.mode = "whisk";
    this.onDone = onDone || null;
    return true;
  }

  protected updateExtra(_dt: number): void {
    if (this.mode !== "whisk") return;
    const A = 0.5, B = 2.0, C = 0.5;
    const amp = 1.1, w = 2 * Math.PI; // one figure-8 per second -> two in 2 s
    const hover = 1.6;
    const lis = (s: number): Pose => {
      const x = amp * Math.sin(w * s), z = amp * Math.sin(2 * w * s);
      const vx = amp * w * Math.cos(w * s), vz = 2 * amp * w * Math.cos(2 * w * s);
      const p = this.c.add(new vec3(x, hover, z));
      const dir = new vec3(vx * 0.03, -1, vz * 0.03).normalize();
      return { p: p, q: quat.rotationFromTo(new vec3(-1, 0, 0), dir) };
    };
    if (this.t < A) {
      const a = smooth(this.t / A);
      const s = lis(0);
      this.place(vec3.lerp(this.from.p, s.p, a).add(new vec3(0, 2.0 * Math.sin(Math.PI * a), 0)), quat.slerp(this.from.q, s.q, a));
    } else if (this.t < A + B) {
      const s = lis(this.t - A);
      this.place(s.p, s.q);
    } else if (this.t < A + B + C) {
      const a = smooth((this.t - A - B) / C);
      const s = lis(B);
      const r = this.restWorld();
      this.place(vec3.lerp(s.p, r.p, a).add(new vec3(0, 2.0 * Math.sin(Math.PI * a), 0)), quat.slerp(s.q, r.q, a));
    } else {
      const cb = this.onDone;
      this.finish();
      if (cb) cb();
    }
  }
}

// ───────────────────────────── controller ─────────────────────────────

const TOOL_NUMBERS = [306, 321, 322, 323, 326, 333, 334, 335, 336];
const LISTED_TOOLS = [306, 322, 323, 326, 333, 334, 335, 336];

/**
 * Owns the A4b props (stockpot + tawa live in HeroWareController because they swap the cookware). Builds everything
 * hidden (prepare), shows / hides per dish (show), and restores the boot look (applyLeftovers: santoku, nothing extra).
 */
export class ToolWareController {
  private props: StationPropsBuilder;
  private hw: HeroWareController;
  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private basket: StrainerBasket | null = null;
  private basketOn: boolean = false;
  private ramekins: SceneObject | null = null;
  private tools: { [n: number]: ToolProp } = {};
  private on: { [n: number]: boolean } = {};
  private knifeOrig: RenderMesh | null = null;
  private knifeVar: { [n: number]: RenderMesh } = {};
  private knifeActive: number = 321;
  private listed: number[] = [];

  constructor(props: StationPropsBuilder, hw: HeroWareController) {
    this.props = props;
    this.hw = hw;
    props.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()));
    this.bus.on("WHISK_REQUESTED", () => {
      const w = this.tools[336];
      if (w && this.on[336] && w instanceof WhiskProp) w.whiskEmulsion();
    });
    this.bus.on("DISH_BLUEPRINT_APPLIED", (d?: any) => {
      // non-staged applies (Reset, cycle without briefing): the hooks ran already; settle what no hook covers
      if (!d || d.staged === true || !d.blueprint) return;
      this.setDishList(d.blueprint);
      this.applyLeftovers();
    });
  }

  private root(): SceneObject {
    return this.props.getSceneObject();
  }

  /** True for the numbers this controller shows / hides (#321 included: it restores the santoku). */
  handles(n: number): boolean {
    return TOOL_NUMBERS.indexOf(n) >= 0;
  }

  setDishList(bp: UniversalDishBlueprint | null): void {
    this.listed = [];
    if (!bp) return;
    const nums: number[] = ([] as any[]).concat(bp.vesselAccessNumbers || [], (bp as any).toolAccessNumbers || []);
    for (const n of nums) if (typeof n === "number") this.listed.push(n === 311 ? 304 : n);
  }

  /** A5: the #326 ramekin group (built hidden by prepare(326)), null before it was built. */
  getRamekinRoot(): SceneObject | null {
    return this.ramekins && !isNull(this.ramekins) ? this.ramekins : null;
  }

  /** A5 #161: recolour / refill the three ramekin powders (null colour keeps the current one, amount 0..1 = heap height). */
  setRamekinPowders(cols: (number[] | null)[], amounts: number[]): void {
    if (!this.ramekins) return;
    for (let i = 0; i < 3; i++) {
      const r = this.ramekins.getChild(i);
      const p = r ? r.getChild(0) : null;
      if (!p) continue;
      const c = cols[i];
      if (c) {
        const rmv = p.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        const m = makePbrMaterial(c[0], c[1], c[2], 0.0, 0.85);
        glow(m, c[0] * 0.16, c[1] * 0.16, c[2] * 0.16);
        rmv.mainMaterial = m;
      }
      const a = Math.max(0.3, Math.min(1, typeof amounts[i] === "number" ? amounts[i] : 1));
      p.getTransform().setLocalScale(new vec3(1, a, 1));
      p.getTransform().setLocalPosition(new vec3(0, 0.84 * (1 - a), 0));
    }
  }

  /** A5: back to the A4b default powders (turmeric, kashmiri red, cumin), full heaps. */
  restoreRamekinPowders(): void {
    if (!this.ramekins) return;
    for (let i = 0; i < 3; i++) {
      const r = this.ramekins.getChild(i);
      const p = r ? r.getChild(0) : null;
      if (!p) continue;
      const rmv = p.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mainMaterial = mat(RAMEKIN_POWDERS[i]);
      p.getTransform().setLocalScale(vec3.one());
      p.getTransform().setLocalPosition(vec3.zero());
    }
  }

  getBasket(): StrainerBasket | null {
    return this.basketOn ? this.basket : null;
  }

  getTool(n: number): ToolProp | null {
    return this.on[n] ? this.tools[n] || null : null;
  }

  getWhisk(): WhiskProp | null {
    const w = this.getTool(336);
    return w instanceof WhiskProp ? w : null;
  }

  /** The pot / pan a tool works over (world point): stockpot water, handi mouth, saucier, else the active pan. */
  private target(forWhisk: boolean): vec3 | null {
    const pot = this.props.getSaucierPot();
    const sec = this.hw.getSecondary();
    if (pot && (forWhisk || sec === 305 || sec === 303)) {
      const y = sec === 305 ? POT_WATER_Y : sec === 303 ? 5.4 : 4.0;
      return pot.getTransform().getWorldTransform().multiplyPoint(new vec3(0, y, 0));
    }
    const r = this.root();
    const pan = findByName(r, "WokPan") || findByName(r, "TawaPan") || findByName(r, "SkilletPan");
    return pan ? pan.getTransform().getWorldTransform().multiplyPoint(new vec3(0, 0.6, 0)) : null;
  }

  // ── build (hidden) ──

  /** Builds (once) the hidden prop for #306/#326/#333-#336 and returns its root. */
  prepare(n: number): SceneObject | null {
    try {
      if (n === 306) {
        if (!this.basket) {
          const stock = this.hw.prepare(305);
          if (!stock) return null;
          this.basket = buildBasket(stock);
          this.basket.getObject().name = "StrainerBasketProp" + IDLE;
          this.basket.getObject().enabled = false;
        }
        return this.basket.getObject();
      }
      if (n === 326) {
        if (!this.ramekins) {
          const bowl = findByName(this.root(), "PortionRamekinBowl");
          const board = bowl ? bowl.getParent() : null;
          if (!board) return null;
          this.ramekins = buildRamekins(board);
        }
        return this.ramekins;
      }
      if (n >= 333 && n <= 336) {
        if (!this.tools[n]) {
          if (n === 336) {
            const st = findByName(this.root(), "SaucepotStation");
            if (!st) return null;
            const ls = getSlot("SLOT_SECONDARY_TOOL_REST");
            const o = buildToolMesh("whisk", st, "WhiskProp" + IDLE);
            this.tools[n] = new WhiskProp("whisk", o, new vec3(ls.x + 0.8, ls.y + 1.3, ls.z - 3.8), quat.angleAxis(ls.yawDeg * DEG, vec3.up()), () => this.target(true));
          } else {
            const st = findByName(this.root(), "SkilletStation");
            if (!st) return null;
            const ts = getSlot("SLOT_TERTIARY_TOOL_REST");
            const kind: ToolKind = n === 333 ? "chuan" : n === 334 ? "chopsticks" : "tongs";
            const nm = (n === 333 ? "WokChuanProp" : n === 334 ? "ChopsticksProp" : "TongsProp") + IDLE;
            const o = buildToolMesh(kind, st, nm);
            this.tools[n] = new ToolProp(kind, o, new vec3(ts.x, ts.y, ts.z), quat.angleAxis(ts.yawDeg * DEG, vec3.up()), () => this.target(false));
          }
        }
        return this.tools[n].getObject();
      }
    } catch (e) {
      print(`[ToolGen] build #${n} failed: ${e}`);
    }
    return null;
  }

  // ── show / hide ──

  /** enableTool dispatch for #306, #321-#323, #326, #333-#336. Returns the object now shown (null when hidden / none). */
  show(n: number, enabled: boolean): SceneObject | null {
    if (n === 321 || n === 322 || n === 323) {
      if (enabled) this.setKnife(n);
      return null;
    }
    if (n === 306) {
      if (enabled && !this.prepare(306)) return null;
      if (!this.basket) return null;
      const o = this.basket.getObject();
      if (enabled !== this.basketOn) {
        this.basket.snap(false);
        o.name = enabled ? "StrainerBasketProp" : "StrainerBasketProp" + IDLE;
        o.enabled = enabled;
        if (!enabled) o.getTransform().setLocalScale(vec3.one());
        this.basketOn = enabled;
      }
      return enabled ? o : null;
    }
    if (n === 326) {
      if (enabled && !this.prepare(326)) return null;
      if (!this.ramekins) return null;
      this.ramekins.name = enabled ? "SpiceRamekins" : "SpiceRamekins" + IDLE;
      this.ramekins.enabled = enabled;
      if (!enabled) this.ramekins.getTransform().setLocalScale(vec3.one());
      return enabled ? this.ramekins : null;
    }
    if (n >= 333 && n <= 336) {
      if (enabled && !this.prepare(n)) return null;
      const t = this.tools[n];
      if (!t) return null;
      if (!!this.on[n] !== enabled) {
        t.resetToRest();
        const o = t.getObject();
        const base = n === 333 ? "WokChuanProp" : n === 334 ? "ChopsticksProp" : n === 335 ? "TongsProp" : "WhiskProp";
        o.name = enabled ? base : base + IDLE;
        o.enabled = enabled;
        if (!enabled) o.getTransform().setLocalScale(vec3.one());
        this.on[n] = enabled;
      }
      return enabled ? t.getObject() : null;
    }
    return null;
  }

  /** The hidden-until-reveal object of a staged key (vessel_326, tool_306, tool_333..336); [] when not shown. */
  revealObjects(n: number): SceneObject[] {
    let o: SceneObject | null = null;
    if (n === 306) o = this.basketOn && this.basket ? this.basket.getObject() : null;
    else if (n === 326) o = this.ramekins && this.ramekins.name === "SpiceRamekins" ? this.ramekins : null;
    else if (this.on[n] && this.tools[n]) o = this.tools[n].getObject();
    return o ? [o] : [];
  }

  /** Puts the dish's pasta / noodle prop(s) into the basket (hook for K1's lift-and-toss). */
  holdStarches(starchRoots: SceneObject[]): void {
    if (!this.basketOn || !this.basket) return;
    for (const s of starchRoots) this.basket.holdStarch(s);
  }

  /** Santoku (#321) restores the original blade mesh; #322 / #323 swap in their blade (knife object + kinematics unchanged). */
  setKnife(n: number): void {
    const blade = findByName(this.root(), "KnifeBlade");
    const rmv = blade ? (blade.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
    if (!rmv) return;
    if (!this.knifeOrig) this.knifeOrig = rmv.mesh;
    const want = n === 322 || n === 323 ? n : 321;
    if (want === this.knifeActive) return;
    if (want === 321) rmv.mesh = this.knifeOrig;
    else {
      if (!this.knifeVar[want]) this.knifeVar[want] = bladeMesh(want === 322 ? CHEF_SECTIONS : CLEAVER_SECTIONS, want === 322 ? "322_blade" : "323_blade");
      rmv.mesh = this.knifeVar[want];
      print(`[ToolGen] #${want} ${want === 322 ? "chef knife" : "vegetable cleaver"} blade: ${TOOL_TRIS[want === 322 ? "322_blade" : "323_blade"]} tris`);
    }
    this.knifeActive = want;
  }

  getKnife(): number {
    return this.knifeActive;
  }

  /** What no hook of this dish covers: every unlisted extra goes away, santoku comes back. */
  applyLeftovers(): void {
    for (const n of LISTED_TOOLS) {
      if (n === 322 || n === 323) continue;
      const isOn = n === 306 ? this.basketOn : n === 326 ? !!this.ramekins && this.ramekins.enabled : !!this.on[n];
      if (this.listed.indexOf(n) < 0 && isOn) this.show(n, false);
    }
    if (this.listed.indexOf(322) < 0 && this.listed.indexOf(323) < 0) this.setKnife(321);
  }

  private update(dt: number): void {
    if (this.basket && this.basketOn) this.basket.update(dt);
    for (const k in this.tools) {
      if (this.on[k as any]) this.tools[k as any].update(dt);
    }
  }
}
