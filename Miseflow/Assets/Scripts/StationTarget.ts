import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import {
  AlertRaisedPayload,
  AlertResolvedPayload,
  HandStationPayload,
  MiseFlowEventBus,
  MiseFlowEventType,
  StepDonePinchedPayload,
} from "./MiseFlowEventBus";
import { KIT, KitGlass, applyKitGlass, findSceneCamera, kitGlass, kitText, scaleRgb, withAlpha } from "./StudioCardKit";
import { HeadPoseBillboard } from "./HeadPoseBillboard";
import { HandZoneSensor } from "./HandZoneSensor";
import { KitchenAnchorRoot } from "./KitchenAnchorRoot";
import { ChoreographyDAG } from "./ChoreographyDAG";
import { MetricPrepBlueprint } from "./MetricPrepBlueprint";
import { StationInteractableController } from "./StationInteractableController";
import { StepEngine } from "./StepEngine";
import { classifySteps } from "./KineRegistry";
import { PlatingFinisher } from "./PlatingFinisher";
import { CookRuntime } from "./Cook/CookRuntime";
import { CookStepCard } from "./Cook/CookStepCard";
import { CookEvents, CookWorld, EquipmentHandle } from "./Cook/CookWorld";

// ============================================================================
// MiseFlow v7 Stage 3 (Plan D4 / S4): ONE big target per station.
// ----------------------------------------------------------------------------
// * StationTarget = a UIKit `Button` (SnapOS2 / Round / Ghost: a pure input surface, collider 4.5 cm) plus our own
//   dark-glass visuals. RoundButton is deprecated in UIKit ("use Button.ts and pick the Round shape"), and the
//   dock already uses Button, so this is the project's UIKit round button. The Button object never moves, so its
//   collider stays put in every state (moving a collider mid-press drops SIK events).
// * Three states: DOT (1.2 cm at 40 % brightness, the 4.5 cm collider stays), OPEN (12 x 7 cm dark glass card:
//   step title 1.0 cm, timer 1.8 cm in fixed digit cells, hint <= 4 words 0.8 cm; the circle becomes the Done
//   button) and ALERT (OPEN plus a coral accent pulsing at 1 Hz; the chime comes in Stage 4).
// * StationTargetHub (@component, built in code, no @input) owns one target per legacy station (PREP, SKILLET,
//   SAUCEPOT, PLATING) or, in Cook mode, one per vessel / board / plate, feeds them from StepEngine, the DAG and the
//   Cook runtime, arbitrates the single alert, and moves the old pills / step card into a hidden vault (never
//   renamed, never destroyed, their text keeps updating for LEAF).
// ============================================================================

export type TargetState = "DOT" | "OPEN" | "ALERT";
export type TargetEngine = "LEGACY" | "COOK";
export type PressSource = "TARGET" | "LEAF" | "KEY";

export interface TargetContent {
  title: string; // <= 3 words in practice, shown at 1.0 cm cap height
  timer: string; // "07:05", "3/8" ... drawn in fixed digit cells at 1.8 cm
  hint: string; // <= 4 words, 0.8 cm
  index: string; // "STEP 2 OF 8" (0.6 cm), may be empty
  accent: vec4;
  doneLabel: string;
  doneEnabled: boolean;
}

/** View model of a legacy pill, supplied by MiseFlowSpatialUI (single source for hints and accents; no import cycle). */
export interface LegacyStationView {
  metric: string;
  action: string;
  accent: vec4;
  expanded: boolean;
  key: string;
  alert: boolean;
}

export interface LegacyPlateView {
  seconds: number; // 400 (06:40) + drift
  shifted: boolean;
  done: boolean; // dish ready
  ready: boolean; // sear + sauce done, waiting to plate
}

export interface LegacyViewSource {
  getStationView(id: "PREP" | "SKILLET" | "SAUCEPOT"): LegacyStationView;
  getPlateView(): LegacyPlateView;
}

// Geometry (cm)
export const TARGET_COLLIDER_CM = 4.5;
const DOT_D = 1.2;
const DOT_ALPHA = 0.4;
const CARD_H = 7.0;
const CARD_W = 12.0;
const PLATE_CARD_W = 17.3; // plate: a second 4.5 cm circle ("Name a dish") needs 5.3 cm more
const CIRCLE_X0 = -TARGET_COLLIDER_CM / 2 - 0.85; // card left edge in root-local x
const COL_X = TARGET_COLLIDER_CM / 2 + 0.5; // text column left edge
const COL_W = 5.65;
const SECOND_X = 11.45; // plate: centre of the second circle
const LIFT_CM = 8.0; // above the vessel rim
const COOK_SIDE_CM = 3.0; // toward the cook (kitchen +Z)

// Timing
const CLOSE_SEC = 5.0;
const ANIM_SEC = 0.25;
const HOLD_SEC = 1.5;
const GAZE_DEG = 12;
const GAZE_DWELL_SEC = 1.0;
const ALERT_HZ = 1.0;
const UNDER_SEC = 10.0;

function ev(name: string): MiseFlowEventType {
  return name as unknown as MiseFlowEventType;
}

function alive(o: SceneObject | null | undefined): boolean {
  return !!o && !isNull(o);
}

function easeOutQuad(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return 1 - (1 - u) * (1 - u);
}

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? "0" + m : "" + m}:${r < 10 ? "0" + r : "" + r}`;
}

/** "LOWER BURNER NOW" -> "Lower burner now"; dashes dropped; at most four words. */
export function fourWords(s: string): string {
  const w = String(s || "")
    .replace(/[-–•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((x) => x.length > 0);
  const t = w.slice(0, 4).join(" ").toLowerCase();
  return t.length === 0 ? "" : t.charAt(0).toUpperCase() + t.slice(1);
}

function shortTitle(s: string, max: number): string {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return sp > 6 ? cut.slice(0, sp) : cut;
}

/** True when an object is enabled in the hierarchy AND not scale-hidden (the vault / DishStudio technique). */
export function isVisiblyShown(o: SceneObject | null | undefined): boolean {
  if (!alive(o)) return false;
  const obj = o as SceneObject;
  if (!obj.isEnabledInHierarchy) return false;
  const s = obj.getTransform().getWorldScale();
  return Math.abs(s.x) > 0.01 && Math.abs(s.y) > 0.01;
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

function findInScene(name: string): SceneObject | null {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) {
    const f = findByName(global.scene.getRootObject(i), name);
    if (f) return f;
  }
  return null;
}

const DIGIT_W = 0.95;
const SEP_W = 0.5;
const OTHER_W = 0.9;
const TIMER_CELLS = 6;

function cellWidth(ch: string): number {
  if (ch >= "0" && ch <= "9") return DIGIT_W;
  if (ch === ":" || ch === "/" || ch === ".") return SEP_W;
  return OTHER_W;
}

// ============================================================================
// One target
// ============================================================================

export interface StationTargetOptions {
  id: string; // PREP | SKILLET | SAUCEPOT | PLATING or a Cook equipment id
  engine: TargetEngine;
  label: string; // object name suffix: StationTarget_<label>
  parent: SceneObject;
  plate: boolean; // plate target: second action "Name a dish", hold-pinch opens the palette
}

export class StationTarget {
  public readonly id: string;
  public readonly engine: TargetEngine;
  public readonly isPlate: boolean;
  public readonly root: SceneObject;

  /** Done circle pinched while OPEN / ALERT and enabled. */
  /** Returns true when the step is repeatable (CHOP / PORTION): the card then stays open instead of closing after 0.8 s. */
  public onDone: ((src: PressSource) => boolean | void) | null = null;
  /** Any pinch on the circle means "I am here" (Stage 4 hand-zone fallback; the hub wires it to the sensor). */
  public onPinchHere: (() => void) | null = null;
  /** Plate only: "Name a dish". */
  public onSecondary: ((src: PressSource) => void) | null = null;
  /** Plate only: the circle was held 1.5 s. */
  public onHold: (() => void) | null = null;

  private glasses: KitGlass[] = [];
  private card: SceneObject;
  private cardGlass: KitGlass;
  private disc: KitGlass;
  private disc2: KitGlass | null = null;
  private btnObj: SceneObject;
  private btn2Obj: SceneObject | null = null;
  private btn: Button | null = null;
  private btn2: Button | null = null;
  private titleText: Text;
  private hintText: Text;
  private indexText: Text;
  private doneLabel: Text;
  private nameLabel: Text | null = null;
  private cells: Text[] = [];
  private cellStr: string = "\u0000";

  private content: TargetContent = {
    title: "",
    timer: "",
    hint: "",
    index: "",
    accent: KIT.CYAN,
    doneLabel: "DONE",
    doneEnabled: false,
  };

  // state
  private wantOpen: boolean = false;
  private alertOn: boolean = false;
  private closeAt: number = 0;
  private openK: number = 0;
  private hovered: boolean = false;
  private pressed: boolean = false;
  private heldT: number = 0;
  private holdFired: boolean = false;
  private shown: boolean = true;
  private warmup: number = 10;
  private clockNow: number = 0;
  private lastTrigger: string = "";
  private lastPulseKey: number = -1;
  private lastD: number = -1;
  private discScale: number = 1;

  constructor(o: StationTargetOptions) {
    this.id = o.id;
    this.engine = o.engine;
    this.isPlate = o.plate;
    const root = global.scene.createSceneObject(`StationTarget_${o.label}`);
    root.setParent(o.parent);
    root.createComponent("Component.Canvas");
    this.root = root;
    HeadPoseBillboard.register(root, { pitchDeg: 14 });

    const cardW = o.plate ? PLATE_CARD_W : CARD_W;
    this.card = global.scene.createSceneObject("Target_Card");
    this.card.setParent(root);
    this.card.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001));
    this.card.enabled = false;
    // 85 % alpha dark glass backplate (the only fill allowed below 25 % luminance)
    this.cardGlass = kitGlass(
      this.card,
      "Target_Backplate",
      new vec3(CIRCLE_X0 + cardW / 2, 0, -0.12),
      new vec2(cardW, CARD_H),
      withAlpha(KIT.GLASS, 0.85),
      withAlpha(KIT.CYAN, 0.9),
      0.06,
      KIT.CARD_RADIUS,
      this.glasses
    );
    this.titleText = kitText(this.card, "Target_Title", "", 36, KIT.TEXT, new vec3(COL_X + COL_W / 2, 2.35, 0.03), COL_W, 1.0, { align: "left", weight: 800 });
    this.hintText = kitText(this.card, "Target_Hint", "", 28, withAlpha(KIT.TEXT, 0.86), new vec3(COL_X + COL_W / 2, -1.35, 0.03), COL_W, 0.8, { align: "left", weight: 600 });
    this.indexText = kitText(this.card, "Target_Index", "", 20, KIT.MUTED, new vec3(COL_X + COL_W / 2, -2.75, 0.03), COL_W, 0.6, { align: "left", weight: 700 });
    for (let i = 0; i < TIMER_CELLS; i++) {
      this.cells.push(kitText(this.card, `Target_Timer_${i}`, "", 64, KIT.TEXT, new vec3(COL_X + DIGIT_W / 2 + i * DIGIT_W, 0.5, 0.03), DIGIT_W, 1.8, { align: "center", weight: 800 }));
    }

    // the circle: dot <-> Done button (visual only; input is the Button below)
    this.disc = kitGlass(root, "Target_Disc", new vec3(0, 0, 0.0), new vec2(DOT_D, DOT_D), withAlpha(KIT.CYAN, DOT_ALPHA), withAlpha(KIT.CYAN, 0.55), 0.03, DOT_D / 2, this.glasses);
    this.doneLabel = kitText(root, "Target_DoneLabel", "DONE", 28, KIT.TEXT, new vec3(0, 0, 0.05), TARGET_COLLIDER_CM - 0.6, 0.9, { weight: 800 });
    this.doneLabel.getSceneObject().enabled = false;

    this.btnObj = global.scene.createSceneObject(`Btn_TargetDone_${o.label}`);
    this.btnObj.setParent(root);
    this.btn = this.makeButton(
      this.btnObj,
      (down) => this.onCircleDown(down),
      () => {
        this.pressed = false;
        this.tapCircle("TARGET");
      }
    );

    if (o.plate) {
      this.disc2 = kitGlass(this.card, "Target_Disc2", new vec3(SECOND_X, 0, 0.0), new vec2(TARGET_COLLIDER_CM, TARGET_COLLIDER_CM), scaleRgb(KIT.VIOLET, 0.55, 0.95), withAlpha(KIT.VIOLET, 1.0), 0.07, TARGET_COLLIDER_CM / 2, this.glasses);
      this.nameLabel = kitText(this.card, "Target_NameLabel", "NAME A\nDISH", 24, KIT.TEXT, new vec3(SECOND_X, 0, 0.05), TARGET_COLLIDER_CM - 0.7, 1.8, { weight: 800, wrap: true });
      this.btn2Obj = global.scene.createSceneObject("Btn_TargetNameDish_Plate");
      this.btn2Obj.setParent(this.card);
      this.btn2Obj.getTransform().setLocalPosition(new vec3(SECOND_X, 0, 0));
      this.btn2 = this.makeButton(this.btn2Obj, () => undefined, () => this.pressSecondary("TARGET"));
    }
    this.applyAllGlass();
  }

  /** UIKit round button: SnapOS2 / Round / Ghost, 4.5 cm. */
  private makeButton(obj: SceneObject, onDown: (down: boolean) => void, onUp: () => void): Button | null {
    try {
      const b = obj.createComponent(Button.getTypeName()) as Button;
      b.setVariant({ theme: "SnapOS2", shape: "Round", style: "Ghost" });
      b.size = new vec3(TARGET_COLLIDER_CM, TARGET_COLLIDER_CM, 1.0);
      b.onHoverEnter.add(() => {
        if (obj === this.btnObj) this.hovered = true;
      });
      b.onHoverExit.add(() => {
        if (obj === this.btnObj) {
          this.hovered = false;
          this.pressed = false;
        }
      });
      b.onTriggerDown.add(() => onDown(true));
      b.onTriggerUp.add(() => onUp());
      return b;
    } catch (e) {
      print(`[StationTarget] UIKit button unavailable (${e}); use tapCircle()`);
      return null;
    }
  }

  // ───────────────────────── public API ─────────────────────────

  public getState(): TargetState {
    if (this.alertOn) return "ALERT";
    return this.wantOpen ? "OPEN" : "DOT";
  }

  public isOpen(): boolean {
    return this.wantOpen || this.alertOn;
  }

  public getContent(): TargetContent {
    return this.content;
  }

  public getLastTrigger(): string {
    return this.lastTrigger;
  }

  public getOpenFraction(): number {
    return this.openK;
  }

  /** Collider edge length in cm of the main (Done) circle, read from the UIKit Button's real collider shape. */
  public getColliderCm(): number {
    return this.readCollider(this.btn);
  }

  /** Plate only: collider edge of the "Name a dish" circle (0 elsewhere). */
  public getSecondColliderCm(): number {
    return this.btn2 ? this.readCollider(this.btn2) : 0;
  }

  private readCollider(b: Button | null): number {
    if (!b) return TARGET_COLLIDER_CM;
    try {
      const sh = b.collider.shape as BoxShape;
      const s = sh.size;
      return Math.min(s.x, s.y);
    } catch (e) {
      return b.size.x;
    }
  }

  public getButtonObject(): SceneObject {
    return this.btnObj;
  }

  public getSecondButtonObject(): SceneObject | null {
    return this.btn2Obj;
  }

  public getCardObject(): SceneObject {
    return this.card;
  }

  /** The visual dot / circle size in cm right now. */
  public getDiscDiameter(): number {
    return this.lastD > 0 ? this.lastD : DOT_D;
  }

  /** Opens (or keeps open) and restarts the 5 s close timer. */
  public trigger(reason: string): void {
    this.wantOpen = true;
    this.lastTrigger = reason;
    this.closeAt = this.clockNow + CLOSE_SEC;
  }

  public close(): void {
    if (this.alertOn) return;
    this.wantOpen = false;
  }

  /** Pinching the dot toggles: DOT opens; an open card without an actionable Done closes. */
  public toggle(): void {
    if (this.alertOn) return;
    if (this.wantOpen) this.wantOpen = false;
    else this.trigger("PINCH");
  }

  /** The hub grants / withdraws the single alert slot. */
  public setAlert(on: boolean): void {
    if (on === this.alertOn) return;
    this.alertOn = on;
    if (on) {
      this.wantOpen = true;
      this.lastTrigger = "ALERT";
    } else {
      this.closeAt = this.clockNow + CLOSE_SEC;
    }
  }

  public setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.enabled = on;
    if (on) this.warmup = 8;
  }

  public isShown(): boolean {
    return this.shown;
  }

  public setPosition(local: vec3): void {
    this.root.getTransform().setLocalPosition(local);
  }

  public setContent(c: TargetContent): void {
    const prev = this.content;
    this.content = c;
    if (prev.title !== c.title) this.titleText.text = c.title;
    if (prev.hint !== c.hint) this.hintText.text = c.hint;
    if (prev.index !== c.index) this.indexText.text = c.index;
    if (prev.timer !== c.timer) this.layoutTimer(c.timer);
    if (prev.doneLabel !== c.doneLabel) this.doneLabel.text = c.doneLabel;
  }

  /** The circle pinched: DOT opens it, OPEN / ALERT runs Done when enabled, otherwise toggles. */
  public tapCircle(src: PressSource): void {
    print(`[StationTarget] ${this.id} circle pinched (${src}) state=${this.getState()} doneEnabled=${this.content.doneEnabled}`);
    if (this.holdFired) {
      this.holdFired = false;
      return;
    }
    if (this.onPinchHere) this.onPinchHere();
    if (!this.wantOpen && !this.alertOn) {
      this.trigger("PINCH");
      return;
    }
    if (!this.content.doneEnabled) {
      this.toggle();
      return;
    }
    this.pressDone(src);
  }

  /** Runs the Done path now (any state). */
  public pressDone(src: PressSource): void {
    const keep = this.onDone ? this.onDone(src) : false;
    // the card stays a moment to show what comes next, then the 5 s rule takes over (repeatable steps keep it open)
    if (keep === true) this.closeAt = this.clockNow + CLOSE_SEC;
    else this.closeAt = Math.min(this.closeAt, this.clockNow + 0.8);
  }

  public pressSecondary(src: PressSource): void {
    if (!this.isPlate || !this.isOpen()) return;
    if (this.onSecondary) this.onSecondary(src);
  }

  /** Test hook: a hold of HOLD_SEC on the circle (plate: palette). */
  public fireHold(): void {
    if (this.onHold) this.onHold();
  }

  // ───────────────────────── internals ─────────────────────────

  private onCircleDown(_down: boolean): void {
    this.pressed = true;
    this.heldT = 0;
    this.holdFired = false;
  }

  private layoutTimer(str: string): void {
    this.cellStr = str;
    let x = COL_X;
    for (let i = 0; i < this.cells.length; i++) {
      const t = this.cells[i];
      const ch = i < str.length ? str.charAt(i) : "";
      t.text = ch;
      const w = ch === "" ? DIGIT_W : cellWidth(ch);
      t.getSceneObject().getTransform().setLocalPosition(new vec3(x + w / 2, 0.5, 0.03));
      t.layoutRect = Rect.create(-w / 2, w / 2, -0.9, 0.9);
      x += w;
    }
  }

  private applyAllGlass(): void {
    for (const g of this.glasses) applyKitGlass(g);
  }

  /** Per frame (hub calls it only while the target is shown). */
  public update(dt: number, clock: number): void {
    this.clockNow = clock;
    if (this.pressed && this.isPlate && !this.holdFired) {
      this.heldT += dt;
      if (this.heldT >= HOLD_SEC) {
        this.holdFired = true;
        if (this.onHold) this.onHold();
      }
    }
    if (this.hovered && this.wantOpen) this.closeAt = Math.max(this.closeAt, clock + 1.0);
    if (this.wantOpen && !this.alertOn && clock >= this.closeAt && !this.pressed) {
      this.wantOpen = false;
      this.lastTrigger = "";
    }

    const wantK = this.wantOpen || this.alertOn ? 1 : 0;
    if (this.openK < wantK) this.openK = Math.min(1, this.openK + dt / ANIM_SEC);
    else if (this.openK > wantK) this.openK = Math.max(0, this.openK - dt / ANIM_SEC);
    const e = easeOutQuad(this.openK);

    const accent = this.alertOn ? KIT.CORAL : this.content.accent;
    const pulse = this.alertOn ? 0.5 + 0.5 * Math.sin(clock * Math.PI * 2 * ALERT_HZ) : 1;

    // circle: 1.2 cm dot at 40 % -> 4.5 cm Done button
    const d = DOT_D + (TARGET_COLLIDER_CM - DOT_D) * e;
    const hoverK = this.hovered ? 1.08 : 1.0;
    this.discScale += (hoverK - this.discScale) * Math.min(1, dt * 14);
    const dd = d * this.discScale;
    const dimDone = e > 0.5 && !this.content.doneEnabled;
    const k = 1 + (0.55 - 1) * e;
    const alpha = DOT_ALPHA + (0.95 - DOT_ALPHA) * e;
    const dg = this.disc;
    const bgA = dimDone ? withAlpha(KIT.GLASS, 0.85) : new vec4(accent.r * k, accent.g * k, accent.b * k, alpha);
    const borderA = withAlpha(dimDone ? KIT.MUTED : accent, (0.55 + 0.45 * e) * (this.alertOn ? 0.5 + 0.5 * pulse : 1));
    const changed = Math.abs(dd - this.lastD) > 0.002 || this.alertOn || this.warmup > 0 || !dg.bg.equal(bgA) || !dg.border.equal(borderA);
    if (changed) {
      this.lastD = dd;
      dg.rr.size = new vec2(dd, dd);
      dg.radius = dd / 2;
      dg.bg = bgA;
      dg.border = borderA;
      dg.borderSize = 0.03 + 0.04 * e + (this.alertOn ? 0.03 * pulse : 0);
      applyKitGlass(dg);
    }
    const showCard = e > 0.01;
    if (this.card.enabled !== showCard) this.card.enabled = showCard;
    if (showCard) {
      const s = Math.max(0.001, e);
      this.card.getTransform().setLocalScale(new vec3(s, s, s));
      const cg = this.cardGlass;
      const borderC = withAlpha(accent, this.alertOn ? 0.55 + 0.45 * pulse : 0.9);
      if (!cg.border.equal(borderC) || this.alertOn || this.warmup > 0) {
        cg.border = borderC;
        cg.borderSize = this.alertOn ? 0.06 + 0.05 * pulse : 0.06;
        applyKitGlass(cg);
      }
      this.titleText.textFill.color = this.alertOn ? KIT.CORAL : KIT.TEXT;
      if (this.disc2) {
        this.disc2.border = withAlpha(KIT.VIOLET, 1.0);
        if (this.warmup > 0) applyKitGlass(this.disc2);
      }
    }
    const labelOn = e > 0.7;
    const lo = this.doneLabel.getSceneObject();
    if (lo.enabled !== labelOn) lo.enabled = labelOn;
    if (labelOn) this.doneLabel.textFill.color = dimDone ? withAlpha(KIT.MUTED, 0.6) : KIT.TEXT;
    if (this.btn2Obj) {
      const on = e > 0.5;
      if (this.btn2Obj.enabled !== on) this.btn2Obj.enabled = on;
    }
    if (this.warmup > 0) {
      this.warmup--;
      this.applyAllGlass();
    }
  }

  public destroy(): void {
    HeadPoseBillboard.unregister(this.root);
    if (alive(this.root)) this.root.destroy();
  }
}

// ============================================================================
// The hub
// ============================================================================

const LEGACY_IDS: ("PREP" | "SKILLET" | "SAUCEPOT" | "PLATING")[] = ["SKILLET", "SAUCEPOT", "PREP", "PLATING"];
const LEGACY_LABEL: { [id: string]: string } = { PREP: "Prep", SKILLET: "Skillet", SAUCEPOT: "Saucepot", PLATING: "Plate" };
/**
 * Kitchen-local anchors: the old pill anchors (StationsRoot frame, +0.23 to the kitchen frame) lowered to 8 cm above
 * each rim, 3 cm toward the cook. Skillet rim 1.6, saucier rim 4.9, board 1.6, plate 0.3.
 */
const LEGACY_POS: { [id: string]: vec3 } = {
  SKILLET: new vec3(-11.2, 1.6 + 0.23 + LIFT_CM, -1.5 + COOK_SIDE_CM),
  SAUCEPOT: new vec3(0.0, 4.9 + 0.23 + LIFT_CM, -10.5 + COOK_SIDE_CM),
  PREP: new vec3(10.5, 1.6 + 0.23 + LIFT_CM, -3.0 + COOK_SIDE_CM),
  PLATING: new vec3(0.0, 0.3 + 0.23 + LIFT_CM, 4.5 + COOK_SIDE_CM),
};
const VAULT_NAMES = [
  "SkilletStationUI",
  "SauceStationUI",
  "PrepStationUI",
  "SkilletStationUI_Stem",
  "SauceStationUI_Stem",
  "PrepStationUI_Stem",
  "PlateAnchorUI",
  "StepCard",
];
const VAULT_SCALE = 0.0001;

const ACTION_HINT: { [a: string]: string } = {
  CUT: "Cut evenly",
  MARINATE: "Coat well",
  MIX: "Mix evenly",
  COAT: "Coat every piece",
  HEAT_OIL: "Wait for shimmer",
  DEEP_FRY: "Fry till golden",
  SHALLOW_FRY: "Sear till golden",
  SAUTE_TOSS: "Keep it moving",
  TEMPER: "Bloom the spices",
  SIMMER: "Low and gentle",
  BOIL: "Rolling boil",
  ROLL_DOUGH: "Roll it thin",
  KNEAD: "Knead till smooth",
  COOK_FLAT: "Cook both sides",
  FLIP: "Flip once",
  STEAM_DUM: "Seal and wait",
  WHISK: "Whisk briskly",
  POUR: "Pour slowly",
  SEASON: "Season to taste",
  REST: "Let it rest",
  PLATE: "Plate it up",
  GARNISH: "Finish and garnish",
  GENERIC: "Keep going",
};

function prettyKind(s: string): string {
  const t = String(s || "").replace(/_/g, " ").trim().toLowerCase();
  return t.length === 0 ? "" : t.charAt(0).toUpperCase() + t.slice(1);
}

interface CookRun {
  t0: number;
  dur: number;
  warned: boolean;
}

@component
export class StationTargetHub extends BaseScriptComponent {
  static readonly OBJECT_NAME = "StationTargetHub";
  static readonly ROOT_NAME = "StationTargets";
  private static instance: StationTargetHub | null = null;
  private static viewSource: LegacyViewSource | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private targetsRoot: SceneObject | null = null;
  private legacy: StationTarget[] = [];
  private cook: StationTarget[] = [];
  private world: CookWorld | null = null;
  private cookMode: boolean = false;
  private studioOpen: boolean = false;
  private clock: number = 0;
  private lastReal: number = -1;
  private started: boolean = false;
  private frames: number = 0;

  private dag: ChoreographyDAG | null = null;
  private prep: MetricPrepBlueprint | null = null;
  private controller: StationInteractableController | null = null;
  private finisher: PlatingFinisher | null = null;

  private lastKey: { [id: string]: string } = {};
  private lastSec: { [id: string]: number } = {};
  private converged: boolean = false;
  private alertWanted: { [id: string]: string } = {};
  private legacyAlertIds: { [id: string]: boolean } = {};
  private alertOrder: string[] = [];
  private alertOwner: string | null = null;
  private cookRuns: { [stepId: string]: CookRun } = {};
  private vaultReady: boolean = false;
  private vault: SceneObject | null = null;
  private hudRevealed: boolean = false;
  private gazeId: string | null = null;
  private gazeT: number = 0;
  private camObj: SceneObject | null = null;
  private simGaze: { pos: vec3; fwd: vec3 } | null = null;
  private initialOpenDone: boolean = false;

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): StationTargetHub | null {
    const i = StationTargetHub.instance;
    return i && !isNull(i) ? i : null;
  }

  /** Creates (once) the scene-root object "StationTargetHub". Idempotent. */
  public static ensure(): StationTargetHub {
    const cur = StationTargetHub.getInstance();
    if (cur) return cur;
    const n = global.scene.getRootObjectsCount();
    for (let i = 0; i < n; i++) {
      const o = global.scene.getRootObject(i);
      if (o.name === StationTargetHub.OBJECT_NAME) {
        const c = o.getComponent(StationTargetHub.getTypeName()) as StationTargetHub;
        if (c) {
          StationTargetHub.instance = c;
          return c;
        }
      }
    }
    const obj = global.scene.createSceneObject(StationTargetHub.OBJECT_NAME);
    const comp = obj.createComponent(StationTargetHub.getTypeName()) as StationTargetHub;
    if (!StationTargetHub.instance) StationTargetHub.instance = comp;
    return StationTargetHub.instance;
  }

  /** MiseFlowSpatialUI registers the pill view logic here (no import cycle, single source for hints). */
  public static setViewSource(src: LegacyViewSource | null): void {
    StationTargetHub.viewSource = src;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    StationTargetHub.instance = this;
    this.createEvent("OnStartEvent").bind(() => this.start());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (StationTargetHub.instance === this) StationTargetHub.instance = null;
    });
  }

  private listen(name: string, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[StationTargetHub] ${name} handler error: ${e}`);
      }
    };
    this.bus.on(ev(name), safe);
    this.handlers.push({ ev: ev(name), cb: safe });
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    const kitchen = KitchenAnchorRoot.ensure();
    const root = global.scene.createSceneObject(StationTargetHub.ROOT_NAME);
    root.setParent(kitchen.getRoot());
    this.targetsRoot = root;
    for (const id of LEGACY_IDS) this.legacy.push(this.buildLegacy(id));

    // SIK / bus subscriptions live in OnStart
    this.listen("STEP_STARTED", (d?: any) => this.onLegacyStepStarted(d));
    this.listen("STEP_COMPLETED", () => undefined);
    this.listen("PLATING_CONVERGENCE", () => (this.converged = true));
    this.listen("DRIFT_RECORDED", () => this.triggerLegacy("SKILLET", "DRIFT"));
    this.listen("SCHEDULE_REVISED", () => {
      this.triggerLegacy("SAUCEPOT", "DRIFT");
      this.triggerLegacy("PREP", "DRIFT");
    });
    this.listen("HOLD_CONFIRMED", () => this.triggerLegacy("SKILLET", "HEAT"));
    this.listen("RESET_REQUESTED", () => this.onReset());
    this.listen("STUDIO_STATE_CHANGED", (d?: any) => (this.studioOpen = !!d && !!d.open));
    this.listen("COOK_PLAN_READY", () => this.enterCookMode());
    this.listen(CookEvents.WORLD_READY, (d?: any) => this.onCookWorld(d));
    this.listen(CookEvents.STEP_STARTED, (d?: any) => this.onCookStepStarted(d));
    this.listen(CookEvents.STEP_DONE, (d?: any) => this.onCookStepDone(d));
    this.listen(CookEvents.FINISHED, () => this.onCookFinished());
    this.listen(CookEvents.EXIT, () => this.exitCookMode());
    // Stage 4 hooks: these simply do not fire yet
    this.listen("HAND_AT_STATION", (d?: HandStationPayload) => this.onHandAt(d, true));
    this.listen("HAND_LEFT_STATION", (d?: HandStationPayload) => this.onHandAt(d, false));
    this.listen("ALERT_RAISED", (d?: AlertRaisedPayload) => {
      if (d && d.stationId) {
        delete this.legacyAlertIds[String(d.stationId)]; // the director owns this alert now
        this.requestAlert(String(d.stationId), String(d.kind || "ALERT"));
      }
    });
    this.listen("ALERT_RESOLVED", (d?: AlertResolvedPayload) => {
      if (d && d.stationId) this.resolveAlert(String(d.stationId));
    });
    // Stage 4: in Cook mode the hand-zone sensor measures to the Cook vessel / board / plate targets
    HandZoneSensor.setStationProvider(() => {
      if (!this.cookMode || this.cook.length === 0) return null;
      return this.cook.map((t) => ({ id: t.id, pos: t.root.getTransform().getWorldPosition() }));
    });
    print(`[StationTargetHub] ${this.legacy.length} legacy station targets built`);
  }

  // ───────────────────────── public API ─────────────────────────

  public getTargets(): StationTarget[] {
    return (this.cookMode ? this.cook : this.legacy).slice();
  }

  public getLegacyTargets(): StationTarget[] {
    return this.legacy.slice();
  }

  public getCookTargets(): StationTarget[] {
    return this.cook.slice();
  }

  public getTarget(id: string): StationTarget | null {
    for (const t of this.legacy) if (t.id === id) return t;
    for (const t of this.cook) if (t.id === id) return t;
    return null;
  }

  public getPlateTarget(): StationTarget | null {
    for (const t of this.getTargets()) if (t.isPlate) return t;
    return null;
  }

  public isCookMode(): boolean {
    return this.cookMode;
  }

  public getAlertOwner(): string | null {
    return this.alertOwner;
  }

  public getVault(): SceneObject | null {
    return this.vault;
  }

  /** Dev: scale the hidden legacy HUD (pills, chronometer, step card, Cook card) back in. */
  public setLegacyHudRevealed(on: boolean): void {
    this.hudRevealed = on;
    if (this.vault && alive(this.vault)) {
      const s = on ? 1 : VAULT_SCALE;
      this.vault.getTransform().setLocalScale(new vec3(s, s, s));
    }
    const cc = CookStepCard.getInstance();
    if (cc) cc.setSuppressed(!on);
  }

  public isLegacyHudRevealed(): boolean {
    return this.hudRevealed;
  }

  /** Test hook: pretend the head is at pos looking along fwd (gaze rule). Pass null to clear. */
  public setSimulatedGaze(pos: vec3 | null, fwd?: vec3): void {
    this.simGaze = pos && fwd ? { pos, fwd: fwd.normalize() } : null;
  }

  /** Angle in degrees between the gaze ray and the target (180 when unknown). */
  public gazeAngleDeg(t: StationTarget): number {
    const g = this.gazePose();
    if (!g) return 180;
    const p = t.root.getTransform().getWorldPosition();
    const d = p.sub(g.pos);
    if (d.length < 1e-3) return 0;
    const c = Math.max(-1, Math.min(1, d.normalize().dot(g.fwd)));
    return (Math.acos(c) * 180) / Math.PI;
  }

  /** Programmatic alert request (Stage 4 attention director uses the bus events; scenarios may call this). */
  public requestAlert(id: string, kind: string): void {
    if (this.alertWanted[id] === undefined) this.alertOrder.push(id);
    this.alertWanted[id] = kind;
  }

  public resolveAlert(id: string): void {
    if (this.alertWanted[id] === undefined) return;
    delete this.alertWanted[id];
    this.alertOrder = this.alertOrder.filter((x) => x !== id);
  }

  // ───────────────────────── building ─────────────────────────

  private buildLegacy(id: string): StationTarget {
    const plate = id === "PLATING";
    const t = new StationTarget({ id, engine: "LEGACY", label: LEGACY_LABEL[id], parent: this.targetsRoot as SceneObject, plate });
    t.setPosition(LEGACY_POS[id]);
    this.wireTarget(t);
    return t;
  }

  private wireTarget(t: StationTarget): void {
    t.onPinchHere = () => HandZoneSensor.notifyPinchHere(t.id);
    t.onDone = (src) => (t.engine === "LEGACY" ? this.doneLegacy(t, src) : this.doneCook(t, src));
    if (t.isPlate) {
      t.onSecondary = (src) => {
        this.bus.emit("OPEN_DISH_STUDIO", { source: src === "LEAF" ? "LEAF" : "TARGET" });
        t.close();
      };
      t.onHold = () => {
        print("[StationTargetHub] plate target held 1.5 s: PALETTE_REQUESTED");
        this.bus.emit("PALETTE_REQUESTED", { source: "TARGET" });
      };
    }
  }

  // ───────────────────────── references ─────────────────────────

  private resolveRefs(): void {
    if (this.dag && this.prep && this.controller && this.finisher) return;
    const st = findInScene("StationsRoot");
    if (!st) return;
    if (!this.dag) this.dag = st.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    if (!this.prep) this.prep = st.getComponent(MetricPrepBlueprint.getTypeName()) as MetricPrepBlueprint;
    if (!this.controller) this.controller = st.getComponent(StationInteractableController.getTypeName()) as StationInteractableController;
    if (!this.finisher) {
      const layer = findByName(st, "DiegeticLayer");
      if (layer) this.finisher = layer.getComponent(PlatingFinisher.getTypeName()) as PlatingFinisher;
    }
  }

  // ───────────────────────── vault ─────────────────────────

  /** Moves the old pills, stems, chronometer capsule and legacy step card into a scale-hidden vault (never renamed). */
  private maintainVault(): void {
    if (this.vaultReady) return;
    const st = findInScene("StationsRoot");
    if (!st) return;
    let vault = findByName(st, "LegacyUiVault");
    if (!vault) {
      vault = global.scene.createSceneObject("LegacyUiVault");
      vault.setParent(st);
      vault.getTransform().setLocalPosition(vec3.zero());
      vault.getTransform().setLocalRotation(quat.quatIdentity());
      const s = this.hudRevealed ? 1 : VAULT_SCALE;
      vault.getTransform().setLocalScale(new vec3(s, s, s));
    }
    this.vault = vault;
    let found = 0;
    for (const n of VAULT_NAMES) {
      const o = findByName(st, n);
      if (!o) continue;
      found++;
      if (o.getParent() !== vault) o.setParent(vault);
    }
    if (found === VAULT_NAMES.length) {
      this.vaultReady = true;
      print(`[StationTargetHub] ${found} legacy UI objects moved into the hidden LegacyUiVault`);
    }
  }

  // ───────────────────────── legacy content ─────────────────────────

  private activeLegacyStep(): { idx: number; total: number; station: string; title: string; kind: string } | null {
    const se = StepEngine.getInstance();
    if (!se || !se.isEnabled()) return null;
    const steps = se.getSteps();
    const idx = se.getCurrentIndex();
    if (idx < 0 || idx >= steps.length) return null;
    let kind = "";
    try {
      kind = classifySteps(steps)[idx];
    } catch (e) {
      kind = "";
    }
    return { idx, total: steps.length, station: steps[idx].station, title: steps[idx].title, kind };
  }

  private legacyContent(t: StationTarget): TargetContent {
    const id = t.id;
    const src = StationTargetHub.viewSource;
    const act = this.activeLegacyStep();
    const isActive = !!act && act.station === id;
    const index = act ? `STEP ${act.idx + 1} OF ${act.total}` : "";
    if (id === "PLATING") {
      const pv = src ? src.getPlateView() : { seconds: 400, shifted: false, done: false, ready: false };
      const canPlate = (this.converged || pv.ready) && !pv.done;
      const title = pv.done ? "Plated" : isActive && act ? shortTitle(act.title, 20) : "Plate the dish";
      const hint = pv.done ? "Serve while hot" : canPlate ? "Pinch to plate" : pv.shifted ? "Start shifted +25s" : "Waits on sear";
      return {
        title,
        timer: pv.done ? "00:00" : mmss(pv.seconds),
        hint,
        index,
        accent: pv.done ? KIT.EMERALD : pv.shifted ? KIT.VIOLET : KIT.EMERALD,
        doneLabel: "PLATE",
        doneEnabled: canPlate,
      };
    }
    const view: LegacyStationView = src
      ? src.getStationView(id as "PREP" | "SKILLET" | "SAUCEPOT")
      : { metric: "", action: "", accent: KIT.CYAN, expanded: false, key: "", alert: false };
    let title = "";
    let timer = "";
    let doneLabel = "DONE";
    if (id === "SKILLET") {
      title = isActive && act ? act.title : this.dag ? this.dag.getTaskTitle("skillet_sear_skin") : "Sear";
      timer = this.dag ? mmss(this.dag.getSkilletRemaining()) : "01:00";
    } else if (id === "SAUCEPOT") {
      title = isActive && act ? act.title : this.dag ? this.dag.getTaskTitle("sauce_reduction") : "Sauce";
      timer = this.dag ? mmss(this.dag.getSaucepotRemaining()) : "00:50";
    } else {
      const slices = this.prep ? this.prep.getSliceIndex() : 0;
      const total = this.prep ? this.prep.totalSlices : 8;
      timer = `${slices}/${total}`;
      if (isActive && act && act.kind === "CHOP") {
        title = `Cut ${Math.min(total, slices + 1)} of ${total}`;
        doneLabel = "CUT";
      } else {
        title = isActive && act ? act.title : this.dag ? this.dag.getTaskTitle("prep_shallots") : "Prep";
      }
    }
    if (view.key === "dish" || view.key === "plated" || view.key === "clear" || view.key === "crust") title = fourWords(view.metric);
    return {
      title: shortTitle(title, 20),
      timer,
      hint: fourWords(view.action),
      index,
      accent: view.accent,
      doneLabel,
      doneEnabled: isActive,
    };
  }

  private refreshLegacy(): void {
    const src = StationTargetHub.viewSource;
    for (const t of this.legacy) {
      const c = this.legacyContent(t);
      t.setContent(c);
      const id = t.id;
      // open on a state change that the pill logic expands (10 s before the timer ends, drift, heat, vision, done)
      if (src && id !== "PLATING") {
        const v = src.getStationView(id as "PREP" | "SKILLET" | "SAUCEPOT");
        const prevKey = this.lastKey[id];
        if (prevKey !== undefined && prevKey !== v.key && v.expanded) t.trigger(`STATE_${v.key.toUpperCase()}`);
        this.lastKey[id] = v.key;
        // the pill-derived alert is the hub's own; an alert the attention director raised (ALERT_RAISED) is not auto-resolved here
        if (v.alert) {
          if (this.alertWanted[id] === undefined) this.legacyAlertIds[id] = true;
          this.requestAlert(id, v.key === "drift" ? "DRIFT" : "HEAT_GUARD");
        } else if (this.legacyAlertIds[id] && (this.alertWanted[id] === "DRIFT" || this.alertWanted[id] === "HEAT_GUARD")) {
          delete this.legacyAlertIds[id];
          this.resolveAlert(id);
        }
      }
      // 10 s before a DAG timer ends
      if (this.dag && (id === "SKILLET" || id === "SAUCEPOT")) {
        const rem = id === "SKILLET" ? this.dag.getSkilletRemaining() : this.dag.getSaucepotRemaining();
        const prev = this.lastSec[id];
        if (prev !== undefined && prev > UNDER_SEC && rem <= UNDER_SEC && rem > 0) t.trigger("TIMER_UNDER_10");
        this.lastSec[id] = rem;
      }
      if (id === "PLATING" && this.lastKey.PLATING_READY !== undefined) {
        const pv = src ? src.getPlateView() : null;
        const ready = !!pv && (pv.ready || pv.done);
        if (ready && this.lastKey.PLATING_READY !== "1") t.trigger("PLATE_READY");
        this.lastKey.PLATING_READY = ready ? "1" : "0";
      } else if (id === "PLATING") {
        this.lastKey.PLATING_READY = "0";
      }
    }
  }

  private triggerLegacy(id: string, why: string): void {
    for (const t of this.legacy) if (t.id === id) t.trigger(why);
  }

  private onLegacyStepStarted(d?: any): void {
    const se = StepEngine.getInstance();
    if (!se || !d || typeof d.index !== "number") return;
    const steps = se.getSteps();
    const s = steps[d.index];
    if (s) this.triggerLegacy(String(s.station), "STEP_START");
  }

  // ───────────────────────── Done paths (the old chip / button paths) ─────────────────────────

  private emitDone(t: StationTarget, src: PressSource, advanced: boolean, dishId: string, stepId: string, index: number): void {
    const p: StepDonePinchedPayload = { stationId: t.id, engine: t.engine, dishId, stepId, index, source: src, advanced };
    this.bus.emit("STEP_DONE_PINCHED", p);
  }

  private doneLegacy(t: StationTarget, src: PressSource): boolean {
    this.resolveRefs();
    const act = this.activeLegacyStep();
    const se = StepEngine.getInstance();
    const dishId = se ? se.getDishId() : "";
    const stepId = act && se ? se.getSteps()[act.idx].id : "";
    let advanced = false;
    if (t.id === "PLATING") {
      if (this.finisher && !this.finisher.isDishPlated() && this.converged) {
        this.finisher.begin();
        advanced = true;
      }
    } else if (act && act.station === t.id) {
      // the old chips: Step Cut / Fill Portion / Transfer; every other step completes through the StepEngine
      if (act.kind === "CHOP" && this.controller) this.controller.onStepChopPressed();
      else if (act.kind === "PORTION" && this.controller) this.controller.onFillPortionPressed();
      else if (act.kind === "TRANSFER" && this.controller) this.controller.onTransferPressed();
      else if (se) se.skipToNext();
      advanced = true;
    }
    this.emitDone(t, src, advanced, dishId, stepId, advanced && act ? act.idx : -1);
    const repeatable = !!act && (act.kind === "CHOP" || act.kind === "PORTION");
    if (advanced && t.id !== "PLATING" && act && !repeatable) t.close();
    return advanced && repeatable;
  }

  private doneCook(t: StationTarget, src: PressSource): boolean {
    const rt = CookRuntime.getInstance();
    let advanced = false;
    let stepId = "";
    let index = -1;
    const next = this.cookNextStep(t.id);
    if (rt && next && next.ready && !rt.isAuto() && !rt.getState().finished) {
      stepId = next.step.id;
      index = next.index;
      advanced = rt.startReadyStep(stepId);
    }
    this.emitDone(t, src, advanced, this.world ? String(this.world.plan.dishTitle || "") : "", stepId, index);
    return false;
  }

  // ───────────────────────── Cook mode ─────────────────────────

  private enterCookMode(): void {
    this.cookMode = true;
    this.clearCook();
  }

  private exitCookMode(): void {
    this.cookMode = false;
    this.world = null;
    this.clearCook();
    this.cookRuns = {};
  }

  private clearCook(): void {
    for (const t of this.cook) {
      this.resolveAlert(t.id);
      t.destroy();
    }
    this.cook = [];
  }

  private onCookWorld(d?: any): void {
    const world = d && d.world ? (d.world as CookWorld) : null;
    if (!world) return;
    this.cookMode = true;
    this.world = world;
    this.clearCook();
    this.cookRuns = {};
    for (const id in world.equipment) {
      const eq = world.equipment[id];
      if (!eq || !alive(eq.obj)) continue;
      const isPlate = eq === world.plate;
      const t = new StationTarget({ id, engine: "COOK", label: `${prettyKind(eq.kind) || id}_${id}`.replace(/\s+/g, ""), parent: this.targetsRoot as SceneObject, plate: isPlate });
      this.placeCookTarget(t, eq);
      this.wireTarget(t);
      this.cook.push(t);
    }
    // the first ready step opens its vessel
    const rt = CookRuntime.getInstance();
    const first = rt ? rt.getState().ready[0] : "";
    if (first) {
      for (const s of world.plan.steps || []) if (s && s.id === first) this.triggerCook(String(s.equipmentId || ""), "STEP_READY");
    }
    print(`[StationTargetHub] Cook mode: ${this.cook.length} station targets`);
  }

  private placeCookTarget(t: StationTarget, eq: EquipmentHandle): void {
    if (!alive(eq.obj)) return;
    const k = KitchenAnchorRoot.ensure();
    const rimK = k.worldToKitchen(eq.rimWorld());
    t.setPosition(new vec3(rimK.x, rimK.y + LIFT_CM, rimK.z + COOK_SIDE_CM));
  }

  private triggerCook(equipmentId: string, why: string): void {
    for (const t of this.cook) if (t.id === equipmentId) t.trigger(why);
  }

  private onCookStepStarted(d?: any): void {
    if (!d || !this.world) return;
    const rt = CookRuntime.getInstance();
    const speed = rt ? Math.max(0.05, rt.getSpeed()) : 1;
    let dur = 4;
    for (const s of this.world.plan.steps || []) {
      if (s && s.id === d.stepId) dur = typeof s.durationSec === "number" && isFinite(s.durationSec) && s.durationSec > 0 ? s.durationSec : 4;
    }
    this.cookRuns[String(d.stepId)] = { t0: this.clock, dur: Math.max(1, Math.min(45, dur)) / speed, warned: false };
    this.triggerCook(String(d.equipmentId || ""), "STEP_START");
  }

  private onCookStepDone(d?: any): void {
    if (!d || !this.world) return;
    delete this.cookRuns[String(d.stepId)];
    for (const s of this.world.plan.steps || []) {
      if (s && s.id === d.stepId) this.triggerCook(String(s.equipmentId || ""), "STEP_DONE");
    }
  }

  private onCookFinished(): void {
    const plate = this.getPlateTarget();
    if (plate) plate.trigger("FINISHED");
  }

  /** The step that the vessel's card talks about: running first, then the first pending one on that vessel. */
  private cookNextStep(equipmentId: string): { step: any; index: number; running: boolean; ready: boolean } | null {
    const w = this.world;
    const rt = CookRuntime.getInstance();
    if (!w || !rt) return null;
    const st = rt.getState();
    const steps = w.plan.steps || [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s && String(s.equipmentId) === equipmentId && st.running.indexOf(s.id) >= 0) return { step: s, index: i, running: true, ready: false };
    }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s && String(s.equipmentId) === equipmentId && st.pending.indexOf(s.id) >= 0) {
        return { step: s, index: i, running: false, ready: st.ready.indexOf(s.id) >= 0 };
      }
    }
    return null;
  }

  private cookContent(t: StationTarget): TargetContent {
    const w = this.world;
    const rt = CookRuntime.getInstance();
    const st = rt ? rt.getState() : null;
    const eq = w ? w.equipment[t.id] : null;
    const name = eq ? prettyKind(eq.kind) : "Vessel";
    const total = w ? (w.plan.steps || []).length : 0;
    const doneLabel = t.isPlate ? "PLATE" : "START";
    if (!w || !rt || !st) return { title: name, timer: "--:--", hint: "", index: "", accent: KIT.CYAN, doneLabel, doneEnabled: false };
    const nx = this.cookNextStep(t.id);
    if (!nx) {
      return {
        title: st.finished ? "Dish ready" : "All done here",
        timer: st.finished ? "00:00" : "--:--",
        hint: st.finished ? "Serve while hot" : "Next vessel",
        index: "",
        accent: KIT.EMERALD,
        doneLabel,
        doneEnabled: false,
      };
    }
    const act = String(nx.step.action || "GENERIC").toUpperCase();
    const hint = ACTION_HINT[act] || fourWords(String(nx.step.whatWhy || ""));
    const accent = this.cookAccent(act);
    const index = `STEP ${nx.index + 1} OF ${total}`;
    if (nx.running) {
      const run = this.cookRuns[nx.step.id];
      const left = run ? Math.max(0, run.dur - (this.clock - run.t0)) : 0;
      return { title: shortTitle(String(nx.step.title || act), 20), timer: mmss(left), hint, index, accent, doneLabel, doneEnabled: false };
    }
    const planned = typeof nx.step.durationSec === "number" && nx.step.durationSec > 0 ? nx.step.durationSec : 4;
    return {
      title: shortTitle(String(nx.step.title || act), 20),
      timer: mmss(planned),
      hint: nx.ready ? "Pinch to start" : "Waits on the last step",
      index,
      accent,
      doneLabel,
      doneEnabled: nx.ready && !rt.isAuto() && !st.finished,
    };
  }

  private cookAccent(action: string): vec4 {
    switch (action) {
      case "HEAT_OIL":
      case "DEEP_FRY":
      case "SHALLOW_FRY":
      case "SAUTE_TOSS":
      case "TEMPER":
      case "COOK_FLAT":
      case "FLIP":
        return KIT.GOLD;
      case "SIMMER":
      case "BOIL":
      case "STEAM_DUM":
      case "POUR":
      case "WHISK":
      case "CUT":
        return KIT.CYAN;
      case "PLATE":
      case "GARNISH":
        return KIT.EMERALD;
      default:
        return KIT.CYAN;
    }
  }

  private refreshCook(): void {
    const w = this.world;
    if (!w) return;
    for (const t of this.cook) {
      const eq = w.equipment[t.id];
      if (eq) this.placeCookTarget(t, eq);
      t.setContent(this.cookContent(t));
    }
    // 10 s before a running step ends
    for (const sid in this.cookRuns) {
      const r = this.cookRuns[sid];
      if (r.warned) continue;
      const left = r.dur - (this.clock - r.t0);
      if (r.dur > UNDER_SEC && left <= UNDER_SEC) {
        r.warned = true;
        for (const s of w.plan.steps || []) if (s && s.id === sid) this.triggerCook(String(s.equipmentId || ""), "TIMER_UNDER_10");
      }
    }
  }

  // ───────────────────────── resets, hand hooks ─────────────────────────

  private onReset(): void {
    this.converged = false;
    this.lastKey = {};
    this.lastSec = {};
    this.alertWanted = {};
    this.legacyAlertIds = {};
    this.alertOrder = [];
    this.alertOwner = null;
    this.cookMode = false;
    this.world = null;
    this.clearCook();
    this.cookRuns = {};
    for (const t of this.legacy) {
      t.setAlert(false);
      t.close();
    }
    this.initialOpenDone = false;
  }

  private onHandAt(d: HandStationPayload | undefined, at: boolean): void {
    if (!d || !d.stationId) return;
    const t = this.getTarget(String(d.stationId));
    if (!t) return;
    if (at) t.trigger("HAND_AT_STATION");
    else if (!t.isOpen()) t.close();
  }

  // ───────────────────────── gaze ─────────────────────────

  private gazePose(): { pos: vec3; fwd: vec3 } | null {
    if (this.simGaze) return this.simGaze;
    if (!this.camObj || isNull(this.camObj)) {
      const c = findSceneCamera();
      this.camObj = c ? c.getSceneObject() : null;
    }
    if (!this.camObj) return null;
    const tr = this.camObj.getTransform();
    return { pos: tr.getWorldPosition(), fwd: tr.getWorldRotation().multiplyVec3(new vec3(0, 0, -1)).normalize() };
  }

  private updateGaze(dt: number): void {
    const list = this.getTargets().filter((t) => t.isShown());
    let best: StationTarget | null = null;
    let bestA = GAZE_DEG;
    for (const t of list) {
      const a = this.gazeAngleDeg(t);
      if (a < bestA) {
        bestA = a;
        best = t;
      }
    }
    if (!best) {
      this.gazeId = null;
      this.gazeT = 0;
      return;
    }
    if (this.gazeId !== best.id) {
      this.gazeId = best.id;
      this.gazeT = 0;
      return;
    }
    this.gazeT += dt;
    if (this.gazeT >= GAZE_DWELL_SEC) {
      // gaze opens at most one card at a time; it keeps the open card open while the wearer keeps looking
      const others = list.some((t) => t !== best && t.isOpen());
      if (best.isOpen() || !others) best.trigger("GAZE");
    }
  }

  // ───────────────────────── alerts ─────────────────────────

  private arbitrateAlerts(): void {
    if (this.alertOwner !== null && this.alertWanted[this.alertOwner] === undefined) this.alertOwner = null;
    if (this.alertOwner === null && this.alertOrder.length > 0) this.alertOwner = this.alertOrder[0];
    for (const t of this.getTargets()) {
      const granted = this.alertOwner === t.id;
      t.setAlert(granted);
      if (!granted && this.alertWanted[t.id] !== undefined) t.trigger("ALERT_QUEUED");
    }
    for (const t of this.legacy) if (this.cookMode) t.setAlert(false);
  }

  // ───────────────────────── frame ─────────────────────────

  private onUpdate(): void {
    if (!this.started) return;
    const dt = Math.min(0.1, getDeltaTime());
    // the clock (5 s close rule, pulses) follows real time even when the editor preview runs at a low frame rate
    const realNow = getTime();
    this.clock += this.lastReal < 0 ? dt : Math.max(dt, Math.min(1.0, realNow - this.lastReal));
    this.lastReal = realNow;
    this.frames++;
    this.maintainVault();
    this.resolveRefs();
    if (!this.initialOpenDone && this.frames > 6) {
      this.initialOpenDone = true;
      const act = this.activeLegacyStep();
      if (act) this.triggerLegacy(act.station, "STEP_START");
    }
    const showLegacy = !this.cookMode && !this.studioOpen;
    const showCook = this.cookMode && !this.studioOpen && this.cook.length > 0;
    for (const t of this.legacy) t.setShown(showLegacy);
    for (const t of this.cook) t.setShown(showCook);
    if (showLegacy) this.refreshLegacy();
    if (showCook) this.refreshCook();
    this.arbitrateAlerts();
    // Stage 4: a hand that stays at a station keeps its card open (the 5 s close timer starts when the hand leaves)
    const sensor = HandZoneSensor.getInstance();
    if (sensor) for (const t of this.getTargets()) if (t.isShown() && sensor.isHandAt(t.id)) t.trigger("HAND_AT_STATION");
    if (showLegacy || showCook) this.updateGaze(dt);
    for (const t of this.legacy) if (t.isShown()) t.update(dt, this.clock);
    for (const t of this.cook) if (t.isShown()) t.update(dt, this.clock);
  }
}
