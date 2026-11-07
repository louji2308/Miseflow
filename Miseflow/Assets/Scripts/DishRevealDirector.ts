import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import { DishBlueprintApplier } from "./DishBlueprintApplier";
import { createWorldIcon } from "./DAGCounterConduit";
import { RecipeCompilerService } from "./AI/RecipeCompilerService";
import { StagedDishItem } from "./AI/IDishAssetBuilder";
import { getPreset } from "./AI/DishLibraryConfig";
import { KIT, KitGlass, applyKitGlass, easeOutBack, kitCard, kitGlass, kitText, placeInView, smooth, withAlpha } from "./StudioCardKit";

/**
 * DishRevealDirector.ts  (v5 P5 – staged one-by-one reveal + loading panel)
 *
 * While the briefing cards are swiped, RecipeCompilerService stages the dish (DISH_LOAD_STAGED, then one
 * DISH_ITEM_READY per item in load order: ingredients -> starch / protein -> vessels & tools -> service ware).
 * On Let's cook / Skip (BRIEFING_COMPLETED) the setup returns and this director:
 *  - hides every staged item's scene targets (scale ~0, original scale captured),
 *  - pops the items in ONE BY ONE (ease-out-back ~0.25 s each, 0.15 s apart) the moment each is ready, applying
 *    the item's deferred builder hooks (RecipeCompilerService.revealItem) right before it appears,
 *  - shows DishLoadingPanel in front of the counter when items are still loading (spinning ring, progress bar,
 *    item chips arriving one by one "WOK  LOADING" -> "WOK  READY", live status line), hidden once all are in,
 *  - emits DISH_REVEALED { dishId }.
 * Dish 01 (salmon) has nothing new to spawn: no re-reveal and no panel, the setup simply returns as it was.
 * Reset / a non-staged apply cancels a reveal and snaps every target back to its exact original scale.
 */

const ICON_SPIN = requireAsset("../Icons/progress_activity.png") as Texture;

const POP_SEC = 0.25;
const POP_GAP_SEC = 0.15;
const HIDE_SCALE = 0.001;
const CHIP_COLS = 3;
const CHIP_W = 5.0;
const CHIP_H = 0.95;
const CHIP_GAP = 0.25;
const MAX_CHIPS = 24;
const PANEL_W = CHIP_COLS * CHIP_W + (CHIP_COLS - 1) * CHIP_GAP + 1.4;
const CHIP_STAGGER_SEC = 0.07;

interface Pop {
  obj: SceneObject;
  orig: vec3;
  t: number;
}

interface Chip {
  obj: SceneObject;
  glass: KitGlass;
  text: Text;
  shownAt: number;
  pulse: number;
  state: number; // 0 loading, 1 ready, 2 placed
}

@component
export class DishRevealDirector extends BaseScriptComponent {
  private static instance: DishRevealDirector | null = null;

  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];

  private dishId: string = "";
  private statusLine: string = "";
  private items: StagedDishItem[] = [];
  private ready: boolean[] = [];
  private revealing: boolean = false;
  private instant: boolean = false;
  private next: number = 0;
  private nextPopAt: number = 0;
  private clock: number = 0;
  private captured: { obj: SceneObject; orig: vec3 }[] = [];
  private pops: Pop[] = [];
  private revealedCount: number = 0;

  private panel?: SceneObject;
  private panelBody?: SceneObject;
  private panelGlasses: KitGlass[] = [];
  private panelCard?: KitGlass;
  private panelTitle?: Text;
  private panelStatus?: Text;
  private panelCount?: Text;
  private spinner?: SceneObject;
  private barTrack?: KitGlass;
  private barFill?: KitGlass;
  private barK: number = 0;
  private chips: Chip[] = [];
  private panelOn: boolean = false;
  private panelT: number = 0;
  private panelWarmup: number = 0;
  private panelShownAt: number = 0;

  public static getInstance(): DishRevealDirector | null {
    return DishRevealDirector.instance;
  }

  onAwake(): void {
    DishRevealDirector.instance = this;
    this.buildPanel();
    this.createEvent("OnStartEvent").bind(() => {
      this.listen("DISH_LOAD_STAGED", (d?: any) => this.onStaged(d));
      this.listen("DISH_ITEM_READY", (d?: any) => this.onItemReady(d));
      this.listen("BRIEFING_COMPLETED", (d?: any) => this.startReveal(d && d.dishId ? String(d.dishId) : this.dishId));
      this.listen("RESET_REQUESTED", () => this.cancel("reset"));
      this.listen("DISH_BLUEPRINT_APPLIED", (d?: any) => {
        if (d && !d.staged) this.cancel("non-staged apply");
      });
    });
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.eventBus.off(h.ev, h.cb);
      this.handlers = [];
      this.cancel("destroy");
      if (DishRevealDirector.instance === this) DishRevealDirector.instance = null;
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public isRevealing(): boolean {
    return this.revealing;
  }

  public isPanelVisible(): boolean {
    return this.panelOn;
  }

  public getRevealedCount(): number {
    return this.revealedCount;
  }

  public getItemCount(): number {
    return this.items.length;
  }

  public getPanelStatus(): string {
    return this.panelCount ? this.panelCount.text : "";
  }

  // ───────────────────────── events ─────────────────────────

  private listen(ev: MiseFlowEventType, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[DishReveal] ${ev} handler error: ${e}`);
      }
    };
    this.eventBus.on(ev, safe);
    this.handlers.push({ ev, cb: safe });
  }

  private compiler(): RecipeCompilerService | null {
    return this.getSceneObject().getComponent(RecipeCompilerService.getTypeName()) as RecipeCompilerService;
  }

  private onStaged(d?: any): void {
    if (!d) return;
    this.cancel("new stage");
    this.dishId = String(d.dishId || "");
    this.statusLine = String(d.statusLine || "");
    this.items = Array.isArray(d.items) ? (d.items as StagedDishItem[]) : [];
    this.ready = this.items.map(() => false);
    this.revealedCount = 0;
  }

  private onItemReady(d?: any): void {
    if (!d || String(d.dishId) !== this.dishId) return;
    const i = typeof d.index === "number" ? d.index : -1;
    if (i < 0 || i >= this.ready.length) return;
    this.ready[i] = true;
    this.refreshChipState(i);
  }

  /**
   * K1a truthful chip: READY only once the item's load stage is done AND its staged prop really exists (built hidden,
   * still alive; hook-only items with no prop count as built); PLACED only after the reveal popped it in.
   */
  private assetExists(i: number): boolean {
    const it = this.items[i];
    if (!it) return false;
    const t = it.targets || [];
    for (const o of t) if (!o || isNull(o)) return false;
    return true;
  }

  private chipStateOf(i: number): number {
    if (i < this.revealedCount) return 2;
    return this.ready[i] && this.assetExists(i) ? 1 : 0;
  }

  private refreshChipState(i: number): void {
    const c = this.chips[i];
    if (!c) return;
    const st = this.chipStateOf(i);
    if (st !== c.state) {
      c.state = st;
      c.pulse = 1;
      this.styleChip(i);
    }
  }

  private startReveal(dishId: string): void {
    if (this.items.length === 0 || dishId !== this.dishId || this.revealing) {
      if (this.items.length === 0 && dishId) this.eventBus.emit("DISH_REVEALED", { dishId: dishId });
      return;
    }
    this.revealing = true;
    this.next = 0;
    this.nextPopAt = this.clock;
    this.pops = [];
    this.captured = [];
    this.instant = dishId === getPreset(0).dishId;
    if (this.instant) {
      print(`[DishReveal] ${dishId}: default dish, setup returns as it was (no re-reveal)`);
      return;
    }
    // hide every staged target first: the setup returns with the new dish's props absent, then they pop in
    for (const it of this.items) for (const o of it.targets || []) this.capture(o);
    const waiting = this.ready.some((r) => !r);
    if (waiting) this.showPanel();
    print(`[DishReveal] ${dishId}: revealing ${this.items.length} items (${this.captured.length} props)${waiting ? " with loading panel" : ""}`);
  }

  private capture(o: SceneObject): void {
    if (!o || isNull(o)) return;
    for (const c of this.captured) if (c.obj === o) return;
    const tr = o.getTransform();
    const orig = tr.getLocalScale();
    this.captured.push({ obj: o, orig: orig });
    tr.setLocalScale(orig.uniformScale(HIDE_SCALE));
  }

  private origOf(o: SceneObject): vec3 | null {
    for (const c of this.captured) if (c.obj === o) return c.orig;
    return null;
  }

  /** Reset / superseded: snap every target back to its exact original scale, drop the panel. */
  private cancel(why: string): void {
    const had = this.revealing;
    for (const c of this.captured) if (c.obj && !isNull(c.obj)) c.obj.getTransform().setLocalScale(c.orig);
    this.captured = [];
    this.pops = [];
    this.revealing = false;
    this.hidePanel(true);
    if (had) print(`[DishReveal] reveal cancelled (${why})`);
  }

  private finish(): void {
    for (const c of this.captured) if (c.obj && !isNull(c.obj)) c.obj.getTransform().setLocalScale(c.orig);
    this.captured = [];
    this.revealing = false;
    this.hidePanel(false);
    this.eventBus.emit("DISH_REVEALED", { dishId: this.dishId });
    print(`[DishReveal] ${this.dishId} revealed (${this.revealedCount}/${this.items.length})`);
  }

  // ───────────────────────── per frame ─────────────────────────

  private onUpdate(): void {
    const dt = getDeltaTime();
    this.clock += dt;
    if (this.revealing) this.stepReveal(dt);
    this.updatePanel(dt);
  }

  private stepReveal(dt: number): void {
    const c = this.compiler();
    if (this.instant) {
      while (this.next < this.items.length && this.ready[this.next]) {
        if (c) c.revealItem(this.items[this.next].key);
        this.next++;
        this.revealedCount = this.next;
      }
      if (this.next >= this.items.length) this.finish();
      return;
    }
    if (this.next < this.items.length && this.ready[this.next] && this.clock >= this.nextPopAt) {
      const it = this.items[this.next];
      const objs = c ? c.revealItem(it.key) : [];
      for (const o of objs) {
        let orig = this.origOf(o);
        if (!orig) {
          this.capture(o);
          orig = this.origOf(o);
        }
        if (orig) this.pops.push({ obj: o, orig: orig, t: 0 });
      }
      this.next++;
      this.revealedCount = this.next;
      this.refreshChipState(this.next - 1); // PLACED only now that the reveal popped it in
      this.nextPopAt = this.clock + (objs.length > 0 ? POP_GAP_SEC : POP_GAP_SEC * 0.5);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t = Math.min(1, p.t + dt / POP_SEC);
      const k = p.t >= 1 ? 1 : Math.max(HIDE_SCALE, easeOutBack(p.t));
      if (p.obj && !isNull(p.obj)) p.obj.getTransform().setLocalScale(p.orig.uniformScale(k));
      if (p.t >= 1) this.pops.splice(i, 1);
    }
    if (this.next >= this.items.length && this.pops.length === 0 && this.clock >= this.nextPopAt) this.finish();
  }

  // ───────────────────────── loading panel ─────────────────────────

  private buildPanel(): void {
    const root = global.scene.createSceneObject("DishLoadingPanel"); // scene root, in front of the counter
    root.createComponent("Component.Canvas");
    this.panel = root;
    const body = global.scene.createSceneObject("DishLoadingPanel_Body");
    body.setParent(root);
    this.panelBody = body;
    this.panelCard = kitCard(body, "DishLoadingPanel_Card", new vec3(0, 0, -0.1), new vec2(PANEL_W, 8), KIT.VIOLET, this.panelGlasses);
    const holder = global.scene.createSceneObject("DishLoadingPanel_Spinner");
    holder.setParent(body);
    this.spinner = holder;
    createWorldIcon(holder, "DishLoadingPanel_Ring", ICON_SPIN, 1.9, vec3.zero(), KIT.VIOLET);
    this.panelTitle = kitText(body, "DishLoadingPanelTitle", "", 40, KIT.TEXT, vec3.zero(), PANEL_W - 4.2, 1.1, { align: "left", weight: 800 });
    this.panelStatus = kitText(body, "DishLoadingPanelStatus", "", 24, KIT.EMERALD, vec3.zero(), PANEL_W - 1.2, 0.7, { weight: 700 });
    this.panelCount = kitText(body, "DishLoadingPanelCount", "", 26, KIT.GOLD, vec3.zero(), 6, 0.8, { align: "right", weight: 800 });
    this.barTrack = kitGlass(body, "DishLoadingPanel_BarTrack", vec3.zero(), new vec2(PANEL_W - 1.4, 0.32), withAlpha(KIT.MUTED, 0.15), withAlpha(KIT.MUTED, 0.35), 0.03, 0.08, this.panelGlasses);
    this.barFill = kitGlass(body, "DishLoadingPanel_BarFill", vec3.zero(), new vec2(0.3, 0.32), withAlpha(KIT.EMERALD, 0.95), withAlpha(KIT.EMERALD, 1), 0.02, 0.08, this.panelGlasses);
    for (let i = 0; i < MAX_CHIPS; i++) {
      const o = global.scene.createSceneObject(`DishLoadingChip_${i}`);
      o.setParent(body);
      const g = kitGlass(o, `DishLoadingChip_${i}_Glass`, new vec3(0, 0, -0.05), new vec2(CHIP_W, CHIP_H), withAlpha(KIT.GLASS, 0.9), withAlpha(KIT.AMBER, 0.6), 0.04, 0.15, this.panelGlasses);
      const t = kitText(o, `DishLoadingChip_${i}_Text`, "", 24, KIT.MUTED, new vec3(0, 0, 0.03), CHIP_W - 0.3, CHIP_H, { weight: 700 });
      o.enabled = false;
      this.chips.push({ obj: o, glass: g, text: t, shownAt: 0, pulse: 0, state: 0 });
    }
    root.enabled = false;
  }

  private showPanel(): void {
    if (!this.panel || !this.panelBody) return;
    const n = Math.min(MAX_CHIPS, this.items.length);
    const rows = Math.max(1, Math.ceil(n / CHIP_COLS));
    const h = 4.3 + rows * (CHIP_H + CHIP_GAP);
    const top = h / 2;
    if (this.panelCard) this.panelCard.rr.size = new vec2(PANEL_W, h);
    const left = -PANEL_W / 2 + 0.7;
    if (this.spinner) this.spinner.getTransform().setLocalPosition(new vec3(left + 0.95, top - 1.25, 0.03));
    const bp = DishBlueprintApplier.getActiveBlueprint();
    if (this.panelTitle) {
      this.panelTitle.text = `SETTING UP ${bp && bp.dishId === this.dishId ? bp.dishTitle : "YOUR DISH"}`;
      this.panelTitle.getSceneObject().getTransform().setLocalPosition(new vec3(left + 2.2 + (PANEL_W - 4.2) / 2, top - 1.0, 0.03));
    }
    if (this.panelCount) this.panelCount.getSceneObject().getTransform().setLocalPosition(new vec3(PANEL_W / 2 - 0.7 - 3, top - 1.65, 0.03));
    if (this.panelStatus) {
      this.panelStatus.text = this.statusLine;
      this.panelStatus.getSceneObject().getTransform().setLocalPosition(new vec3(0, top - 2.45, 0.03));
    }
    const barY = top - 3.2;
    if (this.barTrack) this.barTrack.obj.getTransform().setLocalPosition(new vec3(0, barY, 0.0));
    if (this.barFill) this.barFill.obj.getTransform().setLocalPosition(new vec3(-(PANEL_W - 1.4) / 2, barY, 0.02));
    const gx0 = -((CHIP_COLS * CHIP_W + (CHIP_COLS - 1) * CHIP_GAP) / 2) + CHIP_W / 2;
    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i];
      if (i >= n) {
        c.obj.enabled = false;
        continue;
      }
      const r = Math.floor(i / CHIP_COLS);
      const col = i % CHIP_COLS;
      c.obj.getTransform().setLocalPosition(new vec3(gx0 + col * (CHIP_W + CHIP_GAP), top - 4.25 - r * (CHIP_H + CHIP_GAP), 0.02));
      c.state = this.chipStateOf(i);
      c.shownAt = this.clock + i * CHIP_STAGGER_SEC; // chips arrive one by one
      c.pulse = 0;
      c.obj.enabled = false;
      this.styleChip(i);
    }
    this.barK = 0;
    this.panelOn = true;
    this.panelT = 0;
    this.panelShownAt = this.clock;
    this.panelWarmup = 8;
    this.panel.enabled = true;
    // in front of the counter, upper part of the view (the props pop in below it)
    // ~45 % of the display height, upper half, well in front of the counter (which sits ~60 cm from the camera)
    placeInView(this.panel, PANEL_W / 0.85, h / 0.45, 1.0, 0.2, 26, 40);
  }

  private hidePanel(immediate: boolean): void {
    this.panelOn = false;
    if (immediate && this.panel) {
      this.panelT = 0;
      this.panel.enabled = false;
    }
  }

  private styleChip(i: number): void {
    const c = this.chips[i];
    const it = this.items[i];
    if (!c || !it) return;
    const word = c.state === 0 ? "LOADING" : c.state === 1 ? "READY" : "PLACED";
    c.text.text = `${it.label}  ${word}`;
    const col = c.state === 0 ? KIT.AMBER : KIT.EMERALD;
    c.text.textFill.color = c.state === 0 ? withAlpha(KIT.MUTED, 0.85) : c.state === 2 ? KIT.TEXT : KIT.EMERALD;
    c.glass.border = withAlpha(col, c.state === 0 ? 0.45 : 0.95);
    c.glass.bg = c.state === 2 ? withAlpha(new vec4(col.r * 0.22, col.g * 0.22, col.b * 0.22, 1), 0.92) : withAlpha(KIT.GLASS, 0.9);
    applyKitGlass(c.glass);
  }

  private updatePanel(dt: number): void {
    if (!this.panel || !this.panel.enabled) return;
    const target = this.panelOn ? 1 : 0;
    this.panelT += (target - this.panelT) * Math.min(1, dt * 10);
    if (!this.panelOn && this.panelT < 0.02) {
      this.panel.enabled = false;
      return;
    }
    if (this.panelBody) {
      const s = 0.9 + 0.1 * smooth(this.panelT);
      this.panelBody.getTransform().setLocalScale(new vec3(s, s * smooth(Math.min(1, this.panelT * 1.4)), 1));
    }
    if (this.panelWarmup > 0) {
      this.panelWarmup--;
      for (const g of this.panelGlasses) applyKitGlass(g);
    }
    if (this.spinner) this.spinner.getTransform().setLocalRotation(quat.angleAxis(-(this.clock - this.panelShownAt) * 4.5, vec3.forward()));
    const total = Math.max(1, this.items.length);
    let nReady = 0;
    for (let i = 0; i < this.ready.length; i++) if (this.chipStateOf(i) >= 1) nReady++;
    const frac = (nReady + this.revealedCount) / (2 * total);
    this.barK += (frac - this.barK) * Math.min(1, dt * 6);
    if (this.barFill) {
      const w = Math.max(0.3, (PANEL_W - 1.4) * this.barK);
      this.barFill.rr.size = new vec2(w, 0.32);
      this.barFill.obj.getTransform().setLocalPosition(new vec3(-(PANEL_W - 1.4) / 2 + w / 2, this.barTrack ? this.barTrack.obj.getTransform().getLocalPosition().y : 0, 0.02));
    }
    if (this.panelCount) this.panelCount.text = `${nReady}/${this.items.length} READY • ${this.revealedCount} PLACED`;
    for (let i = 0; i < this.chips.length && i < this.items.length; i++) {
      const c = this.chips[i];
      if (!c.obj.enabled && this.clock >= c.shownAt && this.panelOn) {
        c.obj.enabled = true;
        c.pulse = 1;
        applyKitGlass(c.glass);
      }
      if (c.pulse > 0) {
        c.pulse = Math.max(0, c.pulse - dt / 0.3);
        const k = c.obj.enabled ? (c.pulse > 0.5 ? easeOutBack(1 - (c.pulse - 0.5) * 2) : 1 + 0.08 * c.pulse) : 1;
        c.obj.getTransform().setLocalScale(new vec3(Math.max(0.01, k), Math.max(0.01, k), 1));
      }
    }
  }
}
