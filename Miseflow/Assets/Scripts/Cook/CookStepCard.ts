/**
 * CookStepCard.ts  (Chef Director v6, W4)
 *
 * Compact step card for Cook mode, in the StudioCardKit visual language (dark glass, accent outline, near-square
 * corners): "STEP i/n" + action, title, what/why, progress dots (done / running / pending) and two pinch buttons:
 *   Btn_CookDoStep -> COOK_DO_STEP {}            (MANUAL: start the next ready step)
 *   Btn_CookAuto   -> COOK_AUTO {on: !auto}       (AUTO cook on / off; label follows COOK_MODE_CHANGED)
 * Shown on COOK_WORLD_READY, hidden on COOK_EXIT. With parallel steps it shows the most recently started one.
 *
 * The buttons are UIKit Buttons that emit directly (no MiseFlowButtonTrigger: its name-based fallback would map
 * unknown Btn_* names to legacy STEP_CHOP). For LEAF / automation call CookStepCard.getInstance().press("DO_STEP" |
 * "AUTO"); the same handlers are registered as MiseFlowButtonTrigger actions COOK_DO_STEP / COOK_AUTO.
 */

import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { MiseFlowEventBus, MiseFlowEventType } from "../MiseFlowEventBus";
import { MiseFlowButtonTrigger } from "../MiseFlowButtonTrigger";
import {
  KIT, KitButton, KitGlass, animateKitButtons, applyKitGlass, easeOutBack, kitCard, kitGlass, kitText, placeInView, smooth, styleKitButton, withAlpha,
} from "../StudioCardKit";
import { CookEvents } from "./CookWorld";
import { CookRuntime, CookRuntimeEvents } from "./CookRuntime";

const CARD_W = 10.4;
const CARD_H = 6.8;
const MAX_DOTS = 14;
const IN_SEC = 0.3;
const BTN_W = 4.4;
const BTN_H = 1.05;

const ACTION_LABEL: { [a: string]: string } = {
  CUT: "CUT", MARINATE: "MARINATE", MIX: "MIX", COAT: "COAT", HEAT_OIL: "HEAT OIL", DEEP_FRY: "DEEP FRY", SHALLOW_FRY: "SHALLOW FRY",
  SAUTE_TOSS: "TOSS", TEMPER: "TEMPER", SIMMER: "SIMMER", BOIL: "BOIL", ROLL_DOUGH: "ROLL", KNEAD: "KNEAD", COOK_FLAT: "COOK", FLIP: "FLIP",
  STEAM_DUM: "DUM", WHISK: "WHISK", POUR: "POUR", SEASON: "SEASON", REST: "REST", PLATE: "PLATE", GARNISH: "GARNISH", GENERIC: "COOK",
};

function accentOf(action: string): vec4 {
  switch (action) {
    case "HEAT_OIL": case "DEEP_FRY": case "SHALLOW_FRY": case "SAUTE_TOSS": case "TEMPER": case "COOK_FLAT": case "FLIP":
      return KIT.AMBER;
    case "SIMMER": case "BOIL": case "STEAM_DUM": case "POUR": case "WHISK":
      return KIT.CYAN;
    case "PLATE": case "GARNISH":
      return KIT.VIOLET;
    default:
      return KIT.EMERALD;
  }
}

function ev(name: string): MiseFlowEventType {
  return name as unknown as MiseFlowEventType;
}

type DotState = "pending" | "running" | "done";

@component
export class CookStepCard extends BaseScriptComponent {
  private static instance: CookStepCard | null = null;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private root: SceneObject | null = null;
  private cardGlass: KitGlass | null = null;
  private glasses: KitGlass[] = [];
  private buttons: KitButton[] = [];
  private idxText: Text | null = null;
  private actionText: Text | null = null;
  private titleText: Text | null = null;
  private bodyText: Text | null = null;
  private nextText: Text | null = null;
  private dots: KitGlass[] = [];
  private doBtn: KitButton | null = null;
  private autoBtn: KitButton | null = null;

  private visible: boolean = false;
  private total: number = 0;
  private dotState: DotState[] = [];
  private shownStep: string = "";
  private auto: boolean = false;
  private finished: boolean = false;
  private animK: number = 1;
  private warmup: number = 0;

  public static getInstance(): CookStepCard | null {
    return CookStepCard.instance;
  }

  onAwake(): void {
    CookStepCard.instance = this;
    MiseFlowButtonTrigger.registerAction("COOK_DO_STEP", () => this.press("DO_STEP"));
    MiseFlowButtonTrigger.registerAction("COOK_AUTO", () => this.press("AUTO"));
    this.listen(CookEvents.WORLD_READY, (d?: any) => this.onWorldReady(d));
    this.listen(CookEvents.STEP_STARTED, (d?: any) => this.onStarted(d));
    this.listen(CookEvents.STEP_DONE, (d?: any) => this.onDone(d));
    this.listen(CookEvents.FINISHED, () => this.onFinished());
    this.listen(CookEvents.EXIT, () => this.hide());
    this.listen(CookRuntimeEvents.MODE, (d?: any) => {
      this.auto = !!d && !!d.auto;
      this.refreshButtons();
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (CookStepCard.instance === this) CookStepCard.instance = null;
    });
  }

  // ───────────────────────── public API ─────────────────────────

  /** Same as pinching the button. */
  public press(kind: "DO_STEP" | "AUTO"): void {
    if (!this.visible) return;
    if (kind === "DO_STEP") {
      if (this.auto || this.finished) return;
      this.bus.emit(ev(CookRuntimeEvents.DO_STEP), {});
    } else {
      this.bus.emit(ev(CookRuntimeEvents.AUTO), { on: !this.auto });
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public getShownStepId(): string {
    return this.shownStep;
  }

  /** {visible, step, title, index text, auto, dots} for tests. */
  public getSnapshot(): any {
    return {
      visible: this.visible,
      step: this.shownStep,
      title: this.titleText ? this.titleText.text : "",
      index: this.idxText ? this.idxText.text : "",
      auto: this.auto,
      finished: this.finished,
      dots: this.dotState.slice(),
    };
  }

  // ───────────────────────── events ─────────────────────────

  private listen(name: string, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[CookStepCard] ${name} handler error: ${e}`);
      }
    };
    this.bus.on(ev(name), safe);
    this.handlers.push({ ev: ev(name), cb: safe });
  }

  private onWorldReady(d?: any): void {
    const world = d ? d.world : null;
    const plan = world ? world.plan : null;
    this.ensureBuilt();
    this.total = plan && Array.isArray(plan.steps) ? plan.steps.length : 0;
    this.dotState = [];
    for (let i = 0; i < this.total; i++) this.dotState.push("pending");
    this.finished = false;
    this.shownStep = "";
    this.setTexts(`${this.total} STEPS`, "", plan ? String(plan.dishTitle || "Ready to cook") : "Ready to cook", "Pinch Do step for one step at a time, or Auto to cook the whole dish.", KIT.EMERALD);
    // CookRuntime may not have started this world yet (listener order): read the first step from the plan itself
    if (this.nextText) {
      const first = plan && Array.isArray(plan.steps) && plan.steps.length > 0 ? plan.steps[0] : null;
      this.nextText.text = first ? `NEXT: ${String(first.title || first.action || "").slice(0, 44)}` : "";
    }
    this.show();
  }

  private onStarted(d?: any): void {
    if (!d || !this.root) return;
    const i = typeof d.index === "number" ? d.index : -1;
    const total = typeof d.total === "number" ? d.total : this.total;
    if (total !== this.total) {
      this.total = total;
      while (this.dotState.length < total) this.dotState.push("pending");
    }
    if (i >= 0 && i < this.dotState.length) this.dotState[i] = "running";
    this.shownStep = String(d.stepId || "");
    const action = String(d.action || "GENERIC");
    this.setTexts(`STEP ${i + 1}/${total}`, ACTION_LABEL[action] || action, String(d.title || ""), String(d.whatWhy || ""), accentOf(action));
    if (!this.visible) this.show();
    else this.animK = 0.55; // small pop for the new step
  }

  private onDone(d?: any): void {
    if (!d) return;
    const i = typeof d.index === "number" ? d.index : -1;
    if (i >= 0 && i < this.dotState.length) this.dotState[i] = "done";
    this.layoutDots();
    this.refreshNext();
  }

  private onFinished(): void {
    this.finished = true;
    for (let i = 0; i < this.dotState.length; i++) this.dotState[i] = "done";
    this.setTexts(`${this.total}/${this.total} DONE`, "PLATED", "Dish complete", "Every step is done. Serve it while it is hot.", KIT.VIOLET);
    this.refreshButtons();
  }

  // ───────────────────────── view ─────────────────────────

  private ensureBuilt(): void {
    if (this.root && !isNull(this.root)) return;
    // Scene root, NOT under DiegeticLayer: that layer lives under StationsRoot, which is collapsed (scale ~0) in Cook mode.
    const root = global.scene.createSceneObject("CookStepCard");
    root.createComponent("Component.Canvas");
    this.root = root;
    this.cardGlass = kitCard(root, "CookStepCard_Glass", new vec3(0, 0, -0.1), new vec2(CARD_W, CARD_H), KIT.EMERALD, this.glasses);
    const inner = CARD_W - 0.9;
    const top = CARD_H / 2;
    this.idxText = kitText(root, "CookStepCard_Index", "", 26, KIT.EMERALD, new vec3(-inner / 2 + 2.2, top - 0.55, 0.03), 4.4, 0.7, { align: "left", weight: 800 });
    this.actionText = kitText(root, "CookStepCard_Action", "", 24, KIT.MUTED, new vec3(inner / 2 - 2.0, top - 0.55, 0.03), 4.0, 0.7, { align: "right", weight: 800 });
    this.titleText = kitText(root, "CookStepCard_Title", "", 42, KIT.TEXT, new vec3(0, top - 1.4, 0.03), inner, 0.95, { align: "left", weight: 800 });
    this.bodyText = kitText(root, "CookStepCard_Body", "", 26, withAlpha(KIT.TEXT, 0.86), new vec3(0, top - 2.65, 0.03), inner, 1.4, { align: "left", wrap: true, weight: 600 });
    this.nextText = kitText(root, "CookStepCard_Next", "", 24, KIT.GOLD, new vec3(0, -0.4, 0.03), inner, 0.7, { align: "left", weight: 800 });
    const prog = global.scene.createSceneObject("CookStepCard_Progress");
    prog.setParent(root);
    prog.getTransform().setLocalPosition(new vec3(0, -CARD_H / 2 + 2.05, 0.02));
    for (let i = 0; i < MAX_DOTS; i++) {
      const g = kitGlass(prog, `CookStepCard_Dot_${i}`, vec3.zero(), new vec2(0.26, 0.26), withAlpha(KIT.GLASS, 0.9), withAlpha(KIT.MUTED, 0.5), 0.03, 0.13, this.glasses);
      g.obj.enabled = false;
      this.dots.push(g);
    }
    const by = -CARD_H / 2 + 0.85;
    this.doBtn = this.makeButton(root, "Btn_CookDoStep", "DO STEP", KIT.EMERALD, new vec3(-BTN_W / 2 - 0.3, by, 0.05), () => this.press("DO_STEP"), true);
    this.autoBtn = this.makeButton(root, "Btn_CookAuto", "AUTO: OFF", KIT.AMBER, new vec3(BTN_W / 2 + 0.3, by, 0.05), () => this.press("AUTO"), false);
    // The Director palette is collapsed with StationsRoot in Cook mode, so the card carries the way out / the way to a new dish.
    const ey = -CARD_H / 2 - 0.85;
    this.makeButton(root, "Btn_CookNewDish", "NEW DISH", KIT.VIOLET, new vec3(-BTN_W / 2 - 0.3, ey, 0.05), () => this.bus.emit(ev("COOK_NEW_DISH"), {}), false);
    this.makeButton(root, "Btn_CookExit", "EXIT", KIT.CORAL, new vec3(BTN_W / 2 + 0.3, ey, 0.05), () => this.bus.emit("RESET_REQUESTED"), false);
    root.enabled = false;
    this.warmup = 8;
  }

  /** kitButton without MiseFlowButtonTrigger (see header). */
  private makeButton(parent: SceneObject, name: string, label: string, accent: vec4, pos: vec3, onPress: () => void, primary: boolean): KitButton {
    const holder = global.scene.createSceneObject(`${name}_Holder`);
    holder.setParent(parent);
    holder.getTransform().setLocalPosition(pos);
    const frame = kitGlass(holder, `${name}_Frame`, new vec3(0, 0, -0.05), new vec2(BTN_W, BTN_H), withAlpha(KIT.GLASS, 0.9), withAlpha(accent, 0.92), 0.06, Math.min(KIT.BUTTON_RADIUS, BTN_H * 0.2), this.glasses);
    const txt = kitText(holder, `${name}_Label`, label, 34, KIT.TEXT, new vec3(0, 0, 0.06), BTN_W - 0.3, BTN_H);
    const obj = global.scene.createSceneObject(name);
    obj.setParent(holder);
    const kb: KitButton = { obj: holder, frame, accent, label: txt, hovered: false, pressed: false, dim: false, primary, scale: 1 };
    try {
      const btn = obj.createComponent(Button.getTypeName()) as Button;
      btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "Ghost" });
      btn.size = new vec3(BTN_W, BTN_H, 0.3);
      btn.onHoverEnter.add(() => { kb.hovered = true; styleKitButton(kb); });
      btn.onHoverExit.add(() => { kb.hovered = false; kb.pressed = false; styleKitButton(kb); });
      btn.onTriggerDown.add(() => { kb.pressed = true; styleKitButton(kb); });
      btn.onTriggerUp.add(() => {
        kb.pressed = false;
        styleKitButton(kb);
        if (!kb.dim) onPress();
      });
    } catch (e) {
      print(`[CookStepCard] UIKit button unavailable (${e}); use press()`);
    }
    styleKitButton(kb);
    this.buttons.push(kb);
    return kb;
  }

  private setTexts(idx: string, action: string, title: string, body: string, accent: vec4): void {
    if (this.idxText) {
      this.idxText.text = idx;
      this.idxText.textFill.color = accent;
    }
    if (this.actionText) this.actionText.text = action;
    if (this.titleText) this.titleText.text = title;
    if (this.bodyText) this.bodyText.text = body;
    this.refreshNext();
    if (this.cardGlass) {
      this.cardGlass.border = withAlpha(accent, 0.92);
      applyKitGlass(this.cardGlass);
    }
    this.layoutDots();
    this.refreshButtons();
  }

  /** "NEXT: <title>" for the first step that has not started yet (what the next pinch will do). */
  private refreshNext(): void {
    if (!this.nextText) return;
    let txt = "";
    try {
      const rt = CookRuntime.getInstance();
      const w = rt ? rt.getWorld() : null;
      if (rt && w && !this.finished) {
        const pend = rt.getState().pending;
        if (pend.length > 0) {
          for (const s of w.plan.steps || []) {
            if (s && s.id === pend[0]) {
              txt = `NEXT: ${String(s.title || s.action || "").slice(0, 44)}`;
              break;
            }
          }
        }
      }
    } catch (e) {
      txt = "";
    }
    this.nextText.text = txt;
  }

  private layoutDots(): void {
    const n = Math.min(MAX_DOTS, this.total);
    const gap = 0.52;
    const x0 = -((n - 1) * gap) / 2;
    for (let d = 0; d < this.dots.length; d++) {
      const g = this.dots[d];
      if (d >= n) {
        g.obj.enabled = false;
        continue;
      }
      g.obj.enabled = true;
      const st = this.dotState[d] || "pending";
      const running = st === "running";
      const done = st === "done";
      const size = running ? 0.36 : 0.26;
      g.rr.size = new vec2(size, size);
      g.radius = size / 2;
      g.bg = done ? withAlpha(KIT.EMERALD, 0.95) : running ? withAlpha(KIT.AMBER, 0.6) : withAlpha(KIT.GLASS, 0.9);
      g.border = running ? withAlpha(KIT.TEXT, 1) : withAlpha(done ? KIT.EMERALD : KIT.MUTED, done ? 0.95 : 0.5);
      g.borderSize = running ? 0.05 : 0.03;
      g.obj.getTransform().setLocalPosition(new vec3(x0 + d * gap, 0, 0));
      applyKitGlass(g);
    }
  }

  private refreshButtons(): void {
    if (this.autoBtn && this.autoBtn.label) this.autoBtn.label.text = this.auto ? "AUTO: ON" : "AUTO: OFF";
    if (this.autoBtn) {
      this.autoBtn.primary = this.auto;
      this.autoBtn.dim = this.finished;
      styleKitButton(this.autoBtn);
    }
    if (this.doBtn) {
      this.doBtn.dim = this.auto || this.finished;
      styleKitButton(this.doBtn);
    }
  }

  private show(): void {
    this.ensureBuilt();
    const r = this.root;
    if (!r) return;
    r.enabled = true;
    this.visible = true;
    this.animK = 0;
    this.warmup = 8;
    try {
      placeInView(r, CARD_W / 0.32, CARD_H / 0.32, 1.0, 0.31, 26, 80); // high above the bench, readable in a 1080p recording
    } catch (e) {
      print(`[CookStepCard] placeInView failed: ${e}`);
    }
  }

  private hide(): void {
    this.visible = false;
    this.shownStep = "";
    this.finished = false;
    if (this.root && !isNull(this.root)) this.root.enabled = false;
  }

  private onUpdate(): void {
    const r = this.root;
    if (!r || !this.visible || !r.enabled) return;
    const dt = getDeltaTime();
    if (this.animK < 1) {
      this.animK = Math.min(1, this.animK + dt / IN_SEC);
      const k = Math.max(0.001, this.animK >= 1 ? 1 : easeOutBack(smooth(this.animK)));
      r.getTransform().setLocalScale(new vec3(k, k, k));
    }
    animateKitButtons(this.buttons, dt);
    if (this.warmup > 0) {
      this.warmup--;
      for (const g of this.glasses) applyKitGlass(g);
    }
  }
}
