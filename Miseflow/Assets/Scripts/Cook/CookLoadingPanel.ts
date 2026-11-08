/**
 * CookLoadingPanel.ts  (Chef Director v6, W3)
 *
 * Generic version of DishRevealDirector's loading panel (that one is bound to RecipeCompilerService's staged items, so it
 * cannot be driven by a CookPlan): same StudioCardKit look, spinning ring, progress bar, chips arriving one by one
 * "KADAI  LOADING" -> "KADAI  READY" -> "KADAI  PLACED", live status line. Scene-root object in front of the camera
 * (never inside the hidden legacy StationsRoot). Owned by one buildCookWorld() call; destroy() removes everything.
 */
import { createWorldIcon } from "../DAGCounterConduit";
import { KIT, KitGlass, applyKitGlass, easeOutBack, kitCard, kitGlass, kitText, placeInView, smooth, withAlpha } from "../StudioCardKit";

const ICON_SPIN = requireAsset("../../Icons/progress_activity.png") as Texture;

const CHIP_COLS = 3;
const CHIP_W = 5.0;
const CHIP_H = 0.95;
const CHIP_GAP = 0.25;
const MAX_CHIPS = 24;
const PANEL_W = CHIP_COLS * CHIP_W + (CHIP_COLS - 1) * CHIP_GAP + 1.4;
const CHIP_STAGGER_SEC = 0.06;

interface Chip {
  obj: SceneObject;
  glass: KitGlass;
  text: Text;
  label: string;
  shownAt: number;
  pulse: number;
  state: number; // 0 loading, 1 ready, 2 placed
}

export class CookLoadingPanel {
  private root: SceneObject;
  private body: SceneObject;
  private glasses: KitGlass[] = [];
  private card: KitGlass;
  private status: Text;
  private count: Text;
  private spinner: SceneObject;
  private barTrack: KitGlass;
  private barFill: KitGlass;
  private chips: Chip[] = [];
  private total: number;
  private barK: number = 0;
  private clock: number = 0;
  private on: boolean = true;
  private t: number = 0;
  private warmup: number = 8;
  private alive: boolean = true;

  constructor(title: string, labels: string[]) {
    this.total = labels.length;
    const root = global.scene.createSceneObject("CookLoadingPanel");
    root.createComponent("Component.Canvas");
    this.root = root;
    const body = global.scene.createSceneObject("CookLoadingPanel_Body");
    body.setParent(root);
    this.body = body;
    const n = Math.min(MAX_CHIPS, labels.length);
    const rows = Math.max(1, Math.ceil(n / CHIP_COLS));
    const h = 4.3 + rows * (CHIP_H + CHIP_GAP);
    const top = h / 2;
    const left = -PANEL_W / 2 + 0.7;
    this.card = kitCard(body, "CookLoadingPanel_Card", new vec3(0, 0, -0.1), new vec2(PANEL_W, h), KIT.VIOLET, this.glasses);
    const holder = global.scene.createSceneObject("CookLoadingPanel_Spinner");
    holder.setParent(body);
    holder.getTransform().setLocalPosition(new vec3(left + 0.95, top - 1.25, 0.03));
    this.spinner = holder;
    createWorldIcon(holder, "CookLoadingPanel_Ring", ICON_SPIN, 1.9, vec3.zero(), KIT.VIOLET);
    kitText(body, "CookLoadingPanelTitle", `SETTING UP ${title.toUpperCase()}`, 40, KIT.TEXT, new vec3(left + 2.2 + (PANEL_W - 4.2) / 2, top - 1.0, 0.03), PANEL_W - 4.2, 1.1, { align: "left", weight: 800 });
    this.count = kitText(body, "CookLoadingPanelCount", "", 26, KIT.GOLD, new vec3(PANEL_W / 2 - 0.7 - 3, top - 1.65, 0.03), 6, 0.8, { align: "right", weight: 800 });
    this.status = kitText(body, "CookLoadingPanelStatus", "Only what your steps need", 24, KIT.EMERALD, new vec3(0, top - 2.45, 0.03), PANEL_W - 1.2, 0.7, { weight: 700 });
    const barY = top - 3.2;
    this.barTrack = kitGlass(body, "CookLoadingPanel_BarTrack", new vec3(0, barY, 0), new vec2(PANEL_W - 1.4, 0.32), withAlpha(KIT.MUTED, 0.15), withAlpha(KIT.MUTED, 0.35), 0.03, 0.08, this.glasses);
    this.barFill = kitGlass(body, "CookLoadingPanel_BarFill", new vec3(-(PANEL_W - 1.4) / 2, barY, 0.02), new vec2(0.3, 0.32), withAlpha(KIT.EMERALD, 0.95), withAlpha(KIT.EMERALD, 1), 0.02, 0.08, this.glasses);
    const gx0 = -((CHIP_COLS * CHIP_W + (CHIP_COLS - 1) * CHIP_GAP) / 2) + CHIP_W / 2;
    for (let i = 0; i < n; i++) {
      const o = global.scene.createSceneObject(`CookLoadingChip_${i}`);
      o.setParent(body);
      const r = Math.floor(i / CHIP_COLS);
      const col = i % CHIP_COLS;
      o.getTransform().setLocalPosition(new vec3(gx0 + col * (CHIP_W + CHIP_GAP), top - 4.25 - r * (CHIP_H + CHIP_GAP), 0.02));
      const g = kitGlass(o, `CookLoadingChip_${i}_Glass`, new vec3(0, 0, -0.05), new vec2(CHIP_W, CHIP_H), withAlpha(KIT.GLASS, 0.9), withAlpha(KIT.AMBER, 0.6), 0.04, 0.15, this.glasses);
      const label = i === MAX_CHIPS - 1 && labels.length > MAX_CHIPS ? `+${labels.length - MAX_CHIPS + 1} MORE` : labels[i];
      const t = kitText(o, `CookLoadingChip_${i}_Text`, "", 24, KIT.MUTED, new vec3(0, 0, 0.03), CHIP_W - 0.3, CHIP_H, { weight: 700 });
      o.enabled = false;
      const c: Chip = { obj: o, glass: g, text: t, label: label, shownAt: i * CHIP_STAGGER_SEC, pulse: 0, state: 0 };
      this.chips.push(c);
      this.style(c);
    }
    // in front of the counter, upper part of the view (the props pop in below it) - same placement as DishLoadingPanel
    placeInView(root, PANEL_W / 0.85, h / 0.45, 1.0, 0.2, 26, 40);
  }

  /** 0 loading, 1 ready (built hidden), 2 placed (popped in). */
  setState(i: number, state: number): void {
    const c = this.chips[Math.min(i, this.chips.length - 1)];
    if (!c || !this.alive) return;
    if (i >= MAX_CHIPS - 1 && this.total > MAX_CHIPS && state < 2) return;
    if (state !== c.state) {
      c.state = state;
      c.pulse = 1;
      this.style(c);
    }
  }

  setStatus(text: string): void {
    if (this.alive) this.status.text = text;
  }

  /** Fade out; update() returns false once gone (then destroy()). */
  close(): void {
    this.on = false;
  }

  isAlive(): boolean {
    return this.alive;
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    if (this.root && !isNull(this.root)) this.root.destroy();
  }

  private style(c: Chip): void {
    const word = c.state === 0 ? "LOADING" : c.state === 1 ? "READY" : "PLACED";
    c.text.text = `${c.label}  ${word}`;
    const col = c.state === 0 ? KIT.AMBER : KIT.EMERALD;
    c.text.textFill.color = c.state === 0 ? withAlpha(KIT.MUTED, 0.85) : c.state === 2 ? KIT.TEXT : KIT.EMERALD;
    c.glass.border = withAlpha(col, c.state === 0 ? 0.45 : 0.95);
    c.glass.bg = c.state === 2 ? withAlpha(new vec4(col.r * 0.22, col.g * 0.22, col.b * 0.22, 1), 0.92) : withAlpha(KIT.GLASS, 0.9);
    applyKitGlass(c.glass);
  }

  /** Per frame; false once fully hidden after close() (or destroyed). */
  update(dt: number): boolean {
    if (!this.alive) return false;
    this.clock += dt;
    const target = this.on ? 1 : 0;
    this.t += (target - this.t) * Math.min(1, dt * 10);
    if (!this.on && this.t < 0.02) {
      this.destroy();
      return false;
    }
    const s = 0.9 + 0.1 * smooth(this.t);
    this.body.getTransform().setLocalScale(new vec3(s, s * smooth(Math.min(1, this.t * 1.4)), 1));
    if (this.warmup > 0) {
      this.warmup--;
      for (const g of this.glasses) applyKitGlass(g);
    }
    this.spinner.getTransform().setLocalRotation(quat.angleAxis(-this.clock * 4.5, vec3.forward()));
    let ready = 0;
    let placed = 0;
    for (const c of this.chips) {
      if (c.state >= 1) ready++;
      if (c.state >= 2) placed++;
    }
    const frac = (ready + placed) / (2 * Math.max(1, this.chips.length));
    this.barK += (frac - this.barK) * Math.min(1, dt * 6);
    const w = Math.max(0.3, (PANEL_W - 1.4) * this.barK);
    this.barFill.rr.size = new vec2(w, 0.32);
    this.barFill.obj.getTransform().setLocalPosition(new vec3(-(PANEL_W - 1.4) / 2 + w / 2, this.barTrack.obj.getTransform().getLocalPosition().y, 0.02));
    this.count.text = `${Math.min(this.total, ready)}/${this.total} READY • ${placed} PLACED`;
    for (const c of this.chips) {
      if (!c.obj.enabled && this.clock >= c.shownAt && this.on) {
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
    return true;
  }
}
