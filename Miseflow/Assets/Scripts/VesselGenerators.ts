/**
 * VesselGenerators.ts  (v5 A4a hero vessels / tools / service ware)
 * Procedural low-poly meshes (MeshAcc, bottom-centre pivot, additive-display colours) + the controller that swaps them in:
 *   #302 carbon-steel wok / Indian kadai  -> WokPan       (SkilletStation, in place of the skillet; pan floor registered)
 *   #303 biryani dum handi + domed lid    -> BiryaniHandi (child of SaucepotPot, in place of the saucier) + HandiDumLid
 *   #332 stainless gravy ladle            -> LadleProp    (SaucepotStation, SLOT_SECONDARY_TOOL_REST)
 *   #342 deep noodle / pasta bowl         -> NoodleBowlProp   (PlatingServingStation, in place of the coupe plate)
 *   #343 serving handi on a thali         -> ServingHandiProp (PlatingServingStation, in place of the coupe plate)
 * Inactive props keep a "_Idle" name so the name-based finders (ProteinGenerators / PanTossRoll: WokPan,
 * LadleOrbitalStir: BiryaniHandi / LadleProp) only ever see the live one. Dish 01 never builds any of this.
 */
import { MeshAcc, makePbrMaterial, makeTexturedPbr, SteamPlume, StationPropsBuilder } from "./StationPropsBuilder";
import { registerPanFloor } from "./ProteinGenerators";
import { AssetPageTable, autoServewareFor, SERVEWARE_NUMBERS } from "./AI/AssetPageTable";
import { UniversalDishBlueprint } from "./AI/UniversalDishSchema";
import { getSlot } from "./AI/SpatialSlotAllocator";
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { buildStockpot, buildTawa, StockpotProp, STOCK_INNER } from "./ToolGenerators";

const TEX_CAST_IRON = requireAsset("../Textures/Tex_CastIron.png") as Texture;
const DEG = Math.PI / 180;
const IDLE = "_Idle";

// ───────────────────────────── materials (lazy: this module is imported by StationPropsBuilder) ─────────────────────────────

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
    // seasoned carbon steel: bronze-blue patina over the iron texture, lifted so it never reads black on Specs
    // seasoned black carbon steel with a soft satin sheen over the iron texture
    case "carbon": m = glow(makeTexturedPbr(TEX_CAST_IRON, 0.66, 0.34, 0.86, 0.85, 0.88), 0.03, 0.03, 0.034); break;
    case "carbonEdge": m = glow(makePbrMaterial(0.80, 0.81, 0.83, 0.9, 0.2), 0.05, 0.05, 0.055); break; // polished rolled rim
    case "wood": m = makePbrMaterial(0.40, 0.24, 0.14, 0.0, 0.42); break; // oiled walnut
    case "brass": m = glow(makePbrMaterial(0.92, 0.74, 0.40, 0.9, 0.24), 0.06, 0.045, 0.02); break;
    case "copper": m = glow(makePbrMaterial(0.88, 0.52, 0.33, 0.9, 0.24), 0.07, 0.035, 0.02); break;
    case "dough": m = makePbrMaterial(0.95, 0.86, 0.68, 0.0, 0.7); break;
    case "chrome": m = makePbrMaterial(0.93, 0.94, 0.96, 0.62, 0.17); break;
    case "glaze": m = makePbrMaterial(0.92, 0.91, 0.88, 0.02, 0.16); break;
    case "glazeBand": m = glow(makePbrMaterial(0.34, 0.46, 0.86, 0.05, 0.2), 0.04, 0.06, 0.12); break;
    case "thali": m = makePbrMaterial(0.86, 0.87, 0.90, 0.85, 0.2); break;
    default: m = makePbrMaterial(0.8, 0.8, 0.8, 0.2, 0.4);
  }
  matCache[key] = m;
  return m;
}

/** Tri counts of the last built meshes (logged once per build; reported by the A4a summary). */
export const VESSEL_TRIS: { [k: string]: number } = {};

function addMesh(parent: SceneObject, name: string, acc: MeshAcc, matKey: string, triKey?: string): SceneObject {
  const o = global.scene.createSceneObject(name);
  o.setParent(parent);
  const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  rmv.mesh = acc.toMesh();
  rmv.mainMaterial = mat(matKey);
  if (triKey) VESSEL_TRIS[triKey] = (VESSEL_TRIS[triKey] || 0) + acc.triCount();
  return o;
}

function setRmv(o: SceneObject, acc: MeshAcc, matKey: string, triKey: string): void {
  const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  rmv.mesh = acc.toMesh();
  rmv.mainMaterial = mat(matKey);
  VESSEL_TRIS[triKey] = (VESSEL_TRIS[triKey] || 0) + acc.triCount();
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

// ───────────────────────────── #302 wok / kadai ─────────────────────────────

/** Pan-local wok floor (ProteinGenerators: y += curve * r^2 inside the bowl). */
export const WOK_FLOOR = { y: 0.45, r: 5.6, curve: 0.03 };
/** Same yaw as the skillet so the long handle points rear-left (clear of board + saucier). */
export const WOK_YAW = -66 * DEG;
// outer wall up to a rolled rim, back down the 32-degree inner wall (rise 4.15 over r 4.0 -> 9.5 ~ 33 deg mean)
const WOK_PROFILE: [number, number][] = [
  [0.0, 0.0], [3.0, 0.05], [6.2, 1.05], [8.6, 2.75], [9.75, 4.2], [9.98, 4.62], [9.78, 4.76],
  [9.5, 4.6], [7.6, 2.95], [4.0, 0.85], [0.0, 0.45],
];

function handleFrame(phiDeg: number): { d: number[]; s: number[] } {
  const p = phiDeg * DEG;
  const d = [Math.cos(p), 0, Math.sin(p)];
  return { d: d, s: [-d[2], 0, d[0]] };
}

/** Rim loop (kadai handle / wok helper) at angle phi: a flat D-loop from the rim. */
function rimLoop(acc: MeshAcc, phiDeg: number, y: number, out: number, half: number, r: number): void {
  const { d, s } = handleFrame(phiDeg);
  const P = (rad: number, lat: number, yy: number): [number, number, number] => [d[0] * rad + s[0] * lat, yy, d[2] * rad + s[2] * lat];
  const curve: [number, number, number][] = [
    P(9.62, -half, y - 0.15), P(9.62 + out * 0.7, -half * 0.85, y + 0.12), P(9.62 + out, 0, y + 0.22),
    P(9.62 + out * 0.7, half * 0.85, y + 0.12), P(9.62, half, y - 0.15),
  ];
  acc.sweep(curve, curve.map(() => r), curve.map(() => r * 0.8), 8, true);
}

/** Builds the wok under `parent` (hidden, idle name). Children: body (lathe <= 440 tris), rim glint, both handle sets. */
export function buildWok(parent: SceneObject): { root: SceneObject; wokHandle: SceneObject; kadaiLoops: SceneObject } {
  for (const k of ["302_body", "302_rim", "302_wok_handle", "302_kadai_loops"]) VESSEL_TRIS[k] = 0;
  const root = global.scene.createSceneObject("WokPan" + IDLE);
  root.setParent(parent);
  root.getTransform().setLocalRotation(quat.fromEulerAngles(0, WOK_YAW, 0));
  const body = new MeshAcc();
  body.lathe(WOK_PROFILE, 22);
  setRmv(root, body, "carbon", "302_body");

  // rolled rim glint: lighter steel edge so the silhouette reads on the additive display
  const rim = new MeshAcc();
  rim.torus(0, 4.66, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 9.86, 0.11, 0.1, 30, 3);
  addMesh(root, "WokRimGlint", rim, "carbonEdge", "302_rim");

  // Chinese wok: long hollow-steel socket + wooden grip (rear-left, like the skillet handle) + helper loop opposite
  const wokHandle = global.scene.createSceneObject("WokLongHandle");
  wokHandle.setParent(root);
  const { d } = handleFrame(168);
  const sock: [number, number, number][] = [];
  const grip: [number, number, number][] = [];
  const yAt = (r: number) => 3.95 + (r - 9.6) * 0.27;
  for (let i = 0; i <= 3; i++) {
    const r = 9.6 + (12.6 - 9.6) * (i / 3);
    sock.push([d[0] * r, yAt(r), d[2] * r]);
  }
  for (let i = 0; i <= 5; i++) {
    const r = 12.4 + (19.4 - 12.4) * (i / 5);
    grip.push([d[0] * r, yAt(r), d[2] * r]);
  }
  const sa = new MeshAcc();
  sa.sweep(sock, [0.5, 0.36, 0.34, 0.36], [0.4, 0.3, 0.3, 0.32], 8, true);
  rimLoop(sa, 348, 4.3, 1.9, 1.25, 0.24);
  addMesh(wokHandle, "WokHandleSocket", sa, "carbon", "302_wok_handle");
  const ga = new MeshAcc();
  ga.sweep(grip, [0.5, 0.56, 0.56, 0.54, 0.5, 0.46], [0.46, 0.5, 0.5, 0.48, 0.45, 0.42], 8, true);
  addMesh(wokHandle, "WokHandleGrip", ga, "wood", "302_wok_handle");

  // Indian kadai: two riveted loop handles on the same axis
  const kadaiLoops = global.scene.createSceneObject("KadaiLoopHandles");
  kadaiLoops.setParent(root);
  const ka = new MeshAcc();
  rimLoop(ka, 168, 4.3, 2.1, 1.45, 0.28);
  rimLoop(ka, 348, 4.3, 2.1, 1.45, 0.28);
  // brass rivet heads where each loop is fixed, visible on the inner wall
  for (const phi of [168, 348]) {
    const f = handleFrame(phi);
    const n = [-f.d[0] * 0.66, 0.75, -f.d[2] * 0.66];
    for (const lat of [-1.2, 1.2]) ka.dome(f.d[0] * 8.98 + f.s[0] * lat, 4.16, f.d[2] * 8.98 + f.s[2] * lat, n, 0.24, 0.1, 5);
  }
  addMesh(kadaiLoops, "KadaiLoops", ka, "brass", "302_kadai_loops");
  kadaiLoops.enabled = false;

  root.enabled = false;
  print(`[VesselGen] #302 wok/kadai: body ${VESSEL_TRIS["302_body"]} tris, rim ${VESSEL_TRIS["302_rim"]}, wok handle ${VESSEL_TRIS["302_wok_handle"]}, kadai loops ${VESSEL_TRIS["302_kadai_loops"]}`);
  return { root: root, wokHandle: wokHandle, kadaiLoops: kadaiLoops };
}

/** Kadai (two loops) for Indian dishes, long-handled wok otherwise. */
export function isKadaiDish(bp: UniversalDishBlueprint | null): boolean {
  if (!bp) return false;
  const s = `${(bp as any).cuisineTag || ""} ${bp.dishId || ""} ${(bp as any).name || ""}`.toUpperCase();
  return /INDIAN|HYDERABAD|DUM|MUGHLAI|PUNJAB|KADAI|KARAHI|MAKHANI|BIRYANI/.test(s);
}

// ───────────────────────────── #303 biryani dum handi + lid ─────────────────────────────

export const HANDI_RIM_Y = 5.42;
// pot-local (SaucepotPot frame): wide belly r 5.8, narrow neck 4.65, flared lip 5.3 (fits inside the simmer arcs)
const HANDI_PROFILE: [number, number][] = [
  [0.0, 0.0], [3.0, 0.02], [4.6, 0.45], [5.55, 1.4], [5.8, 2.4], [5.6, 3.4], [5.0, 4.25], [4.65, 4.78],
  [4.88, 5.12], [5.3, 5.36], [5.24, 5.46], [4.95, 5.3], [4.45, 4.8], [4.8, 4.2], [5.4, 3.4], [5.6, 2.4],
  [5.35, 1.4], [4.4, 0.62], [2.8, 0.5], [0.0, 0.48],
];
/** Inner wall [y, r] for the saucier fill-level discs (StationPropsBuilder.setPotInnerProfile). */
export const HANDI_INNER: [number, number][] = [[0.48, 0.0], [0.5, 2.8], [0.62, 4.4], [1.4, 5.35], [2.4, 5.6], [3.4, 5.4], [4.2, 4.8], [4.8, 4.45]];
const LID_PROFILE: [number, number][] = [
  [0.0, 1.62], [1.7, 1.52], [3.3, 1.2], [4.5, 0.62], [5.2, 0.08], [5.5, 0.0],
  [5.55, 0.14], [4.7, 0.78], [3.4, 1.38], [1.8, 1.74], [0.0, 1.84],
];
const KNOB_PROFILE: [number, number][] = [[0.0, 1.82], [0.5, 1.86], [0.32, 2.15], [0.62, 2.45], [0.56, 2.72], [0.0, 2.8]];
const LID_SEALED_POS = new vec3(0, HANDI_RIM_Y, 0);
const LID_ASIDE_POS = new vec3(0, 5.25, -7.0); // leaning on the back of the handi, knob away from the viewer
const LID_ASIDE_ROT = quat.angleAxis(-70 * DEG, vec3.right());
const LID_LIFT_SEC = 1.1;
const LID_LOWER_SEC = 0.75;
const LID_RATTLE_SEC = 0.5;

/**
 * HandiDumLid controller: setSealed(bool, animate), lift(withSteamBurst), lower(), isSealed().
 * Sealed = seated on the rim (lower() also shows the dough dum-seal ring + a short rattle); lifted = rises with a steam
 * burst, then rests leaning on the back of the handi.
 */
export class HandiLid {
  private static current: HandiLid | null = null;
  private lid: SceneObject;
  private dough: SceneObject;
  private steam: SteamPlume;
  private sealed: boolean = true;
  private mode: "" | "lift" | "lower" | "rattle" = "";
  private t: number = 0;
  private fromPos: vec3 = LID_SEALED_POS;
  private fromRot: quat = quat.quatIdentity();
  private burstLeft: number = 0;
  private live: boolean = false;

  constructor(lid: SceneObject, dough: SceneObject, steam: SteamPlume) {
    this.lid = lid;
    this.dough = dough;
    this.steam = steam;
  }

  /** The lid of the handi on the burner right now (null while the saucier is shown). */
  static getActive(): HandiLid | null {
    return HandiLid.current && HandiLid.current.live ? HandiLid.current : null;
  }

  setLive(on: boolean): void {
    this.live = on;
    if (on) HandiLid.current = this;
    else if (HandiLid.current === this) HandiLid.current = null;
  }

  getObject(): SceneObject {
    return this.lid;
  }

  isSealed(): boolean {
    return this.sealed && this.mode !== "lift";
  }

  isBusy(): boolean {
    return this.mode !== "";
  }

  setSealed(sealed: boolean, animate: boolean = true): void {
    if (sealed) {
      if (animate) this.lower();
      else this.snap(true, false);
    } else if (animate) this.lift(false);
    else this.snap(false, false);
  }

  /** Seat (true) or set aside (false) at once; dough ring optional. */
  snap(sealed: boolean, dough: boolean): void {
    this.mode = "";
    this.sealed = sealed;
    const tr = this.lid.getTransform();
    tr.setLocalPosition(sealed ? LID_SEALED_POS : LID_ASIDE_POS);
    tr.setLocalRotation(sealed ? quat.quatIdentity() : LID_ASIDE_ROT);
    this.dough.enabled = sealed && dough;
    this.dough.getTransform().setLocalScale(vec3.one());
    this.burstLeft = 0;
    this.steam.setNow(0);
  }

  lift(withSteamBurst: boolean = true): void {
    if (!this.sealed && this.mode !== "lower" && this.mode !== "rattle") return;
    this.beginFrom();
    this.mode = "lift";
    this.sealed = false;
    this.dough.enabled = false;
    if (withSteamBurst) {
      this.burstLeft = 2.4;
      this.steam.target = 1;
    }
  }

  lower(): void {
    if (this.sealed && this.mode === "") {
      // already seated: just press the dough seal + rattle
      this.mode = "rattle";
      this.t = 0;
      this.dough.enabled = true;
      return;
    }
    this.beginFrom();
    this.mode = "lower";
    this.sealed = true;
  }

  private beginFrom(): void {
    const tr = this.lid.getTransform();
    this.fromPos = tr.getLocalPosition();
    this.fromRot = tr.getLocalRotation();
    this.t = 0;
  }

  update(dt: number): void {
    if (this.burstLeft > 0) {
      this.burstLeft -= dt;
      if (this.burstLeft <= 0) this.steam.target = 0;
    }
    this.steam.update(dt);
    if (this.mode === "") return;
    this.t += dt;
    const tr = this.lid.getTransform();
    if (this.mode === "lift") {
      const up = new vec3(0, HANDI_RIM_Y + 3.6, 0);
      const k = this.t / LID_LIFT_SEC;
      if (k < 0.36) {
        const a = smooth(k / 0.36);
        tr.setLocalPosition(vec3.lerp(this.fromPos, up, a));
        tr.setLocalRotation(quat.slerp(this.fromRot, quat.angleAxis(-8 * DEG, vec3.right()), a));
      } else if (k < 1) {
        const a = smooth((k - 0.36) / 0.64);
        const p = vec3.lerp(up, LID_ASIDE_POS, a).add(new vec3(0, 1.6 * Math.sin(Math.PI * a), 0));
        tr.setLocalPosition(p);
        tr.setLocalRotation(quat.slerp(quat.angleAxis(-8 * DEG, vec3.right()), LID_ASIDE_ROT, a));
      } else {
        tr.setLocalPosition(LID_ASIDE_POS);
        tr.setLocalRotation(LID_ASIDE_ROT);
        this.mode = "";
      }
    } else if (this.mode === "lower") {
      const above = new vec3(0, HANDI_RIM_Y + 2.4, 0);
      const k = this.t / LID_LOWER_SEC;
      if (k < 0.6) {
        const a = smooth(k / 0.6);
        tr.setLocalPosition(vec3.lerp(this.fromPos, above, a).add(new vec3(0, 1.2 * Math.sin(Math.PI * a), 0)));
        tr.setLocalRotation(quat.slerp(this.fromRot, quat.quatIdentity(), a));
      } else if (k < 1) {
        tr.setLocalPosition(vec3.lerp(above, LID_SEALED_POS, smooth((k - 0.6) / 0.4)));
        tr.setLocalRotation(quat.quatIdentity());
      } else {
        this.mode = "rattle";
        this.t = 0;
        this.dough.enabled = true;
      }
    } else if (this.mode === "rattle") {
      const k = Math.min(1, this.t / LID_RATTLE_SEC);
      const decay = 1 - k;
      const w = Math.sin(this.t * 2 * Math.PI * 11) * decay;
      tr.setLocalPosition(LID_SEALED_POS.add(new vec3(0, Math.abs(w) * 0.12, 0)));
      tr.setLocalRotation(quat.angleAxis(w * 3.2 * DEG, new vec3(1, 0, 0.6).normalize()));
      const ds = 0.4 + 0.6 * smooth(k * 1.6);
      this.dough.getTransform().setLocalScale(new vec3(ds, 1, ds));
      if (k >= 1) {
        tr.setLocalPosition(LID_SEALED_POS);
        tr.setLocalRotation(quat.quatIdentity());
        this.dough.getTransform().setLocalScale(vec3.one());
        this.mode = "";
      }
    }
  }
}

/** Builds the handi (child of the saucier pot, hidden, idle name) + its HandiDumLid. */
export function buildHandi(potObj: SceneObject): { root: SceneObject; lid: HandiLid } {
  for (const k of ["303_body", "303_rim", "303_lid", "303_dough"]) VESSEL_TRIS[k] = 0;
  const root = global.scene.createSceneObject("BiryaniHandi" + IDLE);
  root.setParent(potObj);
  const body = new MeshAcc();
  body.lathe(HANDI_PROFILE, 32);
  setRmv(root, body, "brass", "303_body");
  const rim = new MeshAcc();
  rim.torus(0, 5.38, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 5.27, 0.14, 0.12, 36, 5);
  // copper belly band (hammered-copper handi accent)
  rim.torus(0, 2.4, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 5.8, 0.06, 0.16, 36, 4);
  addMesh(root, "HandiCopperRim", rim, "copper", "303_rim");

  const lidObj = global.scene.createSceneObject("HandiDumLid");
  lidObj.setParent(root);
  const la = new MeshAcc();
  la.lathe(LID_PROFILE, 32);
  setRmv(lidObj, la, "brass", "303_lid");
  const knob = new MeshAcc();
  knob.lathe(KNOB_PROFILE, 14);
  knob.torus(0, 0.12, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 5.45, 0.1, 0.08, 32, 4);
  addMesh(lidObj, "HandiLidKnob", knob, "copper", "303_lid");

  const dough = global.scene.createSceneObject("HandiDoughSeal");
  dough.setParent(root);
  dough.getTransform().setLocalPosition(new vec3(0, HANDI_RIM_Y, 0));
  const da = new MeshAcc();
  da.torus(0, 0.02, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 5.38, 0.3, 0.2, 28, 6);
  setRmv(dough, da, "dough", "303_dough");
  dough.enabled = false;

  const steam = new SteamPlume(root, "HandiDumSteamRoot", "HandiDumSteam", {
    count: 4, spread: 1.8, baseY: 5.0, rise: 6.5, size0: 2.8, size1: 3.2, alpha: 0.85,
    speed: 0.5, sway: 0.6, z: 0.4, fadeIn: 0.25, fadeOut: 1.6,
  });
  const lid = new HandiLid(lidObj, dough, steam);
  lid.snap(true, false);
  root.enabled = false;
  print(`[VesselGen] #303 handi: body ${VESSEL_TRIS["303_body"]} tris, copper ${VESSEL_TRIS["303_rim"]}, lid ${VESSEL_TRIS["303_lid"]}, dough seal ${VESSEL_TRIS["303_dough"]}`);
  return { root: root, lid: lid };
}

// ───────────────────────────── #332 gravy ladle ─────────────────────────────

/** SLOT_SECONDARY_TOOL_REST (SaucepotStation frame): the bowl rests on its side, handle lying toward +X (yaw from the slot). */
const LADLE_SLOT = getSlot("SLOT_SECONDARY_TOOL_REST");
const LADLE_REST_POS = new vec3(LADLE_SLOT.x, LADLE_SLOT.y + 1.4, LADLE_SLOT.z);
const LADLE_REST_ROT = quat.angleAxis(LADLE_SLOT.yawDeg * DEG, vec3.up()).multiply(quat.angleAxis(-80 * DEG, vec3.forward()));
const BOWL_PROFILE: [number, number][] = [
  [0.0, -1.35], [0.7, -1.17], [1.17, -0.68], [1.35, 0.0], [1.42, 0.06], [1.3, 0.09],
  [1.25, 0.0], [1.08, -0.62], [0.62, -1.05], [0.0, -1.2],
];

/** Builds the ladle (upright frame: bowl centre at the origin, opening +Y, handle rising on +X with a hook). */
export function buildLadleMesh(parent: SceneObject): SceneObject {
  VESSEL_TRIS["332_ladle"] = 0;
  const root = global.scene.createSceneObject("LadleProp" + IDLE);
  root.setParent(parent);
  const bowl = new MeshAcc();
  bowl.lathe(BOWL_PROFILE, 20);
  setRmv(root, bowl, "chrome", "332_ladle");
  const curve: [number, number, number][] = [
    [1.28, 0.06, 0], [1.62, 0.9, 0], [1.95, 2.6, 0], [2.3, 6.0, 0], [2.65, 9.6, 0], [2.95, 13.0, 0],
    [3.08, 15.0, 0], [2.85, 16.0, 0], [2.2, 16.3, 0], [1.65, 15.7, 0],
  ];
  const rw = [0.4, 0.32, 0.3, 0.3, 0.32, 0.36, 0.36, 0.32, 0.27, 0.24];
  const rh = rw.map((w) => w * 0.42);
  const h = new MeshAcc();
  h.sweep(curve, rw, rh, 6, true);
  addMesh(root, "LadleHandle", h, "chrome", "332_ladle");
  return root;
}

const TP_DIP = 0.6, TP_SCOOP = 0.4, TP_TRAVEL = 1.0, TP_TILT = 0.7, TP_HOLD = 0.35, TP_BACK = 0.9;

/** #332 stainless gravy ladle: rest pose at SLOT_SECONDARY_TOOL_REST + ladleToPlate() helper (K1 plating pour). */
export class LadleProp {
  private obj: SceneObject;
  private props: StationPropsBuilder;
  private t: number = -1;
  private onDone: (() => void) | null = null;
  private pot: SceneObject | null = null;
  private target: vec3 = vec3.zero();
  private restWorld: vec3 = vec3.zero();
  private restWorldRot: quat = quat.quatIdentity();

  constructor(obj: SceneObject, props: StationPropsBuilder) {
    this.obj = obj;
    this.props = props;
    this.resetToRest();
  }

  getObject(): SceneObject {
    return this.obj;
  }

  isBusy(): boolean {
    return this.t >= 0;
  }

  resetToRest(): void {
    this.t = -1;
    this.onDone = null;
    const tr = this.obj.getTransform();
    tr.setLocalPosition(LADLE_REST_POS);
    tr.setLocalRotation(LADLE_REST_ROT);
  }

  /**
   * Scoop from the handi / saucier and pour over the plate: dip, lift, arc to above `targetWorld` (default: active
   * service piece centre), tilt-pour, return to rest. Returns false while busy / hidden / no pot.
   */
  ladleToPlate(targetWorld?: vec3, onDone?: () => void): boolean {
    if (this.t >= 0 || !this.obj.isEnabledInHierarchy) return false;
    const root = this.props.getSceneObject();
    this.pot = findByName(root, "BiryaniHandi") || this.props.getSaucierPot();
    if (!this.pot) return false;
    if (targetWorld) this.target = targetWorld;
    else {
      const plate = this.props.getPlateObject();
      if (!plate) return false;
      this.target = plate.getTransform().getWorldTransform().multiplyPoint(new vec3(0, this.props.getPlateFloorLocalY(), 0));
    }
    const tr = this.obj.getTransform();
    this.restWorld = tr.getWorldPosition();
    this.restWorldRot = tr.getWorldRotation();
    this.onDone = onDone || null;
    this.t = 0;
    return true;
  }

  private potPoint(x: number, y: number, z: number): vec3 {
    return this.pot!.getTransform().getWorldTransform().multiplyPoint(new vec3(x, y, z));
  }

  update(dt: number): void {
    if (this.t < 0 || !this.pot || isNull(this.pot)) return;
    this.t += dt;
    const t = this.t;
    const tr = this.obj.getTransform();
    const potRot = this.pot.getTransform().getWorldRotation();
    const dir = this.target.sub(this.potPoint(0, 0, 0));
    const yaw = Math.atan2(-dir.z, dir.x); // handle (+X) trails the pour direction... keep it upright, facing the plate
    const upright = potRot.multiply(quat.angleAxis(yaw + Math.PI, vec3.up()));
    const dip = this.potPoint(0, 2.6, 0);
    const above = this.potPoint(0, 8.0, 0);
    const overPlate = this.target.add(new vec3(0, 4.0, 0));
    const tilt = upright.multiply(quat.angleAxis(-75 * DEG, vec3.forward()));
    let t0 = 0;
    if (t < (t0 += TP_DIP)) {
      const a = smooth(t / TP_DIP);
      tr.setWorldPosition(vec3.lerp(this.restWorld, dip, a).add(new vec3(0, 3.0 * Math.sin(Math.PI * a), 0)));
      tr.setWorldRotation(quat.slerp(this.restWorldRot, upright, a));
    } else if (t < (t0 += TP_SCOOP)) {
      tr.setWorldPosition(vec3.lerp(dip, above, smooth((t - (t0 - TP_SCOOP)) / TP_SCOOP)));
      tr.setWorldRotation(upright);
    } else if (t < (t0 += TP_TRAVEL)) {
      const a = smooth((t - (t0 - TP_TRAVEL)) / TP_TRAVEL);
      tr.setWorldPosition(vec3.lerp(above, overPlate, a).add(new vec3(0, 2.0 * Math.sin(Math.PI * a), 0)));
      tr.setWorldRotation(upright);
    } else if (t < (t0 += TP_TILT)) {
      tr.setWorldRotation(quat.slerp(upright, tilt, smooth((t - (t0 - TP_TILT)) / TP_TILT)));
      tr.setWorldPosition(overPlate);
    } else if (t < (t0 += TP_HOLD)) {
      tr.setWorldRotation(tilt);
    } else if (t < (t0 += TP_BACK)) {
      const a = smooth((t - (t0 - TP_BACK)) / TP_BACK);
      tr.setWorldPosition(vec3.lerp(overPlate, this.restWorld, a).add(new vec3(0, 2.5 * Math.sin(Math.PI * a), 0)));
      tr.setWorldRotation(quat.slerp(tilt, this.restWorldRot, a));
    } else {
      const cb = this.onDone;
      this.resetToRest();
      if (cb) cb();
    }
  }
}

// ───────────────────────────── #342 / #343 service ware ─────────────────────────────

export interface ServePiece {
  root: SceneObject;
  floorY: number;
  rimR: number;
  /** Plating reticle scale vs the coupe plate. */
  fit: number;
}

export function buildNoodleBowl(parent: SceneObject): ServePiece {
  VESSEL_TRIS["342_bowl"] = 0;
  const root = global.scene.createSceneObject("NoodleBowlProp" + IDLE);
  root.setParent(parent);
  const prof: [number, number][] = [
    [0.0, 0.02], [1.9, 0.02], [2.0, 0.0], [2.15, 0.18], [2.4, 0.3], [3.1, 0.8], [3.75, 1.7], [4.1, 2.6],
    [4.25, 3.2], [4.2, 3.3], [4.05, 3.22], [3.9, 2.6], [3.55, 1.75], [2.9, 0.95], [2.0, 0.55], [0.0, 0.5],
  ];
  const a = new MeshAcc();
  a.lathe(prof, 36);
  setRmv(root, a, "glaze", "342_bowl");
  // indigo glaze band on the outer wall + rim line (reads clearly on the additive display)
  const band = new MeshAcc();
  band.lathe([[3.18, 0.92], [3.62, 1.5], [3.95, 2.15]].map(([r, y]) => [r + 0.035, y] as [number, number]), 36);
  band.torus(0, 3.27, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 4.22, 0.06, 0.06, 40, 4);
  addMesh(root, "NoodleBowlGlazeBand", band, "glazeBand", "342_bowl");
  root.enabled = false;
  print(`[VesselGen] #342 deep bowl: ${VESSEL_TRIS["342_bowl"]} tris`);
  return { root: root, floorY: 0.5, rimR: 4.25, fit: 0.78 };
}

export function buildServingHandi(parent: SceneObject): ServePiece {
  VESSEL_TRIS["343_thali_handi"] = 0;
  const root = global.scene.createSceneObject("ServingHandiProp" + IDLE);
  root.setParent(parent);
  const thali: [number, number][] = [
    [0.0, 0.0], [4.6, 0.0], [5.0, 0.1], [5.15, 0.52], [5.3, 0.62], [5.18, 0.68], [4.86, 0.26], [4.5, 0.18], [0.0, 0.18],
  ];
  const ta = new MeshAcc();
  ta.lathe(thali, 40);
  setRmv(root, ta, "thali", "343_thali_handi");
  const bowl = global.scene.createSceneObject("ServingHandiBowl");
  bowl.setParent(root);
  bowl.getTransform().setLocalPosition(new vec3(0, 0.18, 0));
  const prof: [number, number][] = [
    [0.0, 0.0], [2.0, 0.0], [2.6, 0.2], [3.4, 0.9], [3.7, 1.8], [3.55, 2.7], [3.7, 3.3], [4.0, 3.6],
    [3.95, 3.72], [3.75, 3.62], [3.45, 3.1], [3.35, 2.6], [3.45, 1.8], [3.1, 1.0], [2.3, 0.5], [0.0, 0.45],
  ];
  const ba = new MeshAcc();
  ba.lathe(prof, 32);
  setRmv(bowl, ba, "brass", "343_thali_handi");
  const rim = new MeshAcc();
  rim.torus(0, 3.64, 0, [1, 0, 0], [0, 0, 1], [0, 1, 0], 3.98, 0.12, 0.1, 36, 5);
  addMesh(bowl, "ServingHandiCopperRim", rim, "copper", "343_thali_handi");
  root.enabled = false;
  print(`[VesselGen] #343 serving handi + thali: ${VESSEL_TRIS["343_thali_handi"]} tris`);
  return { root: root, floorY: 0.63, rimR: 4.0, fit: 0.72 };
}

// ───────────────────────────── plan + controller ─────────────────────────────

/** What a dish wants on the hero slots (mirrors RecipeCompilerService.buildStage / runBuilderHooks). */
export interface WarePlan {
  primary: number;
  secondary: number;
  ladle: boolean;
  serve: number;
  kadai: boolean;
}

export function warePlanFor(bp: UniversalDishBlueprint | null): WarePlan {
  const plan: WarePlan = { primary: -1, secondary: -1, ladle: false, serve: -1, kadai: isKadaiDish(bp) };
  if (!bp) return plan;
  const nums: number[] = ([] as any[]).concat(bp.vesselAccessNumbers || [], (bp as any).toolAccessNumbers || []);
  const sauceVessel = bp.sauce ? bp.sauce.vesselAccessNumber : -1;
  for (const raw of nums) {
    if (typeof raw !== "number") continue;
    const e = AssetPageTable.vessels.get(raw);
    if (!e) continue;
    const n = e.accessNumber;
    if (e.kind === "COOKWARE" && e.slot === "SLOT_PRIMARY_BURNER" && plan.primary < 0) plan.primary = n;
    if (e.kind === "COOKWARE" && e.slot === "SLOT_SECONDARY_BURNER" && (plan.secondary < 0 || n === sauceVessel)) plan.secondary = n;
    if (n === 332) plan.ladle = !!(bp.sauce && bp.sauce.useLadleStir);
    if (SERVEWARE_NUMBERS.indexOf(n) >= 0) plan.serve = n;
  }
  if (plan.serve < 0) plan.serve = autoServewareFor(bp);
  return plan;
}

interface SavedVis {
  obj: SceneObject;
  rmv: RenderMeshVisual | null;
  was: boolean;
}

/**
 * Owns the A4a props and swaps them in/out (StationPropsDishBuilder drives it from morphVessel / enableTool / stage /
 * reveal). Every swap hides the original prop's visuals (saving their enabled state) and restores them exactly.
 */
export class HeroWareController {
  private props: StationPropsBuilder;
  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private wok: { root: SceneObject; wokHandle: SceneObject; kadaiLoops: SceneObject } | null = null;
  private handi: { root: SceneObject; lid: HandiLid } | null = null;
  private ladle: LadleProp | null = null;
  private stock: StockpotProp | null = null; // A4b #305 pasta stockpot (secondary burner)
  private tawa: SceneObject | null = null; // A4b #307 tawa (primary burner)
  private serve: { [n: number]: ServePiece } = {};
  private primary: number = 301;
  private secondary: number = 304;
  private serveActive: number = 341;
  private ladleOn: boolean = false;
  private kadai: boolean = false;
  private skilletSaved: SavedVis[] = [];
  private saucierSaved: SavedVis[] = [];
  private coupeWas: boolean = true;
  private autoLifted: boolean = false;
  /** Called after the primary pan changed (the dish builder re-places its protein props). */
  public onPanChanged: (() => void) | null = null;

  constructor(props: StationPropsBuilder) {
    this.props = props;
    registerPanFloor("WokPan", WOK_FLOOR);
    props.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()));
    this.bus.on("DUM_SEAL_REQUESTED", (d?: any) => {
      const lid = HandiLid.getActive();
      if (!lid) return;
      if (d && d.seal === false) lid.lift(true);
      else lid.lower();
    });
    this.bus.on("RESET_REQUESTED", () => {
      if (this.ladle) this.ladle.resetToRest();
      if (this.handi) this.handi.lid.snap(true, false);
      this.autoLifted = false;
    });
    this.bus.on("DISH_BLUEPRINT_APPLIED", (d?: any) => {
      // non-staged applies (Reset, cycle without briefing): the hooks ran already; settle what no hook covers
      if (!d || d.staged === true || !d.blueprint) return;
      this.applyLeftovers(warePlanFor(d.blueprint));
    });
  }

  private root(): SceneObject {
    return this.props.getSceneObject();
  }

  private station(name: string): SceneObject | null {
    return findByName(this.root(), name);
  }

  // ── build (hidden) ──

  /** Builds (once) the hidden prop for #302/#303/#305/#307/#332/#342/#343 and returns its root (null for other numbers). */
  prepare(n: number): SceneObject | null {
    try {
      if (n === 302) {
        if (!this.wok) {
          const st = this.station("SkilletStation");
          if (!st) return null;
          this.wok = buildWok(st);
        }
        return this.wok.root;
      }
      if (n === 303) {
        if (!this.handi) {
          const pot = this.props.getSaucierPot();
          if (!pot) return null;
          this.handi = buildHandi(pot);
        }
        return this.handi.root;
      }
      if (n === 305) {
        if (!this.stock) {
          const pot = this.props.getSaucierPot();
          if (!pot) return null;
          this.stock = buildStockpot(pot);
        }
        return this.stock.root;
      }
      if (n === 307) {
        if (!this.tawa) {
          const st = this.station("SkilletStation");
          if (!st) return null;
          this.tawa = buildTawa(st);
        }
        return this.tawa;
      }
      if (n === 332) {
        if (!this.ladle) {
          const st = this.station("SaucepotStation");
          if (!st) return null;
          const o = buildLadleMesh(st);
          o.enabled = false;
          this.ladle = new LadleProp(o, this.props);
          print(`[VesselGen] #332 ladle: ${VESSEL_TRIS["332_ladle"]} tris`);
        }
        return this.ladle.getObject();
      }
      if (n === 342 || n === 343) {
        if (!this.serve[n]) {
          const st = this.station("PlatingServingStation");
          if (!st) return null;
          this.serve[n] = n === 342 ? buildNoodleBowl(st) : buildServingHandi(st);
        }
        return this.serve[n].root;
      }
    } catch (e) {
      print(`[VesselGen] build #${n} failed: ${e}`);
    }
    return null;
  }

  // ── swaps ──

  setKadai(on: boolean): void {
    this.kadai = on;
    if (!this.wok) return;
    this.wok.kadaiLoops.enabled = on;
    this.wok.wokHandle.enabled = !on;
  }

  private hide(list: SavedVis[], parent: SceneObject | null, rmvOwner: SceneObject | null, children: string[]): void {
    if (list.length > 0) return;
    if (rmvOwner) {
      const rmv = rmvOwner.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      if (rmv) {
        list.push({ obj: rmvOwner, rmv: rmv, was: rmv.enabled });
        rmv.enabled = false;
      }
    }
    if (!parent) return;
    for (const n of children) {
      const o = findByName(parent, n);
      if (!o) continue;
      list.push({ obj: o, rmv: null, was: o.enabled });
      o.enabled = false;
    }
  }

  private unhide(list: SavedVis[]): void {
    for (const s of list) {
      if (!s.obj || isNull(s.obj)) continue;
      if (s.rmv) s.rmv.enabled = s.was;
      else s.obj.enabled = s.was;
    }
    list.length = 0;
  }

  /** #302 wok/kadai or #307 tawa in place of the skillet, or back to the skillet (any other number). */
  showPrimary(n: number): boolean {
    const want = n === 302 ? 302 : n === 307 ? 307 : 301;
    if (want !== 301 && !this.prepare(want)) return false;
    if (want === this.primary) {
      if (want === 302) this.setKadai(this.kadai);
      return false;
    }
    const st = this.station("SkilletStation");
    const pan = st ? findByName(st, "SkilletPan") : null;
    if (this.primary === 302 && this.wok) {
      this.wok.root.name = "WokPan" + IDLE;
      this.wok.root.enabled = false;
      this.wok.root.getTransform().setLocalScale(vec3.one());
    }
    if (this.primary === 307 && this.tawa) {
      this.tawa.name = "TawaPan" + IDLE;
      this.tawa.enabled = false;
      this.tawa.getTransform().setLocalScale(vec3.one());
    }
    if (want === 301) {
      this.unhide(this.skilletSaved);
    } else {
      this.hide(this.skilletSaved, pan, pan, ["SkilletHandle", "SkilletHandleRivets", "SkilletHelperTab", "SkilletOilPool"]);
      if (want === 302 && this.wok) {
        this.setKadai(this.kadai);
        this.wok.root.name = "WokPan";
        this.wok.root.enabled = true;
      } else if (want === 307 && this.tawa) {
        this.tawa.name = "TawaPan";
        this.tawa.enabled = true;
      }
    }
    this.primary = want;
    if (this.onPanChanged) this.onPanChanged();
    return true;
  }

  /** #303 handi (+ lid, sealed) or #305 stockpot in place of the saucier, or back to the saucier (any other number). */
  showSecondary(n: number): boolean {
    const want = n === 303 ? 303 : n === 305 ? 305 : 304;
    if (want !== 304 && !this.prepare(want)) return false;
    if (want === this.secondary) return false;
    const pot = this.props.getSaucierPot();
    if (this.secondary === 303 && this.handi) {
      this.handi.lid.setLive(false);
      this.handi.lid.snap(true, false);
      this.handi.root.name = "BiryaniHandi" + IDLE;
      this.handi.root.enabled = false;
      this.handi.root.getTransform().setLocalScale(vec3.one());
    }
    if (this.secondary === 305 && this.stock) {
      this.stock.setLive(false);
      this.stock.root.name = "PastaStockpot" + IDLE;
      this.stock.root.enabled = false;
      this.stock.root.getTransform().setLocalScale(vec3.one());
    }
    if (want === 304) {
      this.unhide(this.saucierSaved);
      this.props.setPotInnerProfile(null);
    } else {
      this.hide(this.saucierSaved, pot, pot, ["SaucepanHandle", "HandleRivet1"]);
      if (want === 303 && this.handi) {
        this.handi.root.name = "BiryaniHandi";
        this.handi.root.enabled = true;
        this.handi.lid.snap(true, false);
        this.handi.lid.setLive(true);
        this.props.setPotInnerProfile(HANDI_INNER);
        this.autoLifted = false;
      } else if (want === 305 && this.stock) {
        this.stock.root.name = "PastaStockpot";
        this.stock.root.enabled = true;
        this.stock.setLive(true);
        this.props.setPotInnerProfile(STOCK_INNER);
      }
    }
    this.secondary = want;
    return true;
  }

  showLadle(on: boolean): SceneObject | null {
    if (on && !this.prepare(332)) return null;
    if (!this.ladle) return null;
    const o = this.ladle.getObject();
    if (on !== this.ladleOn) {
      this.ladle.resetToRest();
      o.name = on ? "LadleProp" : "LadleProp" + IDLE;
      o.enabled = on;
      if (!on) o.getTransform().setLocalScale(vec3.one());
      this.ladleOn = on;
    }
    return on ? o : null;
  }

  /** Active service piece #341 coupe / #342 deep bowl / #343 serving handi; returns the object now shown. */
  showServe(n: number): SceneObject | null {
    const want = n === 342 || n === 343 ? n : 341;
    if (want !== 341 && !this.prepare(want)) return null;
    const coupe = this.props.getCoupePlate();
    if (want !== this.serveActive) {
      for (const k of [342, 343]) {
        const p = this.serve[k];
        if (!p || k === want) continue;
        p.root.name = (k === 342 ? "NoodleBowlProp" : "ServingHandiProp") + IDLE;
        p.root.enabled = false;
        p.root.getTransform().setLocalScale(vec3.one());
      }
      if (want === 341) {
        if (coupe) coupe.enabled = this.coupeWas;
        this.props.setServicePiece(null, 0, 0, 1);
      } else {
        const p = this.serve[want];
        if (this.serveActive === 341 && coupe) this.coupeWas = coupe.enabled;
        if (coupe) coupe.enabled = false;
        p.root.name = want === 342 ? "NoodleBowlProp" : "ServingHandiProp";
        p.root.enabled = true;
        this.props.setServicePiece(p.root, p.floorY, p.rimR, p.fit);
      }
      this.serveActive = want;
    }
    return want === 341 ? coupe : this.serve[want].root;
  }

  /** What no hook of this dish covers: ladle off, skillet / saucier back when the dish has no such vessel. */
  applyLeftovers(plan: WarePlan): void {
    this.setKadai(plan.kadai);
    if (!plan.ladle) this.showLadle(false);
    if (plan.primary < 0) this.showPrimary(301);
    if (plan.secondary < 0) this.showSecondary(304);
  }

  getPrimary(): number {
    return this.primary;
  }

  getSecondary(): number {
    return this.secondary;
  }

  getServe(): number {
    return this.serveActive;
  }

  isLadleOn(): boolean {
    return this.ladleOn;
  }

  getLadle(): LadleProp | null {
    return this.ladleOn ? this.ladle : null;
  }

  getLid(): HandiLid | null {
    return HandiLid.getActive();
  }

  /** A4b stockpot while it is the live secondary vessel (null otherwise). */
  getStock(): StockpotProp | null {
    return this.stock && this.secondary === 305 ? this.stock : null;
  }

  private update(dt: number): void {
    if (this.handi && this.secondary === 303) {
      const lid = this.handi.lid;
      // the transfer pours into an open handi: the lid lifts (steam burst) as the first pour starts
      const stage = this.props.getTransferStage();
      if (stage === 0) this.autoLifted = false;
      else if (!this.autoLifted && lid.isSealed() && !lid.isBusy()) {
        this.autoLifted = true;
        lid.lift(true);
      }
      lid.update(dt);
    }
    if (this.ladle && this.ladleOn) this.ladle.update(dt);
    if (this.stock && this.secondary === 305) this.stock.update(dt);
  }
}
