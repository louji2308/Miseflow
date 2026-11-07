import { MiseFlowEventBus, MiseFlowEventType, StudioTextSubmittedPayload } from "./MiseFlowEventBus";
import { MiseFlowButtonTrigger } from "./MiseFlowButtonTrigger";
import { AutoCookController } from "./AutoCookController";
import { SpatialBriefingDeck } from "./SpatialBriefingDeck";
import { VoiceSousChefController } from "./VoiceSousChefController";
import { createWorldIcon } from "./DAGCounterConduit";
import { RecipeCompilerService } from "./AI/RecipeCompilerService";
import { getPreset, nextPresetIndex, PRESET_COUNT } from "./AI/DishLibraryConfig";
import { NOT_FOUND_MESSAGE, UniversalDishBlueprint } from "./AI/UniversalDishSchema";
import {
  KIT, KitButton, KitGlass, animateKitButtons, applyKitGlass, kitButton, kitCard, kitText, placeInView, styleKitButton, withAlpha,
} from "./StudioCardKit";

/**
 * DishStudio.ts  (v5 P5 – full-view Dish Studio mode controller)
 *
 * Tapping the AI Dish button (Btn_CycleDish) opens the studio: the WHOLE setup (everything under StationsRoot:
 * stations, props, pills, Director HUD, banner, steam, rings, conduits, beacons) is hidden WITHOUT being destroyed,
 * disabled or reset: StationsRoot's local scale is saved and set to ~0, so every script, DAG timer and state keeps
 * running untouched; exitStudio() writes the saved scale back (exact restore). The studio itself (DishStudioRoot)
 * is a scene-root object placed in front of the camera, so it is never affected.
 *
 * Screens: HOME (two large cards SPEAK / KEYBOARD, small Back in the corner, a small row of the 6 prebuilt dishes)
 * -> LISTENING (AsrModule one-shot) or TYPING (TextInputSystem keyboard) -> REVIEW ("Heard" + Edit for speech only /
 * "Typed", Confirm, Cancel) -> IDENTIFYING (DISH_COMPILE_REQUESTED) -> DECK (SpatialBriefingDeck cards) or back to
 * HOME with the exact not-found card. Let's cook / Skip (BRIEFING_COMPLETED) closes the studio; DishRevealDirector
 * then pops the staged dish in one by one. Back = the setup exactly as it was (no Reset). Closed at boot and Reset.
 *
 * NOTE: the AR keyboard does not render in the Lens Studio Preview with the SPECS 27 simulation. The testable path
 * is the bus: emit STUDIO_TEXT_SUBMITTED { text, source: "KEYBOARD" | "SPEECH" } (LEAF does this) to land on the
 * review card exactly as the keyboard's Done / the ASR final transcript would.
 * Auto Cook is cancelled and ignored while the studio is open. Never throws out of handlers.
 */

const ICON_MIC = requireAsset("../Icons/mic.png") as Texture;
const ICON_KEYBOARD = requireAsset("../Icons/keyboard.png") as Texture;
const ICON_SPIN = requireAsset("../Icons/progress_activity.png") as Texture;

// Studio canvas (cm at the fitted distance)
const CANVAS_W = 24.0; // ~ the Specs display aspect (0.875): fills the visible AR frame
const CANVAS_H = 25.0;
const HIDDEN_SCALE = 0.0001;
const MIN_IDENTIFY_SEC = 0.45;

const CHIP_LABELS = ["SALMON", "BIRYANI", "HAKKA NOODLES", "RIBEYE", "PANEER TIKKA", "PRAWN PASTA"];

export type StudioScreen = "CLOSED" | "HOME" | "LISTENING" | "TYPING" | "REVIEW" | "IDENTIFYING" | "DECK";

function findUp(o: SceneObject, name: string): SceneObject | null {
  let cur: SceneObject | null = o;
  while (cur) {
    if (cur.name === name) return cur;
    cur = cur.hasParent() ? cur.getParent() : null;
  }
  return null;
}

@component
export class DishStudio extends BaseScriptComponent {
  private static instance: DishStudio | null = null;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private screen: StudioScreen = "CLOSED";
  private stationsRoot: SceneObject | null = null;
  private savedScale: vec3 | null = null;
  private clock: number = 0;
  private warmup: number = 0;

  private root?: SceneObject;
  private titleGroup?: SceneObject;
  private homeGroup?: SceneObject;
  private reviewGroup?: SceneObject;
  private statusGroup?: SceneObject;
  private deckSlot?: SceneObject;
  private glasses: KitGlass[] = [];
  private buttons: KitButton[] = [];

  private subtitle?: Text;
  private noticeObj?: SceneObject;
  private noticeGlass?: KitGlass;
  private noticeText?: Text;
  private notice: string = "";
  private backBtn?: KitButton;

  private reviewHeader?: Text;
  private reviewIcon?: Image;
  private reviewBody?: Text;
  private editBtn?: KitButton;
  private cancelBtn?: KitButton;
  private reviewText: string = "";
  private reviewSource: "SPEECH" | "KEYBOARD" = "KEYBOARD";

  private statusIconObj?: SceneObject;
  private statusIcon?: Image;
  private statusTitle?: Text;
  private statusDetail?: Text;
  private statusSpin: boolean = false;

  private draft: string = "";
  private kbSource: "SPEECH" | "KEYBOARD" = "KEYBOARD";
  private keyboardOpen: boolean = false;
  private identifyAt: number = 0;
  private pendingDeck: { bp: UniversalDishBlueprint; status: string; at: number } | null = null;

  public static getInstance(): DishStudio | null {
    return DishStudio.instance;
  }

  onAwake(): void {
    DishStudio.instance = this;
    this.build();
    const reg = (a: string, fn: () => void) => MiseFlowButtonTrigger.registerAction(a, fn);
    reg("STUDIO_SPEAK", () => this.startSpeech());
    reg("STUDIO_KEYBOARD", () => this.openKeyboard("", "KEYBOARD"));
    reg("STUDIO_BACK", () => this.back());
    reg("STUDIO_CONFIRM", () => this.confirm());
    reg("STUDIO_EDIT", () => this.edit());
    reg("STUDIO_CANCEL", () => this.goHome(""));
    reg("STUDIO_CANCELWAIT", () => this.cancelWait());
    for (let i = 0; i < PRESET_COUNT; i++) reg(`STUDIO_CHIP_${i}`, () => this.pickPreset(i));

    this.createEvent("OnStartEvent").bind(() => {
      this.resolveStationsRoot();
      const deck = SpatialBriefingDeck.getInstance();
      if (deck && this.deckSlot) deck.attachTo(this.deckSlot);
      this.listen("STUDIO_TEXT_SUBMITTED", (d?: StudioTextSubmittedPayload) => this.onTextSubmitted(d));
      this.listen("DISH_NOT_FOUND", () => this.onNotFound());
      this.listen("DISH_BLUEPRINT_APPLIED", (d?: any) => this.onBlueprint(d));
      this.listen("BRIEFING_COMPLETED", () => this.exitStudio(true));
      this.listen("RESET_REQUESTED", () => this.exitStudio(true));
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
      this.exitStudio(true);
      if (DishStudio.instance === this) DishStudio.instance = null;
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public isOpen(): boolean {
    return this.screen !== "CLOSED";
  }

  public getScreen(): StudioScreen {
    return this.screen;
  }

  /** Text of the notice card on HOME ("" when none); the not-found card reads exactly NOT_FOUND_MESSAGE. */
  public getNoticeText(): string {
    return this.notice;
  }

  public getReviewText(): string {
    return this.reviewText;
  }

  public getReviewHeader(): string {
    return this.reviewHeader ? this.reviewHeader.text : "";
  }

  public isEditAvailable(): boolean {
    return !!this.editBtn && this.editBtn.obj.enabled && this.screen === "REVIEW";
  }

  /** True while StationsRoot is collapsed (the setup is hidden, not destroyed). */
  public isSetupHidden(): boolean {
    return this.savedScale !== null;
  }

  /** AI Dish button: open the studio on its HOME screen. */
  public openHome(): void {
    this.enterStudio();
    this.goHome("");
  }

  /** Key 8 shortcut: open the studio and identify the next prebuilt dish straight away (card flow follows). */
  public quickCycle(): void {
    const c = this.compiler();
    const cur = c ? c.getCurrentPresetIndex() : 0;
    this.enterStudio();
    this.pickPreset(nextPresetIndex(cur < 0 ? 0 : cur));
  }

  /** Hides the whole setup (scale-to-zero of StationsRoot; nothing destroyed, disabled or reset) and shows the studio. */
  public enterStudio(): void {
    if (this.screen !== "CLOSED") return;
    this.resolveStationsRoot();
    if (this.stationsRoot && this.savedScale === null) {
      const tr = this.stationsRoot.getTransform();
      this.savedScale = tr.getLocalScale();
      tr.setLocalScale(new vec3(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE));
    }
    AutoCookController.setStudioLock(true);
    if (this.root) {
      placeInView(this.root, CANVAS_W, CANVAS_H, 1.04);
      this.root.enabled = true;
    }
    this.screen = "HOME";
    this.warmup = 8;
    print("[DishStudio] open (setup hidden, state kept)");
  }

  /** Closes the studio; restore = true writes StationsRoot's saved scale back (exactly the previous setup). */
  public exitStudio(restore: boolean = true): void {
    this.stopInputs();
    this.pendingDeck = null;
    const deck = SpatialBriefingDeck.getInstance();
    if (deck && deck.isOpen()) deck.closeDeck();
    if (restore && this.stationsRoot && this.savedScale !== null) {
      this.stationsRoot.getTransform().setLocalScale(this.savedScale);
      this.savedScale = null;
    }
    if (this.root) this.root.enabled = false;
    AutoCookController.setStudioLock(false);
    const was = this.screen;
    this.screen = "CLOSED";
    this.notice = "";
    if (was !== "CLOSED") {
      print("[DishStudio] closed (setup restored)");
      this.emitState();
    }
  }

  // ───────────────────────── flow ─────────────────────────

  private compiler(): RecipeCompilerService | null {
    return this.getSceneObject().getComponent(RecipeCompilerService.getTypeName()) as RecipeCompilerService;
  }

  private voice(): VoiceSousChefController | null {
    return this.getSceneObject().getComponent(VoiceSousChefController.getTypeName()) as VoiceSousChefController;
  }

  private back(): void {
    if (this.screen === "CLOSED" || this.screen === "DECK" || this.pendingDeck) return;
    if (this.screen === "IDENTIFYING") {
      const c = this.compiler();
      if (c) c.cancelPending();
    }
    this.exitStudio(true);
  }

  private cancelWait(): void {
    if (this.screen === "IDENTIFYING") {
      if (this.pendingDeck) return;
      const c = this.compiler();
      if (c) c.cancelPending();
    }
    this.goHome("");
  }

  private goHome(notice: string): void {
    if (this.screen === "CLOSED") return;
    this.stopInputs();
    this.notice = notice;
    this.show("HOME");
  }

  private startSpeech(): void {
    if (this.screen !== "HOME") return;
    const v = this.voice();
    this.setStatus(ICON_MIC, KIT.CYAN, "LISTENING...", "Say the dish name, e.g. \"mushroom biryani\"", false);
    this.show("LISTENING");
    const ok = !!v && v.captureOnce(
      (text: string) => this.eventBus.emit("STUDIO_TEXT_SUBMITTED", { text: text, source: "SPEECH" }),
      (partial: string) => { if (this.statusDetail && this.screen === "LISTENING") this.statusDetail.text = `"${partial}"`; },
      (msg: string) => { if (this.screen === "LISTENING") this.goHome(msg); }
    );
    if (!ok) this.goHome("Voice input runs on Spectacles. In Preview use KEYBOARD or a quick pick.");
  }

  /** TextInputSystem AR keyboard (Done submits). Edit of a transcript re-opens it pre-filled (speech path only). */
  private openKeyboard(initial: string, source: "SPEECH" | "KEYBOARD"): void {
    if (this.screen !== "HOME" && this.screen !== "REVIEW") return;
    const tis: any = (global as any).textInputSystem;
    if (!tis || typeof tis.requestKeyboard !== "function" || typeof TextInputSystem === "undefined") {
      this.goHome("Keyboard unavailable here. Use SPEAK or a quick pick.");
      return;
    }
    this.draft = initial;
    this.kbSource = source;
    this.setStatus(ICON_KEYBOARD, KIT.VIOLET, source === "SPEECH" ? "EDIT WHAT CHEF HEARD" : "TYPE THE DISH NAME", initial.length > 0 ? `"${initial}"` : "Type on the keyboard, then press Done", false);
    this.show("TYPING");
    try {
      const o = new TextInputSystem.KeyboardOptions();
      o.enablePreview = true;
      o.keyboardType = TextInputSystem.KeyboardType.Text;
      o.returnKeyType = TextInputSystem.ReturnKeyType.Done;
      o.initialText = initial;
      o.onTextChanged = (text: string, _range: vec2) => {
        this.draft = text;
        if (this.statusDetail && this.screen === "TYPING") this.statusDetail.text = text.length > 0 ? `"${text}"` : "Type on the keyboard, then press Done";
      };
      o.onReturnKeyPressed = () => this.submitDraft();
      o.onKeyboardStateChanged = (isOpen: boolean) => {
        this.keyboardOpen = isOpen;
        if (!isOpen && this.screen === "TYPING") {
          if (this.draft.trim().length > 0) this.submitDraft();
          else this.goHome("");
        }
      };
      tis.requestKeyboard(o);
      this.keyboardOpen = true;
    } catch (e) {
      print(`[DishStudio] keyboard request failed: ${e}`);
      this.goHome("Keyboard unavailable here. Use SPEAK or a quick pick.");
    }
  }

  private submitDraft(): void {
    if (this.screen !== "TYPING") return;
    this.eventBus.emit("STUDIO_TEXT_SUBMITTED", { text: this.draft, source: this.kbSource });
  }

  private onTextSubmitted(d?: StudioTextSubmittedPayload): void {
    if (!d) return;
    const text = typeof d.text === "string" ? d.text.trim() : "";
    const source = d.source === "SPEECH" ? "SPEECH" : "KEYBOARD";
    if (this.screen === "CLOSED") this.enterStudio();
    if (this.screen === "DECK" || this.screen === "IDENTIFYING") return;
    this.screen = "REVIEW"; // before the keyboard is dismissed (its close callback must not re-submit)
    this.stopInputs();
    if (text.length === 0) {
      this.goHome(source === "SPEECH" ? "Nothing heard. Try again." : "Nothing typed. Try again.");
      return;
    }
    this.reviewText = text;
    this.reviewSource = source;
    if (this.reviewHeader) this.reviewHeader.text = source === "SPEECH" ? "HEARD" : "TYPED";
    if (this.reviewIcon) {
      this.reviewIcon.mainMaterial.mainPass.baseTex = source === "SPEECH" ? ICON_MIC : ICON_KEYBOARD;
      this.reviewIcon.mainMaterial.mainPass.baseColor = source === "SPEECH" ? KIT.CYAN : KIT.VIOLET;
    }
    if (this.reviewBody) this.reviewBody.text = `"${text}"`;
    const speech = source === "SPEECH";
    if (this.editBtn) this.editBtn.obj.enabled = speech; // edit step: speech path ONLY
    if (this.cancelBtn) this.cancelBtn.obj.getTransform().setLocalPosition(new vec3(speech ? -1.4 : -5.0, -7.8, 0.05));
    this.show("REVIEW");
  }

  private edit(): void {
    if (this.screen !== "REVIEW" || this.reviewSource !== "SPEECH") return;
    this.openKeyboard(this.reviewText, "SPEECH");
  }

  private confirm(): void {
    if (this.screen !== "REVIEW" || this.reviewText.length === 0) return;
    const q = this.reviewText;
    this.identify(`"${q}"`);
    this.eventBus.emit("DISH_COMPILE_REQUESTED", { query: q, source: this.reviewSource === "SPEECH" ? "VOICE" : "KEYBOARD" });
  }

  private pickPreset(i: number): void {
    if (this.screen === "CLOSED") this.enterStudio();
    if (this.screen === "DECK" || this.screen === "IDENTIFYING") return;
    this.stopInputs();
    this.identify(getPreset(i).dishTitle);
    this.eventBus.emit("DISH_COMPILE_REQUESTED", { presetIndex: i, source: "HUD" });
  }

  private identify(detail: string): void {
    this.setStatus(ICON_SPIN, KIT.VIOLET, "IDENTIFYING DISH", detail, true);
    this.identifyAt = this.clock;
    this.show("IDENTIFYING");
  }

  private onNotFound(): void {
    if (this.screen === "CLOSED") this.enterStudio();
    if (this.screen === "DECK") return;
    this.pendingDeck = null;
    this.goHome(NOT_FOUND_MESSAGE); // exact text, input choice re-opens, setup stays hidden
    print(`[DishStudio] not found -> "${NOT_FOUND_MESSAGE}"`);
  }

  private onBlueprint(d?: any): void {
    if (!d || !d.blueprint || !d.showBriefing) return;
    if (this.screen === "CLOSED") this.enterStudio(); // voice / bus requests land in the studio too
    if (this.screen === "DECK") return;
    const status = typeof d.statusLine === "string" ? d.statusLine : "";
    const at = this.screen === "IDENTIFYING" ? this.identifyAt + MIN_IDENTIFY_SEC : this.clock;
    this.pendingDeck = { bp: d.blueprint as UniversalDishBlueprint, status: status, at: at };
    if (at <= this.clock) this.showDeck();
  }

  private showDeck(): void {
    const p = this.pendingDeck;
    this.pendingDeck = null;
    if (!p) return;
    this.stopInputs();
    this.notice = "";
    this.show("DECK");
    const deck = SpatialBriefingDeck.getInstance();
    if (deck) deck.openDeck(p.bp, p.status);
  }

  private stopInputs(): void {
    const v = this.voice();
    if (v) v.stopCapture();
    if (this.keyboardOpen) {
      this.keyboardOpen = false;
      try {
        const tis: any = (global as any).textInputSystem;
        if (tis && typeof tis.dismissKeyboard === "function") tis.dismissKeyboard();
      } catch (_e) {
        // keyboard already gone
      }
    }
  }

  // ───────────────────────── presentation ─────────────────────────

  private show(s: StudioScreen): void {
    this.screen = s;
    const deck = s === "DECK";
    if (this.titleGroup) this.titleGroup.enabled = !deck;
    if (this.homeGroup) this.homeGroup.enabled = s === "HOME";
    if (this.reviewGroup) this.reviewGroup.enabled = s === "REVIEW";
    if (this.statusGroup) this.statusGroup.enabled = s === "LISTENING" || s === "TYPING" || s === "IDENTIFYING";
    if (this.deckSlot) this.deckSlot.enabled = deck;
    if (this.backBtn) this.backBtn.obj.enabled = !deck;
    const hasNotice = s === "HOME" && this.notice.length > 0;
    if (this.noticeObj) this.noticeObj.enabled = hasNotice;
    if (this.subtitle) {
      this.subtitle.getSceneObject().enabled = !hasNotice;
      this.subtitle.text = s === "REVIEW" ? "Check it, then confirm" : s === "HOME" ? "How would you like to choose your dish?" : "Dish Studio";
    }
    if (hasNotice && this.noticeText && this.noticeGlass) {
      const nf = this.notice === NOT_FOUND_MESSAGE;
      this.noticeText.text = this.notice;
      this.noticeText.textFill.color = nf ? KIT.TEXT : KIT.MUTED;
      this.noticeGlass.border = withAlpha(nf ? KIT.CORAL : KIT.AMBER, 0.95);
      this.noticeGlass.borderSize = nf ? 0.09 : 0.06;
      applyKitGlass(this.noticeGlass);
    }
    this.warmup = Math.max(this.warmup, 6);
    this.emitState();
  }

  private emitState(): void {
    this.eventBus.emit("STUDIO_STATE_CHANGED", { open: this.screen !== "CLOSED", screen: this.screen });
  }

  private setStatus(icon: Texture, color: vec4, title: string, detail: string, spin: boolean): void {
    if (this.statusIcon) {
      this.statusIcon.mainMaterial.mainPass.baseTex = icon;
      this.statusIcon.mainMaterial.mainPass.baseColor = color;
    }
    if (this.statusTitle) this.statusTitle.text = title;
    if (this.statusDetail) {
      this.statusDetail.text = detail;
      this.statusDetail.textFill.color = color;
    }
    this.statusSpin = spin;
    if (this.statusIconObj) this.statusIconObj.getTransform().setLocalRotation(quat.quatIdentity());
  }

  private group(name: string): SceneObject {
    const g = global.scene.createSceneObject(name);
    g.setParent(this.root!);
    return g;
  }

  private build(): void {
    const root = global.scene.createSceneObject("DishStudioRoot"); // scene root: never inside the hidden setup
    root.createComponent("Component.Canvas"); // Text / Image only render under a Canvas
    this.root = root;

    // title strip + notice card
    const title = this.group("Studio_Title");
    this.titleGroup = title;
    kitText(title, "Studio_TitleLabel", "DISH STUDIO", 30, KIT.VIOLET, new vec3(0, 11.5, 0), 12, 0.9, { weight: 800 });
    this.subtitle = kitText(title, "Studio_Subtitle", "How would you like to choose your dish?", 44, KIT.TEXT, new vec3(0, 9.95, 0), 20.5, 1.3, { weight: 700 });
    const notice = global.scene.createSceneObject("StudioNoticeCard");
    notice.setParent(title);
    this.noticeObj = notice;
    this.noticeGlass = kitCard(notice, "StudioNotice_Glass", new vec3(0, 9.95, -0.1), new vec2(22.6, 2.0), KIT.CORAL, this.glasses);
    this.noticeText = kitText(notice, "StudioNoticeText", "", 40, KIT.TEXT, new vec3(0, 9.95, 0.03), 21.8, 1.6, { weight: 700 });
    notice.enabled = false;
    this.backBtn = kitButton(root, "Btn_StudioBack", "< Back", KIT.NEUTRAL, new vec3(-CANVAS_W / 2 + 1.6, CANVAS_H / 2 - 0.9, 0.05), 3.0, 1.3, 32, this.buttons, this.glasses);

    // HOME: two large near-square cards + quick-pick chips (2 rows of 3)
    const home = this.group("Studio_Home");
    this.homeGroup = home;
    this.bigCard(home, "Btn_StudioSpeak", ICON_MIC, "SPEAK", "Say the dish name", KIT.CYAN, -5.85);
    this.bigCard(home, "Btn_StudioKeyboard", ICON_KEYBOARD, "KEYBOARD", "Type the dish name", KIT.VIOLET, 5.85);
    kitText(home, "Studio_ChipCaption", "OR QUICK PICK A PREBUILT DISH", 24, KIT.MUTED, new vec3(0, -6.2, 0), 20, 0.7, { weight: 700 });
    const chipW = 7.3;
    const gap = 0.4;
    for (let i = 0; i < PRESET_COUNT; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      kitButton(home, `Btn_StudioChip_${i}`, CHIP_LABELS[i] || `DISH ${i + 1}`, i === 0 ? KIT.EMERALD : KIT.NEUTRAL, new vec3((col - 1) * (chipW + gap), -7.75 - row * 1.95, 0.05), chipW, 1.55, 30, this.buttons, this.glasses);
    }

    // REVIEW: "Heard" / "Typed" card
    const review = this.group("Studio_Review");
    this.reviewGroup = review;
    kitCard(review, "StudioReview_Card", new vec3(0, 1.4, -0.1), new vec2(22.4, 13.2), KIT.CYAN, this.glasses);
    this.reviewIcon = createWorldIcon(review, "StudioReview_Icon", ICON_MIC, 1.5, new vec3(-9.6, 6.6, 0.03), KIT.CYAN);
    this.reviewHeader = kitText(review, "StudioReviewHeader", "HEARD", 40, KIT.CYAN, new vec3(-2.6, 6.6, 0.03), 12, 1.2, { align: "left", weight: 800 });
    this.reviewBody = kitText(review, "StudioReviewText", "", 76, KIT.TEXT, new vec3(0, 2.4, 0.03), 20.4, 5.6, { wrap: true, weight: 800 });
    kitText(review, "StudioReview_Hint", "Confirm and Chef AI identifies the dish", 30, KIT.MUTED, new vec3(0, -2.9, 0.03), 20, 0.9, { weight: 600 });
    this.editBtn = kitButton(review, "Btn_StudioEdit", "Edit", KIT.CYAN, new vec3(-7.6, -7.8, 0.05), 5.4, 2.0, 40, this.buttons, this.glasses);
    this.cancelBtn = kitButton(review, "Btn_StudioCancel", "Cancel", KIT.NEUTRAL, new vec3(-1.4, -7.8, 0.05), 5.4, 2.0, 40, this.buttons, this.glasses);
    kitButton(review, "Btn_StudioConfirm", "Confirm", KIT.EMERALD, new vec3(6.6, -7.8, 0.05), 7.6, 2.0, 44, this.buttons, this.glasses, true);

    // LISTENING / TYPING / IDENTIFYING status card
    const status = this.group("Studio_Status");
    this.statusGroup = status;
    kitCard(status, "StudioStatus_Card", new vec3(0, 1.4, -0.1), new vec2(21, 12.6), KIT.VIOLET, this.glasses);
    const iconHolder = global.scene.createSceneObject("StudioStatus_IconHolder");
    iconHolder.setParent(status);
    iconHolder.getTransform().setLocalPosition(new vec3(0, 4.9, 0.03));
    this.statusIconObj = iconHolder;
    this.statusIcon = createWorldIcon(iconHolder, "StudioStatus_Icon", ICON_SPIN, 3.4, vec3.zero(), KIT.VIOLET);
    this.statusTitle = kitText(status, "StudioStatusTitle", "", 60, KIT.TEXT, new vec3(0, 0.9, 0.03), 19.5, 1.7, { weight: 800 });
    this.statusDetail = kitText(status, "StudioStatusDetail", "", 42, KIT.VIOLET, new vec3(0, -1.6, 0.03), 19.5, 2.4, { wrap: true, weight: 700 });
    kitButton(status, "Btn_StudioCancelWait", "Cancel", KIT.NEUTRAL, new vec3(0, -7.8, 0.05), 5.4, 2.0, 40, this.buttons, this.glasses);

    // deck slot (SpatialBriefingDeck parents its card here)
    this.deckSlot = this.group("Studio_DeckSlot");

    for (const g of [home, review, status, this.deckSlot]) g.enabled = false;
    root.enabled = false;
  }

  private bigCard(parent: SceneObject, name: string, icon: Texture, title: string, sub: string, accent: vec4, x: number): void {
    const b = kitButton(parent, name, "", accent, new vec3(x, 1.7, 0), 11.2, 12.6, 40, this.buttons, this.glasses, false);
    b.frame.radius = KIT.CARD_RADIUS;
    b.frame.borderSize = 0.07;
    styleKitButton(b);
    createWorldIcon(b.obj, `${name}_Icon`, icon, 4.4, new vec3(0, 2.4, 0.06), accent);
    kitText(b.obj, `${name}_Title`, title, 84, KIT.TEXT, new vec3(0, -2.3, 0.06), 10.4, 2.2, { weight: 800 });
    kitText(b.obj, `${name}_Sub`, sub, 34, accent, new vec3(0, -4.3, 0.06), 10.2, 1.0, { weight: 700 });
  }

  private resolveStationsRoot(): void {
    if (this.stationsRoot && !isNull(this.stationsRoot)) return;
    this.stationsRoot = findUp(this.getSceneObject(), "StationsRoot");
  }

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[DishStudio] ${ev} handler error: ${e}`);
      }
    };
    this.eventBus.on(ev, safe);
    this.handlers.push({ ev, cb: safe });
  }

  private onUpdate(): void {
    const dt = getDeltaTime();
    this.clock += dt;
    if (this.screen === "CLOSED") return;
    if (this.pendingDeck && this.clock >= this.pendingDeck.at) this.showDeck();
    if (this.warmup > 0) {
      this.warmup--;
      for (const g of this.glasses) applyKitGlass(g);
      for (const b of this.buttons) styleKitButton(b);
    }
    animateKitButtons(this.buttons, dt);
    if (this.statusIconObj && (this.screen === "LISTENING" || this.screen === "TYPING" || this.screen === "IDENTIFYING")) {
      const tr = this.statusIconObj.getTransform();
      if (this.statusSpin) {
        tr.setLocalRotation(quat.angleAxis(-this.clock * 4.2, vec3.forward()));
        tr.setLocalScale(vec3.one());
      } else {
        const s = 1 + 0.08 * Math.sin(this.clock * 5.5);
        tr.setLocalScale(new vec3(s, s, 1));
      }
    }
  }
}
