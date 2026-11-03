import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { MeshAcc, SALMON_DOME_H, SALMON_SKIN_BULGE, makePbrMaterial, makeTexturedPbr } from "./StationPropsBuilder";
import { faceDirectorCamera } from "./DAGCounterConduit";

const DEG = Math.PI / 180;
const TEX_STEAM = requireAsset("../Textures/Tex_Steam.png") as Texture;

/** Total length of the physical flip (glide in -> slide under -> flip -> pat -> back to rest). */
export const FLIP_DURATION_SEC = 3.3;

// Choreography keys (seconds from playFlip)
const T_GLIDE = 0.62; // rest -> hover over the near edge of the fillet
const T_CONTACT = 0.82; // 45 deg drop onto the pan floor
const T_UNDER = 1.16; // slide under the fillet
const T_LAND = 2.2; // lift, roll 180 deg in a parabolic arc, land centred
const T_PAT = 2.72; // move over the seared top, two pats
// FLIP_DURATION_SEC: retreat to rest

// ─── Spatula geometry (SkilletStation-local units: 1 = 0.68 cm; pan radius 10, fillet 10.6 x 5.4) ───
// Origin = blade front-edge centre, blade bottom at y 0, blade points +Z, handle toward -Z.
const BLADE_L = 7.4;
const BLADE_HW_FRONT = 2.9;
const BLADE_HW_HEEL = 1.75;
const BLADE_T = 0.09;
const BLADE_LIFT = 0.32; // heel rises (slight upward curve of a fish turner)
const NECK_L = 2.4;
const NECK_RISE = 1.75;
const HANDLE_L = 10.6;
const HANDLE_RISE_DEG = 7;

// Rest pose: lying on the slab in front-left of the skillet, blade toward the slab's left edge,
// handle toward the plate (right-handed grab). Station-local; slab top ~ y 0.
const REST_FRONT = new vec3(-8.6, 0, 14.4);
const REST_YAW = -90 * DEG;
const APPROACH_SWING = 20 * DEG;
const ARC_APEX = 3.4; // salmon flight apex above the pan floor (~2.3 cm)
const CARRY_PITCH = 24 * DEG;
const SLAB_Y = 0.02;

function smooth(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return t * t * (3 - 2 * t);
}

function smoother(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function lerpV(a: vec3, b: vec3, k: number): vec3 {
  return new vec3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
}

/** Salmon height above its rest pose during the flip (k 0..1): parabola from blade height to the pan. */
function arcH(k: number): number {
  return 0.14 * (1 - k) + 4 * ARC_APEX * k * (1 - k);
}

/** Drift across the fillet (pan-local units, negative = far side) so the roll reads as going over. */
function arcDrift(k: number): number {
  return -0.8 * Math.sin(Math.PI * k);
}

function bladeHalfW(v: number): number {
  return lerp(BLADE_HW_FRONT, BLADE_HW_HEEL, Math.pow(v, 1.15));
}

function bladeLift(v: number): number {
  return BLADE_LIFT * v * v;
}

/**
 * Slotted stainless fish-turner blade as a masked grid: columns across (edge rails, 5 long slots,
 * 4 slats), rows along the length (solid front + heel bands). Rounded front corners, thin bevelled
 * front edge, slight upward curve toward the heel.
 */
function buildBlade(acc: MeshAcc): void {
  const COLS = [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]; // rail, slot, slat, ..., slot, rail (column widths)
  const SLOT = (c: number): boolean => c % 2 === 1;
  const total = COLS.reduce((s, w) => s + w, 0);
  const uEdges: number[] = [-1];
  let acc0 = 0;
  for (const w of COLS) {
    acc0 += w;
    uEdges.push(-1 + (2 * acc0) / total);
  }
  const NV = 14;
  const SLOT_ROW0 = 2;
  const SLOT_ROW1 = 12;
  const NC = COLS.length;
  // grid point (column edge i, row j) -> position on top or bottom surface
  const P = (i: number, j: number, top: boolean): vec3 => {
    const u = uEdges[i];
    const v = j / NV;
    const front = -0.95 * Math.pow(Math.abs(u), 3.2) * (1 - v); // rounded front corners
    const z = lerp(front, -BLADE_L, v);
    const x = u * bladeHalfW(v);
    const t = BLADE_T * (0.35 + 0.65 * smooth(v / 0.14)); // bevelled leading edge
    const y = bladeLift(v) + (top ? t : 0);
    return new vec3(x, y, z);
  };
  const solid = (c: number, r: number): boolean => {
    if (c < 0 || c >= NC || r < 0 || r >= NV) return false;
    return !(SLOT(c) && r >= SLOT_ROW0 && r < SLOT_ROW1);
  };
  const topIds: number[][] = [];
  const botIds: number[][] = [];
  for (let i = 0; i <= NC; i++) {
    topIds.push([]);
    botIds.push([]);
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      const slope = (2 * BLADE_LIFT * v) / BLADE_L; // dy/d(-z)
      const pt = P(i, j, true);
      const pb = P(i, j, false);
      topIds[i].push(acc.v(pt.x, pt.y, pt.z, 0, 1, -slope, (uEdges[i] + 1) / 2, v));
      botIds[i].push(acc.v(pb.x, pb.y, pb.z, 0, -1, slope, (uEdges[i] + 1) / 2, v));
    }
  }
  const wall = (a: vec3, b: vec3, c: vec3, d: vec3, n: vec3): void => {
    const i0 = acc.v(a.x, a.y, a.z, n.x, n.y, n.z, 0, 0);
    const i1 = acc.v(b.x, b.y, b.z, n.x, n.y, n.z, 1, 0);
    const i2 = acc.v(c.x, c.y, c.z, n.x, n.y, n.z, 1, 1);
    const i3 = acc.v(d.x, d.y, d.z, n.x, n.y, n.z, 0, 1);
    acc.quad(i0, i1, i2, i3);
  };
  for (let c = 0; c < NC; c++) {
    for (let r = 0; r < NV; r++) {
      if (!solid(c, r)) continue;
      acc.quad(topIds[c][r], topIds[c + 1][r], topIds[c + 1][r + 1], topIds[c][r + 1]);
      acc.quad(botIds[c][r], botIds[c + 1][r], botIds[c + 1][r + 1], botIds[c][r + 1]);
      // side walls where the neighbour is a slot or outside the blade
      if (!solid(c - 1, r)) wall(P(c, r, false), P(c, r + 1, false), P(c, r + 1, true), P(c, r, true), new vec3(-1, 0, 0));
      if (!solid(c + 1, r)) wall(P(c + 1, r, false), P(c + 1, r + 1, false), P(c + 1, r + 1, true), P(c + 1, r, true), new vec3(1, 0, 0));
      if (!solid(c, r - 1)) wall(P(c, r, false), P(c + 1, r, false), P(c + 1, r, true), P(c, r, true), new vec3(0, 0, 1));
      if (!solid(c, r + 1)) wall(P(c, r + 1, false), P(c + 1, r + 1, false), P(c + 1, r + 1, true), P(c, r + 1, true), new vec3(0, 0, -1));
    }
  }
}

/** Handle axis start (end of the offset neck) and unit direction. */
function handleFrame(): { start: vec3; dir: vec3 } {
  const heelY = bladeLift(1) + BLADE_T * 0.5;
  const start = new vec3(0, heelY + NECK_RISE, -BLADE_L - NECK_L);
  const a = HANDLE_RISE_DEG * DEG;
  return { start, dir: new vec3(0, Math.sin(a), -Math.cos(a)) };
}

/** Steel parts: blade, offset tang/neck, ferrule and rivets. */
function buildSteel(acc: MeshAcc): void {
  buildBlade(acc);
  const heelY = bladeLift(1) + BLADE_T * 0.5;
  const hf = handleFrame();
  // Offset neck: flat strap rising from the blade heel into the handle (S-curve)
  const neck: [number, number, number][] = [];
  const nrw: number[] = [];
  const nrh: number[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -BLADE_L + 0.9 - (NECK_L + 0.9 + 1.2) * t;
    const y = heelY + NECK_RISE * smooth((t - 0.15) / 0.7) + Math.max(0, t - 0.85) * 0.6;
    neck.push([0, y, z]);
    nrw.push(lerp(0.75, 0.36, smooth(t / 0.4)));
    nrh.push(0.065);
  }
  acc.sweep(neck, nrw, nrh, 10, true);
  // Steel ferrule / bolster at the handle mouth
  const f0 = hf.start.add(hf.dir.uniformScale(-0.05));
  const f1 = hf.start.add(hf.dir.uniformScale(0.65));
  acc.sweep([[f0.x, f0.y, f0.z], [f1.x, f1.y, f1.z]], [0.5, 0.5], [0.4, 0.4], 14, true);
  // Two rivets where the tang is fixed to the blade heel
  for (const sx of [-1, 1]) {
    acc.dome(sx * 0.32, heelY + BLADE_T * 0.5, -BLADE_L + 0.45, [0, 1, 0], 0.14, 0.06, 8);
  }
  // Three handle rivets (both faces)
  for (const t of [0.16, 0.38, 0.6]) {
    const p = hf.start.add(hf.dir.uniformScale(HANDLE_L * t));
    const r = handleHalfW((HANDLE_L * t - 0.6) / (HANDLE_L - 0.6)) - 0.02;
    for (const sx of [-1, 1]) {
      acc.dome(p.x + sx * r, p.y, p.z, [sx, 0, 0], 0.13, 0.05, 8);
    }
  }
}

/** Walnut handle with a palm swell and a rounded butt. */
function buildHandle(acc: MeshAcc): void {
  const hf = handleFrame();
  const curve: [number, number, number][] = [];
  const rw: number[] = [];
  const rh: number[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = hf.start.add(hf.dir.uniformScale(0.6 + (HANDLE_L - 0.6) * t));
    curve.push([p.x, p.y, p.z]);
    rw.push(handleHalfW(t));
    rh.push(handleHalfH(t));
  }
  acc.sweep(curve, rw, rh, 16, false);
  // rounded butt + front shoulder caps
  const end = hf.start.add(hf.dir.uniformScale(HANDLE_L));
  acc.ellipsoid(end.x, end.y, end.z, rw[N], rh[N], 0.42, 16, 6, 0, HANDLE_RISE_DEG * DEG);
  const fr = hf.start.add(hf.dir.uniformScale(0.6));
  acc.ellipsoid(fr.x, fr.y, fr.z, rw[0], rh[0], 0.12, 16, 4, 0, HANDLE_RISE_DEG * DEG);
}

function handleSwell(t: number): number {
  return Math.sin(Math.PI * Math.max(0, Math.min(1, t / 0.9))) * 0.08;
}

function handleHalfW(t: number): number {
  return 0.44 + 0.06 * t + handleSwell(t);
}

function handleHalfH(t: number): number {
  return 0.34 + 0.03 * t + handleSwell(t) * 0.7;
}

interface SpatPose {
  p: vec3; // blade front-edge centre (station-local)
  yaw: number;
  pitch: number; // + tips the blade's front edge down
}

/**
 * SpatulaFlipRig.ts
 * WS9-P2 physical fish-turner prop (SpatulaProp) and a deterministic ~3.3 s flip of the salmon:
 * glide in from rest, 18 deg blade tilt with a 45 deg drop onto the pan floor, slide under the
 * fillet, lift and roll the fillet 180 deg about its long axis in a parabolic arc, land centred
 * (seared SalmonCrispySkin now on top) with a sizzle/steam burst, two pats, back to rest.
 * Plain class driven by SpatulaTechniqueGuide (no physics, no extra script component).
 */
export class SpatulaFlipRig {
  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private ready: boolean = false;

  private station!: SceneObject;
  private salmon!: SceneObject;
  private herb: SceneObject | null = null;
  private prop!: SceneObject;

  private salmonPos0!: vec3;
  private salmonRot0!: quat;
  private salmonScale0!: vec3;
  private herbPos0: vec3 = vec3.zero();
  private herbRot0: quat = quat.quatIdentity();
  private herbScale0: vec3 = vec3.one();

  // station-local frame of the fillet
  private C!: vec3; // fillet base centre
  private w!: vec3; // spatula handle-side direction (across the fillet, toward the near side)
  private approachYaw: number = 0;
  private restPose!: SpatPose;

  private t: number = -1; // seconds into the flip, -1 = idle
  private flipped: boolean = false;
  private callbacks: (() => void)[] = [];
  private landed: boolean = false;

  private steam: { obj: SceneObject; mat: Material; dx: number; dz: number; ph: number }[] = [];
  private drops: { obj: SceneObject; v: vec3; p0: vec3 }[] = [];
  private fxT: number = -1;

  /** Bind to SkilletStation / SalmonFillet under StationsRoot and build the prop. False until props exist. */
  public tryInit(stationsRoot: SceneObject | null): boolean {
    if (this.ready) return true;
    if (!stationsRoot) return false;
    const station = findByName(stationsRoot, "SkilletStation");
    const salmon = station ? findByName(station, "SalmonFillet") : null;
    const pan = station ? findByName(station, "SkilletPan") : null;
    if (!station || !salmon || !pan || !findByName(salmon, "SalmonCrispySkin")) return false;
    this.station = station;
    this.salmon = salmon;
    this.herb = findByName(salmon, "HerbSprig");

    const st = salmon.getTransform();
    this.salmonPos0 = st.getLocalPosition();
    this.salmonRot0 = st.getLocalRotation();
    this.salmonScale0 = st.getLocalScale();
    if (this.herb) {
      const ht = this.herb.getTransform();
      this.herbPos0 = ht.getLocalPosition();
      this.herbRot0 = ht.getLocalRotation();
      this.herbScale0 = ht.getLocalScale();
    }

    // Fillet frame in SkilletStation space (pan is only yawed + offset inside the station)
    const pt = pan.getTransform();
    const panRot = pt.getLocalRotation();
    this.C = pt.getLocalPosition().add(panRot.multiplyVec3(this.salmonPos0));
    const wv = panRot.multiply(this.salmonRot0).multiplyVec3(vec3.forward());
    // The blade enters across the fillet, swung APPROACH_SWING toward the cook's right so the
    // handle reads in profile (not end-on) from the director camera and stays clear of the plate.
    const across = new vec3(wv.x, 0, wv.z).normalize();
    this.w = quat.angleAxis(APPROACH_SWING, vec3.up()).multiplyVec3(across).normalize();
    this.approachYaw = Math.atan2(-this.w.x, -this.w.z);

    this.buildProp();
    this.buildFx();
    this.ready = true;
    this.applyRest();
    return true;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public isFlipped(): boolean {
    return this.flipped;
  }

  public isPlaying(): boolean {
    return this.t >= 0;
  }

  public getSpatulaProp(): SceneObject | null {
    return this.ready ? this.prop : null;
  }

  /** Start the flip (idempotent). onDone fires when the spatula is back at rest (or at once if already flipped). */
  public play(onDone?: () => void): boolean {
    if (!this.ready) return false;
    if (this.flipped && this.t < 0) {
      if (onDone) onDone();
      return false;
    }
    if (onDone) this.callbacks.push(onDone);
    if (this.t >= 0) return true;
    this.t = 0;
    this.landed = false;
    this.bus.emit("SALMON_FLIP_STARTED", { durationSec: FLIP_DURATION_SEC });
    return true;
  }

  /** Unflipped salmon, spatula at rest, fx hidden; pending callbacks are dropped. */
  public reset(): void {
    this.t = -1;
    this.flipped = false;
    this.landed = false;
    this.callbacks = [];
    if (!this.ready) return;
    const st = this.salmon.getTransform();
    st.setLocalPosition(this.salmonPos0);
    st.setLocalRotation(this.salmonRot0);
    st.setLocalScale(this.salmonScale0);
    this.setHerb(false, 1);
    this.applyRest();
    this.fxT = -1;
    for (const s of this.steam) s.obj.enabled = false;
    for (const d of this.drops) d.obj.enabled = false;
  }

  public update(dt: number): void {
    if (!this.ready) return;
    this.updateFx(dt);
    if (this.t < 0) return;
    this.t += dt;
    const t = Math.min(this.t, FLIP_DURATION_SEC);
    this.applySalmon(t);
    this.applySpatula(t);
    if (!this.landed && t >= T_LAND) {
      this.landed = true;
      this.startFx();
    }
    if (this.t >= FLIP_DURATION_SEC) {
      this.t = -1;
      this.flipped = true;
      this.applyRest();
      this.bus.emit("SALMON_FLIPPED", { durationSec: FLIP_DURATION_SEC });
      const cbs = this.callbacks;
      this.callbacks = [];
      for (const cb of cbs) {
        try {
          cb();
        } catch (e) {
          print(`[SpatulaFlipRig] onDone error: ${e}`);
        }
      }
    }
  }

  // ───────────────────────── build ─────────────────────────

  private buildProp(): void {
    const old = findByName(this.station, "SpatulaProp");
    if (old) old.destroy();
    this.prop = global.scene.createSceneObject("SpatulaProp");
    this.prop.setParent(this.station);

    const steelMat = makePbrMaterial(0.9, 0.92, 0.95, 0.62, 0.2);
    const woodMat = makePbrMaterial(0.52, 0.3, 0.15, 0.0, 0.42);
    const mk = (name: string, mat: Material, build: (a: MeshAcc) => void): void => {
      const o = global.scene.createSceneObject(name);
      o.setParent(this.prop);
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mainMaterial = mat;
      const acc = new MeshAcc();
      build(acc);
      acc.apply(rmv);
    };
    mk("SpatulaProp_Steel", steelMat, buildSteel);
    mk("SpatulaProp_Handle", woodMat, buildHandle);

    // Rest: tilt about the blade heel until the handle butt meets the slab
    const hf = handleFrame();
    const butt = hf.start.add(hf.dir.uniformScale(HANDLE_L + 0.2));
    const heel = new vec3(0, bladeLift(1), -BLADE_L);
    const pitch = -Math.atan2(butt.y - 0.42 - heel.y, heel.z - butt.z);
    const q = this.rotOf(REST_YAW, pitch);
    const heelRot = q.multiplyVec3(heel);
    const y = SLAB_Y - heelRot.y;
    this.restPose = { p: new vec3(REST_FRONT.x, y, REST_FRONT.z), yaw: REST_YAW, pitch };
  }

  private buildFx(): void {
    // Steam puffs (textured quads facing the director camera) + tiny oil spatter beads
    const quad = new MeshAcc();
    const q0 = quad.v(-0.5, 0, 0, 0, 0, 1, 0, 0);
    const q1 = quad.v(0.5, 0, 0, 0, 0, 1, 1, 0);
    const q2 = quad.v(0.5, 1, 0, 0, 0, 1, 1, 1);
    const q3 = quad.v(-0.5, 1, 0, 0, 0, 1, 0, 1);
    quad.quad(q0, q1, q2, q3);
    const dirs: [number, number][] = [[-3.6, 1.2], [-1.2, -1.6], [1.4, 1.5], [3.4, -0.9]];
    for (let i = 0; i < dirs.length; i++) {
      const o = global.scene.createSceneObject(`SalmonFlipSteam_${i}`);
      o.setParent(this.station);
      const m = makeTexturedPbr(TEX_STEAM, 0.0, 1.0, 1, 1, 1);
      m.mainPass.blendMode = BlendMode.Normal;
      m.mainPass.depthWrite = false;
      m.mainPass.twoSided = true;
      try {
        (m.mainPass as any).Port_Emissive_N006 = new vec3(0.6, 0.6, 0.62);
      } catch (e) {
        // no emissive port
      }
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mainMaterial = m;
      quad.apply(rmv);
      o.enabled = false;
      this.steam.push({ obj: o, mat: m, dx: dirs[i][0], dz: dirs[i][1], ph: i * 0.09 });
    }
    const bead = new MeshAcc();
    bead.ellipsoid(0, 0, 0, 0.13, 0.13, 0.13, 6, 4);
    const oilMat = makePbrMaterial(1.0, 0.82, 0.42, 0.3, 0.08);
    for (let i = 0; i < 7; i++) {
      const o = global.scene.createSceneObject(`SalmonFlipSpatter_${i}`);
      o.setParent(this.station);
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mainMaterial = oilMat;
      bead.apply(rmv);
      o.enabled = false;
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const r = 4.6 + (i % 3) * 0.7;
      this.drops.push({
        obj: o,
        p0: new vec3(Math.cos(a) * 3.2, 0.7, Math.sin(a) * 2.2),
        v: new vec3(Math.cos(a) * r, 5.2 + (i % 2) * 1.6, Math.sin(a) * r * 0.7),
      });
    }
  }

  // ───────────────────────── salmon ─────────────────────────

  /** Flip progress 0..1 between T_UNDER and T_LAND. */
  private flipK(t: number): number {
    return Math.max(0, Math.min(1, (t - T_UNDER) / (T_LAND - T_UNDER)));
  }

  private applySalmon(t: number): void {
    const H = SALMON_DOME_H;
    let h = 0;
    let theta = 0;
    let s = 0;
    let squash = 1;
    if (t < T_UNDER) {
      // the blade slips under: the fillet rides up by the blade thickness
      h = 0.14 * smooth((t - T_CONTACT - 0.12) / (T_UNDER - T_CONTACT - 0.12));
    } else if (t < T_LAND) {
      const k = this.flipK(t);
      h = arcH(k); // parabolic arc
      theta = -Math.PI * smoother(k); // near edge rises and rolls over the far edge
      s = arcDrift(k); // drifts toward the far side, lands centred
    } else {
      theta = -Math.PI;
      const k = (t - T_LAND) / 0.32;
      if (k < 1) squash = 1 - 0.09 * Math.sin(Math.PI * k) * (1 - k * 0.4);
      // two pats from the spatula
      const pk = (t - (T_LAND + 0.3)) / (T_PAT - T_LAND - 0.3);
      if (pk > 0 && pk < 1) squash = Math.min(squash, 1 - 0.05 * Math.abs(Math.sin(pk * Math.PI * 2)));
    }
    const rx = quat.angleAxis(theta, vec3.right());
    const c = new vec3(0, H / 2, 0);
    const pivotOff = this.salmonRot0.multiplyVec3(c.sub(rx.multiplyVec3(c)));
    const wLocal = this.salmonRot0.multiplyVec3(vec3.forward());
    const pos = this.salmonPos0.add(pivotOff).add(new vec3(0, h, 0)).add(wLocal.uniformScale(s));
    const tr = this.salmon.getTransform();
    tr.setLocalRotation(this.salmonRot0.multiply(rx));
    tr.setLocalPosition(t >= T_LAND ? pos.add(new vec3(0, -(1 - squash) * H, 0)) : pos);
    tr.setLocalScale(new vec3(this.salmonScale0.x, this.salmonScale0.y * squash, this.salmonScale0.z));

    // Rosemary: tucks away as the blade goes under, re-laid on the seared top after landing
    if (t < T_LAND) this.setHerb(false, 1 - smooth((t - T_CONTACT) / 0.3));
    else this.setHerb(true, smooth((t - T_LAND - 0.35) / 0.35));
  }

  private setHerb(flippedPose: boolean, scale: number): void {
    if (!this.herb) return;
    const ht = this.herb.getTransform();
    if (flippedPose) {
      // flipped frame: local -Y is up; lay the sprig back on the skin (top ~ y = -bulge)
      ht.setLocalRotation(this.herbRot0.multiply(quat.angleAxis(Math.PI, vec3.right())));
      ht.setLocalPosition(new vec3(this.herbPos0.x, this.herbPos0.y + 1.79 - SALMON_SKIN_BULGE, this.herbPos0.z));
    } else {
      ht.setLocalRotation(this.herbRot0);
      ht.setLocalPosition(this.herbPos0);
    }
    const k = Math.max(0.0001, scale);
    ht.setLocalScale(this.herbScale0.uniformScale(k));
    this.herb.enabled = scale > 0.01;
  }

  // ───────────────────────── spatula ─────────────────────────

  private rotOf(yaw: number, pitch: number): quat {
    return quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(pitch, vec3.right()));
  }

  private applyPose(p: SpatPose): void {
    const tr = this.prop.getTransform();
    tr.setLocalPosition(p.p);
    tr.setLocalRotation(this.rotOf(p.yaw, p.pitch));
  }

  private applyRest(): void {
    if (this.prop && this.restPose) this.applyPose(this.restPose);
  }

  private at(along: number, y: number): vec3 {
    return new vec3(this.C.x + this.w.x * along, y, this.C.z + this.w.z * along);
  }

  private blend(a: SpatPose, b: SpatPose, k: number, bump: number = 0): SpatPose {
    const p = lerpV(a.p, b.p, k);
    p.y += bump * Math.sin(Math.PI * k);
    return { p, yaw: lerp(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k) };
  }

  private applySpatula(t: number): void {
    const floor = this.C.y;
    const yaw = this.approachYaw;
    const near = 2.9; // fillet half-extent along the (swung) approach line, pan-local units
    const hover: SpatPose = { p: this.at(near + 2.1, floor + 2.1), yaw, pitch: 18 * DEG };
    const contact: SpatPose = { p: this.at(near + 0.25, floor + 0.02), yaw, pitch: 18 * DEG };
    const under: SpatPose = { p: this.at(-near - 0.5, floor + 0.02), yaw, pitch: 3 * DEG };
    const topY = floor + SALMON_DOME_H + SALMON_SKIN_BULGE;
    const away: SpatPose = { p: this.at(near + 3.6, floor + 3.4), yaw, pitch: 6 * DEG };
    const patHi: SpatPose = { p: this.at(-near + 0.2, topY + 0.7), yaw, pitch: 0 };
    let pose: SpatPose;
    if (t < T_GLIDE) {
      pose = this.blend(this.restPose, hover, smooth(t / T_GLIDE), 3.2);
    } else if (t < T_CONTACT) {
      const k = (t - T_GLIDE) / (T_CONTACT - T_GLIDE);
      pose = this.blend(hover, contact, k * k * (2 - k) * 0.5 + smooth(k) * 0.5); // 45 deg drop line
    } else if (t < T_UNDER) {
      const k = (t - T_CONTACT) / (T_UNDER - T_CONTACT);
      pose = this.blend(contact, under, 1 - (1 - k) * (1 - k));
    } else if (t < T_LAND) {
      const k = this.flipK(t);
      const k0 = 0.3;
      if (k < k0) {
        // carry: lift with the fillet and tip the front edge down to roll it over the far side
        const c = k / k0;
        pose = { p: this.at(-near - 0.5 + arcDrift(k), floor + arcH(k) - 0.02), yaw, pitch: lerp(3 * DEG, CARRY_PITCH, smooth(c)) };
      } else {
        // release: slip back out from under (handle lowering) and wait clear of the landing
        const from: SpatPose = { p: this.at(-near - 0.5 + arcDrift(k0), floor + arcH(k0) - 0.02), yaw, pitch: CARRY_PITCH };
        pose = this.blend(from, away, smooth((k - k0) / 0.36));
      }
    } else if (t < T_PAT) {
      const k = (t - T_LAND) / (T_PAT - T_LAND);
      if (k < 0.4) {
        pose = this.blend(away, patHi, smooth(k / 0.4));
      } else {
        // two gentle pats on the seared top
        const pk = (k - 0.4) / 0.6;
        const dip = Math.abs(Math.sin(pk * Math.PI * 2));
        pose = { p: new vec3(patHi.p.x, patHi.p.y - 0.62 * dip, patHi.p.z), yaw, pitch: 0 };
      }
    } else {
      const k = (t - T_PAT) / (FLIP_DURATION_SEC - T_PAT);
      pose = this.blend(patHi, this.restPose, smooth(k), 3.0);
    }
    this.applyPose(pose);
  }

  // ───────────────────────── sizzle fx ─────────────────────────

  private startFx(): void {
    this.fxT = 0;
    for (const s of this.steam) s.obj.enabled = true;
    for (const d of this.drops) d.obj.enabled = true;
    this.updateFx(0);
  }

  private updateFx(dt: number): void {
    if (this.fxT < 0) return;
    this.fxT += dt;
    const T_STEAM = 1.3;
    const T_DROP = 0.55;
    const camFace = faceDirectorCamera(this.station.getTransform().getLocalPosition());
    for (const s of this.steam) {
      const k = (this.fxT - s.ph) / T_STEAM;
      if (k >= 1) {
        s.obj.enabled = false;
        continue;
      }
      const kk = Math.max(0, k);
      const tr = s.obj.getTransform();
      tr.setLocalPosition(new vec3(this.C.x + s.dx * (1 + 0.25 * kk), this.C.y + 1.0 + kk * 5.0, this.C.z + s.dz));
      const sc = 2.2 + kk * 3.2;
      tr.setLocalScale(new vec3(sc, sc * 1.4, 1));
      tr.setLocalRotation(camFace);
      s.mat.mainPass.baseColor = new vec4(1, 1, 1, Math.sin(Math.PI * kk) * 0.8);
    }
    for (const d of this.drops) {
      const tt = this.fxT;
      if (tt >= T_DROP) {
        d.obj.enabled = false;
        continue;
      }
      const p = new vec3(
        this.C.x + d.p0.x + d.v.x * tt,
        this.C.y + d.p0.y + d.v.y * tt - 0.5 * 30 * tt * tt,
        this.C.z + d.p0.z + d.v.z * tt
      );
      const tr = d.obj.getTransform();
      tr.setLocalPosition(p);
      const sc = 1 - tt / T_DROP;
      tr.setLocalScale(new vec3(sc, sc, sc));
    }
    if (this.fxT > T_STEAM + 0.4) this.fxT = -1;
  }
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
