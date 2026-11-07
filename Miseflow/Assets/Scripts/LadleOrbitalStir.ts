import { DishBlueprintApplier } from "./DishBlueprintApplier";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { StationPropsBuilder } from "./StationPropsBuilder";
import { HandiLid } from "./VesselGenerators";

// Choreography (real seconds)
const T_LIFT = 0.35; // rest -> above the pot rim
const T_DIP = 0.6; // bowl dips into the sauce
const ORBIT_SEC = 2.2; // 2 orbital revolutions
const T_RETURN = 0.45; // back to rest
const ORBIT_R = 1.6; // pot-local units
const DIP_Y = 2.8; // pot-local orbit height
const LIFT_Y = 6.0; // pot-local hover height before the dip
const LADLE_NAME = "LadleProp"; // #332, built by the asset phase
const POT_NAMES = ["BiryaniHandi", "SaucepotPot"]; // first found wins (handi arrives with the asset phase)

export type LadleStirResult = "IDLE" | "PLAYING" | "PLAYED" | "NOOP_NO_PROP";

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

/**
 * LadleOrbitalStir.ts — KINE_LADLE_ORBITAL_STIR (v5 Part 4, design table 3.4 #5)
 * On LADLE_STIR_REQUESTED, or automatically after Pour 2 (PREP_BOWL_POURED) when the active
 * blueprint has sauce.useLadleStir: the #332 ladle lifts from its rest, dips into the saucier/handi,
 * traces 2 orbital revolutions (r 1.6) over 2.2 s while the sauce surface turns and the saucier
 * steams, then returns to rest. The ladle is located by name (LadleProp); until the asset phase
 * builds it the request is a deterministic no-op with ONE log line (result NOOP_NO_PROP).
 * Dish 01 (useLadleStir false) never triggers it. Reset restores the rest pose.
 */
@component
export class LadleOrbitalStir extends BaseScriptComponent {
  private static instance: LadleOrbitalStir | null = null;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private t: number = -1;
  private revs: number = 2;
  private ladle: SceneObject | null = null;
  private pot: SceneObject | null = null;
  private sauce: SceneObject | null = null;
  private sauceRot0: quat = quat.quatIdentity();
  private sauceScale0: vec3 = vec3.one();
  private restWorldRot: quat = quat.quatIdentity();
  private restPos: vec3 = vec3.zero(); // ladle local
  private restRot: quat = quat.quatIdentity();
  private restWorld: vec3 = vec3.zero();
  private lastWorld: vec3 = vec3.zero();
  private result: LadleStirResult = "IDLE";
  private requestCount: number = 0;
  private missingLogged: boolean = false;
  private props: StationPropsBuilder | null = null;

  public static getInstance(): LadleOrbitalStir | null {
    return LadleOrbitalStir.instance;
  }

  onAwake(): void {
    LadleOrbitalStir.instance = this;
    this.createEvent("OnStartEvent").bind(() => {
      this.listen("PREP_BOWL_POURED", () => {
        if (DishBlueprintApplier.wantsLadleStir()) this.eventBus.emit("LADLE_STIR_REQUESTED", { revolutions: 2 });
      });
      this.listen("LADLE_STIR_REQUESTED", (d?: any) => this.play(d && typeof d.revolutions === "number" ? d.revolutions : 2));
      this.listen("RESET_REQUESTED", () => this.cancel());
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
      if (LadleOrbitalStir.instance === this) LadleOrbitalStir.instance = null;
    });
  }

  // ── public state ──

  public isBusy(): boolean {
    return this.t >= 0;
  }

  public getResult(): LadleStirResult {
    return this.result;
  }

  /** Number of LADLE_STIR_REQUESTED events handled since boot (LEAF observes the delta). */
  public getRequestCount(): number {
    return this.requestCount;
  }

  // ── internals ──

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  private stationsRoot(): SceneObject | null {
    let o: SceneObject | null = this.getSceneObject();
    while (o && o.name !== "StationsRoot" && o.hasParent()) o = o.getParent();
    return o && o.name === "StationsRoot" ? o : null;
  }

  private play(revolutions: number): void {
    this.requestCount++;
    if (this.t >= 0) return;
    const root = this.stationsRoot();
    const ladle = root ? findByName(root, LADLE_NAME) : null;
    let pot: SceneObject | null = null;
    if (root) for (const n of POT_NAMES) if (!pot) pot = findByName(root, n);
    if (!ladle || !pot) {
      this.result = "NOOP_NO_PROP";
      if (!this.missingLogged) {
        this.missingLogged = true;
        print(`[LadleStir] ${!ladle ? LADLE_NAME : "saucier"} not in scene yet (asset phase pending): KINE_LADLE_ORBITAL_STIR is a no-op`);
      }
      return;
    }
    if (root && !this.props) this.props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    this.ladle = ladle;
    this.pot = pot;
    this.revs = Math.max(1, Math.min(4, Math.round(revolutions)));
    const tr = ladle.getTransform();
    this.restPos = tr.getLocalPosition();
    this.restRot = tr.getLocalRotation();
    this.restWorld = tr.getWorldPosition();
    this.lastWorld = this.restWorld;
    // A4a: the handi is a child of the saucier pot, the fill discs stay on the pot
    this.sauce = findByName(pot, "SimmeringLemonSauce") || (root ? findByName(root, "SimmeringLemonSauce") : null);
    if (this.sauce) {
      this.sauceRot0 = this.sauce.getTransform().getLocalRotation();
      this.sauceScale0 = this.sauce.getTransform().getLocalScale();
    }
    this.restWorldRot = tr.getWorldRotation();
    const lid = HandiLid.getActive();
    if (lid && lid.isSealed()) lid.lift(true); // dum lid comes off (steam burst) before the ladle goes in
    ladle.enabled = true;
    this.t = 0;
    this.result = "PLAYING";
    print(`[LadleStir] KINE_LADLE_ORBITAL_STIR start (${this.revs} revolutions)`);
  }

  /** Upright ladle (handle +X) turned so the handle leans outward at orbit angle a (pot frame). */
  private stirRot(a: number): quat {
    return this.pot!.getTransform().getWorldRotation().multiply(quat.angleAxis(-a, vec3.up()));
  }

  private potPoint(x: number, y: number, z: number): vec3 {
    return this.pot!.getTransform().getWorldTransform().multiplyPoint(new vec3(x, y, z));
  }

  private onUpdate(): void {
    if (this.t < 0 || !this.ladle || !this.pot) return;
    const prevT = this.t;
    this.t += getDeltaTime();
    const t = this.t;
    const tr = this.ladle.getTransform();
    const entry = this.potPoint(ORBIT_R, LIFT_Y, 0);
    const orbitStart = this.potPoint(ORBIT_R, DIP_Y, 0);
    const tOrbit0 = T_DIP;
    const tOrbit1 = T_DIP + ORBIT_SEC;
    const tEnd = tOrbit1 + T_RETURN;
    let p: vec3;
    if (t < T_LIFT) {
      p = vec3.lerp(this.restWorld, entry, smooth(t / T_LIFT)).add(new vec3(0, 1.2 * Math.sin(Math.PI * Math.min(1, t / T_LIFT)), 0));
      tr.setWorldRotation(quat.slerp(this.restWorldRot, this.stirRot(0), smooth(t / T_LIFT)));
    } else if (t < tOrbit0) {
      p = vec3.lerp(entry, orbitStart, smooth((t - T_LIFT) / (T_DIP - T_LIFT)));
      tr.setWorldRotation(this.stirRot(0));
    } else if (t < tOrbit1) {
      if (prevT < tOrbit0 && this.props) this.props.pulseSaucierSteam(ORBIT_SEC + 0.8); // steam burst as the bowl goes in
      const k = (t - tOrbit0) / ORBIT_SEC;
      const a = 2 * Math.PI * this.revs * smooth(k);
      p = this.potPoint(ORBIT_R * Math.cos(a), DIP_Y, ORBIT_R * Math.sin(a));
      tr.setWorldRotation(this.stirRot(a));
      if (this.sauce) {
        const st = this.sauce.getTransform();
        st.setLocalRotation(this.sauceRot0.multiply(quat.angleAxis(a * 0.5, vec3.up())));
        // ripple: the domed surface bulges and settles in the ladle's wake
        const rip = 1 + 0.9 * Math.sin(k * Math.PI) * (0.6 + 0.4 * Math.sin(a * 3));
        st.setLocalScale(new vec3(this.sauceScale0.x, this.sauceScale0.y * rip, this.sauceScale0.z));
      }
    } else if (t < tEnd) {
      const kb = smooth((t - tOrbit1) / T_RETURN);
      p = vec3.lerp(this.lastWorld, this.restWorld, kb);
      tr.setWorldRotation(quat.slerp(this.stirRot(2 * Math.PI * this.revs), this.restWorldRot, kb));
    } else {
      this.finish();
      return;
    }
    if (t < tOrbit1) this.lastWorld = p;
    tr.setWorldPosition(p);
  }

  private finish(): void {
    this.t = -1;
    this.result = "PLAYED";
    this.restore();
    print("[LadleStir] KINE_LADLE_ORBITAL_STIR done");
  }

  private restore(): void {
    if (this.ladle) {
      const tr = this.ladle.getTransform();
      tr.setLocalPosition(this.restPos);
      tr.setLocalRotation(this.restRot);
    }
    if (this.sauce) {
      this.sauce.getTransform().setLocalRotation(this.sauceRot0);
      this.sauce.getTransform().setLocalScale(this.sauceScale0);
    }
  }

  private cancel(): void {
    if (this.t >= 0) this.restore();
    this.t = -1;
    if (this.result === "PLAYING") this.result = "IDLE";
  }
}
