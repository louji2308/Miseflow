import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { ChoreographyDAG } from "./ChoreographyDAG";
import { MetricPrepBlueprint } from "./MetricPrepBlueprint";
import { StationPropsBuilder } from "./StationPropsBuilder";
import { SpatulaTechniqueGuide } from "./SpatulaTechniqueGuide";
import { PlatingFinisher } from "./PlatingFinisher";
import { AutoCookController } from "./AutoCookController";
import { LadleOrbitalStir } from "./LadleOrbitalStir";
import { DishBlueprintApplier } from "./DishBlueprintApplier";
import { ProteinRegistry } from "./ProteinGenerators";
import { getPreset } from "./AI/DishLibraryConfig";
import { StepSpec, UniversalDishBlueprint } from "./AI/UniversalDishSchema";
import { KineRegistry, StepKind, classifySteps } from "./KineRegistry";
import { KIT, KitGlass, applyKitGlass, easeOutBack, kitCard, kitGlass, kitText, smooth, withAlpha } from "./StudioCardKit";

/**
 * StepEngine.ts (v5 K1a)
 * Walks the active dish's own steps[] one at a time and emits STEP_STARTED / STEP_COMPLETED { dishId, stepId, index,
 * total }. It never drives the kitchen: every step completes from the REAL state the existing flow already produces,
 * so manual play (Btn_*) and Auto Cook advance it the same way. Dish 01 maps onto today's flow with no behaviour change.
 *
 * Completion signal per step (decided once per dish from kinematic + station + order):
 *   CHOP      first KINE_ROCK_CHOP                 -> 8th cut (MetricPrepBlueprint slice index = totalSlices)
 *   PORTION   later ROCK_CHOP / PREP TWO_STAGE_POUR -> portion dome 100% (or the bowl already poured)
 *   TRANSFER  first non-PREP TWO_STAGE_POUR         -> bowl poured into the saucier (PREP_BOWL_POURED)
 *   SAUCE     later non-PREP TWO_STAGE_POUR         -> DAG sauce_reduction COMPLETE
 *   SEAR      earlier SPATULA_FLIP / PAN_TOSS       -> flip window (sear <= 10 s) or the flip / toss started
 *   FLIPPED   last SPATULA_FLIP / PAN_TOSS          -> protein flipped / tossed (SALMON_FLIPPED)
 *   LADLE / DUM / WHISK / NOODLE                    -> their *_REQUESTED (+ ladle idle again) or the step's own
 *                                                      durationSec (warp / Auto Cook speed scaled) so nothing hangs
 *   PLATED    KINE_CONVERGENCE_PLATING              -> DISH_PLATED
 * Every step is shown at least MIN_DWELL_SEC; once the dish converged / plated, timed steps catch up at once.
 * Boot / Reset = preset 0 at step 0; a staged (Dish Studio) dish starts at its reveal (DISH_REVEALED).
 *
 * Also owns the compact step card (StepCard / StepCardTitle / StepCardBody / StepProgress) and the sear doneness
 * driver for non-salmon proteins (ProteinProp.setDoneness follows the DAG sear clock, only ever upwards).
 */

type StepState = "pending" | "active" | "done";

const MIN_DWELL_SEC = 0.8;
const FLIP_WINDOW_SEC = 10.0;
const REQ_SETTLE_SEC = 2.5; // dum / whisk / noodle: request seen -> done after this (no completion callback yet)
const KINE_CAP_SEC = 24.0; // K1b: a running noodle / dum / whisk kinematic holds its step at most this long (real s)
const POUR_CAP_SEC = 20.0; // K1b: a ladle step waits for a running transfer pour at most this long
const IN_SEC = 0.32;
const OUT_SEC = 0.18;
const MAX_DOTS = 9;

// Card geometry (cm, StationsRoot-local; same frame and camera as the station pills)
const CARD_W = 9.2;
const CARD_H = 4.3;
const CAM_LOCAL = new vec3(0, 42.6, 54.6);
const ANCHOR: { [s: string]: vec3 } = {
  PREP: new vec3(12.4, 12.6, -6.5), // above the prep pill
  SKILLET: new vec3(-11.6, 11.8, -4.0), // above the skillet pill
  SAUCEPOT: new vec3(-10.6, 12.2, -12.0), // left of the sauce pill, below the dish banner
  PLATING: new vec3(10.6, 12.2, -12.0), // right of the sauce pill
};

function faceCamera(pos: vec3): quat {
  const d = CAM_LOCAL.sub(pos);
  const yaw = Math.atan2(d.x, d.z);
  const horiz = Math.sqrt(d.x * d.x + d.z * d.z);
  const pitch = -Math.atan2(d.y, horiz);
  return quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(pitch, vec3.right()));
}

function accentOf(station: string): vec4 {
  if (station === "SKILLET") return KIT.AMBER;
  if (station === "SAUCEPOT") return KIT.CYAN;
  return KIT.EMERALD;
}

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const n = parent.getChildrenCount();
  for (let i = 0; i < n; i++) {
    const f = findByName(parent.getChild(i), name);
    if (f) return f;
  }
  return null;
}

/** Completion kind of every step of a dish (see header table); shared with Auto Cook via KineRegistry. */
export { classifySteps };

@component
export class StepEngine extends BaseScriptComponent {
  private static instance: StepEngine | null = null;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  // refs
  private stationsRoot: SceneObject | null = null;
  private dag: ChoreographyDAG | null = null;
  private prep: MetricPrepBlueprint | null = null;
  private props: StationPropsBuilder | null = null;
  private guide: SpatulaTechniqueGuide | null = null;
  private finisher: PlatingFinisher | null = null;

  // step state
  private enabledFlag: boolean = true;
  private dishId: string = "";
  private steps: StepSpec[] = [];
  private kinds: StepKind[] = [];
  private states: StepState[] = [];
  private index: number = -1;
  private stepT: number = 0; // real seconds in the step
  private stepScaledT: number = 0; // warp / Auto Cook scaled seconds in the step
  private pendingDish: UniversalDishBlueprint | null = null; // staged dish waiting for its reveal
  private converged: boolean = false;
  private plated: boolean = false;
  // request counters (bus) and how many a finished step already consumed
  private req: { [k: string]: number } = { DUM: 0, WHISK: 0, NOODLE: 0 };
  private used: { [k: string]: number } = { DUM: 0, WHISK: 0, NOODLE: 0, LADLE: 0 };
  private reqSeenAt: number = -1;
  // K1b: completed kinematic runs a finished step already consumed (KineRegistry providers)
  private kineUsed: { [k: string]: number } = { DUM: 0, WHISK: 0, NOODLE: 0 };

  // card
  private cardVisible: boolean = true;
  private studioOpen: boolean = false;
  /** A Cook-engine dish owns the scene: the legacy step card stays hidden. */
  private cookActive: boolean = false;
  private card: SceneObject | null = null;
  private cardGlass: KitGlass | null = null;
  private glasses: KitGlass[] = [];
  private idxText: Text | null = null;
  private stationText: Text | null = null;
  private titleText: Text | null = null;
  private bodyText: Text | null = null;
  private dots: KitGlass[] = [];
  private shown: number = -1;
  private shownDish: string = "";
  private animK: number = 0;
  private animDir: number = 0; // +1 in, -1 out, 0 idle
  private warmup: number = 0;

  public static getInstance(): StepEngine | null {
    return StepEngine.instance;
  }

  onAwake(): void {
    StepEngine.instance = this;
    KineRegistry.setEngine(this);
    this.createEvent("OnStartEvent").bind(() => {
      this.resolve();
      this.buildCard();
      // Chef Director (Cook engine) dishes bring their own step card: the legacy salmon-era card stays hidden meanwhile
      this.listen("COOK_PLAN_READY", () => (this.cookActive = true));
      this.listen("COOK_EXIT", () => (this.cookActive = false));
      this.listen("RESET_REQUESTED", () => {
        this.cookActive = false;
        this.onReset();
      });
      this.listen("DISH_BLUEPRINT_APPLIED", (d?: any) => this.onApplied(d));
      this.listen("DISH_REVEALED", (d?: any) => this.onRevealed(d));
      this.listen("STUDIO_STATE_CHANGED", (d?: any) => (this.studioOpen = !!d && !!d.open));
      this.listen("PLATING_CONVERGENCE", () => (this.converged = true));
      this.listen("DISH_PLATED", () => (this.plated = true));
      this.listen("DUM_SEAL_REQUESTED", () => this.onRequest("DUM"));
      this.listen("WHISK_REQUESTED", () => this.onRequest("WHISK"));
      this.listen("NOODLE_TOSS_REQUESTED", () => this.onRequest("NOODLE"));
      this.loadDish(DishBlueprintApplier.getActiveBlueprint());
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
      if (StepEngine.instance === this) StepEngine.instance = null;
      if (KineRegistry.getEngine() === this) KineRegistry.setEngine(null);
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public getSteps(): StepSpec[] {
    return this.steps.slice();
  }

  public getStepStates(): StepState[] {
    return this.states.slice();
  }

  /** Index of the active step; steps.length once the dish is finished; -1 when no dish is loaded. */
  public getCurrentIndex(): number {
    return this.index;
  }

  public getDishId(): string {
    return this.dishId;
  }

  /** Test hook: completes the active step now (STEP_COMPLETED, then STEP_STARTED of the next one). */
  public skipToNext(): void {
    if (this.index >= 0 && this.index < this.steps.length) this.complete();
  }

  /** Engine on/off (off = no tracking, no events, card hidden). */
  public setEnabled(on: boolean): void {
    this.enabledFlag = on;
    if (!on) this.hideCardNow();
  }

  public isEnabled(): boolean {
    return this.enabledFlag;
  }

  /** STEPS chip (Btn_StepGuide): show / hide the step card; the engine keeps tracking. Default ON. */
  public setCardVisible(on: boolean): void {
    this.cardVisible = on;
    if (!on) this.hideCardNow();
  }

  public isCardVisible(): boolean {
    return this.cardVisible;
  }

  public toggleCard(): boolean {
    this.setCardVisible(!this.cardVisible);
    print(`[StepEngine] step card ${this.cardVisible ? "ON" : "OFF"}`);
    return this.cardVisible;
  }

  // ───────────────────────── setup ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[StepEngine] ${ev} handler error: ${e}`);
      }
    };
    this.eventBus.on(ev, safe);
    this.handlers.push({ ev, cb: safe });
  }

  private resolve(): void {
    if (!this.stationsRoot) {
      let o: SceneObject | null = this.getSceneObject();
      while (o && o.name !== "StationsRoot" && o.hasParent()) o = o.getParent();
      this.stationsRoot = o && o.name === "StationsRoot" ? o : null;
    }
    const root = this.stationsRoot;
    if (root) {
      if (!this.dag) this.dag = root.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
      if (!this.prep) this.prep = root.getComponent(MetricPrepBlueprint.getTypeName()) as MetricPrepBlueprint;
      if (!this.props) this.props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    }
    const self = this.getSceneObject();
    if (!this.guide) this.guide = self.getComponent(SpatulaTechniqueGuide.getTypeName()) as SpatulaTechniqueGuide;
    if (!this.finisher) this.finisher = self.getComponent(PlatingFinisher.getTypeName()) as PlatingFinisher;
  }

  // ───────────────────────── dish / steps ─────────────────────────

  private onReset(): void {
    this.pendingDish = null;
    this.loadDish(getPreset(0));
  }

  private onApplied(d?: any): void {
    if (!d || !d.blueprint) return;
    const bp = d.blueprint as UniversalDishBlueprint;
    if (d.staged) {
      this.pendingDish = bp; // the dish starts at its reveal (after Let's cook / Skip)
      return;
    }
    this.pendingDish = null;
    // Reset re-applies dish 01 right after RESET_REQUESTED: already at its step 0, nothing new to announce
    if (bp.dishId === this.dishId && this.index === 0 && this.stepT < 0.5 && !this.converged) return;
    this.loadDish(bp);
  }

  private onRevealed(d?: any): void {
    const p = this.pendingDish;
    if (!p || !d || String(d.dishId) !== p.dishId) return;
    this.pendingDish = null;
    this.loadDish(p);
  }

  private onRequest(k: string): void {
    this.req[k] = (this.req[k] || 0) + 1;
    if (this.index >= 0 && this.index < this.kinds.length && this.kinds[this.index] === k) this.reqSeenAt = this.stepT;
  }

  private loadDish(bp: UniversalDishBlueprint): void {
    if (!bp) return;
    this.resolve();
    this.dishId = bp.dishId;
    this.steps = Array.isArray(bp.steps) ? bp.steps.slice() : [];
    this.kinds = classifySteps(this.steps);
    this.states = this.steps.map(() => "pending" as StepState);
    this.converged = false;
    this.plated = false;
    for (const k in this.req) this.used[k] = this.req[k];
    for (const k in this.kineUsed) this.kineUsed[k] = this.kineDone(k);
    const stir = LadleOrbitalStir.getInstance();
    this.used.LADLE = stir ? stir.getRequestCount() : 0;
    this.index = -1;
    print(`[StepEngine] ${bp.dishId}: ${this.steps.length} steps [${this.kinds.join(", ")}]`);
    this.start(0);
  }

  private start(i: number): void {
    this.index = i;
    this.stepT = 0;
    this.stepScaledT = 0;
    this.reqSeenAt = -1;
    if (i < 0 || i >= this.steps.length) return;
    this.states[i] = "active";
    const s = this.steps[i];
    if (this.enabledFlag) this.eventBus.emit("STEP_STARTED", { dishId: this.dishId, stepId: s.id, index: i, total: this.steps.length });
    print(`[StepEngine] STEP_STARTED ${this.dishId} ${i + 1}/${this.steps.length} ${s.id} (${this.kinds[i]})`);
  }

  private complete(): void {
    const i = this.index;
    if (i < 0 || i >= this.steps.length) return;
    this.states[i] = "done";
    const kind = this.kinds[i];
    if (kind === "LADLE") {
      const stir = LadleOrbitalStir.getInstance();
      this.used.LADLE = stir ? stir.getRequestCount() : this.used.LADLE;
    } else if (this.req[kind] !== undefined) {
      this.used[kind] = this.req[kind];
      this.kineUsed[kind] = this.kineDone(kind);
    }
    const s = this.steps[i];
    if (this.enabledFlag) this.eventBus.emit("STEP_COMPLETED", { dishId: this.dishId, stepId: s.id, index: i, total: this.steps.length });
    print(`[StepEngine] STEP_COMPLETED ${this.dishId} ${i + 1}/${this.steps.length} ${s.id}`);
    this.start(i + 1);
  }

  private timeScale(): number {
    let k = this.dag && this.dag.isTimeWarpActive() ? 10 : 1;
    const auto = AutoCookController.getInstance();
    if (auto && auto.isRunning()) k *= Math.max(1, auto.speed);
    return k;
  }

  /** K1b: completed runs of the kinematic behind a DUM / WHISK / NOODLE step (0 when none is registered). */
  private kineDone(kind: string): number {
    const p = KineRegistry.get(kind);
    return p ? p.getDoneCount() : 0;
  }

  private searRemaining(): number {
    return this.dag ? this.dag.getSkilletRemaining() : 0;
  }

  private searRunning(): boolean {
    const st = this.dag ? this.dag.getTaskState("skillet_sear_skin") : undefined;
    return st === "ACTIVE" || st === "NEEDS_ATTENTION" || st === "PAUSED_BY_USER";
  }

  private flipped(): boolean {
    return !!this.guide && this.guide.isFlipped() && !this.guide.isFlipping();
  }

  private bowlPoured(): boolean {
    return !!this.props && this.props.isBowlPouredIntoSaucier();
  }

  private isPlated(): boolean {
    return this.plated || (!!this.finisher && this.finisher.isDishPlated());
  }

  /** True when the active step's real-world completion signal holds. */
  private stepDone(kind: StepKind, s: StepSpec): boolean {
    const late = this.converged || this.isPlated();
    switch (kind) {
      case "CHOP":
        return !!this.prep && this.prep.getSliceIndex() >= this.prep.totalSlices;
      case "PORTION":
        return (!!this.prep && this.prep.isComplete()) || this.bowlPoured() || late;
      case "TRANSFER":
        return this.bowlPoured() || late;
      case "SAUCE":
        return (!!this.dag && this.dag.getTaskState("sauce_reduction") === "COMPLETE") || late;
      case "SEAR":
        return (!!this.guide && (this.guide.isFlipping() || this.guide.isFlipped())) || (this.searRunning() && this.searRemaining() <= FLIP_WINDOW_SEC) || late;
      case "FLIPPED":
        return this.flipped() || this.isPlated();
      case "PLATED":
        return this.isPlated();
      case "LADLE": {
        // K1b: the masala is still pouring into the pot -> the stir it triggers has not happened yet
        if (this.props && this.props.isSaucierPourActive() && this.stepT < POUR_CAP_SEC) return false;
        const stir = LadleOrbitalStir.getInstance();
        if (stir && stir.getRequestCount() > this.used.LADLE && !stir.isBusy()) return true;
        return late || this.stepScaledT >= Math.max(1, s.durationSec);
      }
      default: {
        // K1b: the kinematic finished a run for this step -> done; still animating -> hold (capped)
        const kin = KineRegistry.get(kind);
        if (kin) {
          if (kin.getDoneCount() > (this.kineUsed[kind] || 0)) return true;
          if (kin.isBusy() && this.stepT < KINE_CAP_SEC) return false;
        }
        // DUM / WHISK / NOODLE: request seen (now or since the previous such step) -> settle; else the step's own time
        if ((this.req[kind] || 0) > (this.used[kind] || 0)) {
          if (this.reqSeenAt < 0) this.reqSeenAt = this.stepT;
          if (this.stepT - this.reqSeenAt >= REQ_SETTLE_SEC) return true;
        }
        return late || this.stepScaledT >= Math.max(1, s.durationSec);
      }
    }
  }

  // ───────────────────────── per frame ─────────────────────────

  private onUpdate(): void {
    const dt = getDeltaTime();
    if (this.enabledFlag && this.index >= 0 && this.index < this.steps.length) {
      this.stepT += dt;
      this.stepScaledT += dt * this.timeScale();
      if (this.stepT >= MIN_DWELL_SEC && this.stepDone(this.kinds[this.index], this.steps[this.index])) this.complete();
    }
    this.driveDoneness();
    this.updateCard(dt);
  }

  /** K1a: non-salmon proteins brown with the sear clock (only ever upwards; flips / tosses / vision keep their say). */
  private driveDoneness(): void {
    const p = ProteinRegistry.getActive();
    if (!p || !this.dag || !this.searRunning()) return;
    if (this.guide && this.guide.isFlipping()) return;
    const prog = Math.max(0, Math.min(1, this.dag.getSkilletProgress()));
    const target = this.guide && this.guide.isFlipped() ? 0.85 + 0.15 * smooth(prog) : 0.8 * smooth(prog);
    if (target > p.getDoneness() + 0.002) p.setDoneness(target);
  }

  // ───────────────────────── step card ─────────────────────────

  private buildCard(): void {
    const parent = this.stationsRoot || this.getSceneObject();
    const old = findByName(parent, "StepCard");
    if (old) old.destroy();
    const root = global.scene.createSceneObject("StepCard");
    root.setParent(parent);
    root.createComponent("Component.Canvas");
    this.card = root;
    this.cardGlass = kitCard(root, "StepCard_Glass", new vec3(0, 0, -0.1), new vec2(CARD_W, CARD_H), KIT.EMERALD, this.glasses);
    const inner = CARD_W - 0.9;
    this.idxText = kitText(root, "StepCardIndex", "", 26, KIT.EMERALD, new vec3(-0.6, 1.5, 0.03), inner - 1.2, 0.7, { align: "left", weight: 800 });
    this.stationText = kitText(root, "StepCardStation", "", 22, KIT.MUTED, new vec3(inner / 2 - 1.6, 1.5, 0.03), 3.2, 0.7, { align: "right", weight: 700 });
    this.titleText = kitText(root, "StepCardTitle", "", 42, KIT.TEXT, new vec3(0, 0.72, 0.03), inner, 0.95, { align: "left", weight: 800 });
    this.bodyText = kitText(root, "StepCardBody", "", 26, withAlpha(KIT.TEXT, 0.86), new vec3(0, -0.45, 0.03), inner, 1.35, { align: "left", wrap: true, weight: 600 });
    const prog = global.scene.createSceneObject("StepProgress");
    prog.setParent(root);
    prog.getTransform().setLocalPosition(new vec3(0, -1.62, 0.02));
    for (let i = 0; i < MAX_DOTS; i++) {
      const g = kitGlass(prog, `StepProgress_Dot_${i}`, vec3.zero(), new vec2(0.26, 0.26), withAlpha(KIT.GLASS, 0.9), withAlpha(KIT.MUTED, 0.5), 0.03, 0.13, this.glasses);
      g.obj.enabled = false;
      this.dots.push(g);
    }
    root.enabled = false;
    this.warmup = 8;
  }

  private hideCardNow(): void {
    if (this.card && this.card.enabled) this.card.enabled = false;
    this.animK = 0;
    this.animDir = 0;
    this.shown = -1;
  }

  private wantCard(): boolean {
    return this.enabledFlag && this.cardVisible && !this.studioOpen && !this.cookActive && this.index >= 0 && this.index < this.steps.length;
  }

  private applyContent(i: number): void {
    const s = this.steps[i];
    if (!s || !this.card) return;
    this.shown = i;
    this.shownDish = this.dishId;
    const accent = accentOf(s.station);
    const total = this.steps.length;
    if (this.idxText) {
      this.idxText.text = `STEP ${i + 1}/${total}`;
      this.idxText.textFill.color = accent;
    }
    if (this.stationText) this.stationText.text = s.station === "SAUCEPOT" ? "SAUCE" : s.station;
    if (this.titleText) this.titleText.text = s.title;
    if (this.bodyText) this.bodyText.text = s.whatWhy;
    if (this.cardGlass) {
      this.cardGlass.border = withAlpha(accent, 0.92);
      applyKitGlass(this.cardGlass);
    }
    const n = Math.min(MAX_DOTS, total);
    const gap = 0.52;
    const x0 = -((n - 1) * gap) / 2;
    for (let d = 0; d < this.dots.length; d++) {
      const g = this.dots[d];
      if (d >= n) {
        g.obj.enabled = false;
        continue;
      }
      g.obj.enabled = true;
      const active = d === i;
      const done = d < i;
      const size = active ? 0.36 : 0.26;
      g.rr.size = new vec2(size, size);
      g.radius = size / 2;
      g.bg = done ? withAlpha(accent, 0.95) : active ? withAlpha(accent, 0.5) : withAlpha(KIT.GLASS, 0.9);
      g.border = active ? withAlpha(KIT.TEXT, 1) : withAlpha(done ? accent : KIT.MUTED, done ? 0.95 : 0.5);
      g.borderSize = active ? 0.05 : 0.03;
      g.obj.getTransform().setLocalPosition(new vec3(x0 + d * gap, 0, 0));
      applyKitGlass(g);
    }
    const pos = ANCHOR[s.station] || ANCHOR.PREP;
    const tr = this.card.getTransform();
    tr.setLocalPosition(pos);
    tr.setLocalRotation(faceCamera(pos));
    this.warmup = Math.max(this.warmup, 3);
  }

  private updateCard(dt: number): void {
    const c = this.card;
    if (!c) return;
    if (!this.wantCard()) {
      if (c.enabled) {
        // finished dish: fade out; hidden by toggle / studio: hideCardNow already ran
        if (this.animDir !== -1 && this.animK > 0) this.animDir = -1;
        if (this.animK <= 0.001 || this.animDir === 0) this.hideCardNow();
      }
    } else if (!c.enabled) {
      c.enabled = true;
      this.applyContent(this.index);
      this.animK = 0;
      this.animDir = 1;
      this.warmup = 8;
    } else if ((this.shown !== this.index || this.shownDish !== this.dishId) && this.animDir !== -1) {
      this.animDir = -1; // STEP_COMPLETED: out, then the next step comes in
    }
    if (this.animDir === 1) {
      this.animK = Math.min(1, this.animK + dt / IN_SEC);
      if (this.animK >= 1) this.animDir = 0;
    } else if (this.animDir === -1) {
      this.animK = Math.max(0, this.animK - dt / OUT_SEC);
      if (this.animK <= 0) {
        this.animDir = 0;
        if (this.wantCard()) {
          this.applyContent(this.index);
          this.animDir = 1;
        } else {
          this.hideCardNow();
          return;
        }
      }
    }
    if (!c.enabled) return;
    const s = this.animDir === -1 ? smooth(this.animK) : this.animK >= 1 ? 1 : easeOutBack(this.animK);
    const k = Math.max(0.001, s);
    c.getTransform().setLocalScale(new vec3(k, k, k));
    if (this.warmup > 0) {
      this.warmup--;
      for (const g of this.glasses) applyKitGlass(g);
    }
  }
}
