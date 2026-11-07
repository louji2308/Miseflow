/**
 * PantryGenerators.ts  (v5 A5 spices / dairy / oils / legumes, #160-#166)
 * Procedural low-poly props (MeshAcc, <= 400 tris per mesh, additive-display colours) + animated effects + the controller:
 *   #160 whole garam masala trio   GaramMasalaProp  dropInto(target, onDone)   spices hop into hot oil, sizzle ripples
 *   #161 ground spice powders      PowderProp       pinchInto(target, i, onDone) puff + colour tint (+ #326 ramekins)
 *   #162 butter / ghee pat         ButterProp       placeOn / setMelt(0..1) / meltOver  cube -> foaming golden pool
 *   #163 grated cheese             CheeseProp       placeOn / setMelt(0..1) / meltOver  shreds -> glossy golden cap
 *   #164 cream / coconut / yogurt  CreamProp        swirlOnto(target, onDone) / setProgress(0..1)
 *   #165 oils & umami glazes       CruetProp        drizzle(target, rgb, onDone) / drizzlePose(k)
 *   #166 lentils / dal / chickpeas LegumeProp       setFill(0..1) inside the secondary pot
 * PantryController: stage / reveal (itemKeys "pantry_160" ...), rebuild, target(kind), getPlan() (ordered summary for K1).
 * Everything is built HIDDEN (props disabled) until revealed; Reset removes it all. Dish 01 never builds any of this.
 * Imported (indirectly) by StationPropsBuilder: nothing here may touch imported values at module load time.
 */
import { MeshAcc, makePbrMaterial, POT_INNER, StationPropsBuilder } from "./StationPropsBuilder";
import { queryPanFloor } from "./ProteinGenerators";
import { getSlot, SlotId, toRoot } from "./AI/SpatialSlotAllocator";
import { getCatalogEntry } from "./AI/AssetPageTable";
import { PrepSlotEntry, Rgb, UniversalDishBlueprint } from "./AI/UniversalDishSchema";
import { PantryContext } from "./AI/IDishAssetBuilder";
import { HANDI_INNER } from "./VesselGenerators";
import { STOCK_INNER } from "./ToolGenerators";
import type { ToolWareController } from "./ToolGenerators";

const DEG = Math.PI / 180;

export type PantryKind = "pan" | "pot" | "plate" | "starch";

/** Resolved surface a pantry prop acts on. world = surface point (pan floor / pot floor / top of a plate or starch). */
export interface PantryTarget {
  obj: SceneObject;
  world: vec3;
  /** usable radius in StationsRoot cm */
  radius: number;
  /** obj world scale / StationsRoot world scale (local units -> StationsRoot cm) */
  scale: number;
  kind: "pan" | "pot" | "top";
  /** pot only: inner wall [y, r] (pot-local) and the floor height */
  profile?: [number, number][];
  floorY?: number;
  topY?: number;
}

export interface PantryPlanStep {
  order: number;
  accessNumber: number;
  itemKey: string;
  name: string;
  variant: string;
  phase: "COOK" | "FINISH";
  restSlot: string;
  /** public API K1 calls, e.g. "dropInto(pan)" */
  api: string;
  target: PantryKind;
  note: string;
}

/** Tri counts per mesh of the last built props (A5 report). */
export const PANTRY_TRIS: { [k: string]: number } = {};

// ───────────────────────────── helpers ─────────────────────────────

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smooth(k: number): number {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function findByName(root: SceneObject, name: string): SceneObject | null {
  if (root.name === name) return root;
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const f = findByName(root.getChild(i), name);
    if (f) return f;
  }
  return null;
}

function glow(m: Material, c: number[], k: number): void {
  if (k <= 0) return;
  try {
    (m.mainPass as any).Port_Emissive_N006 = new vec3(c[0] * k, c[1] * k, c[2] * k);
  } catch (_e) {
    // shader without the emissive port
  }
}

/** Opaque PBR with a small emissive lift (additive display reads it). */
function mat(c: number[], metal: number = 0.0, rough: number = 0.5, emi: number = 0.12): Material {
  const m = makePbrMaterial(c[0], c[1], c[2], metal, rough);
  glow(m, c, emi);
  return m;
}

/** Alpha-blended material whose opacity is driven with set(). */
class Fade {
  m: Material;
  c: number[];
  private emi: number;

  constructor(c: number[], a: number, emi: number = 0.12, metal: number = 0.0, rough: number = 0.2) {
    this.c = c;
    this.emi = emi;
    this.m = makePbrMaterial(c[0], c[1], c[2], metal, rough);
    this.m.mainPass.blendMode = BlendMode.Normal;
    this.m.mainPass.depthWrite = false;
    this.m.mainPass.twoSided = true;
    glow(this.m, c, emi);
    this.set(a);
  }

  set(a: number): void {
    this.m.mainPass.baseColor = new vec4(this.c[0], this.c[1], this.c[2], clamp01(a));
  }

  rgb(c: number[], a: number): void {
    this.c = c;
    glow(this.m, c, this.emi);
    this.set(a);
  }
}

function mixRgb(a: number[], b: number[], t: number): number[] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgbOf(c: Rgb | number[] | undefined, d: number[]): number[] {
  return c && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2]) ? [c[0], c[1], c[2]] : d;
}

// ───────────────────────────── tweens ─────────────────────────────

interface Tw {
  owner: any;
  delay: number;
  t: number;
  dur: number;
  fn: (k: number) => void;
  done?: () => void;
}

export class PantryTweens {
  private list: Tw[] = [];

  add(owner: any, delay: number, dur: number, fn: (k: number) => void, done?: () => void): void {
    this.list.push({ owner: owner, delay: delay, t: 0, dur: Math.max(0.001, dur), fn: fn, done: done });
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    for (let i = 0; i < this.list.length; i++) {
      const w = this.list[i];
      if (w.delay > 0) {
        w.delay -= dt;
        continue;
      }
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      try {
        w.fn(k);
      } catch (e) {
        print(`[Pantry] tween error: ${e}`);
        w.t = w.dur;
      }
    }
    const fin: Tw[] = [];
    const keep: Tw[] = [];
    for (const w of this.list) (w.delay <= 0 && w.t >= w.dur ? fin : keep).push(w);
    this.list = keep;
    for (const w of fin) {
      if (!w.done) continue;
      try {
        w.done();
      } catch (e) {
        print(`[Pantry] tween done error: ${e}`);
      }
    }
  }

  clear(owner: any): void {
    this.list = this.list.filter((w) => w.owner !== owner);
  }

  clearAll(): void {
    this.list = [];
  }

  busy(owner: any): boolean {
    for (const w of this.list) if (w.owner === owner) return true;
    return false;
  }
}

// ───────────────────────────── meshes ─────────────────────────────

const RAMEKIN_PROFILE: [number, number][] = [
  [0.0, 0.0], [0.85, 0.0], [1.12, 0.12], [1.2, 0.95], [1.08, 0.98], [1.0, 0.9], [0.98, 0.28], [0.0, 0.25],
];
const POWDER_PROFILE: [number, number][] = [[0.0, 0.84], [0.95, 0.84], [0.7, 0.97], [0.35, 1.07], [0.0, 1.12]];
// one column inside the slab edge (the A4b #326 zig-zag reaches the edge); the herb ramekin continues the column
const RAMEKIN_POS: [number, number][] = [[10.2, 8.0], [10.2, 10.4], [10.2, 12.8], [10.4, 15.2]];

function ramekinMesh(segs: number): MeshAcc {
  const a = new MeshAcc();
  a.lathe(RAMEKIN_PROFILE, segs);
  return a;
}

/** Star anise: 8 boat pods radiating from a hub (true 8-pointed star) + 8 glossy seeds (second mesh). */
function starAniseMeshes(): { pods: MeshAcc; seeds: MeshAcc } {
  const pods = new MeshAcc();
  const seeds = new MeshAcc();
  for (let i = 0; i < 8; i++) {
    const yaw = i * 45 * DEG;
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    pods.ellipsoid(sx * 0.27, 0.07, cz * 0.27, 0.105, 0.3, 0.06, 6, 3, yaw, Math.PI / 2);
    seeds.ellipsoid(sx * 0.3, 0.13, cz * 0.3, 0.04, 0.05, 0.035, 4, 2);
  }
  pods.ellipsoid(0, 0.07, 0, 0.16, 0.07, 0.16, 8, 3);
  return { pods: pods, seeds: seeds };
}

/** Cinnamon quill: a sheet rolled 1.75 turns (axis along X), inner + outer wall. */
function cinnamonMesh(): MeshAcc {
  const a = new MeshAcc();
  const N = 14, L = 1.05, turns = 1.75, r0 = 0.1, r1 = 0.24, th = 0.04;
  for (const side of [0, 1]) {
    const ids: number[][] = [];
    for (let j = 0; j <= N; j++) {
      const ang = turns * Math.PI * 2 * (j / N);
      const r = lerp(r0, r1, j / N) + (side === 0 ? th : 0);
      const c = Math.cos(ang), s = Math.sin(ang);
      const nn = side === 0 ? 1 : -1;
      ids.push([a.v(-L, 0.26 + r * c, r * s, 0, nn * c, nn * s, 0, j / N), a.v(L, 0.26 + r * c, r * s, 0, nn * c, nn * s, 1, j / N)]);
    }
    for (let j = 0; j < N; j++) a.quad(ids[j][0], ids[j][1], ids[j + 1][1], ids[j + 1][0]);
  }
  return a;
}

/** Green cardamom pod: pointed, three-ridged ellipsoid lying along X. */
function cardamomMesh(): MeshAcc {
  const a = new MeshAcc();
  a.ellipsoid(0, 0.13, 0, 0.14, 0.34, 0.13, 8, 4, Math.PI / 2, Math.PI / 2, 3, 0.1);
  return a;
}

/** Clove: slim tapering stem, neck, ball head (lies along Z, centred). */
function cloveMesh(): MeshAcc {
  const a = new MeshAcc();
  const prof: [number, number][] = [[0, 0], [0.03, 0.02], [0.05, 0.3], [0.055, 0.5], [0.04, 0.56], [0.09, 0.62], [0.1, 0.72], [0, 0.8]];
  a.setXform(0, 0.1, -0.4, 0, Math.PI / 2);
  a.lathe(prof, 5);
  a.clearXform();
  return a;
}

/** Bay leaf: lanceolate blade with a raised midrib, top + underside (lies along Z, centred). */
function bayMesh(): MeshAcc {
  const a = new MeshAcc();
  const st = 7, L = 1.7;
  for (const up of [1, -1]) {
    const rows: number[][] = [];
    for (let i = 0; i <= st; i++) {
      const t = i / st;
      const z = t * L - L / 2;
      const w = 0.34 * Math.sin(Math.PI * Math.pow(t, 0.85));
      const y = 0.06 * Math.sin(Math.PI * t) + 0.02;
      rows.push([
        a.v(-w, y - 0.02, z, 0, up, 0, 0, t),
        a.v(0, y + 0.02 * up, z, 0, up, 0, 0.5, t),
        a.v(w, y - 0.02, z, 0, up, 0, 1, t),
      ]);
    }
    for (let i = 0; i < st; i++) {
      a.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
      a.quad(rows[i][1], rows[i][2], rows[i + 1][2], rows[i + 1][1]);
    }
  }
  return a;
}

function unitBubble(): MeshAcc {
  const a = new MeshAcc();
  a.ellipsoid(0, 0.5, 0, 0.5, 0.42, 0.5, 6, 3);
  return a;
}

function grainMesh(): MeshAcc {
  const a = new MeshAcc();
  a.ellipsoid(0, 0.06, 0, 0.06, 0.05, 0.06, 4, 2);
  return a;
}

function puffMesh(): MeshAcc {
  const a = new MeshAcc();
  a.ellipsoid(0, 0.4, 0, 0.4, 0.34, 0.4, 6, 3);
  return a;
}

function ringMesh(): MeshAcc {
  const a = new MeshAcc();
  a.arc(0, 0, 0, 0.5, 0.14, 0, 360, 20);
  return a;
}

function discMesh(): MeshAcc {
  const a = new MeshAcc();
  a.disc(0, 0, 0, 1, 24);
  return a;
}

/** Unit-radius melt pool with an organic edge and a soft meniscus. */
function poolMesh(): MeshAcc {
  const a = new MeshAcc();
  a.lathe([[1.0, 0.0], [0.95, 0.04], [0.8, 0.05], [0, 0.05]], 20, 5, 0.05);
  return a;
}

function butterCubeMesh(): MeshAcc {
  const a = new MeshAcc();
  a.box(0, 0.5, 0, 0.8, 0.5, 0.6);
  a.box(0, 1.0, 0, 0.7, 0.04, 0.5); // slightly pale top face
  return a;
}

function gheePuckMesh(): MeshAcc {
  const a = new MeshAcc();
  a.lathe([[0, 0], [0.8, 0], [0.9, 0.06], [0.9, 0.7], [0.8, 0.78], [0, 0.78]], 12);
  return a;
}

function slateDishMesh(r: number): MeshAcc {
  const a = new MeshAcc();
  a.lathe([[0, 0], [r * 0.9, 0], [r, 0.07], [r, 0.16], [r * 0.9, 0.2], [0, 0.17]], 14);
  return a;
}

/** Cheese shreds: curved triangular strands piled in a cone. */
function cheeseShredMesh(): MeshAcc {
  const a = new MeshAcc();
  const rnd = makeRng(1603);
  for (let i = 0; i < 32; i++) {
    const r = 1.15 * Math.sqrt(rnd());
    const ang = rnd() * Math.PI * 2;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const h = 0.75 * Math.max(0, 1 - r / 1.35) + 0.07 + rnd() * 0.1;
    const yaw = rnd() * Math.PI * 2;
    const len = 0.5 + 0.28 * rnd();
    const dx = Math.cos(yaw) * len * 0.5, dz = Math.sin(yaw) * len * 0.5;
    const curve: [number, number, number][] = [[x - dx, h - 0.05, z - dz], [x, h + 0.07, z], [x + dx, h - 0.05, z + dz]];
    a.sweep(curve, [0.045, 0.05, 0.04], [0.045, 0.05, 0.04], 3, false);
  }
  return a;
}

function cheeseCapMesh(): MeshAcc {
  const a = new MeshAcc();
  a.lathe([[1.1, 0.0], [1.05, 0.05], [0.92, 0.12], [0.55, 0.19], [0, 0.2]], 18, 6, 0.08);
  return a;
}

/** Cruet glass (open-bottomed profile closed at the top), liquid and cork. */
function bottleMeshes(): { glass: MeshAcc; liquid: MeshAcc; cork: MeshAcc } {
  const glass = new MeshAcc();
  glass.lathe([[0, 0], [0.75, 0], [0.95, 0.1], [1.0, 0.3], [1.0, 1.9], [0.8, 2.4], [0.36, 2.75], [0.33, 3.3], [0.42, 3.42], [0, 3.42]], 12);
  const liquid = new MeshAcc();
  liquid.lathe([[0, 0.06], [0.7, 0.06], [0.86, 0.16], [0.9, 0.3], [0.9, 1.7], [0, 1.7]], 12);
  const cork = new MeshAcc();
  cork.lathe([[0, 3.32], [0.3, 3.32], [0.38, 3.45], [0.4, 3.7], [0, 3.72]], 8);
  return { glass: glass, liquid: liquid, cork: cork };
}

function streamMesh(): MeshAcc {
  const a = new MeshAcc();
  a.lathe([[0.1, 0], [0.085, 1]], 6);
  return a;
}

/** Swept spiral ribbon (outer ring inwards, ~2.25 turns), drawn up to progress p (0..1); null while nothing is drawn. */
const SWIRL_K = 30;
function swirlMesh(R: number, p: number): MeshAcc | null {
  const total = (SWIRL_K - 1) * clamp01(p);
  if (total <= 0.02) return null;
  const pts: [number, number, number][] = [];
  const rw: number[] = [];
  const at = (t: number): [number, number, number] => {
    const ang = 2.25 * Math.PI * 2 * t;
    const rr = R * (1 - 0.9 * t);
    return [Math.cos(ang) * rr, 0.1 + 0.05 * t, Math.sin(ang) * rr];
  };
  const wAt = (t: number): number => (0.06 + 0.09 * t) * Math.min(1, 0.4 + t * 9);
  const full = Math.floor(total);
  for (let i = 0; i <= full; i++) {
    const t = i / (SWIRL_K - 1);
    pts.push(at(t));
    rw.push(wAt(t));
  }
  const frac = total - full;
  if (frac > 0.02 && full < SWIRL_K - 1) {
    const t = (full + frac) / (SWIRL_K - 1);
    pts.push(at(t));
    rw.push(wAt(t));
  }
  if (pts.length < 2) return null;
  const a = new MeshAcc();
  a.sweep(pts, rw, rw.slice(), 6, true);
  return a;
}

/** Dal / broth surface: unit-radius gently domed disc. */
function dalSurfaceMesh(): MeshAcc {
  const a = new MeshAcc();
  a.lathe([[1.0, 0.0], [0.97, 0.02], [0.6, 0.045], [0, 0.05]], 20);
  return a;
}

/** Tadka specks (chilli / mustard / cumin flecks) scattered on a unit disc. */
function tadkaMesh(): MeshAcc {
  const a = new MeshAcc();
  const rnd = makeRng(1664);
  for (let i = 0; i < 16; i++) {
    const r = 0.86 * Math.sqrt(rnd());
    const ang = rnd() * Math.PI * 2;
    a.ellipsoid(Math.cos(ang) * r, 0.04, Math.sin(ang) * r, 0.05, 0.016, 0.035, 5, 2, rnd() * Math.PI);
  }
  return a;
}

function chickpeaMesh(): MeshAcc {
  const a = new MeshAcc();
  a.ellipsoid(0, 0.2, 0, 0.26, 0.2, 0.23, 7, 4, 0, 0, 3, 0.1);
  return a;
}

function lentilHeapMesh(): MeshAcc {
  const a = new MeshAcc();
  a.lathe([[0, 0.84], [0.95, 0.84], [0.75, 0.98], [0.4, 1.1], [0, 1.16]], 12, 9, 0.05);
  return a;
}

// ───────────────────────────── base prop ─────────────────────────────

export abstract class PantryProp {
  protected root: SceneObject;
  protected tris: { [k: string]: number } = {};
  protected fx: SceneObject[] = [];
  protected dead: boolean = false;

  constructor(protected ctl: PantryController, protected n: number, protected entry: PrepSlotEntry, protected variant: string) {
    this.root = global.scene.createSceneObject(`PantryProp_${n}`);
    this.root.setParent(ctl.stationsObject());
  }

  /** Root object (the staged reveal pops this). */
  getObject(): SceneObject {
    return this.root;
  }

  getAccessNumber(): number {
    return this.n;
  }

  getItemKey(): string {
    return `pantry_${this.n}`;
  }

  getVariant(): string {
    return this.variant;
  }

  getName(): string {
    return this.entry.name || `Pantry #${this.n}`;
  }

  isLive(): boolean {
    return !this.dead && !!this.root && !isNull(this.root);
  }

  getTriCounts(): { [k: string]: number } {
    const o: { [k: string]: number } = {};
    for (const k in this.tris) o[k] = this.tris[k];
    return o;
  }

  abstract getRestSlot(): SlotId;

  update(_dt: number): void {}

  /** Puts everything back at the rest slot (unmelted, unswirled, spices back in the dish). */
  resetToRest(): void {}

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.ctl.tweens.clear(this);
    for (const o of this.fx) if (o && !isNull(o)) o.destroy();
    this.fx = [];
    if (this.root && !isNull(this.root)) this.root.destroy();
  }

  protected seat(slot: SlotId): void {
    const p = toRoot(getSlot(slot));
    this.root.getTransform().setLocalPosition(new vec3(p.x, p.y, p.z));
  }

  protected part(parent: SceneObject, name: string, acc: MeshAcc, m: Material, key?: string): SceneObject {
    const o = global.scene.createSceneObject(name);
    o.setParent(parent);
    const r = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    r.mesh = acc.toMesh();
    r.mainMaterial = m;
    const k = `${this.n}_${key || name}`;
    this.tris[key || name] = acc.triCount();
    PANTRY_TRIS[k] = acc.triCount();
    return o;
  }

  protected partMesh(parent: SceneObject, name: string, mesh: RenderMesh, m: Material): SceneObject {
    const o = global.scene.createSceneObject(name);
    o.setParent(parent);
    const r = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    r.mesh = mesh;
    r.mainMaterial = m;
    return o;
  }

  protected track(o: SceneObject): SceneObject {
    this.fx.push(o);
    return o;
  }

  protected setPose(o: SceneObject, pos: number[], eulDeg: number[], s: number): void {
    const tr = o.getTransform();
    tr.setLocalPosition(new vec3(pos[0], pos[1], pos[2]));
    tr.setLocalRotation(quat.fromEulerAngles(eulDeg[0] * DEG, eulDeg[1] * DEG, eulDeg[2] * DEG));
    tr.setLocalScale(new vec3(s, s, s));
  }

  /** Arc hop of `obj` to a world point (ease + parabola, height in StationsRoot cm). */
  protected hop(obj: SceneObject, to: vec3, height: number, delay: number, dur: number, done?: () => void, spinDeg: number = 0): void {
    let from: vec3 | null = null;
    let rot0: quat | null = null;
    this.ctl.tweens.add(this, delay, dur, (k) => {
      if (!obj || isNull(obj)) return;
      const tr = obj.getTransform();
      if (!from) {
        from = tr.getWorldPosition();
        rot0 = tr.getWorldRotation();
      }
      const e = smooth(k);
      const arc = 4 * k * (1 - k) * height * this.ctl.unit();
      tr.setWorldPosition(new vec3(lerp(from.x, to.x, e), lerp(from.y, to.y, e) + arc, lerp(from.z, to.z, e)));
      if (spinDeg !== 0 && rot0) tr.setWorldRotation(rot0.multiply(quat.angleAxis(spinDeg * DEG * e, vec3.up())));
    }, done);
  }
}

// ───────────────────────────── #160 whole garam masala trio ─────────────────────────────

interface SpicePiece {
  obj: SceneObject;
  pos: number[];
  eul: number[];
  s: number;
  half: number;
}

export class GaramMasalaProp extends PantryProp {
  private pieces: SpicePiece[] = [];
  private dropped: boolean = false;
  private sizzle: { holder: SceneObject; landed: { obj: SceneObject; y: number }[]; target: PantryTarget } | null = null;

  constructor(ctl: PantryController, entry: PrepSlotEntry) {
    super(ctl, 160, entry, "garam masala");
    this.seat("SLOT_PANTRY_SPICE");
    const dish = this.part(this.root, "GaramDish", ramekinMesh(14), mat([0.93, 0.91, 0.86], 0, 0.2, 0.1), "dish");
    dish.getTransform().setLocalScale(new vec3(1.45, 1.45, 1.45));
    const sa = starAniseMeshes();
    const starMesh = sa.pods.toMesh();
    const seedMesh = sa.seeds.toMesh();
    this.tris["star_pods"] = sa.pods.triCount();
    this.tris["star_seeds"] = sa.seeds.triCount();
    const cinA = cinnamonMesh(), cardA = cardamomMesh(), cloveA = cloveMesh(), bayA = bayMesh();
    this.tris["cinnamon"] = cinA.triCount();
    this.tris["cardamom"] = cardA.triCount();
    this.tris["clove"] = cloveA.triCount();
    this.tris["bay"] = bayA.triCount();
    const cinMesh = cinA.toMesh(), cardMesh = cardA.toMesh(), cloveM = cloveA.toMesh(), bayM = bayA.toMesh();
    const mStar = mat([0.58, 0.34, 0.18], 0, 0.6, 0.14);
    const mSeed = mat([0.34, 0.18, 0.09], 0.1, 0.25, 0.1);
    const mCin = mat([0.72, 0.44, 0.22], 0, 0.7, 0.14);
    mCin.mainPass.twoSided = true;
    const mCard = mat([0.62, 0.74, 0.34], 0, 0.5, 0.14);
    const mClove = mat([0.46, 0.27, 0.15], 0, 0.5, 0.12);
    const mBay = mat([0.48, 0.58, 0.26], 0, 0.55, 0.14);
    const layout: { k: string; pos: number[]; eul: number[]; s: number }[] = [
      { k: "bay", pos: [0.0, 1.0, 0.0], eul: [4, 35, 6], s: 1.15 },
      { k: "cin", pos: [0.05, 0.62, 0.78], eul: [0, 78, 4], s: 1.5 },
      { k: "cin", pos: [-0.2, 0.86, -0.72], eul: [0, -12, -5], s: 1.4 },
      { k: "star", pos: [-0.5, 1.12, 0.2], eul: [8, 25, 6], s: 1.5 },
      { k: "star", pos: [0.55, 1.2, -0.3], eul: [-10, -40, -8], s: 1.35 },
      { k: "card", pos: [0.85, 0.72, 0.5], eul: [0, 50, 0], s: 1.7 },
      { k: "card", pos: [-0.92, 0.7, -0.35], eul: [0, -30, 0], s: 1.7 },
      { k: "card", pos: [0.1, 1.05, 0.15], eul: [0, 110, 0], s: 1.7 },
      { k: "clove", pos: [0.62, 0.9, -0.55], eul: [0, 20, 0], s: 1.5 },
      { k: "clove", pos: [-0.7, 0.95, 0.5], eul: [0, 120, 0], s: 1.5 },
      { k: "clove", pos: [0.05, 1.3, -0.05], eul: [0, -60, 0], s: 1.5 },
      { k: "clove", pos: [-0.2, 0.8, 0.95], eul: [0, 75, 0], s: 1.5 },
    ];
    let idx = 0;
    for (const L of layout) {
      let o: SceneObject;
      let half = 0.12;
      if (L.k === "star") {
        o = this.partMesh(this.root, `Star_${idx}`, starMesh, mStar);
        const seeds = this.partMesh(o, "StarSeeds", seedMesh, mSeed);
        seeds.getTransform().setLocalPosition(vec3.zero());
        half = 0.1;
      } else if (L.k === "cin") {
        o = this.partMesh(this.root, `Cinnamon_${idx}`, cinMesh, mCin);
        half = 0.3;
      } else if (L.k === "card") {
        o = this.partMesh(this.root, `Cardamom_${idx}`, cardMesh, mCard);
        half = 0.22;
      } else if (L.k === "clove") {
        o = this.partMesh(this.root, `Clove_${idx}`, cloveM, mClove);
        half = 0.15;
      } else {
        o = this.partMesh(this.root, `BayLeaf_${idx}`, bayM, mBay);
        half = 0.08;
      }
      this.setPose(o, L.pos, L.eul, L.s);
      this.pieces.push({ obj: o, pos: L.pos, eul: L.eul, s: L.s, half: half * L.s });
      idx++;
    }
    print(`[PantryGen] #160 garam masala: star ${this.tris["star_pods"]}+${this.tris["star_seeds"]}, cinnamon ${this.tris["cinnamon"]}, cardamom ${this.tris["cardamom"]}, clove ${this.tris["clove"]}, bay ${this.tris["bay"]}, dish ${this.tris["dish"]} tris`);
  }

  getRestSlot(): SlotId {
    return "SLOT_PANTRY_SPICE";
  }

  isDropped(): boolean {
    return this.dropped;
  }

  /**
   * The spices hop one after another into the hot oil of `target` (pan / pot / any SceneObject / PantryTarget),
   * land with a sizzle ripple and keep sizzling ~1.5 s, then onDone. They stay in the pan until resetToRest().
   */
  dropInto(target: any, onDone?: () => void): void {
    const t = this.ctl.resolve(target, "pan");
    if (!t || this.dropped) {
      if (onDone) onDone();
      return;
    }
    this.dropped = true;
    const holder = this.track(this.ctl.holder(t, 0));
    const u = this.ctl.unit();
    const R = Math.min(Math.max(1.0, t.radius * 0.5), 3.4);
    // oil sheen under the spices
    const sheen = this.ctl.pool(t, [0.98, 0.78, 0.30], 0.02);
    this.track(sheen.obj);
    this.ctl.tweens.add(this, 0, 0.9, (k) => {
      sheen.setRadius(R * 1.25 * smooth(k));
      sheen.fade.set(0.5 * smooth(k * 2));
    });
    const landed: { obj: SceneObject; y: number }[] = [];
    const N = this.pieces.length;
    const ga = 2.399963;
    for (let i = 0; i < N; i++) {
      const p = this.pieces[i];
      const ang = i * ga;
      const rr = R * Math.sqrt((i + 0.5) / N) * 0.95;
      const lx = Math.cos(ang) * rr, lz = Math.sin(ang) * rr;
      const ly = 0.14 + p.half * 0.5;
      const lw = holder.getTransform().getWorldTransform().multiplyPoint(new vec3(lx, ly, lz));
      this.hop(p.obj, lw, 3.6, 0.15 + i * 0.1, 0.62, () => {
        if (!p.obj || isNull(p.obj) || !holder || isNull(holder)) return;
        p.obj.setParent(holder);
        const tr = p.obj.getTransform();
        tr.setLocalPosition(new vec3(lx, ly, lz));
        tr.setLocalRotation(quat.fromEulerAngles(0, ((i * 67) % 360) * DEG, 0));
        tr.setLocalScale(new vec3(p.s, p.s, p.s));
        landed.push({ obj: p.obj, y: ly });
        this.ctl.ring(t, tr.getWorldPosition(), [0.98, 0.84, 0.46], 1.7 * 1.0, 0.75);
      }, 360);
      void u;
    }
    const startSizzle = 0.15 + N * 0.1 + 0.62;
    let nextRing = 0;
    this.ctl.tweens.add(this, startSizzle, 1.5, (k) => {
      for (let i = 0; i < landed.length; i++) {
        const l = landed[i];
        if (!l.obj || isNull(l.obj)) continue;
        l.obj.getTransform().setLocalPosition(new vec3(l.obj.getTransform().getLocalPosition().x, l.y + 0.07 * Math.sin(k * 34 + i * 1.7) * (1 - k * 0.6), l.obj.getTransform().getLocalPosition().z));
      }
      if (k >= nextRing && landed.length > 0) {
        nextRing += 0.22;
        const l = landed[Math.floor(k * 97 + nextRing * 13) % landed.length];
        if (l.obj && !isNull(l.obj)) this.ctl.ring(t, l.obj.getTransform().getWorldPosition(), [0.98, 0.84, 0.46], 1.3, 0.6);
      }
    }, () => {
      this.sizzle = { holder: holder, landed: landed, target: t };
      if (onDone) onDone();
    });
  }

  resetToRest(): void {
    this.ctl.tweens.clear(this);
    for (const p of this.pieces) {
      if (!p.obj || isNull(p.obj)) continue;
      p.obj.setParent(this.root);
      this.setPose(p.obj, p.pos, p.eul, p.s);
    }
    for (const o of this.fx) if (o && !isNull(o)) o.destroy();
    this.fx = [];
    this.sizzle = null;
    this.dropped = false;
  }
}

// ───────────────────────────── #161 ground spice & herb powders ─────────────────────────────

const POWDER_DEFAULT: number[][] = [[0.96, 0.72, 0.0], [0.79, 0.1, 0.07], [0.43, 0.28, 0.13], [0.23, 0.48, 0.16]];

interface PowderSrc {
  ramekin: SceneObject | null;
  heap: SceneObject | null;
  rgb: number[];
  amount: number;
}

export class PowderProp extends PantryProp {
  private srcs: PowderSrc[] = [];
  private colours: number[][] = [];
  private ownCount: number = 4;
  private withA4b: boolean = false;
  private tint: PoolHandle[] = [];
  private grain: RenderMesh | null = null;
  private puff: RenderMesh | null = null;

  constructor(ctl: PantryController, entry: PrepSlotEntry, withRamekins: boolean) {
    super(ctl, 161, entry, withRamekins ? "ramekins #326" : "own ramekins");
    const cat = getCatalogEntry(161);
    const extra = cat && cat.extraColors ? cat.extraColors : null;
    for (let i = 0; i < 4; i++) this.colours.push(rgbOf(extra ? extra[i] : undefined, POWDER_DEFAULT[i]));
    this.withA4b = withRamekins;
    const board = ctl.boardObject();
    if (board) this.root.setParent(board);
    const slot = getSlot("SLOT_SPICE_RAMEKINS");
    this.root.getTransform().setLocalPosition(new vec3(0, slot.y, 0));
    const ram = ramekinMesh(14).toMesh();
    const first = withRamekins ? 3 : 0;
    this.ownCount = withRamekins ? 1 : 4;
    const rm = ramekinMesh(14);
    this.tris["ramekin"] = rm.triCount();
    const hm = new MeshAcc();
    hm.lathe(POWDER_PROFILE, 12, 9, 0.04);
    this.tris["heap"] = hm.triCount();
    const heapMesh = hm.toMesh();
    const mRam = mat([0.93, 0.91, 0.86], 0, 0.2, 0.1);
    for (let i = 0; i < this.ownCount; i++) {
      const ci = first + i;
      const o = global.scene.createSceneObject(["RamekinTurmeric", "RamekinKashmiriRed", "RamekinCumin", "RamekinHerbGreen"][ci] + "_P161");
      o.setParent(this.root);
      o.getTransform().setLocalPosition(new vec3(RAMEKIN_POS[ci][0], 0, RAMEKIN_POS[ci][1]));
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mesh = ram;
      rmv.mainMaterial = mRam;
      const h = global.scene.createSceneObject("Powder");
      h.setParent(o);
      const hr = h.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      hr.mesh = heapMesh;
      hr.mainMaterial = mat(this.colours[ci], 0, 0.85, 0.16);
      this.srcs.push({ ramekin: o, heap: h, rgb: this.colours[ci], amount: 1 });
    }
    PANTRY_TRIS["161_ramekin"] = rm.triCount();
    PANTRY_TRIS["161_heap"] = hm.triCount();
    if (withRamekins) {
      // #326 integration: recolour / refill the three A4b ramekins with the first three powders
      ctl.configureRamekins([this.colours[0], this.colours[1], this.colours[2]], [0.92, 0.92, 0.92]);
      for (let i = 0; i < 3; i++) this.srcs.unshift({ ramekin: null, heap: null, rgb: this.colours[2 - i], amount: 0.92 });
      this.srcs = [this.srcs[0], this.srcs[1], this.srcs[2], this.srcs[3]];
      // order: turmeric, kashmiri, cumin (A4b ramekins, resolved lazily), herb (own)
      this.srcs[0].rgb = this.colours[0];
      this.srcs[1].rgb = this.colours[1];
      this.srcs[2].rgb = this.colours[2];
    }
    print(`[PantryGen] #161 powders: ramekin ${this.tris["ramekin"]}, heap ${this.tris["heap"]} tris x${this.ownCount} (${this.variant})`);
  }

  getRestSlot(): SlotId {
    return "SLOT_SPICE_RAMEKINS";
  }

  getPowderColours(): number[][] {
    return this.colours.map((c) => c.slice());
  }

  getPowderCount(): number {
    return this.srcs.length;
  }

  /** Resolves the ramekin world point of powder i (A4b ramekins are looked up lazily). */
  private sourceWorld(i: number): vec3 | null {
    const s = this.srcs[i];
    if (!s) return null;
    let o: SceneObject | null = s.ramekin;
    if (!o && this.withA4b) {
      const r = this.ctl.ramekinRoot();
      const c = r ? r.getChild(i) : null;
      o = c || null;
    }
    if (!o || isNull(o)) return null;
    return o.getTransform().getWorldTransform().multiplyPoint(new vec3(0, 1.3, 0));
  }

  /** Sets powder i's colour + heap amount (0..1) on the own or #326 ramekin. */
  setPowder(i: number, rgb: Rgb | number[], amount: number): void {
    const s = this.srcs[i];
    if (!s) return;
    s.rgb = rgbOf(rgb, s.rgb);
    s.amount = clamp01(amount);
    if (s.heap && !isNull(s.heap)) {
      const r = s.heap.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      r.mainMaterial = mat(s.rgb, 0, 0.85, 0.16);
      s.heap.getTransform().setLocalScale(new vec3(1, s.amount, 1));
      s.heap.getTransform().setLocalPosition(new vec3(0, 0.84 * (1 - s.amount), 0));
    } else if (this.withA4b && i < 3) {
      const cols: (number[] | null)[] = [null, null, null];
      const am: number[] = [0.92, 0.92, 0.92];
      cols[i] = s.rgb;
      am[i] = s.amount;
      this.ctl.configureRamekins(cols, am);
    }
  }

  /** A pinch of powder i into `target`: grains arc over, a puff rises and the oil / sauce takes the colour. */
  pinchInto(target: any, index: number = 0, onDone?: () => void): void {
    const t = this.ctl.resolve(target, "pan");
    const i = Math.max(0, Math.min(this.srcs.length - 1, Math.floor(index)));
    const s = this.srcs[i];
    const from = this.sourceWorld(i);
    if (!t || !s || !from) {
      if (onDone) onDone();
      return;
    }
    const rgb = s.rgb;
    if (!this.grain) {
      this.grain = grainMesh().toMesh();
      this.puff = puffMesh().toMesh();
    }
    const u = this.ctl.unit();
    const rnd = makeRng(161 + i * 7 + this.tint.length * 3);
    const grains: { o: SceneObject; to: vec3; }[] = [];
    const gm = mat(rgb, 0, 0.85, 0.2);
    for (let g = 0; g < 8; g++) {
      const o = global.scene.createSceneObject("PowderGrain");
      o.setParent(this.ctl.stationsObject());
      this.partMesh(o, "g", this.grain, gm);
      const sc = u * (1.3 + rnd() * 0.8);
      o.getTransform().setWorldScale(new vec3(sc, sc, sc));
      o.getTransform().setWorldPosition(from);
      this.track(o);
      grains.push({ o: o, to: new vec3(t.world.x + (rnd() - 0.5) * 1.1 * u, t.world.y + 0.08 * u, t.world.z + (rnd() - 0.5) * 1.1 * u) });
    }
    const start = from;
    this.ctl.tweens.add(this, 0, 0.6, (k) => {
      const e = smooth(k);
      for (let g = 0; g < grains.length; g++) {
        const to = grains[g].to;
        const arc = 4 * k * (1 - k) * (2.6 + g * 0.12) * u;
        grains[g].o.getTransform().setWorldPosition(new vec3(lerp(start.x, to.x, e), lerp(start.y, to.y, e) + arc, lerp(start.z, to.z, e)));
      }
    }, () => {
      for (const g of grains) if (g.o && !isNull(g.o)) g.o.enabled = false;
      this.ctl.ring(t, t.world, rgb, 1.2, 0.6);
      this.spawnPuff(t, rgb);
      this.addTint(t, rgb, rnd);
      s.amount = Math.max(0.35, s.amount - 0.12);
      this.setPowder(i, rgb, s.amount);
      this.ctl.tweens.add(this, 0, 0.9, () => {}, () => {
        if (onDone) onDone();
      });
    });
  }

  private spawnPuff(t: PantryTarget, rgb: number[]): void {
    const holder = this.track(this.ctl.holder(t, 0.15));
    const blobs: { o: SceneObject; f: Fade; dx: number; dz: number }[] = [];
    for (let b = 0; b < 3; b++) {
      const f = new Fade(mixRgb(rgb, [1, 1, 1], 0.25), 0.7, 0.18);
      const o = this.partMesh(holder, "PowderPuff", this.puff as RenderMesh, f.m);
      blobs.push({ o: o, f: f, dx: (b - 1) * 0.45, dz: ((b * 5) % 3 - 1) * 0.35 });
    }
    this.ctl.tweens.add(this, 0, 0.95, (k) => {
      for (const b of blobs) {
        if (!b.o || isNull(b.o)) continue;
        const sc = lerp(0.35, 1.6, smooth(k));
        b.o.getTransform().setLocalScale(new vec3(sc, sc * 0.8, sc));
        b.o.getTransform().setLocalPosition(new vec3(b.dx * k, 0.2 + 1.5 * k, b.dz * k));
        b.f.set(0.7 * (1 - k) * (1 - k));
      }
    }, () => {
      if (holder && !isNull(holder)) holder.destroy();
    });
  }

  private addTint(t: PantryTarget, rgb: number[], rnd: () => number): void {
    const layer = this.tint.length;
    const p = this.ctl.pool(t, rgb, 0.04 + Math.min(layer, 5) * 0.006);
    this.track(p.obj);
    this.tint.push(p);
    const R = Math.min(Math.max(1.0, t.radius * 0.55), 3.0) * (0.75 + rnd() * 0.3);
    this.ctl.tweens.add(this, 0, 0.9, (k) => {
      p.setRadius(R * smooth(k));
      p.fade.set(0.42 * smooth(k));
    });
  }

  resetToRest(): void {
    this.ctl.tweens.clear(this);
    for (const o of this.fx) if (o && !isNull(o)) o.destroy();
    this.fx = [];
    this.tint = [];
    for (let i = 0; i < this.srcs.length; i++) this.setPowder(i, this.colours[i], i < 3 && this.withA4b ? 0.92 : 1);
  }

  destroy(): void {
    if (this.withA4b) this.ctl.restoreRamekins();
    super.destroy();
  }
}

// ───────────────────────────── fx pools ─────────────────────────────

export interface PoolHandle {
  obj: SceneObject;
  fade: Fade;
  setRadius(r: number): void;
}

// ───────────────────────────── #162 butter / ghee pat ─────────────────────────────

export class ButterProp extends PantryProp {
  private mover: SceneObject;
  private body: SceneObject;
  private pool: SceneObject;
  private foam: SceneObject;
  private bubbles: { o: SceneObject; ph: number; s: number }[] = [];
  private poolMat: Material;
  private bodyMat: Material;
  private k: number = 0;
  private R: number = 1.0;
  private clock: number = 0;
  private tgt: PantryTarget | null = null;
  private ghee: boolean;

  constructor(ctl: PantryController, entry: PrepSlotEntry, ghee: boolean) {
    super(ctl, 162, entry, ghee ? "ghee" : "butter");
    this.ghee = ghee;
    this.seat("SLOT_PANTRY_FAT");
    this.part(this.root, "ButterDish", slateDishMesh(1.6), mat([0.86, 0.60, 0.46], 0.1, 0.45, 0.12), "dish");
    this.mover = global.scene.createSceneObject("ButterMover");
    this.mover.setParent(this.root);
    this.mover.getTransform().setLocalPosition(new vec3(0, 0.17, 0));
    const body = ghee ? gheePuckMesh() : butterCubeMesh();
    const cube = ghee ? [0.97, 0.76, 0.28] : [0.99, 0.90, 0.52];
    this.bodyMat = mat(cube, 0.0, 0.32, 0.2);
    this.body = this.part(this.mover, ghee ? "GheePuck" : "ButterCube", body, this.bodyMat, "pat");
    this.body.getTransform().setLocalScale(new vec3(1.15, 1.15, 1.15));
    this.poolMat = mat(ghee ? [0.98, 0.68, 0.16] : [1.0, 0.82, 0.28], 0.15, 0.08, 0.3);
    this.pool = this.part(this.mover, "MeltPool", poolMesh(), this.poolMat, "pool");
    this.pool.enabled = false;
    this.foam = global.scene.createSceneObject("FoamRing");
    this.foam.setParent(this.mover);
    this.foam.enabled = false;
    const bub = unitBubble();
    this.tris["bubble"] = bub.triCount();
    const bm = bub.toMesh();
    const fm = mat([1.0, 0.95, 0.72], 0.0, 0.2, 0.25);
    const rnd = makeRng(162);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + rnd() * 0.3;
      const rr = i < 8 ? 0.8 + rnd() * 0.12 : rnd() * 0.45;
      const o = this.partMesh(this.foam, "Bubble", bm, fm);
      const s = 0.1 + rnd() * 0.1;
      o.getTransform().setLocalPosition(new vec3(Math.cos(a) * rr, 0.04, Math.sin(a) * rr));
      this.bubbles.push({ o: o, ph: rnd() * 6.28, s: s });
    }
    PANTRY_TRIS["162_foam_total"] = bub.triCount() * 10;
    this.setMelt(0);
    print(`[PantryGen] #162 ${this.variant}: pat ${this.tris["pat"]}, pool ${this.tris["pool"]}, bubble ${this.tris["bubble"]} x10, dish ${this.tris["dish"]} tris`);
  }

  getRestSlot(): SlotId {
    return "SLOT_PANTRY_FAT";
  }

  getMelt(): number {
    return this.k;
  }

  /** Moves the pat onto `target` (skillet, wok, handi floor, any SceneObject / PantryTarget). */
  placeOn(target: any, onDone?: () => void): void {
    const t = this.ctl.resolve(target, "pan");
    if (!t) {
      if (onDone) onDone();
      return;
    }
    this.tgt = t;
    this.R = Math.min(Math.max(1.1, t.radius * 0.5), 2.7);
    const to = new vec3(t.world.x, t.world.y + 0.02 * this.ctl.unit(), t.world.z);
    this.hop(this.mover, to, 3.2, 0, 0.75, () => {
      if (!this.mover || isNull(this.mover) || !t.obj || isNull(t.obj)) return;
      this.ctl.mount(this.mover, t.obj, to, 0);
      this.applyMelt();
      if (onDone) onDone();
    });
  }

  /** Cube shrinks while the golden foaming pool grows. k 0 = cold pat, 1 = fully melted. */
  setMelt(k: number): void {
    this.k = clamp01(k);
    this.applyMelt();
  }

  private applyMelt(): void {
    const k = this.k;
    const e = smooth(k);
    const cube = k < 0.97;
    this.body.enabled = cube;
    if (cube) {
      const sxz = Math.max(0.02, 1 - 0.85 * e);
      const sy = Math.max(0.02, Math.pow(1 - e, 1.25));
      this.body.getTransform().setLocalScale(new vec3(1.15 * sxz, 1.15 * sy, 1.15 * sxz));
    }
    const p = smooth((k - 0.03) / 0.97);
    this.pool.enabled = k > 0.02;
    const Rp = this.tgt ? this.R : 1.1;
    const r = Rp * (0.15 + 0.85 * p);
    this.pool.getTransform().setLocalScale(new vec3(r, 1, r));
    this.foam.enabled = k > 0.12;
    this.foam.getTransform().setLocalScale(new vec3(r * 0.95, 1, r * 0.95));
    const cool = mixRgb(this.ghee ? [0.97, 0.76, 0.28] : [0.99, 0.9, 0.52], [1.0, 0.8, 0.2], e);
    this.bodyMat.mainPass.baseColor = new vec4(cool[0], cool[1], cool[2], 1);
  }

  /** Animated melt over `seconds` (default 3.5), then onDone. */
  meltOver(seconds: number = 3.5, onDone?: () => void): void {
    const k0 = this.k;
    this.ctl.tweens.add(this, 0, seconds, (k) => this.setMelt(lerp(k0, 1, k)), onDone);
  }

  update(dt: number): void {
    if (!this.foam.enabled) return;
    this.clock += dt;
    const calm = this.k >= 0.995 ? 0.55 : 1;
    for (const b of this.bubbles) {
      const s = b.s * (0.7 + 0.3 * Math.sin(this.clock * 7 + b.ph)) * calm * (this.tgt ? 1 : 0.8);
      b.o.getTransform().setLocalScale(new vec3(s * 2, s * 2, s * 2));
    }
  }

  resetToRest(): void {
    this.ctl.tweens.clear(this);
    this.mover.setParent(this.root);
    this.mover.getTransform().setLocalPosition(new vec3(0, 0.17, 0));
    this.mover.getTransform().setLocalRotation(quat.quatIdentity());
    this.mover.getTransform().setLocalScale(vec3.one());
    this.tgt = null;
    this.setMelt(0);
  }
}

// ───────────────────────────── #163 grated cheese ─────────────────────────────

export class CheeseProp extends PantryProp {
  private mover: SceneObject;
  private shreds: SceneObject;
  private cap: SceneObject;
  private shredMat: Material;
  private capMat: Material;
  private k: number = 0;
  private R: number = 1.5;
  private tgt: PantryTarget | null = null;
  private parmesan: boolean;

  constructor(ctl: PantryController, entry: PrepSlotEntry, parmesan: boolean) {
    super(ctl, 163, entry, parmesan ? "parmesan" : "mozzarella");
    this.parmesan = parmesan;
    this.seat("SLOT_PANTRY_CHEESE");
    this.part(this.root, "CheesePlate", slateDishMesh(1.6), mat([0.93, 0.91, 0.86], 0, 0.25, 0.1), "plate");
    this.mover = global.scene.createSceneObject("CheeseMover");
    this.mover.setParent(this.root);
    this.mover.getTransform().setLocalPosition(new vec3(0, 0.17, 0));
    this.shredMat = mat(this.ivory(), 0, 0.6, 0.18);
    this.shreds = this.part(this.mover, "CheeseShreds", cheeseShredMesh(), this.shredMat, "shreds");
    this.capMat = mat(this.ivory(), 0.05, 0.5, 0.2);
    this.cap = this.part(this.mover, "CheeseCap", cheeseCapMesh(), this.capMat, "cap");
    this.cap.enabled = false;
    this.setMelt(0);
    print(`[PantryGen] #163 ${this.variant}: shreds ${this.tris["shreds"]}, cap ${this.tris["cap"]}, plate ${this.tris["plate"]} tris`);
  }

  private ivory(): number[] {
    return this.parmesan ? [0.97, 0.92, 0.70] : [0.99, 0.96, 0.84];
  }

  getRestSlot(): SlotId {
    return "SLOT_PANTRY_CHEESE";
  }

  getMelt(): number {
    return this.k;
  }

  /** Moves the shreds on top of `target` (pasta / flatbread / rice, plate, pan ...). */
  placeOn(target: any, onDone?: () => void): void {
    const t = this.ctl.resolve(target, "starch") || this.ctl.resolve(null, "plate");
    if (!t) {
      if (onDone) onDone();
      return;
    }
    this.tgt = t;
    this.R = Math.min(Math.max(1.3, t.radius * 0.8), 3.0);
    const to = new vec3(t.world.x, t.world.y + 0.03 * this.ctl.unit(), t.world.z);
    this.hop(this.mover, to, 3.6, 0, 0.8, () => {
      if (!this.mover || isNull(this.mover) || !t.obj || isNull(t.obj)) return;
      this.ctl.mount(this.mover, t.obj, to, 0);
      this.applyMelt();
      if (onDone) onDone();
    });
  }

  /** Shreds sag and merge into a glossy golden cap. k 0 = fresh pile, 1 = melted. */
  setMelt(k: number): void {
    this.k = clamp01(k);
    this.applyMelt();
  }

  private applyMelt(): void {
    const k = this.k;
    const e = smooth(k);
    this.shreds.enabled = k < 0.92;
    const sp = 1 + 0.35 * e;
    this.shreds.getTransform().setLocalScale(new vec3(sp, Math.max(0.12, 1 - 0.88 * e), sp));
    const gold = [0.98, 0.72, 0.2];
    const c = mixRgb(this.ivory(), gold, e);
    this.shredMat.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
    this.cap.enabled = k > 0.08;
    const cp = smooth((k - 0.08) / 0.92);
    const r = (this.tgt ? this.R : 1.4) * (0.35 + 0.65 * cp);
    this.cap.getTransform().setLocalScale(new vec3(r, 0.6 + 0.8 * cp, r));
    this.capMat.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1);
    (this.capMat.mainPass as any).roughness = lerp(0.55, 0.1, e);
    (this.capMat.mainPass as any).metallic = lerp(0.0, 0.25, e);
    glow(this.capMat, c, lerp(0.15, 0.32, e));
  }

  meltOver(seconds: number = 3.5, onDone?: () => void): void {
    const k0 = this.k;
    this.ctl.tweens.add(this, 0, seconds, (k) => this.setMelt(lerp(k0, 1, k)), onDone);
  }

  resetToRest(): void {
    this.ctl.tweens.clear(this);
    this.mover.setParent(this.root);
    this.mover.getTransform().setLocalPosition(new vec3(0, 0.17, 0));
    this.mover.getTransform().setLocalRotation(quat.quatIdentity());
    this.mover.getTransform().setLocalScale(vec3.one());
    this.tgt = null;
    this.setMelt(0);
  }
}

// ───────────────────────────── #164 cream / coconut / yogurt swirl ─────────────────────────────

export class CreamProp extends PantryProp {
  private ribbon: SceneObject | null = null;
  private ribbonRmv: RenderMeshVisual | null = null;
  private dollop: SceneObject | null = null;
  private tip: SceneObject | null = null;
  private holderObj: SceneObject | null = null;
  private mat: Material;
  private R: number = 2.0;
  private progress: number = 0;
  private tgt: PantryTarget | null = null;

  constructor(ctl: PantryController, entry: PrepSlotEntry, variant: string) {
    super(ctl, 164, entry, variant);
    this.seat("SLOT_PANTRY_CREAM");
    const col = this.colour();
    this.part(this.root, "CreamCup", ramekinMesh(14), mat([0.93, 0.91, 0.86], 0, 0.2, 0.1), "cup").getTransform().setLocalScale(new vec3(1.2, 1.2, 1.2));
    const surf = new MeshAcc();
    surf.lathe([[1.0, 1.0], [0.95, 1.04], [0.55, 1.12], [0, 1.15]], 14);
    this.part(this.root, "CreamSurface", surf, mat(col, 0, 0.18, 0.28), "surface").getTransform().setLocalScale(new vec3(1.15, 1.15, 1.15));
    this.mat = mat(col, 0, 0.16, 0.3);
    print(`[PantryGen] #164 ${this.variant}: cup ${this.tris["cup"]}, surface ${this.tris["surface"]}, ribbon <= ${SWIRL_K - 1}x6x2+12 tris`);
  }

  private colour(): number[] {
    return this.variant === "coconut" ? [0.97, 0.96, 0.9] : this.variant === "yogurt" ? [1.0, 0.99, 0.96] : [0.99, 0.95, 0.86];
  }

  getRestSlot(): SlotId {
    return "SLOT_PANTRY_CREAM";
  }

  getProgress(): number {
    return this.progress;
  }

  private ensureRibbon(t: PantryTarget, lift: number): void {
    this.tgt = t;
    this.R = Math.min(Math.max(1.3, t.radius * 0.8), 2.9);
    if (!this.holderObj || isNull(this.holderObj)) {
      this.holderObj = this.track(this.ctl.holder(t, lift));
      this.ribbon = global.scene.createSceneObject("CreamRibbon");
      this.ribbon.setParent(this.holderObj);
      this.ribbonRmv = this.ribbon.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      this.ribbonRmv.mainMaterial = this.mat;
      const d = new MeshAcc();
      d.ellipsoid(0, 0.1, 0, 0.3, 0.2, 0.3, 8, 4);
      this.dollop = this.part(this.holderObj, "CreamDollop", d, this.mat, "dollop");
      this.dollop.getTransform().setLocalPosition(new vec3(0, 0.14, 0));
      this.dollop.enabled = false;
      const tp = new MeshAcc();
      tp.ellipsoid(0, 0, 0, 0.14, 0.12, 0.14, 6, 3);
      this.tip = this.part(this.holderObj, "CreamTip", tp, this.mat, "tip");
      this.tip.enabled = false;
    }
  }

  /** Draws the spiral up to progress p (0..1) on `target` (instant pose; swirlOnto animates this). */
  setProgress(p: number, target?: any): void {
    const t = target !== undefined ? this.ctl.resolve(target, "plate") : this.tgt;
    if (!t) return;
    this.ensureRibbon(t, 0.05);
    this.progress = clamp01(p);
    const m = swirlMesh(this.R, this.progress);
    if (this.ribbonRmv && this.ribbon) {
      this.ribbon.enabled = !!m;
      if (m) {
        this.ribbonRmv.mesh = m.toMesh();
        this.tris["ribbon"] = m.triCount();
        PANTRY_TRIS["164_ribbon"] = Math.max(PANTRY_TRIS["164_ribbon"] || 0, m.triCount());
      }
    }
    if (this.dollop) {
      const d = smooth((this.progress - 0.9) / 0.1);
      this.dollop.enabled = d > 0.01;
      this.dollop.getTransform().setLocalScale(new vec3(Math.max(0.01, d), Math.max(0.01, d), Math.max(0.01, d)));
    }
    if (this.tip) {
      const total = (SWIRL_K - 1) * this.progress / (SWIRL_K - 1);
      const ang = 2.25 * Math.PI * 2 * total;
      const rr = this.R * (1 - 0.9 * total);
      this.tip.enabled = this.progress > 0.02 && this.progress < 0.995;
      this.tip.getTransform().setLocalPosition(new vec3(Math.cos(ang) * rr, 0.16, Math.sin(ang) * rr));
    }
  }

  /** Animated spiral drizzle onto `target` (the finished plate / bowl by default), then onDone. */
  swirlOnto(target: any, onDone?: () => void, seconds: number = 2.6): void {
    const t = this.ctl.resolve(target, "plate");
    if (!t) {
      if (onDone) onDone();
      return;
    }
    this.ctl.tweens.add(this, 0, seconds, (k) => this.setProgress(k, t), onDone);
  }

  resetToRest(): void {
    this.ctl.tweens.clear(this);
    for (const o of this.fx) if (o && !isNull(o)) o.destroy();
    this.fx = [];
    this.ribbon = null;
    this.ribbonRmv = null;
    this.dollop = null;
    this.tip = null;
    this.holderObj = null;
    this.progress = 0;
    this.tgt = null;
  }
}

// ───────────────────────────── #165 oils & umami glazes ─────────────────────────────

const OIL_NAMES = ["olive oil", "sesame oil", "dark soy glaze", "saffron milk"];

export class CruetProp extends PantryProp {
  private mover: SceneObject;
  private cork: SceneObject;
  private liquidMat: Material;
  private streamObj: SceneObject;
  private streamMat: Fade;
  private poolHandle: PoolHandle | null = null;
  private rgb: number[];
  private Rp: number = 1.6;
  private rest: vec3 = vec3.zero();

  constructor(ctl: PantryController, entry: PrepSlotEntry, variantIdx: number) {
    super(ctl, 165, entry, OIL_NAMES[Math.max(0, Math.min(3, variantIdx))]);
    const cat = getCatalogEntry(165);
    const extra = cat && cat.extraColors ? cat.extraColors : null;
    const base = rgbOf(extra ? extra[variantIdx] : undefined, [0.8, 0.55, 0.12]);
    const mx = Math.max(base[0], base[1], base[2]);
    this.rgb = mx < 0.5 ? mixRgb(base, [0.62, 0.36, 0.17], 0.6) : base; // additive display: no near-black glaze
    this.seat("SLOT_PANTRY_OIL");
    this.mover = global.scene.createSceneObject("CruetMover");
    this.mover.setParent(this.root);
    const b = bottleMeshes();
    const glass = new Fade([0.78, 0.92, 0.88], 0.36, 0.12, 0.0, 0.05);
    const go = global.scene.createSceneObject("CruetGlass");
    go.setParent(this.mover);
    const gr = go.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    gr.mesh = b.glass.toMesh();
    gr.mainMaterial = glass.m;
    this.liquidMat = mat(this.rgb, 0.0, 0.1, 0.3);
    this.part(this.mover, "CruetLiquid", b.liquid, this.liquidMat, "liquid");
    this.cork = this.part(this.mover, "CruetCork", b.cork, mat([0.74, 0.54, 0.32], 0, 0.7, 0.12), "cork");
    this.tris["glass"] = b.glass.triCount();
    PANTRY_TRIS["165_glass"] = b.glass.triCount();
    this.streamMat = new Fade(this.rgb, 0.95, 0.3, 0.1, 0.05);
    this.streamObj = global.scene.createSceneObject("OilStream");
    this.streamObj.setParent(ctl.stationsObject());
    const sr = this.streamObj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    const sm = streamMesh();
    sr.mesh = sm.toMesh();
    sr.mainMaterial = this.streamMat.m;
    this.tris["stream"] = sm.triCount();
    this.streamObj.enabled = false;
    this.fx.push(this.streamObj);
    this.rest = this.mover.getTransform().getLocalPosition();
    print(`[PantryGen] #165 ${this.variant}: glass ${this.tris["glass"]}, liquid ${this.tris["liquid"]}, cork ${this.tris["cork"]}, stream ${this.tris["stream"]} tris`);
  }

  getRestSlot(): SlotId {
    return "SLOT_PANTRY_OIL";
  }

  getColour(): number[] {
    return this.rgb.slice();
  }

  /**
   * Deterministic pose of the whole drizzle at k (0..1): bottle lifts + tilts over the target (0-0.22), the stream falls
   * (0.2-0.32) while the glossy pool grows (0.3-0.85), the stream retracts (0.76-0.88), the bottle returns (0.84-1).
   * drizzle() just sweeps k.
   */
  drizzlePose(k: number, target: any, rgb?: Rgb | number[]): void {
    const t = this.ctl.resolve(target, "plate");
    if (!t) return;
    const col = rgb ? rgbOf(rgb, this.rgb) : this.rgb;
    if (col[0] !== this.streamMat.c[0] || col[1] !== this.streamMat.c[1] || col[2] !== this.streamMat.c[2]) {
      this.streamMat.rgb(col, 0.95);
      this.liquidMat.mainPass.baseColor = new vec4(col[0], col[1], col[2], 1);
      glow(this.liquidMat, col, 0.3);
    }
    this.Rp = Math.min(Math.max(1.0, t.radius * 0.5), 2.4);
    const u = this.ctl.unit();
    const st = this.ctl.stationsObject().getTransform();
    const pf = smooth(k / 0.22) * (1 - smooth((k - 0.84) / 0.16));
    const theta = 105 * DEG;
    void st;
    const lipLocal = this.root.getTransform().getInvertedWorldTransform().multiplyPoint(new vec3(t.world.x, t.world.y + 4.1 * u, t.world.z));
    const ct = Math.cos(theta), sn = Math.sin(theta);
    const hb = new vec3(lipLocal.x - (-sn * 3.45), lipLocal.y - ct * 3.45, lipLocal.z);
    const pos = new vec3(lerp(this.rest.x, hb.x, pf), lerp(this.rest.y, hb.y, pf) + 2.2 * Math.sin(Math.PI * pf), lerp(this.rest.z, hb.z, pf));
    const mt = this.mover.getTransform();
    mt.setLocalPosition(pos);
    mt.setLocalRotation(quat.angleAxis(theta * pf, vec3.forward()));
    this.cork.enabled = pf < 0.08;
    // stream
    const lip = mt.getWorldTransform().multiplyPoint(new vec3(0, 3.45, 0));
    const surfY = t.world.y + 0.05 * u;
    const H = Math.max(0.01, lip.y - surfY);
    const g = smooth((k - 0.2) / 0.12);
    const r = smooth((k - 0.76) / 0.12);
    const bottom = surfY + H * r;
    const top = surfY + H * g;
    const show = pf > 0.9 && g > 0.01 && r < 0.99 && top - bottom > 0.02 * u;
    this.streamObj.enabled = show;
    if (show) {
      const wob = 1 + 0.18 * Math.sin(k * 90);
      const tr = this.streamObj.getTransform();
      tr.setWorldPosition(new vec3(lip.x - 0.0, bottom, lip.z));
      tr.setWorldScale(new vec3(u * wob, top - bottom, u * wob));
    }
    // pool
    const p = smooth((k - 0.3) / 0.55);
    if (p > 0.02) {
      if (!this.poolHandle) {
        this.poolHandle = this.ctl.pool(t, col, 0.035, 0.9, true);
        this.fx.push(this.poolHandle.obj);
      }
      this.poolHandle.setRadius(this.Rp * p);
      this.poolHandle.fade.rgb(col, 0.9);
    }
  }

  /** Cruet hops over `target`, drizzles `rgb` (variant colour by default) and leaves a glossy pool; then onDone. */
  drizzle(target: any, rgb?: Rgb | number[], onDone?: () => void, seconds: number = 3.4): void {
    const t = this.ctl.resolve(target, "plate");
    if (!t) {
      if (onDone) onDone();
      return;
    }
    this.ctl.tweens.add(this, 0, seconds, (k) => this.drizzlePose(k, t, rgb), () => {
      this.streamObj.enabled = false;
      if (onDone) onDone();
    });
  }

  /** Removes the glossy pool left by drizzle(). */
  clearPool(): void {
    if (this.poolHandle && !isNull(this.poolHandle.obj)) this.poolHandle.obj.destroy();
    this.poolHandle = null;
  }

  resetToRest(): void {
    this.ctl.tweens.clear(this);
    this.clearPool();
    const mt = this.mover.getTransform();
    mt.setLocalPosition(this.rest);
    mt.setLocalRotation(quat.quatIdentity());
    this.cork.enabled = true;
    this.streamObj.enabled = false;
  }
}

// ───────────────────────────── #166 lentils / dal / chickpeas ─────────────────────────────

const CHICKPEA_SPOTS: number[][] = [
  [0.0, 0.0, 0], [0.5, 0.1, 0], [-0.45, 0.2, 0], [0.15, -0.5, 0], [-0.1, 0.55, 0], [0.62, -0.42, 0], [-0.6, -0.35, 0],
  [0.45, 0.62, 0], [-0.5, 0.68, 0], [0.0, 0.1, 1], [0.3, -0.25, 1], [-0.28, -0.15, 1], [0.15, 0.4, 1], [-0.15, 0.3, 1],
];

export class LegumeProp extends PantryProp {
  private chick: boolean;
  private holderObj: SceneObject | null = null;
  private surface: SceneObject | null = null;
  private specks: SceneObject | null = null;
  private bubbles: { o: SceneObject; ph: number }[] = [];
  private peas: SceneObject[] = [];
  private fill: number = 0;
  private tgt: PantryTarget | null = null;
  private clock: number = 0;
  private surfMat: Material;
  private chickMesh: RenderMesh | null = null;
  private chickMat: Material | null = null;

  constructor(ctl: PantryController, entry: PrepSlotEntry, chickpea: boolean) {
    super(ctl, 166, entry, chickpea ? "chickpeas" : "dal");
    this.chick = chickpea;
    this.seat("SLOT_PANTRY_LEGUME");
    this.part(this.root, "LegumeJar", ramekinMesh(14), mat([0.93, 0.91, 0.86], 0, 0.2, 0.1), "jar").getTransform().setLocalScale(new vec3(1.2, 1.2, 1.2));
    if (chickpea) {
      const cm = chickpeaMesh();
      this.chickMesh = cm.toMesh();
      this.tris["chickpea"] = cm.triCount();
      PANTRY_TRIS["166_chickpea"] = cm.triCount();
      this.chickMat = mat([0.9, 0.74, 0.44], 0, 0.55, 0.16);
      for (let i = 0; i < 8; i++) {
        const o = this.partMesh(this.root, "JarChickpea", this.chickMesh, this.chickMat);
        const a = i * 2.4;
        const r = i === 7 ? 0 : 0.55;
        o.getTransform().setLocalPosition(new vec3(Math.cos(a) * r, 1.0 + (i === 7 ? 0.28 : 0.0), Math.sin(a) * r));
        o.getTransform().setLocalScale(new vec3(1.5, 1.5, 1.5));
      }
    } else {
      this.part(this.root, "DryLentils", lentilHeapMesh(), mat([0.88, 0.5, 0.16], 0, 0.8, 0.16), "lentils").getTransform().setLocalScale(new vec3(1.2, 1.2, 1.2));
    }
    this.surfMat = mat(chickpea ? [0.82, 0.54, 0.2] : [0.93, 0.72, 0.22], 0.0, 0.3, 0.26);
    print(`[PantryGen] #166 ${this.variant}: jar ${this.tris["jar"]}, ${chickpea ? "chickpea " + this.tris["chickpea"] + " x14" : "lentils " + this.tris["lentils"] + ", surface 40+, tadka 320"} tris`);
  }

  getRestSlot(): SlotId {
    return "SLOT_PANTRY_LEGUME";
  }

  getFill(): number {
    return this.fill;
  }

  isChickpea(): boolean {
    return this.chick;
  }

  private build(t: PantryTarget): void {
    this.tgt = t;
    this.holderObj = this.track(this.ctl.holder(t, 0));
    this.surface = this.part(this.holderObj, "DalSurface", dalSurfaceMesh(), this.surfMat, "surface");
    if (!this.chick) {
      this.specks = this.part(this.holderObj, "TadkaSpecks", tadkaMesh(), mat([0.78, 0.2, 0.1], 0, 0.5, 0.2), "tadka");
      const bm = unitBubble().toMesh();
      const bmat = mat([1.0, 0.9, 0.55], 0, 0.15, 0.25);
      for (let i = 0; i < 4; i++) {
        const o = this.partMesh(this.holderObj, "DalBubble", bm, bmat);
        this.bubbles.push({ o: o, ph: i * 1.7 });
      }
    } else {
      const rnd = makeRng(166);
      for (let i = 0; i < CHICKPEA_SPOTS.length; i++) {
        const o = this.partMesh(this.holderObj, `Chickpea_${i}`, this.chickMesh as RenderMesh, this.chickMat as Material);
        o.getTransform().setLocalRotation(quat.fromEulerAngles(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5));
        this.peas.push(o);
      }
    }
  }

  /**
   * Fills the secondary pot / handi (or `target`) 0..1: dal = golden surface rising with tadka specks and bubbles,
   * chickpeas = plump pieces piling up in a golden-brown broth.
   */
  setFill(k: number, target?: any): void {
    const t = target !== undefined ? this.ctl.resolve(target, "pot") : this.tgt || this.ctl.resolve(null, "pot");
    if (!t) return;
    if (!this.holderObj || isNull(this.holderObj) || (this.tgt && t.obj !== this.tgt.obj)) {
      for (const o of this.fx) if (o && !isNull(o)) o.destroy();
      this.fx = [];
      this.peas = [];
      this.bubbles = [];
      this.build(t);
    }
    this.fill = clamp01(k);
    const prof = t.profile || POT_INNER;
    const fy = t.floorY !== undefined ? t.floorY : prof[0][0];
    const topY = t.topY !== undefined ? t.topY : fy + 3.0;
    const f = smooth(this.fill);
    const level = lerp(fy + 0.1, topY, this.chick ? f * 0.62 : f); // pot-local y of the surface
    const rl = this.ctl.innerRadius(prof, level) * 0.95;
    const sc = t.scale;
    const hRoot = (level - fy) * sc;
    const rRoot = Math.max(0.3, rl * sc);
    const show = this.fill > 0.01;
    if (this.surface) {
      this.surface.enabled = show;
      this.surface.getTransform().setLocalPosition(new vec3(0, hRoot, 0));
      this.surface.getTransform().setLocalScale(new vec3(rRoot, 1, rRoot));
    }
    if (this.specks) {
      this.specks.enabled = show && this.fill > 0.35;
      this.specks.getTransform().setLocalPosition(new vec3(0, hRoot + 0.03, 0));
      this.specks.getTransform().setLocalScale(new vec3(rRoot, 1, rRoot));
    }
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.o.enabled = show && this.fill > 0.5;
      const a = i * 1.9 + 0.6;
      b.o.getTransform().setLocalPosition(new vec3(Math.cos(a) * rRoot * 0.5, hRoot + 0.02, Math.sin(a) * rRoot * 0.5));
    }
    if (this.chick) {
      const n = Math.round(this.peas.length * smooth(this.fill * 1.3));
      const rr = Math.min(rRoot, 3.4);
      for (let i = 0; i < this.peas.length; i++) {
        const spot = CHICKPEA_SPOTS[i];
        const o = this.peas[i];
        o.enabled = i < n;
        o.getTransform().setLocalPosition(new vec3(spot[0] * rr * 0.85, Math.max(0.15, hRoot - 0.2) + spot[2] * 0.4, spot[1] * rr * 0.85));
        o.getTransform().setLocalScale(new vec3(1.8, 1.8, 1.8));
      }
    }
  }

  update(dt: number): void {
    if (!this.bubbles.length || this.fill < 0.5) return;
    this.clock += dt;
    for (const b of this.bubbles) {
      const s = 0.2 * (0.55 + 0.45 * Math.sin(this.clock * 5 + b.ph));
      b.o.getTransform().setLocalScale(new vec3(s * 1.4, s * 1.4, s * 1.4));
    }
  }

  resetToRest(): void {
    this.ctl.tweens.clear(this);
    for (const o of this.fx) if (o && !isNull(o)) o.destroy();
    this.fx = [];
    this.holderObj = null;
    this.surface = null;
    this.specks = null;
    this.bubbles = [];
    this.peas = [];
    this.tgt = null;
    this.fill = 0;
  }
}

// ───────────────────────────── controller ─────────────────────────────

const PAN_NAMES = ["WokPan", "TawaPan", "SkilletPan"];

/** Plan order (K1 decides WHEN; this is the natural cooking order + the API each prop offers). */
const PLAN: { n: number; phase: "COOK" | "FINISH"; api: string; target: PantryKind; note: string }[] = [
  { n: 160, phase: "COOK", api: "dropInto(pan|pot, onDone)", target: "pan", note: "whole spices bloom in the hot oil first" },
  { n: 162, phase: "COOK", api: "placeOn(pan|pot); meltOver(sec)", target: "pan", note: "butter / ghee melts into a foaming pool" },
  { n: 161, phase: "COOK", api: "pinchInto(pan|pot, index, onDone)", target: "pan", note: "ground powders tint the oil / sauce" },
  { n: 165, phase: "COOK", api: "drizzle(pan|plate, rgb, onDone)", target: "plate", note: "oil / glaze sheen (olive early, sesame / soy / saffron at the finish)" },
  { n: 166, phase: "COOK", api: "setFill(0..1) in the secondary pot", target: "pot", note: "dal / chickpeas simmer" },
  { n: 163, phase: "FINISH", api: "placeOn(starch|plate); meltOver(sec)", target: "starch", note: "cheese melts into a glossy cap" },
  { n: 164, phase: "FINISH", api: "swirlOnto(plate, onDone)", target: "plate", note: "cream / yogurt spiral garnish" },
];

export class PantryController {
  readonly tweens: PantryTweens = new PantryTweens();
  private host: StationPropsBuilder;
  private stationsObj: SceneObject;
  private tw: ToolWareController;
  private current: PantryProp[] = [];
  private pending: PantryProp[] = [];
  private clearOnReveal: boolean = false;
  private rings: { o: SceneObject; f: Fade }[] = [];
  private ringIdx: number = 0;
  private ringM: RenderMesh | null = null;
  private discM: RenderMesh | null = null;
  private poolM: RenderMesh | null = null;
  private starchProvider: () => SceneObject[] = () => [];
  private evt: SceneEvent | null = null;

  constructor(host: StationPropsBuilder, tw: ToolWareController) {
    this.host = host;
    this.stationsObj = host.getSceneObject();
    this.tw = tw;
  }

  /** Lazily binds the per-frame update (nothing runs until a pantry prop exists). */
  private ensureUpdate(): void {
    if (this.evt) return;
    this.evt = this.host.createEvent("UpdateEvent");
    this.evt.bind(() => {
      const dt = getDeltaTime();
      this.tweens.update(dt);
      for (const p of this.current) if (p.isLive()) p.update(dt);
    });
  }

  setStarchProvider(fn: () => SceneObject[]): void {
    this.starchProvider = fn;
  }

  stationsObject(): SceneObject {
    return this.stationsObj;
  }

  /** The prep board object (parent of the prep bowl and the #326 ramekins). */
  boardObject(): SceneObject | null {
    const bowl = findByName(this.stationsObj, "PortionRamekinBowl");
    return bowl ? bowl.getParent() : null;
  }

  unit(): number {
    const s = this.stationsObj.getTransform().getWorldScale().x;
    return s > 0.0001 ? s : 1;
  }

  // ── A4b #326 ramekin integration ──

  ramekinRoot(): SceneObject | null {
    return this.tw.getRamekinRoot();
  }

  configureRamekins(cols: (number[] | null)[], amounts: number[]): void {
    this.tw.prepare(326);
    this.tw.setRamekinPowders(cols, amounts);
  }

  restoreRamekins(): void {
    this.tw.restoreRamekinPowders();
  }

  // ── targets ──

  innerRadius(profile: [number, number][], y: number): number {
    if (y <= profile[0][0]) return profile[0][1] > 0.5 ? profile[0][1] : profile[1][1] * (y - profile[0][0] + 0.05);
    for (let i = 1; i < profile.length; i++) {
      if (y <= profile[i][0]) {
        const a = profile[i - 1], b = profile[i];
        const t = (y - a[0]) / Math.max(1e-4, b[0] - a[0]);
        return lerp(a[1], b[1], t);
      }
    }
    return profile[profile.length - 1][1];
  }

  private panTarget(pan: SceneObject): PantryTarget {
    const f = queryPanFloor(pan);
    const u = this.unit();
    const ws = pan.getTransform().getWorldScale().x;
    const w = pan.getTransform().getWorldTransform().multiplyPoint(new vec3(0, f.y, 0));
    return { obj: pan, world: w, radius: (f.r * ws) / u, scale: ws / u, kind: "pan" };
  }

  private potTarget(): PantryTarget | null {
    const handi = findByName(this.stationsObj, "BiryaniHandi");
    const stock = findByName(this.stationsObj, "PastaStockpot");
    const pot = this.host.getSaucierPot();
    let obj: SceneObject | null = null;
    let prof: [number, number][] = POT_INNER;
    let top = 3.6;
    if (handi && handi.isEnabledInHierarchy) {
      obj = handi;
      prof = HANDI_INNER;
      top = 3.4;
    } else if (stock && stock.isEnabledInHierarchy) {
      obj = stock;
      prof = STOCK_INNER;
      top = 4.4;
    } else if (pot) {
      obj = pot;
    }
    if (!obj) return null;
    const u = this.unit();
    const ws = obj.getTransform().getWorldScale().x;
    const fy = prof[0][0] + 0.02;
    const w = obj.getTransform().getWorldTransform().multiplyPoint(new vec3(0, fy, 0));
    const r = this.innerRadius(prof, fy + 0.6) * 0.8;
    return { obj: obj, world: w, radius: (r * ws) / u, scale: ws / u, kind: "pot", profile: prof, floorY: fy, topY: top };
  }

  /** Top surface of any object (plate, starch tray, bowl): centre of its enabled meshes' bounds, highest point. */
  private topTarget(o: SceneObject): PantryTarget {
    let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9, mxy = -1e9;
    const walk = (n: SceneObject) => {
      const rmv = n.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (rmv && rmv.mesh && n.isEnabledInHierarchy && !/Steam|Ripple|Ring|Pantry|Fx|Reticle/.test(n.name)) {
        const a = rmv.mesh.aabbMin, b = rmv.mesh.aabbMax;
        const wt = n.getTransform().getWorldTransform();
        for (let i = 0; i < 8; i++) {
          const p = wt.multiplyPoint(new vec3(i & 1 ? b.x : a.x, i & 2 ? b.y : a.y, i & 4 ? b.z : a.z));
          mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x);
          mnz = Math.min(mnz, p.z); mxz = Math.max(mxz, p.z);
          mxy = Math.max(mxy, p.y);
        }
      }
      for (let i = 0; i < n.getChildrenCount(); i++) walk(n.getChild(i));
    };
    walk(o);
    const u = this.unit();
    const ws = o.getTransform().getWorldScale().x;
    if (mxy < -1e8) {
      const p = o.getTransform().getWorldPosition();
      return { obj: o, world: p, radius: 1.2, scale: ws / u, kind: "top" };
    }
    const radius = Math.max(0.9, (0.3 * Math.min(mxx - mnx, mxz - mnz)) / u);
    return { obj: o, world: new vec3((mnx + mxx) / 2, mxy, (mnz + mxz) / 2), radius: radius, scale: ws / u, kind: "top" };
  }

  /** Named target: "pan" (wok / tawa / skillet floor), "pot" (handi / stockpot / saucier floor), "plate" (service piece top), "starch" (starch prop top). */
  target(kind: PantryKind): PantryTarget | null {
    if (kind === "pan") {
      for (const n of PAN_NAMES) {
        const o = findByName(this.stationsObj, n);
        if (o && o.isEnabledInHierarchy) return this.panTarget(o);
      }
      return null;
    }
    if (kind === "pot") return this.potTarget();
    if (kind === "plate") {
      const p = this.host.getPlateObject();
      return p && !isNull(p) ? this.topTarget(p) : null;
    }
    const s = this.starchProvider();
    for (const o of s) if (o && !isNull(o) && o.isEnabledInHierarchy) return this.topTarget(o);
    return null;
  }

  /** Accepts a PantryTarget, a PantryKind string, a SceneObject (pan / pot / any), or null (falls back to `hint`). */
  resolve(t: any, hint?: PantryKind): PantryTarget | null {
    if (t === null || t === undefined) return hint ? this.target(hint) : null;
    if (typeof t === "string") return this.target(t as PantryKind);
    if (t.world !== undefined && t.obj !== undefined) return t as PantryTarget;
    const o = t as SceneObject;
    if (isNull(o)) return null;
    if (PAN_NAMES.indexOf(o.name) >= 0) return this.panTarget(o);
    if (/Handi|Stockpot|SaucepotPot/.test(o.name)) return this.potTarget();
    return this.topTarget(o);
  }

  // ── fx helpers ──

  /** Child object of the target at its surface point (+lift StationsRoot cm), unit scale, upright: content authored in StationsRoot cm. */
  holder(t: PantryTarget, lift: number): SceneObject {
    const h = global.scene.createSceneObject("PantryFx");
    const u = this.unit();
    this.mount(h, t.obj, new vec3(t.world.x, t.world.y + lift * u, t.world.z), 0);
    return h;
  }

  /** Re-parents `o` under `parent` at a world point, upright, keeping StationsRoot-cm content size. */
  mount(o: SceneObject, parent: SceneObject, world: vec3, yawDeg: number): void {
    o.setParent(parent);
    const tr = o.getTransform();
    const u = this.unit();
    tr.setWorldPosition(world);
    tr.setWorldRotation(quat.angleAxis(yawDeg * DEG, vec3.up()));
    tr.setWorldScale(new vec3(u, u, u));
  }

  /** Flat translucent disc on the target (oil sheen, powder tint, drizzle pool). glossy = opaque-ish shiny glaze. */
  pool(t: PantryTarget, rgb: number[], lift: number, alpha: number = 0.0, glossy: boolean = false): PoolHandle {
    if (!this.discM) this.discM = discMesh().toMesh();
    const f = new Fade(rgb, alpha, glossy ? 0.3 : 0.14, glossy ? 0.2 : 0.0, glossy ? 0.05 : 0.3);
    const o = global.scene.createSceneObject("PantryPool");
    const u = this.unit();
    this.mount(o, t.obj, new vec3(t.world.x, t.world.y + lift * u, t.world.z), 0);
    const r = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    r.mesh = this.discM;
    r.mainMaterial = f.m;
    o.getTransform().setLocalScale(new vec3(0.001, 1, 0.001));
    const handle: PoolHandle = {
      obj: o,
      fade: f,
      setRadius: (rad: number) => {
        if (o && !isNull(o)) o.getTransform().setWorldScale(new vec3(u * Math.max(0.001, rad), u, u * Math.max(0.001, rad)));
      },
    };
    return handle;
  }

  /** Expanding fading ripple ring (sizzle) at a world point on the target. */
  ring(t: PantryTarget, world: vec3, rgb: number[], maxR: number, dur: number): void {
    if (!this.ringM) this.ringM = ringMesh().toMesh();
    let slot = this.rings[this.ringIdx % 8];
    if (!slot) {
      const f = new Fade(rgb, 0, 0.2);
      const o = global.scene.createSceneObject("PantryRipple");
      o.setParent(this.stationsObj);
      const r = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      r.mesh = this.ringM;
      r.mainMaterial = f.m;
      o.enabled = false;
      slot = { o: o, f: f };
      this.rings[this.ringIdx % 8] = slot;
    }
    this.ringIdx++;
    const s = slot;
    if (!s.o || isNull(s.o)) return;
    const u = this.unit();
    s.f.rgb(rgb, 0.85);
    s.o.enabled = true;
    this.mount(s.o, t.obj && !isNull(t.obj) ? t.obj : this.stationsObj, new vec3(world.x, world.y + 0.06 * u, world.z), 0);
    this.tweens.add(s, 0, dur, (k) => {
      const sc = u * Math.max(0.05, maxR * 0.6 * smooth(k));
      s.o.getTransform().setWorldScale(new vec3(sc, u, sc));
      s.f.set(0.8 * (1 - k));
    }, () => {
      if (s.o && !isNull(s.o)) s.o.enabled = false;
    });
  }

  // ── props ──

  private makeProp(n: number, entry: PrepSlotEntry, ctx: PantryContext): PantryProp | null {
    const text = ctx.dishText;
    const has = (re: RegExp) => re.test(text);
    try {
      if (n === 160) return new GaramMasalaProp(this, entry);
      if (n === 161) return new PowderProp(this, entry, ctx.vessels.indexOf(326) >= 0);
      if (n === 162) return new ButterProp(this, entry, !has(/makhani|butter/) && has(/biryani|paneer|tikka|dal|masala|hyderabadi|ghee|indian/));
      if (n === 163) return new CheeseProp(this, entry, has(/pasta|spaghetti|penne|carbonara|parmesan/));
      if (n === 164) return new CreamProp(this, entry, has(/coconut|curry|thai/) ? "coconut" : has(/yogurt|raita|biryani/) ? "yogurt" : "cream");
      if (n === 165) return new CruetProp(this, entry, has(/saffron/) ? 3 : has(/noodle|hakka|wok|sesame|chinese/) ? 1 : has(/soy|teriyaki|glaze|ribeye|steak/) ? 2 : 0);
      if (n === 166) return new LegumeProp(this, entry, has(/chickpea|chana|chole|hummus/));
    } catch (e) {
      print(`[PantryGen] build #${n} failed: ${e}`);
    }
    return null;
  }

  private entryFor(n: number, label: string): PrepSlotEntry {
    const c = getCatalogEntry(n);
    if (c) return { accessNumber: c.accessNumber, name: c.name, archetype: c.archetype, colorRgb: c.colorRgb, scaleMultiplier: c.scaleMultiplier };
    return { accessNumber: n, name: label, archetype: "GRANULAR_MOUND", colorRgb: [0.8, 0.8, 0.8], scaleMultiplier: 1 };
  }

  static contextOf(bp: UniversalDishBlueprint): PantryContext {
    const names: string[] = [bp.dishTitle || "", bp.cuisineTag || "", bp.protein ? bp.protein.name : ""];
    for (const s of bp.prepSlots || []) names.push(s ? s.name : "");
    const vessels: number[] = [];
    for (const n of ([] as any[]).concat(bp.vesselAccessNumbers || [], (bp as any).toolAccessNumbers || [])) if (typeof n === "number") vessels.push(n);
    return { dishText: names.join(" ").toLowerCase(), vessels: vessels };
  }

  private dropList(list: PantryProp[]): void {
    for (const p of list) p.destroy();
  }

  private clearAll(): void {
    this.dropList(this.current);
    this.dropList(this.pending);
    this.current = [];
    this.pending = [];
    this.clearOnReveal = false;
    this.tweens.clearAll();
    for (const r of this.rings) if (r && r.o && !isNull(r.o)) r.o.enabled = false;
    this.tw.restoreRamekinPowders();
  }

  /** P5 staging: builds the dish's pantry props HIDDEN (disabled); each pantry_<n> item's target is its root. */
  stage(bp: UniversalDishBlueprint, items: { key: string; group: string; accessNumber: number; label: string; targets?: SceneObject[] }[]): void {
    this.dropList(this.pending);
    this.pending = [];
    this.tw.restoreRamekinPowders();
    this.clearOnReveal = true;
    const ctx = PantryController.contextOf(bp);
    for (const it of items) {
      if (it.group !== "SPICE") continue;
      const p = this.makeProp(it.accessNumber, this.entryFor(it.accessNumber, it.label), ctx);
      if (!p) continue;
      p.getObject().enabled = false;
      this.pending.push(p);
      it.targets = [p.getObject()];
    }
  }

  /**
   * Reveal hook: the first call of a staged dish removes the previous dish's props. Returns the objects to pop in for a
   * pantry_<n> key (null for other keys).
   */
  reveal(itemKey: string): SceneObject[] | null {
    if (this.clearOnReveal) {
      this.clearOnReveal = false;
      this.dropList(this.current);
      this.current = [];
      this.tweens.clearAll();
    }
    if (itemKey.indexOf("pantry_") !== 0) return null;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.getItemKey() !== itemKey) continue;
      this.pending.splice(i, 1);
      this.current.push(p);
      p.getObject().enabled = true;
      this.ensureUpdate();
      return [p.getObject()];
    }
    return [];
  }

  /** Immediate (non-staged) build: entries = resolved #160-#166 of the dish, null removes everything (Reset). */
  rebuild(entries: PrepSlotEntry[] | null, ctx?: PantryContext): void {
    this.clearAll();
    if (!entries) return;
    const c: PantryContext = ctx || { dishText: "", vessels: [] };
    for (const e of entries) {
      const p = this.makeProp(e.accessNumber, e.name ? e : this.entryFor(e.accessNumber, ""), c);
      if (!p) continue;
      p.getObject().enabled = true;
      this.current.push(p);
    }
    if (this.current.length > 0) this.ensureUpdate();
  }

  /** Adds an already built prop to the live list (contact sheet / tests). */
  adopt(p: PantryProp): void {
    this.current.push(p);
    this.ensureUpdate();
  }

  getProps(): PantryProp[] {
    return this.current.filter((p) => p.isLive());
  }

  getProp(n: number): PantryProp | null {
    for (const p of this.current) if (p.isLive() && p.getAccessNumber() === n) return p;
    return null;
  }

  hasProps(): boolean {
    return this.current.length > 0 || this.pending.length > 0;
  }

  /** Ordered summary of the live pantry props: what each does, which public API and target K1 should use. */
  getPlan(): PantryPlanStep[] {
    const out: PantryPlanStep[] = [];
    for (const s of PLAN) {
      const p = this.getProp(s.n);
      if (!p) continue;
      out.push({
        order: out.length + 1,
        accessNumber: s.n,
        itemKey: p.getItemKey(),
        name: p.getName(),
        variant: p.getVariant(),
        phase: s.phase,
        restSlot: p.getRestSlot(),
        api: s.api,
        target: s.target,
        note: s.note,
      });
    }
    return out;
  }
}
