import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { MiseFlowEventBus, MiseFlowEventType } from "./MiseFlowEventBus";
import {
  KIT,
  KitButton,
  KitGlass,
  animateKitButtons,
  applyKitGlass,
  kitGlass,
  kitText,
  styleKitButton,
  withAlpha,
} from "./StudioCardKit";
import { KitchenAnchorRoot } from "./KitchenAnchorRoot";
import { ClaimController } from "./ClaimController";
import { KitchenPersistence } from "./KitchenPersistence";
import { DishStudio } from "./DishStudio";
import { StationTargetHub } from "./StationTarget";

// ============================================================================
// MiseFlow v7 Stage 3 (Plan S8): the hidden Director palette.
// ----------------------------------------------------------------------------
// The Director dock (SIM / debug controls) is no longer product UI. This component adopts the existing dock object
// `DirectorPaletteUI` (every UI_Btn_* / Btn_AutoCook / Btn_CycleDish / Btn_StepGuide keeps its name, its
// MiseFlowButtonTrigger and its action) under a closed `DirectorPalette` root and adds a second row of v7 entries:
// Claim kitchen, Quick claim, Forget kitchen, Show ghosts (a flag only until Stage 7), Quick dish, Legacy HUD.
// Opens on PALETTE_REQUESTED (hold-pinch 1.5 s on the plate target), on key D in the editor, or open()/toggle();
// a second request closes it. Keyboard shortcuts 1-0 stay in MiseFlowSpatialUI exactly as they were.
// Closed = the root is disabled: no palette or dock object is visible. tapButton("Btn_AutoCook") and friends still
// work (they call the MiseFlowButtonTrigger component, not a hit test).
// ============================================================================

const ROOT_NAME = "DirectorPalette";
const DOCK_NAME = "DirectorPaletteUI";
const WARMUP_FRAMES = 12;
const PALETTE_LOCAL = new vec3(0, 4.0, 15.0); // kitchen-local, in front of the counter, low (arms down)

export type PaletteEntry = "CLAIM" | "QUICK_CLAIM" | "FORGET" | "GHOSTS" | "QUICK_DISH" | "LEGACY_HUD";

function ev(name: string): MiseFlowEventType {
  return name as unknown as MiseFlowEventType;
}

function alive(o: SceneObject | null | undefined): boolean {
  return !!o && !isNull(o);
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

@component
export class DirectorPalette extends BaseScriptComponent {
  private static instance: DirectorPalette | null = null;
  /** Stage 7 wires the ghosts to this flag; until then it is only stored. */
  private static showGhosts: boolean = false;

  private bus: MiseFlowEventBus = MiseFlowEventBus.getInstance();
  private handlers: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  private root: SceneObject | null = null;
  private dock: SceneObject | null = null;
  private open_: boolean = false;
  private frames: number = 0;
  private closedForGood: boolean = false;
  private glasses: KitGlass[] = [];
  private buttons: KitButton[] = [];
  private byEntry: { [e: string]: KitButton } = {};
  private warmup: number = 10;

  // ───────────────────────── static API ─────────────────────────

  public static getInstance(): DirectorPalette | null {
    const i = DirectorPalette.instance;
    return i && !isNull(i) ? i : null;
  }

  /** Creates (once) the object "DirectorPalette" under KitchenAnchorRoot. Idempotent. */
  public static ensure(): DirectorPalette {
    const cur = DirectorPalette.getInstance();
    if (cur) return cur;
    const existing = findInScene(ROOT_NAME);
    if (existing) {
      const c = existing.getComponent(DirectorPalette.getTypeName()) as DirectorPalette;
      if (c) {
        DirectorPalette.instance = c;
        return c;
      }
    }
    const obj = global.scene.createSceneObject(ROOT_NAME);
    obj.setParent(KitchenAnchorRoot.ensure().getRoot());
    obj.getTransform().setLocalPosition(PALETTE_LOCAL);
    // hidden by scale until the warm-up is over, so nothing flashes at boot while the UIKit buttons initialise
    obj.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
    const comp = obj.createComponent(DirectorPalette.getTypeName()) as DirectorPalette;
    if (!DirectorPalette.instance) DirectorPalette.instance = comp;
    return DirectorPalette.instance;
  }

  public static getShowGhosts(): boolean {
    return DirectorPalette.showGhosts;
  }

  // ───────────────────────── lifecycle ─────────────────────────

  onAwake(): void {
    DirectorPalette.instance = this;
    this.root = this.getSceneObject();
    this.createEvent("OnStartEvent").bind(() => this.start());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnDestroyEvent").bind(() => {
      for (const h of this.handlers) this.bus.off(h.ev, h.cb);
      this.handlers = [];
      if (DirectorPalette.instance === this) DirectorPalette.instance = null;
    });
  }

  private listen(name: string, cb: (d?: any) => void): void {
    const safe = (d?: any) => {
      try {
        cb(d);
      } catch (e) {
        print(`[DirectorPalette] ${name} handler error: ${e}`);
      }
    };
    this.bus.on(ev(name), safe);
    this.handlers.push({ ev: ev(name), cb: safe });
  }

  private start(): void {
    this.adoptDock();
    this.buildKitchenRow();
    // SIK / key / bus subscriptions in OnStart
    this.listen("PALETTE_REQUESTED", () => this.toggle());
    this.listen("STUDIO_STATE_CHANGED", (d?: any) => {
      if (d && d.open && this.open_) this.close();
    });
    this.listen("CLAIM_STATE_CHANGED", (d?: any) => {
      if (d && d.claiming && this.open_) this.close();
    });
    this.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
      const sys: any = (global as any).deviceInfoSystem;
      if (!sys || typeof sys.isEditor !== "function" || !sys.isEditor()) return;
      const key: any = (e as any).key;
      const ks = key !== undefined && key !== null ? String(key) : "";
      if ((typeof Keys !== "undefined" && key === Keys.D) || ks === "D" || ks === "d" || ks === "Key_D") {
        print("[DirectorPalette] key D: toggle");
        this.toggle();
      }
    });
  }

  // ───────────────────────── public API ─────────────────────────

  public getRoot(): SceneObject {
    return this.root as SceneObject;
  }

  public getDock(): SceneObject | null {
    return this.dock;
  }

  public isOpen(): boolean {
    return this.open_;
  }

  public open(): void {
    if (this.open_) return;
    this.open_ = true;
    if (this.root && alive(this.root)) {
      this.root.getTransform().setLocalScale(vec3.one());
      this.root.enabled = true;
    }
    this.warmup = 10;
    print("[DirectorPalette] open");
  }

  public close(): void {
    if (!this.open_ && this.closedForGood) return;
    this.open_ = false;
    if (this.root && alive(this.root)) {
      this.root.getTransform().setLocalScale(vec3.one());
      this.root.enabled = false;
    }
    this.closedForGood = true;
    print("[DirectorPalette] closed");
  }

  public toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  public getShowGhosts(): boolean {
    return DirectorPalette.showGhosts;
  }

  /** Show ghosts: only stores the flag in Stage 3 (Stage 7 reads it). */
  public setShowGhosts(on: boolean): void {
    DirectorPalette.showGhosts = on;
    const b = this.byEntry.GHOSTS;
    if (b) {
      b.primary = on;
      styleKitButton(b);
    }
    print(`[DirectorPalette] show ghosts flag = ${on}`);
  }

  /** Same as pinching the entry (LEAF / development). */
  public press(entry: PaletteEntry): void {
    switch (entry) {
      case "CLAIM":
        this.claimKitchen();
        break;
      case "QUICK_CLAIM":
        this.quickClaim();
        break;
      case "FORGET":
        this.forgetKitchen();
        break;
      case "GHOSTS":
        this.setShowGhosts(!DirectorPalette.showGhosts);
        break;
      case "QUICK_DISH":
        this.quickDish();
        break;
      case "LEGACY_HUD":
        this.toggleLegacyHud();
        break;
    }
  }

  public claimKitchen(): boolean {
    this.close();
    return ClaimController.ensure().begin();
  }

  public quickClaim(): number {
    this.close();
    return ClaimController.ensure().quickClaim();
  }

  /** KitchenPersistence.forget() then KitchenAnchorRoot.resetPose() (+ the Station_* rings of the forgotten kitchen). */
  public forgetKitchen(): void {
    const claim = ClaimController.ensure();
    if (claim.isClaiming()) claim.cancel();
    KitchenPersistence.ensure().forget();
    ClaimController.clearStations();
    KitchenAnchorRoot.ensure().resetPose();
    print("[DirectorPalette] kitchen forgotten, pose back at P0");
  }

  public quickDish(): void {
    const studio = DishStudio.getInstance();
    if (studio) studio.quickCycle();
  }

  private toggleLegacyHud(): void {
    const hub = StationTargetHub.ensure();
    const on = !hub.isLegacyHudRevealed();
    hub.setLegacyHudRevealed(on);
    const b = this.byEntry.LEGACY_HUD;
    if (b) {
      b.primary = on;
      styleKitButton(b);
    }
  }

  // ───────────────────────── building ─────────────────────────

  /** The dock object keeps its name, children, triggers and billboard registration; only its parent changes. */
  private adoptDock(): void {
    const dock = findInScene(DOCK_NAME);
    if (!dock || !this.root) {
      print("[DirectorPalette] dock not found; palette has only the kitchen row");
      return;
    }
    this.dock = dock;
    dock.setParent(this.root);
    dock.getTransform().setLocalPosition(vec3.zero());
    print(`[DirectorPalette] adopted ${DOCK_NAME} (${dock.getChildrenCount()} children)`);
  }

  private buildKitchenRow(): void {
    if (!this.dock) return;
    const BTN_H = 1.3;
    const GAP = 0.26;
    const PAD = 0.45;
    const PANEL_H = 2.2;
    const TAG_W = 2.1;
    const rowY = -(PANEL_H + 0.35);
    const specs: { entry: PaletteEntry; name: string; label: string; accent: vec4; w: number }[] = [
      { entry: "CLAIM", name: "UI_Btn_ClaimKitchen", label: "Claim kitchen", accent: KIT.CYAN, w: 3.8 },
      { entry: "QUICK_CLAIM", name: "UI_Btn_QuickClaim", label: "Quick claim", accent: KIT.CYAN, w: 3.5 },
      { entry: "FORGET", name: "UI_Btn_ForgetKitchen", label: "Forget kitchen", accent: KIT.CORAL, w: 3.9 },
      { entry: "GHOSTS", name: "UI_Btn_ShowGhosts", label: "Show ghosts", accent: KIT.NEUTRAL, w: 3.5 },
      { entry: "QUICK_DISH", name: "UI_Btn_QuickDish", label: "Quick dish", accent: KIT.VIOLET, w: 3.3 },
      { entry: "LEGACY_HUD", name: "UI_Btn_LegacyHud", label: "Legacy HUD", accent: KIT.NEUTRAL, w: 3.4 },
    ];
    let panelW = PAD * 2 + TAG_W + 0.35;
    for (const s of specs) panelW += s.w + GAP;
    panelW -= GAP;

    const row = global.scene.createSceneObject("Director_KitchenRow");
    row.setParent(this.dock);
    row.getTransform().setLocalPosition(new vec3(0, rowY, 0.05));
    kitGlass(row, "Director_Glass_Kitchen", new vec3(0, 0, -0.1), new vec2(panelW, PANEL_H), withAlpha(KIT.GLASS, 0.88), withAlpha(KIT.NEUTRAL, 0.55), 0.05, PANEL_H / 2, this.glasses);
    let x = -panelW / 2 + PAD;
    kitGlass(row, "Director_TagChip_KITCHEN", new vec3(x + TAG_W / 2, 0, -0.05), new vec2(TAG_W, BTN_H), new vec4(KIT.CYAN.r * 0.25, KIT.CYAN.g * 0.25, KIT.CYAN.b * 0.25, 0.92), withAlpha(KIT.CYAN, 0.85), 0.05, BTN_H / 2, this.glasses);
    kitText(row, "Director_Tag_KITCHEN", "KITCHEN", 22, KIT.CYAN, new vec3(x + TAG_W / 2, 0, 0), TAG_W, BTN_H, { weight: 800 });
    x += TAG_W + 0.35;
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const kb = this.makeButton(row, s.name, s.label, s.accent, new vec3(x + s.w / 2, 0, 0), s.w, BTN_H, () => this.press(s.entry));
      this.byEntry[s.entry] = kb;
      x += s.w + GAP;
    }
    for (const g of this.glasses) applyKitGlass(g);
  }

  private makeButton(parent: SceneObject, name: string, label: string, accent: vec4, pos: vec3, w: number, h: number, onPress: () => void): KitButton {
    const holder = global.scene.createSceneObject(`${name}_Holder`);
    holder.setParent(parent);
    holder.getTransform().setLocalPosition(pos);
    const frame = kitGlass(holder, `${name}_Frame`, new vec3(0, 0, -0.05), new vec2(w, h), withAlpha(KIT.GLASS, 0.9), withAlpha(accent, 0.9), 0.05, h / 2, this.glasses);
    const txt = kitText(holder, `${name}_Label`, label, 24, KIT.TEXT, new vec3(0, 0, 0.06), w - 0.3, h);
    const obj = global.scene.createSceneObject(name);
    obj.setParent(holder);
    const kb: KitButton = { obj: holder, frame, accent, label: txt, hovered: false, pressed: false, dim: false, primary: false, scale: 1 };
    try {
      const btn = obj.createComponent(Button.getTypeName()) as Button;
      btn.setVariant({ theme: "SnapOS2", shape: "Capsule", style: "Ghost" });
      btn.size = new vec3(w, h, 0.3);
      btn.onHoverEnter.add(() => {
        kb.hovered = true;
        styleKitButton(kb);
      });
      btn.onHoverExit.add(() => {
        kb.hovered = false;
        kb.pressed = false;
        styleKitButton(kb);
      });
      btn.onTriggerDown.add(() => {
        kb.pressed = true;
        styleKitButton(kb);
      });
      btn.onTriggerUp.add(() => {
        kb.pressed = false;
        styleKitButton(kb);
        onPress();
      });
    } catch (e) {
      print(`[DirectorPalette] UIKit button unavailable (${e}); use press()`);
    }
    styleKitButton(kb);
    this.buttons.push(kb);
    return kb;
  }

  // ───────────────────────── frame ─────────────────────────

  private onUpdate(): void {
    this.frames++;
    if (this.frames === WARMUP_FRAMES && !this.open_ && !this.closedForGood) {
      // every UIKit button has initialised: the palette goes to its closed state (root disabled, scale back to 1)
      this.close();
    }
    if (!this.open_ || !this.root || !this.root.enabled) return;
    animateKitButtons(this.buttons, getDeltaTime());
    if (this.warmup > 0) {
      this.warmup--;
      for (const g of this.glasses) applyKitGlass(g);
    }
  }
}
