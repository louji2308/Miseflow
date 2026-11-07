import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { MiseFlowButtonTrigger } from "./MiseFlowButtonTrigger";
import { createWorldIcon } from "./DAGCounterConduit";
import { getPreset } from "./AI/DishLibraryConfig";
import { AssetPageTable } from "./AI/AssetPageTable";
import { CookbookCardSpec, StationFocus, UniversalDishBlueprint } from "./AI/UniversalDishSchema";
import {
  KIT, KitButton, KitGlass, animateKitButtons, applyKitGlass, kitButton, kitCard, kitGlass, kitText, smooth, styleKitButton, withAlpha,
} from "./StudioCardKit";

/**
 * SpatialBriefingDeck.ts  (v5 P5 – Dish Studio card deck; replaces the WS15 capsule + spotlight ring)
 * ONE near-square card at a time from blueprint.cookbookCards: "DISH TITLE - STEP n/4", headline, instruction,
 * "why it works" (masteryWhy), a tiny step progress row and the real page-table DMA status line (shrink-to-fit).
 * Controls: Btn_BriefingPrev "<", Btn_BriefingNext ">", Btn_BriefingSkip, and on the LAST card Btn_LetsCook
 * replaces ">" (">" on the last card = Let's cook as well). Skip / Let's cook -> BRIEFING_COMPLETED { dishId, skipped }.
 * Slide + fade between cards. The deck lives inside DishStudioRoot (DishStudio.attach): the setup stays hidden while
 * cards are shown. DishStudio opens it (openDeck) once a blueprint is identified; CLOSED at boot and after Reset.
 * Never throws out of event handlers.
 */

const ICON_CUT = requireAsset("../Icons/content_cut.png") as Texture;
const ICON_FIRE = requireAsset("../Icons/local_fire_department.png") as Texture;
const ICON_POT = requireAsset("../Icons/stockpot.png") as Texture;
const ICON_CLOCHE = requireAsset("../Icons/room_service.png") as Texture;

// Card geometry (cm, studio canvas units)
const CARD_W = 22.0;
const CARD_H = 15.4;
const CARD_Y = 1.6;
const CTRL_Y = -8.6;
const BTN_H = 2.0;
const MAX_DOTS = 9;
const TRANSITION_SEC = 0.24;

interface Focus {
  color: vec4;
  icon: Texture;
  word: string;
}

const FOCUS: { [k: string]: Focus } = {
  PREP: { color: KIT.CYAN, icon: ICON_CUT, word: "PREP" },
  SKILLET: { color: KIT.GOLD, icon: ICON_FIRE, word: "SKILLET" },
  SAUCEPOT: { color: KIT.VIOLET, icon: ICON_POT, word: "SAUCE" },
  PLATING: { color: KIT.EMERALD, icon: ICON_CLOCHE, word: "PLATING" },
};

interface FadeText {
  t: Text;
  base: vec4;
}

@component
export class SpatialBriefingDeck extends BaseScriptComponent {
  private static instance: SpatialBriefingDeck | null = null;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: any; cb: (d?: any) => void }[] = [];

  private blueprint: UniversalDishBlueprint = getPreset(0);
  private statusLine: string = "";
  private stagedReady: number = 0;
  private stagedTotal: number = 0;
  private cardIndex: number = 0;
  private open: boolean = false;
  private warmup: number = 0;
  private transT: number = 1;
  private transDir: number = 0;

  private deckRoot?: SceneObject;
  private content?: SceneObject;
  private glasses: KitGlass[] = [];
  private card?: KitGlass;
  private fades: FadeText[] = [];
  private titleText?: Text;
  private stepText?: Text;
  private headlineText?: Text;
  private instructionText?: Text;
  private whyLabel?: Text;
  private whyText?: Text;
  private statusText?: Text;
  private stationIcon?: Image;
  private dots: KitGlass[] = [];
  private buttons: KitButton[] = [];
  private prevBtn?: KitButton;
  private nextBtn?: KitButton;
  private letsCookBtn?: KitButton;

  public static getInstance(): SpatialBriefingDeck | null {
    return SpatialBriefingDeck.instance;
  }

  onAwake(): void {
    SpatialBriefingDeck.instance = this;
    this.buildDeck();
    MiseFlowButtonTrigger.registerAction("BRIEFING_PREV", () => this.prevCard());
    MiseFlowButtonTrigger.registerAction("BRIEFING_NEXT", () => this.nextCard());
    MiseFlowButtonTrigger.registerAction("BRIEFING_SKIP", () => this.skipAndStartCook());
    MiseFlowButtonTrigger.registerAction("LETS_COOK", () => this.letsCook());

    this.createEvent("OnStartEvent").bind(() => {
      this.listen("RESET_REQUESTED", () => this.closeDeck());
      this.listen("DISH_ITEM_READY", (d?: any) => {
        if (!d) return;
        this.stagedReady = Math.max(this.stagedReady, (d.index || 0) + 1);
        this.stagedTotal = d.total || this.stagedTotal;
        this.refreshStatus();
      });
      this.listen("DISH_LOAD_STAGED", (d?: any) => {
        this.stagedReady = 0;
        this.stagedTotal = d && d.total ? d.total : 0;
        this.refreshStatus();
      });
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
      if (SpatialBriefingDeck.instance === this) SpatialBriefingDeck.instance = null;
    });
  }

  // ───────────────────────── public API ─────────────────────────

  /** DishStudio parents the deck into DishStudioRoot (the setup is hidden while the cards are shown). */
  public attachTo(parent: SceneObject): void {
    if (this.deckRoot) this.deckRoot.setParent(parent);
  }

  public isOpen(): boolean {
    return this.open;
  }

  public getCardIndex(): number {
    return this.cardIndex;
  }

  public getCardCount(): number {
    return this.cards().length;
  }

  public isLastCard(): boolean {
    return this.cardIndex >= this.cards().length - 1;
  }

  public getHeaderText(): string {
    return this.titleText && this.stepText ? `${this.titleText.text} ${this.stepText.text}` : "";
  }

  /** The real AssetPageTable status line of the dish's batch load. */
  public getStatusLine(): string {
    return this.statusLine;
  }

  public getDishId(): string {
    return this.blueprint.dishId;
  }

  public openDeck(bp: UniversalDishBlueprint, statusLine: string): void {
    if (!this.deckRoot) return;
    this.blueprint = bp;
    this.statusLine = statusLine && statusLine.length > 0 ? statusLine : AssetPageTable.getStats().statusLine;
    this.open = true;
    this.deckRoot.enabled = true;
    this.warmup = 8; // UIKit shapes re-assert their style for a few frames after enable
    this.setCard(0, 0);
    print(`[BriefingDeck] open ${bp.dishId} (${this.cards().length} cards) | ${this.statusLine}`);
  }

  public closeDeck(): void {
    this.open = false;
    if (this.deckRoot) this.deckRoot.enabled = false;
  }

  public prevCard(): void {
    if (!this.open || this.cardIndex <= 0) return;
    this.setCard(this.cardIndex - 1, -1);
  }

  public nextCard(): void {
    if (!this.open) return;
    if (this.isLastCard()) {
      this.complete(false);
      return;
    }
    this.setCard(this.cardIndex + 1, 1);
  }

  public skipAndStartCook(): void {
    if (!this.open) return;
    this.complete(true);
  }

  public letsCook(): void {
    if (!this.open) return;
    this.complete(false);
  }

  // ───────────────────────── state ─────────────────────────

  private listen(ev: any, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[BriefingDeck] ${ev} handler error: ${e}`);
      }
    };
    this.eventBus.on(ev, safe);
    this.handlers.push({ ev, cb: safe });
  }

  private cards(): CookbookCardSpec[] {
    const c = this.blueprint && this.blueprint.cookbookCards ? (this.blueprint.cookbookCards as CookbookCardSpec[]) : [];
    return c.length > 0 ? c : (getPreset(0).cookbookCards as CookbookCardSpec[]);
  }

  private complete(skipped: boolean): void {
    const cards = this.cards();
    this.closeDeck();
    this.eventBus.emit("BRIEFING_COMPLETED", { dishId: this.blueprint.dishId, skipped: skipped });
    const first = cards[0];
    this.eventBus.emit("CHEF_COACH_SPEAK", { text: first ? first.masteryWhy : "Mise en place first.", category: "PREP" });
    print(`[BriefingDeck] completed ${this.blueprint.dishId} (skipped ${skipped})`);
  }

  private refreshStatus(): void {
    if (!this.statusText) return;
    const base = this.statusLine.length > 0 ? this.statusLine : AssetPageTable.getStats().statusLine;
    const staging = this.stagedTotal > 0 ? (this.stagedReady >= this.stagedTotal ? ` • ${this.stagedTotal}/${this.stagedTotal} STAGED` : ` • STAGING ${this.stagedReady}/${this.stagedTotal}`) : "";
    this.statusText.text = base + staging;
  }

  private setCard(i: number, dir: number): void {
    const cards = this.cards();
    const total = cards.length;
    this.cardIndex = Math.max(0, Math.min(total - 1, i));
    const card = cards[this.cardIndex];
    const focusKey: StationFocus = card && card.stationFocus ? card.stationFocus : "PREP";
    const f = FOCUS[focusKey] || FOCUS.PREP;
    const last = this.cardIndex === total - 1;

    if (this.titleText) this.titleText.text = `${this.blueprint.dishTitle} -`;
    if (this.stepText) {
      this.stepText.text = `STEP ${this.cardIndex + 1}/${total}`;
      this.setFadeBase(this.stepText, f.color);
    }
    if (this.headlineText) this.headlineText.text = card ? card.headline : "";
    if (this.instructionText) this.instructionText.text = card ? card.instruction : "";
    if (this.whyLabel) {
      this.whyLabel.text = `WHY IT WORKS  •  ${f.word}`;
      this.setFadeBase(this.whyLabel, f.color);
    }
    if (this.whyText) this.whyText.text = card ? card.masteryWhy : "";
    this.refreshStatus();
    if (this.stationIcon) {
      this.stationIcon.mainMaterial.mainPass.baseTex = f.icon;
      this.stationIcon.mainMaterial.mainPass.baseColor = f.color;
    }
    if (this.card) {
      this.card.border = withAlpha(f.color, 0.9);
      applyKitGlass(this.card);
    }
    this.layoutDots(total, f.color);
    if (this.prevBtn) {
      this.prevBtn.dim = this.cardIndex === 0;
      styleKitButton(this.prevBtn);
    }
    if (this.nextBtn) this.nextBtn.obj.enabled = !last;
    if (this.letsCookBtn) this.letsCookBtn.obj.enabled = last;
    if (last) this.warmup = Math.max(this.warmup, 4);

    this.transDir = dir;
    this.transT = dir === 0 ? 0.35 : 0;
    this.applyTransition();
    this.eventBus.emit("BRIEFING_CARD_CHANGED", { cardIndex: this.cardIndex, totalCards: total, stationFocus: focusKey });
  }

  private setFadeBase(t: Text, c: vec4): void {
    for (const fd of this.fades) if (fd.t === t) fd.base = c;
  }

  private layoutDots(total: number, color: vec4): void {
    const n = Math.min(MAX_DOTS, total);
    const small = 0.42;
    const wide = 1.15;
    const gap = 0.28;
    let w = 0;
    for (let i = 0; i < n; i++) w += (i === this.cardIndex ? wide : small) + (i < n - 1 ? gap : 0);
    let x = -w / 2;
    for (let i = 0; i < this.dots.length; i++) {
      const d = this.dots[i];
      if (i >= n) {
        d.obj.enabled = false;
        continue;
      }
      d.obj.enabled = true;
      const active = i === this.cardIndex;
      const dw = active ? wide : small;
      d.rr.size = new vec2(dw, small);
      d.obj.getTransform().setLocalPosition(new vec3(x + dw / 2, CTRL_Y, 0.02));
      d.bg = active ? withAlpha(color, 1) : i < this.cardIndex ? withAlpha(color, 0.45) : withAlpha(KIT.MUTED, 0.25);
      d.border = active ? withAlpha(KIT.TEXT, 0.9) : withAlpha(KIT.MUTED, 0.4);
      applyKitGlass(d);
      x += dw + gap;
    }
  }

  // ───────────────────────── construction ─────────────────────────

  private fadeText(parent: SceneObject, name: string, content: string, size: number, color: vec4, pos: vec3, w: number, h: number, wrap: boolean, align: "left" | "center" | "right" = "center", weight: number = 700): Text {
    const t = kitText(parent, name, content, size, color, pos, w, h, { wrap, align, weight });
    this.fades.push({ t, base: color });
    return t;
  }

  private buildDeck(): void {
    const root = global.scene.createSceneObject("BriefingDeckUI");
    root.setParent(this.getSceneObject());
    this.deckRoot = root;

    this.card = kitCard(root, "BriefingDeck_Card", new vec3(0, CARD_Y, -0.1), new vec2(CARD_W, CARD_H), KIT.CYAN, this.glasses);
    const top = CARD_Y + CARD_H / 2;
    kitGlass(root, "BriefingDeck_Rule", new vec3(0, top - 2.3, -0.05), new vec2(CARD_W - 1.6, 0.04), withAlpha(KIT.MUTED, 0.35), withAlpha(KIT.MUTED, 0.35), 0, 0.02, this.glasses);
    kitGlass(root, "BriefingDeck_RuleLow", new vec3(0, CARD_Y - CARD_H / 2 + 1.55, -0.05), new vec2(CARD_W - 1.6, 0.04), withAlpha(KIT.MUTED, 0.25), withAlpha(KIT.MUTED, 0.25), 0, 0.02, this.glasses);

    const content = global.scene.createSceneObject("BriefingDeck_Content");
    content.setParent(root);
    this.content = content;
    const left = -CARD_W / 2 + 0.8;
    this.stationIcon = createWorldIcon(content, "BriefingDeck_Icon", ICON_CUT, 1.35, new vec3(left + 0.7, top - 1.15, 0.03), KIT.CYAN);
    this.titleText = this.fadeText(content, "BriefingDeck_Header", "", 40, KIT.TEXT, new vec3(left + 1.7 + 6.6, top - 1.15, 0.03), 13.2, 1.3, false, "left", 800);
    this.stepText = this.fadeText(content, "BriefingDeck_HeaderStep", "", 40, KIT.CYAN, new vec3(CARD_W / 2 - 0.8 - 2.8, top - 1.15, 0.03), 5.6, 1.3, false, "right", 800);
    this.headlineText = this.fadeText(content, "BriefingDeck_Headline", "", 66, KIT.TEXT, new vec3(0, top - 4.0, 0.03), CARD_W - 2.0, 2.0, false, "center", 800);
    this.instructionText = this.fadeText(content, "BriefingDeck_Body", "", 44, KIT.TEXT, new vec3(0, top - 7.0, 0.03), CARD_W - 2.4, 3.2, true, "center", 600);
    this.whyLabel = this.fadeText(content, "BriefingDeck_WhyLabel", "WHY IT WORKS", 26, KIT.CYAN, new vec3(0, top - 9.4, 0.03), CARD_W - 2.4, 0.8, false, "center", 800);
    this.whyText = this.fadeText(content, "BriefingDeck_Why", "", 38, KIT.GOLD, new vec3(0, top - 11.0, 0.03), CARD_W - 2.4, 2.2, true, "center", 600);
    this.statusText = this.fadeText(content, "BriefingDeck_DmaStatus", "", 26, KIT.EMERALD, new vec3(0, CARD_Y - CARD_H / 2 + 0.8, 0.03), CARD_W - 1.6, 0.8, false, "center", 700);

    for (let i = 0; i < MAX_DOTS; i++) {
      const d = kitGlass(root, `BriefingDeck_Dot_${i}`, new vec3(0, CTRL_Y, 0.02), new vec2(0.42, 0.42), withAlpha(KIT.MUTED, 0.25), withAlpha(KIT.MUTED, 0.4), 0.03, 0.08, this.glasses);
      this.dots.push(d);
    }

    const controls = global.scene.createSceneObject("BriefingDeck_Controls");
    controls.setParent(root);
    this.prevBtn = kitButton(controls, "Btn_BriefingPrev", "<", KIT.NEUTRAL, new vec3(-3.9, CTRL_Y, 0.05), 2.4, BTN_H, 64, this.buttons, this.glasses);
    this.nextBtn = kitButton(controls, "Btn_BriefingNext", ">", KIT.VIOLET, new vec3(3.9, CTRL_Y, 0.05), 2.4, BTN_H, 64, this.buttons, this.glasses, true);
    this.letsCookBtn = kitButton(controls, "Btn_LetsCook", "LET'S COOK", KIT.EMERALD, new vec3(4.6, CTRL_Y, 0.05), 5.2, BTN_H, 42, this.buttons, this.glasses, true);
    kitButton(controls, "Btn_BriefingSkip", "Skip", KIT.NEUTRAL, new vec3(CARD_W / 2 - 1.6, CTRL_Y, 0.05), 3.2, BTN_H * 0.8, 34, this.buttons, this.glasses);
    this.letsCookBtn.obj.enabled = false;

    this.setCard(0, 0);
    root.enabled = false;
  }

  // ───────────────────────── per frame ─────────────────────────

  private applyTransition(): void {
    if (!this.content) return;
    const e = smooth(this.transT);
    this.content.getTransform().setLocalPosition(new vec3(this.transDir * 2.2 * (1 - e), 0, 0));
    for (const fd of this.fades) fd.t.textFill.color = withAlpha(fd.base, fd.base.a * e);
    if (this.stationIcon) {
      const c = this.stationIcon.mainMaterial.mainPass.baseColor;
      this.stationIcon.mainMaterial.mainPass.baseColor = new vec4(c.r, c.g, c.b, e);
    }
  }

  private onUpdate(): void {
    if (!this.open) return;
    const dt = getDeltaTime();
    if (this.warmup > 0) {
      this.warmup--;
      for (const g of this.glasses) applyKitGlass(g);
      for (const b of this.buttons) styleKitButton(b);
    }
    if (this.transT < 1) {
      this.transT = Math.min(1, this.transT + dt / TRANSITION_SEC);
      this.applyTransition();
    }
    animateKitButtons(this.buttons, dt);
  }
}
