import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { MAT_SAUCE_TOMATO, MeshAcc, StationPropsBuilder, SteamPlume, makePbrMaterial } from "./StationPropsBuilder";
import { SpatulaTechniqueGuide } from "./SpatulaTechniqueGuide";

const DEG = Math.PI / 180;

// Timeline (seconds of tween time, scaled by timeScale)
const T_SALMON0 = 0.15;
const T_SALMON1 = 1.85;
const T_TILT0 = 1.95;
const T_TILT1 = 3.75;
const T_DROP0 = 2.25;
const DROP_STAGGER = 0.13;
const DROP_FLIGHT = 0.55;
const T_POOL0 = 2.55;
const T_POOL1 = 3.55;
const T_STREAK0 = 2.85;
const T_STREAK1 = 3.65;
const T_GARNISH0 = 3.85;
const FLAKE_STAGGER = 0.05;
const FLAKE_FLIGHT = 0.85;
const T_END = 5.9;

const DROP_COUNT = 6;
const FLAKE_COUNT = 16;
const SALMON_PLATE_SCALE = 0.85; // fillet shrinks a touch so it sits inside the (smaller) plate rim
const POT_TILT = 12 * DEG;
const WAIT_FLIP_TIMEOUT = 7.0;
// WS10 plated-dish steam: soft wisps off the hot fillet, fading out ~8 s after DISH_PLATED
const DISH_STEAM_HOLD = 5.5;

type Phase = "IDLE" | "WAIT_FLIP" | "TWEEN" | "DONE";

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

function smooth(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Flyer {
  obj: SceneObject;
  t0: number;
  dur: number;
  from: vec3;
  to: vec3;
  apex: number;
  spin: vec3;
  rest: quat;
  landed: boolean;
}

/**
 * PlatingFinisher.ts (WS9-P3)
 * Finishes the dish on the plate once the DAG reaches PLATING_CONVERGENCE (manual time-warp path or
 * Auto Cook). Deterministic ~5.9 s tween: the flipped salmon (crispy side up) arcs from the skillet
 * onto the plate centre, the saucier tilts and sauce drizzles over the fillet into a pool on the
 * plate, then the parsley garnish left in the prep bowl is sprinkled on top. Emits PLATING_STARTED and
 * DISH_PLATED. If the salmon is still being flipped it waits; if it was never flipped it plays the
 * physical flip first. RESET_REQUESTED restores the empty plate, upright saucier and (via the spatula
 * guide) the unflipped salmon in the pan.
 */
@component
export class PlatingFinisher extends BaseScriptComponent {
  /** Tween speed multiplier (Auto Cook test mode raises it). */
  public timeScale: number = 1.0;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private phase: Phase = "IDLE";
  private t: number = 0;
  private waitT: number = 0;
  private built: boolean = false;

  private stationsRoot: SceneObject | null = null;
  private props: StationPropsBuilder | null = null;
  private guide: SpatulaTechniqueGuide | null = null;
  private salmon: SceneObject | null = null;
  private pot: SceneObject | null = null;
  private potRot0: quat = quat.quatIdentity();
  private potAxis: vec3 = vec3.right();

  private dishRoot!: SceneObject;
  private pool!: SceneObject;
  private streak!: SceneObject;
  private drops: Flyer[] = [];
  private flakes: Flyer[] = [];
  private dishSteam: SteamPlume | null = null;
  private dishSteamT: number = -1;

  // per-run salmon tween
  private sFrom: vec3 = vec3.zero();
  private sTo: vec3 = vec3.zero();
  private rFrom: quat = quat.quatIdentity();
  private rTo: quat = quat.quatIdentity();
  private scFrom: vec3 = vec3.one();
  private salmonTop: vec3 = vec3.zero();
  private salmonAxis: vec3 = vec3.right();
  private plateFloorY: number = 0;
  private plateCentre: vec3 = vec3.zero();
  private platedFlags = { salmon: false, sauce: false, garnish: false };

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.stationsRoot = this.findStationsRoot();
      this.listen("PLATING_CONVERGENCE", () => this.begin());
      this.listen("RESET_REQUESTED", () => this.resetDish());
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public isPlating(): boolean {
    return this.phase === "WAIT_FLIP" || this.phase === "TWEEN";
  }

  public isDishPlated(): boolean {
    return this.phase === "DONE";
  }

  /** Start the plating tween (idempotent; normally driven by PLATING_CONVERGENCE). */
  public begin(): void {
    if (this.phase !== "IDLE") return;
    this.resolve();
    this.waitT = 0;
    this.phase = "WAIT_FLIP";
    if (this.guide && !this.guide.isFlipped() && !this.guide.isFlipping()) {
      this.guide.playFlip(); // crispy side must be up before it leaves the pan
    }
  }

  // ───────────────────────── setup ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  private findStationsRoot(): SceneObject | null {
    let o: SceneObject | null = this.getSceneObject();
    while (o && o.name !== "StationsRoot" && o.hasParent()) o = o.getParent();
    return o && o.name === "StationsRoot" ? o : null;
  }

  private resolve(): void {
    if (!this.stationsRoot) this.stationsRoot = this.findStationsRoot();
    const root = this.stationsRoot;
    if (!root) return;
    if (!this.props) this.props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    if (!this.guide) this.guide = this.getSceneObject().getComponent(SpatulaTechniqueGuide.getTypeName()) as SpatulaTechniqueGuide;
    if (!this.salmon) this.salmon = findByName(root, "SalmonFillet");
    if (!this.pot) {
      this.pot = this.props ? this.props.getSaucierPot() : null;
      if (!this.pot) this.pot = findByName(root, "SaucepotPot");
      if (this.pot) this.potRot0 = this.pot.getTransform().getLocalRotation();
    }
    if (!this.built) this.build();
  }

  private build(): void {
    const plate = this.props ? this.props.getPlateObject() : null;
    const parent = plate && plate.hasParent() ? plate.getParent() : this.stationsRoot;
    if (!parent) return;
    this.dishRoot = global.scene.createSceneObject("PlatedDishFx");
    this.dishRoot.setParent(parent);

    const sauceMat = MAT_SAUCE_TOMATO;
    const mk = (name: string, acc: MeshAcc, mat: Material): SceneObject => {
      const o = global.scene.createSceneObject(name);
      o.setParent(this.dishRoot);
      const rmv = o.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      rmv.mainMaterial = mat;
      acc.apply(rmv);
      o.enabled = false;
      return o;
    };

    // Sauce pool on the plate floor (slightly domed, irregular second lobe)
    const poolAcc = new MeshAcc();
    poolAcc.disc(0, 0, 0, 2.15, 40, 0.05);
    poolAcc.disc(1.1, 0.004, 0.9, 1.05, 24, 0.04);
    this.pool = mk("PlateSaucePool", poolAcc, sauceMat);

    // Glossy streak spooned along the top of the fillet
    const streakAcc = new MeshAcc();
    streakAcc.ellipsoid(0, 0, 0, 2.3, 0.09, 0.42, 20, 5);
    streakAcc.ellipsoid(-0.9, 0.01, 0.3, 0.55, 0.08, 0.3, 12, 4);
    streakAcc.ellipsoid(1.0, 0.01, -0.25, 0.5, 0.08, 0.26, 12, 4);
    this.streak = mk("SalmonSauceStreak", streakAcc, sauceMat);

    const dropAcc = new MeshAcc();
    dropAcc.ellipsoid(0, 0, 0, 0.26, 0.3, 0.26, 10, 6);
    for (let i = 0; i < DROP_COUNT; i++) {
      const o = mk(`SauceDrop_${i}`, dropAcc, sauceMat);
      this.drops.push(this.flyer(o));
    }

    // Garnish flakes: mostly parsley, a few tomato / yellow chilli bits from the prep
    const parsley = makePbrMaterial(0.16, 0.5, 0.14, 0.0, 0.45);
    const tomato = makePbrMaterial(0.9, 0.13, 0.07, 0.05, 0.18);
    const chilli = makePbrMaterial(1.0, 0.8, 0.08, 0.05, 0.18);
    const flakeAcc = new MeshAcc();
    flakeAcc.box(0, 0, 0, 0.17, 0.035, 0.12, 0.4, 0.1);
    const diceAcc = new MeshAcc();
    diceAcc.box(0, 0, 0, 0.1, 0.08, 0.1);
    for (let i = 0; i < FLAKE_COUNT; i++) {
      const kind = i % 8 === 3 ? 1 : i % 8 === 6 ? 2 : 0;
      const o = mk(`GarnishFlake_${i}`, kind === 0 ? flakeAcc : diceAcc, kind === 0 ? parsley : kind === 1 ? tomato : chilli);
      this.flakes.push(this.flyer(o));
    }

    // WS10: same steam technique as the saucier, sized for the fillet (placed at DISH_PLATED)
    this.dishSteam = new SteamPlume(this.dishRoot, "PlatedDishSteamRoot", "PlatedDishSteam", {
      count: 3, spread: 1.3, baseY: 0.2, rise: 3.6, size0: 1.8, size1: 1.8, alpha: 0.5,
      speed: 0.3, sway: 0.4, z: 0.0, fadeIn: 1.2, fadeOut: 2.5,
    });
    this.built = true;
  }

  private flyer(obj: SceneObject): Flyer {
    return { obj, t0: 0, dur: 0, from: vec3.zero(), to: vec3.zero(), apex: 0, spin: vec3.zero(), rest: quat.quatIdentity(), landed: false };
  }

  // ───────────────────────── run ─────────────────────────

  private onUpdate(): void {
    if (this.dishSteam && this.dishSteamT >= 0) {
      const rdt = getDeltaTime();
      this.dishSteamT += rdt;
      if (this.dishSteamT > DISH_STEAM_HOLD) this.dishSteam.target = 0;
      this.dishSteam.update(rdt);
      if (this.dishSteam.target === 0 && this.dishSteam.getLevel() <= 0.001) this.dishSteamT = -1;
    }
    if (this.phase === "IDLE" || this.phase === "DONE") return;
    const dt = getDeltaTime() * Math.max(0.1, this.timeScale);
    if (this.phase === "WAIT_FLIP") {
      this.waitT += dt;
      const flipping = this.guide ? this.guide.isFlipping() : false;
      if (!flipping || this.waitT > WAIT_FLIP_TIMEOUT) this.startTween();
      return;
    }
    this.t += dt;
    this.step(this.t);
  }

  private startTween(): void {
    this.phase = "TWEEN";
    this.t = 0;
    this.platedFlags = { salmon: false, sauce: false, garnish: false };
    if (this.salmon) {
      const tr = this.salmon.getTransform();
      this.sFrom = tr.getWorldPosition();
      this.rFrom = tr.getWorldRotation();
      this.scFrom = tr.getLocalScale();
      // The flipped fillet's origin is not its visual centre (the flip pivots about the long edge),
      // so place it by its world AABB: visual centre over the plate centre, underside on the floor.
      let off = new vec3(0, 0.9, 0); // visual centre relative to the origin
      let halfH = 0.9;
      try {
        const rmv = this.salmon.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv) {
          const mn = rmv.worldAabbMin();
          const mx = rmv.worldAabbMax();
          const c = mn.add(mx).uniformScale(0.5);
          off = c.sub(this.sFrom);
          halfH = c.y - mn.y;
        }
      } catch (e) {
        // keep the default estimate
      }
      const plate = this.props ? this.props.getPlateObject() : null;
      const floorY = this.props ? this.props.getPlateFloorLocalY() : 0.3;
      const centre = plate ? plate.getTransform().getWorldTransform().multiplyPoint(new vec3(0, floorY, 0)) : this.sFrom;
      this.plateFloorY = plate ? centre.y : this.sFrom.y - halfH;
      this.plateCentre = centre;
      const yaw = quat.angleAxis(-22 * DEG, vec3.up());
      this.rTo = yaw.multiply(this.rFrom);
      const visualTarget = new vec3(centre.x, centre.y + halfH * SALMON_PLATE_SCALE + 0.05, centre.z);
      this.sTo = visualTarget.sub(yaw.multiplyVec3(off.uniformScale(SALMON_PLATE_SCALE)));
    }
    this.eventBus.emit("PLATING_STARTED", {});
  }

  private step(t: number): void {
    // 1. salmon: lift, arc across, settle on the plate
    // (the final pose is always applied once, even if a frame hitch jumps past T_SALMON1)
    if (this.salmon && t >= T_SALMON0 && !this.platedFlags.salmon) {
      const k = smooth((t - T_SALMON0) / (T_SALMON1 - T_SALMON0));
      if (t >= T_SALMON1) this.platedFlags.salmon = true;
      const tr = this.salmon.getTransform();
      const p = vec3.lerp(this.sFrom, this.sTo, k).add(new vec3(0, 7.0 * Math.sin(Math.PI * k), 0));
      tr.setWorldPosition(p);
      tr.setWorldRotation(quat.slerp(this.rFrom, this.rTo, k));
      const s = 1 + (SALMON_PLATE_SCALE - 1) * k;
      tr.setLocalScale(this.scFrom.uniformScale(s));
    }

    // 2. sauce: tilt the saucier, drizzle drops onto the fillet, pool + streak spread
    if (t >= T_TILT0 && !this.platedFlags.sauce) {
      this.platedFlags.sauce = true;
      this.prepareSauce();
    }
    if (this.pot && t >= T_TILT0 && t <= T_TILT1 + 0.05) {
      const k = (t - T_TILT0) / (T_TILT1 - T_TILT0);
      const a = k < 0.3 ? smooth(k / 0.3) : k > 0.75 ? 1 - smooth((k - 0.75) / 0.25) : 1;
      this.pot.getTransform().setLocalRotation(quat.angleAxis(POT_TILT * a, this.potAxis).multiply(this.potRot0));
      // WS10: the pot's sauce level drops a little as it is poured over the fillet
      if (this.props) this.props.setSauceServed(smooth((t - T_DROP0) / (T_TILT1 - T_DROP0)));
    }
    for (const d of this.drops) this.fly(d, t, false);
    if (t >= T_POOL0) {
      const k = smooth((t - T_POOL0) / (T_POOL1 - T_POOL0));
      if (!this.pool.enabled) this.pool.enabled = true;
      this.pool.getTransform().setLocalScale(new vec3(0.15 + 0.85 * k, 1, 0.15 + 0.85 * k));
    }
    if (t >= T_STREAK0) {
      const k = smooth((t - T_STREAK0) / (T_STREAK1 - T_STREAK0));
      if (!this.streak.enabled) this.streak.enabled = true;
      this.streak.getTransform().setLocalScale(new vec3(0.1 + 0.9 * k, 1, 0.4 + 0.6 * k));
    }

    // 3. garnish: parsley (and a few bits) from the prep bowl sprinkled over the top
    if (t >= T_GARNISH0 && !this.platedFlags.garnish) {
      this.platedFlags.garnish = true;
      this.prepareGarnish();
    }
    for (const f of this.flakes) this.fly(f, t, true);

    if (t >= T_END) {
      this.phase = "DONE";
      for (const d of this.drops) d.obj.enabled = false;
      if (this.pot) this.pot.getTransform().setLocalRotation(this.potRot0);
      if (this.props) this.props.setSauceServed(1);
      this.startDishSteam();
      this.eventBus.emit("DISH_PLATED", {});
      print("[PlatingFinisher] Dish plated: salmon crispy side up, sauce spooned, garnish on top.");
    }
  }

  private fly(f: Flyer, t: number, tumble: boolean): void {
    if (f.dur <= 0 || t < f.t0) return;
    const k = (t - f.t0) / f.dur;
    const tr = f.obj.getTransform();
    if (k >= 1) {
      if (!f.landed) {
        f.landed = true;
        tr.setWorldPosition(f.to);
        tr.setWorldRotation(f.rest);
        if (!tumble) f.obj.enabled = false; // sauce drop merges into the pool / streak
      }
      return;
    }
    if (!f.obj.enabled) f.obj.enabled = true;
    const p = vec3.lerp(f.from, f.to, k).add(new vec3(0, f.apex * Math.sin(Math.PI * k), 0));
    tr.setWorldPosition(p);
    if (tumble) {
      tr.setWorldRotation(quat.fromEulerAngles(f.spin.x * k, f.spin.y * k, f.spin.z * k));
    } else {
      const s = 0.8 + 0.4 * Math.sin(Math.PI * k);
      tr.setLocalScale(new vec3(s * 0.9, s * 1.2, s * 0.9));
    }
  }

  /** Measure the landed fillet and aim the drizzle. */
  private prepareSauce(): void {
    this.measureSalmon();
    const plateCentre = new vec3(this.plateCentre.x, this.salmonTop.y, this.plateCentre.z);
    // pot tilt axis (pot-parent local) leaning the rim toward the plate
    let lipWorld = plateCentre.add(new vec3(0, 6, -8));
    if (this.pot) {
      const ptr = this.pot.getTransform();
      const potW = ptr.getWorldPosition();
      const dW = new vec3(plateCentre.x - potW.x, 0, plateCentre.z - potW.z);
      const dWorld = dW.length > 1e-3 ? dW.normalize() : vec3.forward();
      const parent = this.pot.hasParent() ? this.pot.getParent() : null;
      const dParent = parent ? parent.getTransform().getInvertedWorldTransform().multiplyDirection(dWorld) : dWorld;
      const dp = new vec3(dParent.x, 0, dParent.z).normalize();
      this.potAxis = vec3.up().cross(dp).normalize();
      const dPot = ptr.getInvertedWorldTransform().multiplyDirection(dWorld);
      const dl = new vec3(dPot.x, 0, dPot.z).normalize();
      lipWorld = ptr.getWorldTransform().multiplyPoint(dl.uniformScale(5.4).add(new vec3(0, 5.2, 0)));
    }
    const rnd = makeRng(9101);
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      const u = (i / Math.max(1, this.drops.length - 1)) * 2 - 1;
      const onFillet = i % 3 !== 2;
      const to = onFillet
        ? this.salmonTop.add(this.salmonAxis.uniformScale(u * 1.6)).add(new vec3(0, 0.05, 0))
        : new vec3(this.plateCentre.x + 1.2 + rnd() * 0.5, this.pool.getTransform().getWorldPosition().y + 0.05, this.plateCentre.z + 0.9 + rnd() * 0.4);
      d.t0 = T_DROP0 + i * DROP_STAGGER;
      d.dur = DROP_FLIGHT;
      d.from = lipWorld;
      d.to = to;
      d.apex = 3.2;
      d.landed = false;
      d.obj.getTransform().setLocalScale(vec3.one());
    }
  }

  private measureSalmon(): void {
    const top = new vec3(this.plateCentre.x, this.plateCentre.y + 1.4, this.plateCentre.z);
    let topY = top.y;
    if (this.salmon) {
      try {
        const rmv = this.salmon.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv) topY = rmv.worldAabbMax().y;
        const skin = findByName(this.salmon, "SalmonCrispySkin");
        const srmv = skin ? (skin.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null;
        if (srmv) topY = Math.max(topY, srmv.worldAabbMax().y);
      } catch (e) {
        // fall back to the estimated height
      }
      const ax = this.salmon.getTransform().getWorldRotation().multiplyVec3(vec3.right());
      const h = new vec3(ax.x, 0, ax.z);
      this.salmonAxis = h.length > 1e-3 ? h.normalize() : vec3.right();
    }
    const c = this.plateCentre; // AABB-placed: the fillet's visual centre sits over the plate centre
    this.salmonTop = new vec3(c.x, topY - 0.06, c.z);

    // pool sits on the plate floor under the fillet; streak rides along the fillet top
    this.pool.getTransform().setWorldPosition(new vec3(this.plateCentre.x + 0.3, this.plateFloorY + 0.015, this.plateCentre.z + 0.45));
    this.pool.getTransform().setWorldRotation(quat.angleAxis(25 * DEG, vec3.up()));
    this.streak.getTransform().setWorldPosition(this.salmonTop);
    const yaw = Math.atan2(-this.salmonAxis.z, this.salmonAxis.x);
    this.streak.getTransform().setWorldRotation(quat.angleAxis(yaw, vec3.up()));
  }

  private prepareGarnish(): void {
    const start = this.props ? this.props.takeGarnish() : null;
    const from = start ? start : this.salmonTop.add(new vec3(12, 4, 0));
    const perp = new vec3(-this.salmonAxis.z, 0, this.salmonAxis.x);
    const rnd = makeRng(5150);
    const poolY = this.pool.getTransform().getWorldPosition().y;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      const onPlate = i % 5 === 4;
      const u = rnd() * 2 - 1;
      const v = rnd() * 2 - 1;
      const to = onPlate
        ? new vec3(this.plateCentre.x + 1.1 + rnd() * 0.6, poolY + 0.06, this.plateCentre.z + 0.8 + rnd() * 0.5)
        : this.salmonTop.add(this.salmonAxis.uniformScale(u * 2.3)).add(perp.uniformScale(v * 0.7)).add(new vec3(0, 0.06, 0));
      f.t0 = T_GARNISH0 + i * FLAKE_STAGGER;
      f.dur = FLAKE_FLIGHT;
      f.from = from.add(new vec3((rnd() - 0.5) * 0.8, 0.6 + rnd() * 0.4, (rnd() - 0.5) * 0.8));
      f.to = to;
      f.apex = 5.5 + rnd() * 1.5;
      f.spin = new vec3((rnd() * 4 + 2) * Math.PI, (rnd() * 4 - 2) * Math.PI, (rnd() * 2 + 1) * Math.PI);
      f.rest = quat.angleAxis(rnd() * Math.PI * 2, vec3.up());
      f.landed = false;
    }
  }

  /** WS10: wisps rise off the plated fillet (world scale matched to the saucier steam). */
  private startDishSteam(): void {
    if (!this.dishSteam) return;
    const tr = this.dishSteam.root.getTransform();
    tr.setWorldPosition(this.salmonTop);
    tr.setWorldRotation(quat.quatIdentity());
    const ref = this.pot ? this.pot.getTransform().getWorldScale() : new vec3(0.7, 0.7, 0.7);
    tr.setWorldScale(ref);
    this.dishSteam.target = 1;
    this.dishSteamT = 0;
  }

  // ───────────────────────── reset ─────────────────────────

  private resetDish(): void {
    this.phase = "IDLE";
    this.t = 0;
    this.waitT = 0;
    if (this.dishSteam) this.dishSteam.setNow(0);
    this.dishSteamT = -1;
    if (this.pot) this.pot.getTransform().setLocalRotation(this.potRot0);
    if (!this.built) return;
    this.pool.enabled = false;
    this.streak.enabled = false;
    for (const f of this.drops.concat(this.flakes)) {
      f.obj.enabled = false;
      f.dur = 0;
      f.landed = false;
    }
    // salmon transform is restored by SpatulaTechniqueGuide.resetFlip (RESET_REQUESTED)
  }
}
