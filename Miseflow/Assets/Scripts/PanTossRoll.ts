import { DishBlueprintApplier } from "./DishBlueprintApplier";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { FlipTechniqueOverride, SpatulaTechniqueGuide } from "./SpatulaTechniqueGuide";
import { SALMON_DOME_H } from "./StationPropsBuilder";
import { ProteinProp, ProteinRegistry, proteinSearEase } from "./ProteinGenerators";

const DEG = Math.PI / 180;
// Choreography (real seconds): dip forward, snap back (launch), settle; pieces hop staggered.
const T_DIP = 0.32; // pan pitches forward to PITCH_FWD
const T_SNAP = 0.56; // snaps back to PITCH_BACK: the pieces launch
const T_SETTLE = 1.0; // pan level again
const PITCH_FWD = -14;
const PITCH_BACK = 8;
const HOP_START = 0.4;
const HOP_STAGGER = 0.08;
const HOP_DUR = 0.9;
const APEX_CM = 3.2; // world cm
const PAN_NAMES = ["WokPan", "TawaPan", "SkilletPan"]; // first found wins (wok arrives with the asset phase)
const PIECE_PREFIX = "ProteinPiece_"; // cubed pieces (asset phase); fallback = the existing fillet

function clamp01(k: number): number {
  return Math.max(0, Math.min(1, k));
}

function smooth(k: number): number {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
}

function smoother(k: number): number {
  const t = clamp01(k);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function findByName(root: SceneObject, name: string): SceneObject | null {
  if (root.name === name) return root;
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const f = findByName(root.getChild(i), name);
    if (f) return f;
  }
  return null;
}

function collectPrefix(root: SceneObject, prefix: string, out: SceneObject[]): void {
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const c = root.getChild(i);
    if (c.name.indexOf(prefix) === 0) out.push(c);
    collectPrefix(c, prefix, out);
  }
}

interface Piece {
  obj: SceneObject;
  pos0: vec3;
  rot0: quat;
  halfH: number;
  delay: number;
}

/**
 * PanTossRoll.ts — KINE_PAN_TOSS_ROLL (v5 Part 4, design table 3.4 #4)
 * The skillet/wok pitches -14 deg then snaps back +8 deg while every protein piece in the pan hops
 * along a staggered parabolic arc (apex ~3.2 cm) and rolls 180 deg so the browned side ends up.
 * Plugged into SpatulaTechniqueGuide as the flip override: it only runs when the active blueprint's
 * protein.primaryKine is KINE_PAN_TOSS_ROLL (or on PAN_TOSS_REQUESTED); dish 01 keeps the spatula
 * flip untouched. On finish the guide adopts the crust-up pose and emits SALMON_FLIPPED, so Auto
 * Cook and PlatingFinisher continue exactly as after a flip. Pieces are found by name under the pan
 * (ProteinPiece_* from the asset phase, else the existing SalmonFillet stand-in).
 * Deterministic frame tween (real time); Reset restores the pan and pieces.
 */
@component
export class PanTossRoll extends BaseScriptComponent implements FlipTechniqueOverride {
  private static instance: PanTossRoll | null = null;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private t: number = -1;
  private forced: boolean = false;
  private done: (() => void) | null = null;
  private pan: SceneObject | null = null;
  private panRot0: quat = quat.quatIdentity();
  private pieces: Piece[] = [];
  private herb: SceneObject | null = null;
  private apexLocal: number = 4.7;
  private endT: number = T_SETTLE;
  private tossCount: number = 0;
  private missingLogged: boolean = false;
  private protein: ProteinProp | null = null; // A3: active protein prop being tossed (null = legacy pieces / fillet)
  private sear0: number = 0;

  public static getInstance(): PanTossRoll | null {
    return PanTossRoll.instance;
  }

  onAwake(): void {
    PanTossRoll.instance = this;
    SpatulaTechniqueGuide.setFlipOverride(this);
    this.createEvent("OnStartEvent").bind(() => {
      this.listen("PAN_TOSS_REQUESTED", () => this.onRequested());
      this.listen("RESET_REQUESTED", () => this.cancel());
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
      if (PanTossRoll.instance === this) {
        PanTossRoll.instance = null;
        SpatulaTechniqueGuide.setFlipOverride(null);
      }
    });
  }

  // ── FlipTechniqueOverride ──

  public isActive(): boolean {
    return this.forced || DishBlueprintApplier.wantsPanToss();
  }

  public isBusy(): boolean {
    return this.t >= 0;
  }

  public techniqueId(): string {
    return "KINE_PAN_TOSS_ROLL";
  }

  public start(done: () => void): boolean {
    if (this.t >= 0) return true;
    if (!this.bind()) {
      this.forced = false;
      return false;
    }
    this.done = done;
    this.t = 0;
    this.tossCount++;
    if (this.herb) this.herb.enabled = false; // re-laid on the crust when the guide adopts the flipped pose
    print(`[PanToss] KINE_PAN_TOSS_ROLL start (${this.pieces.length} piece(s) under ${this.pan ? this.pan.name : "?"})`);
    // observable trigger for HUD / LEAF; t >= 0 already, so our own handler ignores it
    this.eventBus.emit("PAN_TOSS_REQUESTED", { hops: this.pieces.length });
    return true;
  }

  // ── public state (LEAF) ──

  public getTossCount(): number {
    return this.tossCount;
  }

  // ── internals ──

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    this.eventBus.on(ev, cb);
    this.handlers.push({ ev, cb });
  }

  /** PAN_TOSS_REQUESTED from outside: run through the guide so the flip state stays consistent. */
  private onRequested(): void {
    if (this.t >= 0) return;
    const guide = this.findGuide();
    if (!guide) return;
    if (guide.isFlipped() || guide.isFlipping()) return;
    this.forced = true;
    guide.playFlip();
  }

  private findGuide(): SpatulaTechniqueGuide | null {
    const layer = this.getSceneObject();
    return layer.getComponent(SpatulaTechniqueGuide.getTypeName()) as SpatulaTechniqueGuide;
  }

  private stationsRoot(): SceneObject | null {
    let o: SceneObject | null = this.getSceneObject();
    while (o && o.name !== "StationsRoot" && o.hasParent()) o = o.getParent();
    return o && o.name === "StationsRoot" ? o : null;
  }

  /** A3: the active ProteinProp (ProteinRegistry) - its pieces hop inside their pan, browning as they roll. */
  private bindProtein(p: ProteinProp): boolean {
    const pan = p.getPan();
    const ps = p.getPieces();
    if (!pan || ps.length === 0) return false;
    this.protein = p;
    this.sear0 = p.getDoneness();
    this.pan = pan;
    this.panRot0 = pan.getTransform().getLocalRotation();
    this.herb = null;
    this.apexLocal = APEX_CM / Math.max(0.05, p.getObject().getTransform().getWorldScale().y);
    this.pieces = [];
    for (let i = 0; i < ps.length; i++) {
      const tr = ps[i].obj.getTransform();
      this.pieces.push({ obj: ps[i].obj, pos0: tr.getLocalPosition(), rot0: tr.getLocalRotation(), halfH: ps[i].halfH, delay: HOP_START + i * HOP_STAGGER });
    }
    this.endT = Math.max(T_SETTLE, HOP_START + (this.pieces.length - 1) * HOP_STAGGER + HOP_DUR) + 0.12;
    return true;
  }

  private bind(): boolean {
    this.protein = null;
    const prop = ProteinRegistry.getActive();
    if (prop && this.bindProtein(prop)) return true;
    const root = this.stationsRoot();
    let pan: SceneObject | null = null;
    if (root) for (const n of PAN_NAMES) if (!pan) pan = findByName(root, n);
    if (!pan) {
      if (!this.missingLogged) {
        this.missingLogged = true;
        print("[PanToss] no SkilletPan/WokPan found: KINE_PAN_TOSS_ROLL skipped (spatula fallback)");
      }
      return false;
    }
    const all: SceneObject[] = [];
    collectPrefix(pan, PIECE_PREFIX, all);
    const objs = all.filter((o) => o.isEnabledInHierarchy); // A3: staged (hidden) protein props never toss
    const fillet = findByName(pan, "SalmonFillet");
    if (objs.length === 0 && fillet) objs.push(fillet);
    if (objs.length === 0) {
      if (!this.missingLogged) {
        this.missingLogged = true;
        print("[PanToss] no protein pieces under the pan: KINE_PAN_TOSS_ROLL skipped");
      }
      return false;
    }
    this.pan = pan;
    this.panRot0 = pan.getTransform().getLocalRotation();
    this.herb = fillet ? findByName(fillet, "HerbSprig") : null;
    const ws = pan.getTransform().getWorldScale().y;
    this.apexLocal = APEX_CM / Math.max(0.05, ws);
    this.pieces = [];
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const tr = o.getTransform();
      let halfH = SALMON_DOME_H / 2; // fillet: same roll pivot as the spatula flip, so the end pose matches
      if (o !== fillet) {
        try {
          const rmv = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
          if (rmv && rmv.mesh) halfH = Math.max(0.1, rmv.mesh.aabbMax.y / 2);
        } catch (e) {
          // keep the default pivot
        }
      }
      this.pieces.push({ obj: o, pos0: tr.getLocalPosition(), rot0: tr.getLocalRotation(), halfH: halfH, delay: HOP_START + i * HOP_STAGGER });
    }
    this.endT = Math.max(T_SETTLE, HOP_START + (this.pieces.length - 1) * HOP_STAGGER + HOP_DUR) + 0.12;
    return true;
  }

  private pitchAt(t: number): number {
    if (t < T_DIP) return PITCH_FWD * smooth(t / T_DIP);
    if (t < T_SNAP) return PITCH_FWD + (PITCH_BACK - PITCH_FWD) * smooth((t - T_DIP) / (T_SNAP - T_DIP));
    if (t < T_SETTLE) return PITCH_BACK * (1 - smooth((t - T_SNAP) / (T_SETTLE - T_SNAP)));
    return 0;
  }

  private applyPiece(p: Piece, k: number): void {
    const h = this.apexLocal * Math.sin(Math.PI * clamp01(k));
    const theta = -Math.PI * smoother(k);
    const rx = quat.angleAxis(theta, vec3.right());
    const c = new vec3(0, p.halfH, 0);
    const pivotOff = p.rot0.multiplyVec3(c.sub(rx.multiplyVec3(c)));
    const tr = p.obj.getTransform();
    tr.setLocalRotation(p.rot0.multiply(rx));
    tr.setLocalPosition(p.pos0.add(pivotOff).add(new vec3(0, k >= 1 ? 0 : h, 0)));
  }

  private onUpdate(): void {
    if (this.t < 0 || !this.pan) return;
    this.t += getDeltaTime();
    const t = Math.min(this.t, this.endT);
    this.pan.getTransform().setLocalRotation(this.panRot0.multiply(quat.angleAxis(this.pitchAt(t) * DEG, vec3.right())));
    for (const p of this.pieces) this.applyPiece(p, (t - p.delay) / HOP_DUR);
    if (this.protein && this.protein.isLive()) this.protein.setDoneness(Math.max(this.sear0, proteinSearEase((t - HOP_START) / (this.endT - HOP_START))));
    if (this.t >= this.endT) {
      this.pan.getTransform().setLocalRotation(this.panRot0);
      for (const p of this.pieces) this.applyPiece(p, 1);
      this.t = -1;
      this.forced = false;
      const cb = this.done;
      this.done = null;
      print("[PanToss] KINE_PAN_TOSS_ROLL done: browned side up");
      if (cb) cb();
    }
  }

  /** Reset: level pan, pieces back in place (the fillet itself is also restored by the spatula rig reset). */
  private cancel(): void {
    const wasBusy = this.t >= 0;
    this.t = -1;
    this.forced = false;
    this.done = null;
    if (this.pan) this.pan.getTransform().setLocalRotation(this.panRot0);
    if (wasBusy) {
      for (const p of this.pieces) {
        const tr = p.obj.getTransform();
        tr.setLocalPosition(p.pos0);
        tr.setLocalRotation(p.rot0);
      }
    }
    if (this.herb) this.herb.enabled = true;
  }
}
