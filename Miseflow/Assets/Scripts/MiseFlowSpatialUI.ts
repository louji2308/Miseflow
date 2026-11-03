import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { ElementContent } from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { ChoreographyDAG } from "./ChoreographyDAG";
import { MetricPrepBlueprint } from "./MetricPrepBlueprint";
import { MiseFlowEventBus } from "./MiseFlowEventBus";
import { StationInteractableController } from "./StationInteractableController";
import { RapidRouterVisionService } from "./AI/RapidRouterVisionService";
import { VisionScanStandIn } from "./AI/VisionScanStandIn";
import { VisionConfig } from "./AI/VisionConfig";
import { GazeEdgeBeacon } from "./GazeEdgeBeacon";
import { DAGCounterConduit, createWorldIcon, splitMetric, layoutSplitText } from "./DAGCounterConduit";
import { DiegeticChronoRing } from "./DiegeticChronoRing";
import { SpatulaTechniqueGuide } from "./SpatulaTechniqueGuide";
import { PlatingFinisher } from "./PlatingFinisher";
import { AutoCookController } from "./AutoCookController";
import { MiseFlowButtonTrigger } from "./MiseFlowButtonTrigger";

// ============================================================================
// MiseFlow v4 "Diegetic Cockpit" — progressive-disclosure spatial UI
// ----------------------------------------------------------------------------
// * Each station gets a compact 2-line pill pinned just above its own cookware
//   (line 1 = large timer/metric, line 2 = bold <=4-word action). Idle stations
//   collapse to a 1-line pill; the alerted/active station expands, pops, and
//   recedes again once the moment has passed.
// * Master chronometer is a small single-line pill high above the saucier.
// * Director HUD is a compact two-group dock (COOK | SIM) with colour-coded
//   neon frames and hover/press feedback, lifted fully inside the frame.
// * Additive-display contrast: light text on dark glass with a strong luminous
//   edge (dark = transparent on Specs, so the edge + text carry the read).
// NOTE: LEAF asserts on the controller-owned Text3D labels (PrepStatusLabel,
// SkilletStatusLabel, SaucepotStatusLabel) and Btn_* triggers; this script only
// hides their legacy visuals and never rewrites their text.
// ============================================================================

// Palette (luminous jewel tones for an additive display)
const COLOR_TEXT_HEADING = new vec4(0.97, 0.98, 1.0, 1.0);
const COLOR_TEXT_MUTED = new vec4(0.7, 0.78, 0.88, 0.95);
const COLOR_GOLD_HEAT = new vec4(1.0, 0.76, 0.28, 1.0);
const COLOR_AMBER_DRIFT = new vec4(1.0, 0.62, 0.16, 1.0);
const COLOR_CYAN_PREP = new vec4(0.22, 0.86, 0.98, 1.0);
const COLOR_VIOLET_AI = new vec4(0.76, 0.54, 1.0, 1.0);
const COLOR_CORAL_ALERT = new vec4(1.0, 0.42, 0.38, 1.0);
const COLOR_EMERALD_DONE = new vec4(0.24, 0.95, 0.62, 1.0);
const COLOR_SILVER = new vec4(0.78, 0.84, 0.92, 1.0);
const COLOR_GLASS = new vec4(0.04, 0.06, 0.1, 1.0);
const COLOR_AUTO_WHITE_GOLD = new vec4(1.0, 0.9, 0.62, 1.0); // WS9-P3 Auto Cook button (white-gold)

// Camera pose that frames the counter, expressed in StationsRoot-local space
// (world camera (0,25.1,-21.4) minus StationsRoot (0,-17.5,-76)). Used to make
// every panel face the viewer.
const CAM_LOCAL = new vec3(0, 42.6, 54.6);

// Pill geometry (cm)
// v5 capsule labels: dark glass, hairline accent outline, icon left, white label + accent value
const PILL_W = 10.4;
const PILL_PAD = 0.3;
const PILL_METRIC_H = 1.42;
const PILL_ACTION_H = 0.9;
const PILL_GAP = 0.02;
const PILL_H_COLLAPSED = PILL_PAD * 2 + PILL_METRIC_H;
const PILL_H_EXPANDED = PILL_PAD * 2 + PILL_METRIC_H + PILL_GAP + PILL_ACTION_H;
const PILL_METRIC_SIZE = 52;
const PILL_ACTION_SIZE = 30;
const PILL_ICON = 1.25;
const PILL_BORDER = 0.065;

const ICON_FIRE = requireAsset("../Icons/local_fire_department.png") as Texture;
const ICON_POT = requireAsset("../Icons/stockpot.png") as Texture;
const ICON_CUT = requireAsset("../Icons/content_cut.png") as Texture;
const ICON_CLOCHE = requireAsset("../Icons/room_service.png") as Texture;

// Pill anchors = bottom-centre of each pill, StationsRoot-local. Stations:
// skillet (-11.2,-0.22,-1.5), saucier (0,-0.22,-10.5), board (10.5,0.64,-3.0).
const SKILLET_PILL_ANCHOR = new vec3(-11.2, 6.0, -4.0);
const SKILLET_STEM_FOOT_Y = 1.6;
const SAUCE_PILL_ANCHOR = new vec3(0.0, 10.4, -12.0);
const SAUCE_STEM_FOOT_Y = 4.9;
const PREP_PILL_ANCHOR = new vec3(12.0, 5.6, -6.5);
const PREP_STEM_FOOT_Y = 1.6;
const CHRONO_CENTER = new vec3(0.0, 19.0, -16.0);
const DIRECTOR_CENTER = new vec3(0.0, -1.0, 13.4);

// How long transient expansions stay open before receding (seconds)
const EXPAND_PULSE_SEC = 5.0;
// How long a vision gate verdict holds the Skillet pill (seconds)
const VISION_VERDICT_SEC = 6.0;

function faceCamera(pos: vec3): quat {
  const d = CAM_LOCAL.sub(pos);
  const yaw = Math.atan2(d.x, d.z);
  const horiz = Math.sqrt(d.x * d.x + d.z * d.z);
  const pitch = -Math.atan2(d.y, horiz);
  return quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(pitch, vec3.right()));
}

function yawToCamera(pos: vec3): quat {
  const d = CAM_LOCAL.sub(pos);
  return quat.angleAxis(Math.atan2(d.x, d.z), vec3.up());
}

function withAlpha(c: vec4, a: number): vec4 {
  return new vec4(c.r, c.g, c.b, a);
}

function scaleRgb(c: vec4, k: number, a: number): vec4 {
  return new vec4(c.r * k, c.g * k, c.b * k, a);
}

function findByName(parent: SceneObject, name: string): SceneObject | null {
  if (parent.name === name) return parent;
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    const found = findByName(parent.getChild(i), name);
    if (found) return found;
  }
  return null;
}

function findAllByName(parent: SceneObject, name: string, out: SceneObject[] = []): SceneObject[] {
  if (parent.name === name) out.push(parent);
  const count = parent.getChildrenCount();
  for (let i = 0; i < count; i++) {
    findAllByName(parent.getChild(i), name, out);
  }
  return out;
}

function formatMMSS(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins < 10 ? "0" + mins : "" + mins}:${rem < 10 ? "0" + rem : "" + rem}`;
}

interface GlassStyle {
  rr: RoundedRectangle;
  bg: vec4;
  border: vec4;
  borderSize: number;
  radius: number;
  opacity: number;
}

function applyGlass(s: GlassStyle): void {
  if (!s.rr || isNull(s.rr)) return;
  s.rr.gradient = false;
  s.rr.backgroundColor = s.bg;
  s.rr.border = true;
  s.rr.borderColor = s.border;
  s.rr.borderSize = s.borderSize;
  s.rr.cornerRadius = s.radius;
  s.rr.opacity = s.opacity;
}

interface StationView {
  metric: string;
  action: string;
  accent: vec4;
  metricColor: vec4;
  expanded: boolean;
  key: string; // state identity; a change triggers the attention pop
}

interface Pill {
  root: SceneObject;
  glassObj: SceneObject;
  glass: GlassStyle;
  metricText: Text; // label part ("SEAR"), white
  valueText: Text; // value part ("01:00"), accent colour
  actionText: Text;
  iconImage: Image | null;
  metricStr: string;
  stem: GlassStyle | null;
  stemObj: SceneObject | null;
  foot: GlassStyle | null;
  curH: number;
  targetH: number;
  pulse: number;
  key: string;
  accent: vec4;
  metricColor: vec4;
}

interface DirectorButton {
  obj: SceneObject;
  frameObj: SceneObject;
  frame: GlassStyle;
  accent: vec4;
  hovered: boolean;
  pressed: boolean;
  latched: boolean;
  scale: number;
}

@component
export class MiseFlowSpatialUI extends BaseScriptComponent {
  private controller?: StationInteractableController;
  private dag?: ChoreographyDAG;
  private prepBlueprint?: MetricPrepBlueprint;
  private visionService?: RapidRouterVisionService;
  private eventBus: MiseFlowEventBus = MiseFlowEventBus.getInstance();

  private glassStyles: GlassStyle[] = [];
  private startFrameWarmup: number = 0;
  private clock: number = 0;

  private skilletPill?: Pill;
  private saucePill?: Pill;
  private prepPill?: Pill;
  private chronoGlass?: GlassStyle;
  private chronoText?: Text;
  private chronoValue?: Text;
  private chronoStr: string = "";
  private directorButtons: DirectorButton[] = [];
  private warpButton?: DirectorButton;
  private autoButton?: DirectorButton;
  private autoButtonContent?: ElementContent;

  // WS9-P3 Auto Cook caption / plated dish / flip state
  private autoCaption: string = "";
  private isDishReady: boolean = false;
  private isSalmonFlipped: boolean = false;
  private isSalmonFlipping: boolean = false;

  // State
  private isDriftActive: boolean = false;
  private isHeld: boolean = false;
  private isPrepTransferred: boolean = false;
  private isPlated: boolean = false;
  private isTimeWarp: boolean = false;
  private autoApplyCountdown: number = -1.0;
  private plateAnchorTargetSec: number = 400; // 06:40
  private plateAnchorDisplaySec: number = 400;
  private holdExpandUntil: number = -1;
  private transferExpandUntil: number = -1;
  private aiExpandUntil: number = -1;

  // AI scanner state
  private isAiScanning: boolean = false;
  private aiScanTimer: number = 0.0;
  private aiLatestMessage: string = "";

  // Deterministic vision stand-in verdict shown on the Skillet pill
  private visionStandIn?: VisionScanStandIn;
  private visionMetric: string = "";
  private visionAction: string = "";
  private visionAccent: vec4 = COLOR_VIOLET_AI;
  private visionKey: string = "";
  private visionUntil: number = -1;

  onAwake(): void {
    const root = this.getSceneObject();
    if (!root.getComponent(RapidRouterVisionService.getTypeName())) {
      root.createComponent(RapidRouterVisionService.getTypeName());
    }
    this.ensureHeroComponents(root);

    this.buildSpatialInterface();

    this.createEvent("OnStartEvent").bind(() => {
      this.resolveControllers();
      this.suppressLegacyVisuals();
      this.applyAllGlass();
      this.bindEventListeners();
      this.bindKeyboardShortcuts();
      this.refreshAll(true);
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
    });
  }

  private resolveControllers(): void {
    const root = this.getSceneObject();
    this.controller = root.getComponent(
      StationInteractableController.getTypeName()
    ) as StationInteractableController;
    this.dag = root.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    this.prepBlueprint = root.getComponent(MetricPrepBlueprint.getTypeName()) as MetricPrepBlueprint;
    this.visionService = root.getComponent(
      RapidRouterVisionService.getTypeName()
    ) as RapidRouterVisionService;
    const layer = findByName(root, "DiegeticLayer") || root;
    this.visionStandIn = layer.getComponent(VisionScanStandIn.getTypeName()) as VisionScanStandIn;
  }

  /**
   * v4 diegetic + hero layer on StationsRoot/DiegeticLayer: DAG conduits, chrono rings, gaze
   * edge beacons, spatula flip guide and the deterministic vision stand-in. Created at runtime
   * (idempotent) so the layer never depends on an unsaved editor scene edit.
   */
  private ensureHeroComponents(root: SceneObject): void {
    let layer = findByName(root, "DiegeticLayer");
    if (!layer) {
      layer = global.scene.createSceneObject("DiegeticLayer");
      layer.setParent(root);
    }
    for (const typeName of [
      DAGCounterConduit.getTypeName(),
      DiegeticChronoRing.getTypeName(),
      GazeEdgeBeacon.getTypeName(),
      SpatulaTechniqueGuide.getTypeName(),
      VisionScanStandIn.getTypeName(),
      PlatingFinisher.getTypeName(), // WS9-P3 salmon -> plate, sauce, garnish
      AutoCookController.getTypeName(), // WS9-P3 Auto Cook director mode
    ]) {
      if (!layer.getComponent(typeName)) layer.createComponent(typeName);
    }
  }

  private suppressLegacyVisuals(): void {
    const root = this.getSceneObject();

    // Legacy Btn_* objects stay alive (LEAF taps them via MiseFlowButtonTrigger)
    // but are visually removed in favour of the Director HUD.
    const legacyButtons = [
      "Btn_StepChop",
      "Btn_FillPortion",
      "Btn_Transfer",
      "Btn_CheckSear",
      "Btn_ToggleHold",
      "Btn_ToggleTimeWarp",
      "Btn_Reset",
    ];
    for (const btnName of legacyButtons) {
      for (const btnObj of findAllByName(root, btnName)) {
        const rmv = btnObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv) rmv.enabled = false;
        const count = btnObj.getChildrenCount();
        for (let i = 0; i < count; i++) {
          btnObj.getChild(i).enabled = false;
        }
        btnObj.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      }
    }

    // Legacy Text3D labels keep their text (LEAF contract); only hidden.
    const legacyLabels = [
      "PrepStatusLabel",
      "SkilletStatusLabel",
      "SaucepotStatusLabel",
      "DebriefText",
      "DriftDecisionText",
      "Lbl_StepChop",
      "Lbl_FillPortion",
      "Lbl_Transfer",
      "Lbl_CheckSear",
      "Lbl_ToggleHold",
      "Lbl_ToggleTimeWarp",
      "Lbl_Reset",
    ];
    for (const lblName of legacyLabels) {
      for (const lblObj of findAllByName(root, lblName)) {
        lblObj.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      }
    }

    const cardBackings = ["CardBacking", "DriftBacking", "WristPillBacking", "DebriefBacking"];
    for (const backingName of cardBackings) {
      for (const bObj of findAllByName(root, backingName)) {
        const rmv = bObj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
        if (rmv) rmv.enabled = false;
        bObj.getTransform().setLocalScale(new vec3(0.0001, 0.0001, 0.0001));
      }
    }

    for (const cName of ["PlatingDebriefCard", "DriftDecisionCard"]) {
      for (const cObj of findAllByName(root, cName)) {
        cObj.enabled = false;
      }
    }
  }

  /** WS9-P3: manual actions stand down while Auto Cook runs (Reset / Stop still work). */
  private manualAllowed(what: string): boolean {
    if (!AutoCookController.isAutoRunning()) return true;
    print(`[MiseFlowUI] Auto Cook running: ignoring ${what} (press Stop or Reset first)`);
    return false;
  }

  private toggleAutoCook(): void {
    const auto = AutoCookController.getInstance();
    if (auto) auto.toggle();
  }

  private bindKeyboardShortcuts(): void {
    this.createEvent("KeyPressEvent").bind((ev: KeyPressEvent) => {
      if (!this.controller) return;
      const key = (ev as any).key ? String((ev as any).key) : "";
      if (key === "7" || key === "Key_7") {
        this.toggleAutoCook();
        return;
      }
      if (key !== "0" && key !== "Key_0" && !this.manualAllowed(`key ${key}`)) return;
      if (key === "1" || key === "Key_1") {
        this.controller.onStepChopPressed();
      } else if (key === "2" || key === "Key_2") {
        this.controller.onFillPortionPressed();
      } else if (key === "3" || key === "Key_3") {
        this.controller.onTransferPressed();
      } else if (key === "4" || key === "Key_4") {
        this.triggerRealAiVisionScan();
      } else if (key === "5" || key === "Key_5") {
        this.controller.onSimulatePrepDrift();
      } else if (key === "6" || key === "Key_6") {
        this.controller.onToggleTimeWarpPressed();
      } else if (key === "0" || key === "Key_0") {
        this.controller.onResetPressed();
      }
    });
  }

  // ==========================================================================
  // Construction
  // ==========================================================================

  private buildSpatialInterface(): void {
    const root = this.getSceneObject();

    this.skilletPill = this.buildPill(root, "SkilletStationUI", SKILLET_PILL_ANCHOR, SKILLET_STEM_FOOT_Y, COLOR_GOLD_HEAT, "SEAR 01:00", "FLIP AT ZERO", ICON_FIRE);
    this.saucePill = this.buildPill(root, "SauceStationUI", SAUCE_PILL_ANCHOR, SAUCE_STEM_FOOT_Y, COLOR_CYAN_PREP, "SAUCE 00:50", "WAITS ON PREP", ICON_POT);
    this.prepPill = this.buildPill(root, "PrepStationUI", PREP_PILL_ANCHOR, PREP_STEM_FOOT_Y, COLOR_CYAN_PREP, "CUT 0/8", "SLICE ON GUIDES", ICON_CUT);
    this.prepPill.targetH = PILL_H_EXPANDED; // the cook's first task starts open
    this.prepPill.curH = PILL_H_EXPANDED;
    this.layoutPill(this.prepPill);

    this.buildChronometer(root, CHRONO_CENTER);
    this.buildDirectorPalette(root, DIRECTOR_CENTER);
    this.buildLeafTestHarnessObject(root);
  }

  private createGlass(
    parent: SceneObject,
    name: string,
    localPos: vec3,
    size: vec2,
    bg: vec4,
    border: vec4,
    borderSize: number,
    radius: number,
    opacity: number
  ): { obj: SceneObject; style: GlassStyle } {
    const obj = global.scene.createSceneObject(name);
    obj.setParent(parent);
    obj.getTransform().setLocalPosition(localPos);
    const rr = obj.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle;
    rr.size = size;
    const style: GlassStyle = { rr, bg, border, borderSize, radius, opacity };
    applyGlass(style);
    this.glassStyles.push(style);
    return { obj, style };
  }

  private createText(
    parent: SceneObject,
    name: string,
    content: string,
    size: number,
    weight: number,
    color: vec4,
    localPos: vec3,
    width: number,
    height: number
  ): Text {
    const obj = global.scene.createSceneObject(name);
    obj.setParent(parent);
    obj.getTransform().setLocalPosition(localPos);
    const txt = obj.createComponent("Component.Text") as Text;
    txt.text = content;
    txt.size = size;
    (txt as Text & { weight?: number }).weight = weight;
    txt.textFill.mode = TextFillMode.Solid;
    txt.textFill.color = color;
    txt.horizontalAlignment = HorizontalAlignment.Center;
    txt.verticalAlignment = VerticalAlignment.Center;
    txt.horizontalOverflow = HorizontalOverflow.Shrink;
    txt.verticalOverflow = VerticalOverflow.Overflow;
    txt.depthTest = true;
    txt.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2);
    return txt;
  }

  private buildPill(
    parent: SceneObject,
    name: string,
    anchor: vec3,
    stemFootY: number,
    accent: vec4,
    metric: string,
    action: string,
    icon: Texture | null = null
  ): Pill {
    const existing = findByName(parent, name);
    if (existing) existing.destroy();

    const root = global.scene.createSceneObject(name);
    root.setParent(parent);
    root.getTransform().setLocalPosition(anchor);
    root.getTransform().setLocalRotation(faceCamera(anchor));
    root.createComponent("Component.Canvas");

    const h = PILL_H_COLLAPSED;
    const glass = this.createGlass(
      root,
      `${name}_Glass`,
      new vec3(0, h / 2, 0),
      new vec2(PILL_W, h),
      withAlpha(COLOR_GLASS, 0.88),
      withAlpha(accent, 0.95),
      PILL_BORDER,
      h / 2,
      0.9
    );

    let iconImage: Image | null = null;
    if (icon) {
      iconImage = createWorldIcon(root, `${name}_Icon`, icon, PILL_ICON, new vec3(0, 0, 0.03), accent);
    }

    const metricText = this.createText(root, `${name}_Metric`, metric, PILL_METRIC_SIZE, 700, COLOR_TEXT_HEADING, new vec3(0, 0, 0.03), PILL_W - 0.7, PILL_METRIC_H);
    const valueText = this.createText(root, `${name}_Value`, "", PILL_METRIC_SIZE, 700, accent, new vec3(0, 0, 0.03), PILL_W - 0.7, PILL_METRIC_H);
    const actionText = this.createText(
      root,
      `${name}_Action`,
      action,
      PILL_ACTION_SIZE,
      700,
      COLOR_TEXT_HEADING,
      new vec3(0, PILL_PAD + PILL_ACTION_H / 2, 0.03),
      PILL_W - 0.7,
      PILL_ACTION_H
    );
    actionText.getSceneObject().enabled = false;

    // Leader: hairline stem from the pill's bottom-centre down to the cookware, ending in a dot.
    let stem: GlassStyle | null = null;
    let stemObj: SceneObject | null = null;
    let foot: GlassStyle | null = null;
    const stemLen = anchor.y - stemFootY;
    if (stemLen > 0.3) {
      const stemPos = new vec3(anchor.x, (anchor.y + stemFootY) / 2, anchor.z);
      const s = this.createGlass(
        parent,
        `${name}_Stem`,
        stemPos,
        new vec2(0.05, stemLen),
        withAlpha(accent, 0.9),
        withAlpha(accent, 0.9),
        0.0,
        0.025,
        0.9
      );
      s.obj.getTransform().setLocalRotation(yawToCamera(stemPos));
      stem = s.style;
      stemObj = s.obj;

      const f = this.createGlass(
        s.obj,
        `${name}_StemFoot`,
        new vec3(0, -stemLen / 2, 0.01),
        new vec2(0.34, 0.34),
        withAlpha(accent, 1.0),
        withAlpha(accent, 1.0),
        0.0,
        0.17,
        1.0
      );
      foot = f.style;
    }

    const pill: Pill = {
      root,
      glassObj: glass.obj,
      glass: glass.style,
      metricText,
      valueText,
      actionText,
      iconImage,
      metricStr: "",
      stem,
      stemObj,
      foot,
      curH: h,
      targetH: h,
      pulse: 0,
      key: "",
      accent,
      metricColor: COLOR_TEXT_HEADING,
    };
    this.setPillMetric(pill, metric);
    this.layoutPill(pill);
    return pill;
  }

  /** Split "SEAR 01:00" into a white label + accent value, centred in the area right of the icon. */
  private setPillMetric(p: Pill, metric: string): void {
    p.metricStr = metric;
    const [l, v] = splitMetric(metric);
    const iconSpan = p.iconImage ? PILL_ICON + 0.3 : 0;
    const left = -PILL_W / 2 + PILL_PAD + 0.25 + iconSpan;
    const right = PILL_W / 2 - PILL_PAD - 0.25;
    const y = p.curH - PILL_PAD - PILL_METRIC_H / 2;
    const total = layoutSplitText(p.metricText, p.valueText, l, v, PILL_METRIC_SIZE, (left + right) / 2, y, 0.03, right - left);
    if (p.iconImage) {
      const ix = Math.max(-PILL_W / 2 + PILL_PAD + 0.15 + PILL_ICON / 2, (left + right) / 2 - total / 2 - 0.4 - PILL_ICON / 2);
      p.iconImage.getSceneObject().getTransform().setLocalPosition(new vec3(ix, y, 0.03));
    }
  }

  private buildChronometer(parent: SceneObject, center: vec3): void {
    const existing = findByName(parent, "PlateAnchorUI");
    if (existing) existing.destroy();

    const root = global.scene.createSceneObject("PlateAnchorUI");
    root.setParent(parent);
    root.getTransform().setLocalPosition(center);
    root.getTransform().setLocalRotation(faceCamera(center));
    root.createComponent("Component.Canvas");

    const w = 12.6;
    const h = 2.0;
    const g = this.createGlass(
      root,
      "PlateAnchor_Glass",
      new vec3(0, 0, 0),
      new vec2(w, h),
      withAlpha(COLOR_GLASS, 0.88),
      withAlpha(COLOR_EMERALD_DONE, 0.95),
      PILL_BORDER,
      h / 2,
      0.9
    );
    this.chronoGlass = g.style;
    createWorldIcon(root, "PlateAnchor_Icon", ICON_CLOCHE, 1.35, new vec3(-w / 2 + 1.55, 0, 0.03), COLOR_TEXT_HEADING);
    this.createGlass(
      root,
      "PlateAnchor_Divider",
      new vec3(-w / 2 + 2.75, 0, 0.02),
      new vec2(0.05, h * 0.5),
      withAlpha(COLOR_SILVER, 0.7),
      withAlpha(COLOR_SILVER, 0.7),
      0.0,
      0.025,
      0.9
    );
    this.chronoText = this.createText(root, "PlateAnchorTime", "PLATE IN", 54, 700, COLOR_TEXT_HEADING, new vec3(0, 0, 0.03), w - 0.6, h - 0.3);
    this.chronoValue = this.createText(root, "PlateAnchorValue", "06:40", 54, 700, COLOR_EMERALD_DONE, new vec3(0, 0, 0.03), w - 0.6, h - 0.3);
    this.setChrono("PLATE IN 06:40");
  }

  private setChrono(full: string): void {
    if (!this.chronoText || !this.chronoValue || full === this.chronoStr) return;
    this.chronoStr = full;
    const [l, v] = splitMetric(full);
    const left = -12.6 / 2 + 3.0;
    const right = 12.6 / 2 - 0.4;
    // maxW keeps Auto Cook / DISH READY captions right of the divider (PLATE IN mm:ss layout unchanged)
    const maxW = full.indexOf("PLATE IN") === 0 ? 1000 : right - left - 0.3;
    layoutSplitText(this.chronoText, this.chronoValue, l, v, 54, (left + right) / 2, 0, 0.03, maxW);
  }

  // --------------------------------------------------------------------------
  // Director HUD: COOK (Step Cut, Transfer, AI Vision) | SIM (+25s, Warp, Reset)
  // --------------------------------------------------------------------------
  private buildDirectorPalette(parent: SceneObject, center: vec3): void {
    const existing = findByName(parent, "DirectorPaletteUI");
    if (existing) existing.destroy();

    const dock = global.scene.createSceneObject("DirectorPaletteUI");
    dock.setParent(parent);
    dock.getTransform().setLocalPosition(center);
    dock.getTransform().setLocalRotation(faceCamera(center));
    dock.createComponent("Component.Canvas");
    // WS9-P3: third AUTO group -> slightly tighter spacing + 0.93 scale keeps the dock inside the Specs crop
    dock.getTransform().setLocalScale(new vec3(0.93, 0.93, 0.93));

    // v5 capsule dock: COOK chip | Step Cut, Transfer, AI Vision | SIM chip | +25s Drift, 10x Warp, Reset | AUTO chip | Auto Cook
    const BTN_H = 1.3;
    const BTN_GAP = 0.26;
    const TAG_W = 2.1;
    const GROUP_GAP = 0.7;
    const PAD_X = 0.45;
    const PANEL_H = 2.2;
    const COLOR_NEUTRAL = new vec4(0.62, 0.66, 0.72, 1.0);

    type BtnSpec = { name: string; label: string; accent: vec4; w: number; onPress: () => void };
    const groups: { tag: string; tagColor: vec4; buttons: BtnSpec[] }[] = [
      {
        tag: "COOK",
        tagColor: COLOR_CYAN_PREP,
        buttons: [
          { name: "UI_Btn_StepChop", label: "Step Cut", accent: COLOR_NEUTRAL, w: 3.1, onPress: () => { if (this.controller) this.controller.onStepChopPressed(); } },
          { name: "UI_Btn_Transfer", label: "Transfer", accent: COLOR_NEUTRAL, w: 3.1, onPress: () => { if (this.controller) this.controller.onTransferPressed(); } },
          { name: "UI_Btn_InspectSear", label: "AI Vision", accent: COLOR_VIOLET_AI, w: 3.2, onPress: () => { this.triggerRealAiVisionScan(); } },
        ],
      },
      {
        tag: "SIM",
        tagColor: COLOR_AMBER_DRIFT,
        buttons: [
          { name: "UI_Btn_TriggerDrift", label: "+25s Drift", accent: COLOR_AMBER_DRIFT, w: 3.4, onPress: () => { if (this.controller) this.controller.onSimulatePrepDrift(); } },
          { name: "UI_Btn_TimeWarp", label: "10x Warp", accent: COLOR_EMERALD_DONE, w: 3.2, onPress: () => { if (this.controller) this.controller.onToggleTimeWarpPressed(); } },
          { name: "UI_Btn_Reset", label: "Reset", accent: COLOR_NEUTRAL, w: 2.6, onPress: () => { if (this.controller) this.controller.onResetPressed(); } },
        ],
      },
      {
        // WS9-P3: Auto Cook runs the whole service start -> plated dish (label turns into "Stop")
        tag: "AUTO",
        tagColor: COLOR_GOLD_HEAT,
        buttons: [
          { name: "Btn_AutoCook", label: "Auto Cook", accent: COLOR_AUTO_WHITE_GOLD, w: 3.4, onPress: () => { this.toggleAutoCook(); } },
        ],
      },
    ];
    // manual buttons stand down while Auto Cook runs; Reset (cancels it) and Auto Cook itself stay live
    for (const g of groups) {
      for (const b of g.buttons) {
        if (b.name === "UI_Btn_Reset" || b.name === "Btn_AutoCook") continue;
        const press = b.onPress;
        b.onPress = () => { if (this.manualAllowed(b.label)) press(); };
      }
    }
    let panelW = PAD_X * 2 + GROUP_GAP * (groups.length - 1); // one divider gap between groups
    for (const g of groups) {
      panelW += TAG_W + GROUP_GAP * 0.5;
      g.buttons.forEach((b, i) => {
        panelW += b.w + (i < g.buttons.length - 1 ? BTN_GAP : 0);
      });
    }

    this.createGlass(
      dock,
      "Director_Glass",
      new vec3(0, 0, -0.1),
      new vec2(panelW, PANEL_H),
      withAlpha(COLOR_GLASS, 0.88),
      withAlpha(COLOR_SILVER, 0.55),
      0.05,
      PANEL_H / 2,
      0.9
    );

    const content = global.scene.createSceneObject("Director_Content");
    content.setParent(dock);
    content.getTransform().setLocalPosition(new vec3(0, 0, 0.05));

    let x = -panelW / 2 + PAD_X;
    groups.forEach((group, gi) => {
      // Mode chip: tinted fill + outline + accent label
      this.createGlass(
        content,
        `Director_TagChip_${group.tag}`,
        new vec3(x + TAG_W / 2, 0, -0.05),
        new vec2(TAG_W, BTN_H),
        scaleRgb(group.tagColor, gi === 0 ? 0.3 : 0.22, 0.92),
        withAlpha(group.tagColor, 0.85),
        0.05,
        BTN_H / 2,
        0.95
      );
      this.createText(content, `Director_Tag_${group.tag}`, group.tag, 26, 800, group.tagColor, new vec3(x + TAG_W / 2, 0, 0), TAG_W, BTN_H);
      x += TAG_W + GROUP_GAP * 0.5;
      for (let i = 0; i < group.buttons.length; i++) {
        const spec = group.buttons[i];
        const db = this.createDirectorButton(content, spec.name, spec.label, spec.accent, new vec3(x + spec.w / 2, 0, 0), spec.w, BTN_H, spec.onPress);
        if (spec.name === "UI_Btn_TimeWarp") this.warpButton = db;
        if (spec.name === "Btn_AutoCook") {
          this.autoButton = db;
          this.autoButtonContent = db.obj.getComponent(ElementContent.getTypeName()) as ElementContent;
          // passive trigger: LEAF / automation tap Btn_AutoCook through MiseFlowButtonTrigger.triggerAction
          db.obj.createComponent(MiseFlowButtonTrigger.getTypeName());
        }
        x += spec.w + (i < group.buttons.length - 1 ? BTN_GAP : 0);
      }
      if (gi < groups.length - 1) {
        this.createGlass(
          content,
          gi === 0 ? "Director_Divider" : `Director_Divider_${gi}`,
          new vec3(x + GROUP_GAP / 2, 0, 0),
          new vec2(0.05, PANEL_H - 0.9),
          withAlpha(COLOR_SILVER, 0.6),
          withAlpha(COLOR_SILVER, 0.6),
          0.0,
          0.025,
          0.8
        );
        x += GROUP_GAP;
      }
    });
  }

  private createDirectorButton(
    parent: SceneObject,
    name: string,
    label: string,
    accent: vec4,
    pos: vec3,
    width: number,
    height: number,
    onPress: () => void
  ): DirectorButton {
    // Outlined capsule behind the button (colour-coded hairline edge + feedback surface)
    const frame = this.createGlass(
      parent,
      `${name}_Frame`,
      // Keep clear depth gaps (glass -0.1, frame -0.05, button 0 in content space)
      new vec3(pos.x, pos.y, -0.05),
      new vec2(width, height),
      scaleRgb(accent, 0.08, 0.92),
      withAlpha(accent, 0.9),
      0.05,
      height / 2,
      0.95
    );

    const obj = global.scene.createSceneObject(name);
    obj.setParent(parent);
    obj.getTransform().setLocalPosition(pos);
    const btn = obj.createComponent(Button.getTypeName()) as Button;
    btn.setVariant({ theme: "SnapOS2", shape: "Capsule", style: "Ghost" });
    btn.size = new vec3(width, height, 0.3);

    const ec = obj.createComponent(ElementContent.getTypeName()) as ElementContent;
    ec.text = label;
    ec.padding = { top: 0.1, right: 0.12, bottom: 0.1, left: 0.12 };
    ec.textSize = 24;
    ec.sizeOverride = new vec2(width, height);

    const db: DirectorButton = {
      obj,
      frameObj: frame.obj,
      frame: frame.style,
      accent,
      hovered: false,
      pressed: false,
      latched: false,
      scale: 1,
    };

    btn.onHoverEnter.add(() => { db.hovered = true; this.styleDirectorButton(db); });
    btn.onHoverExit.add(() => { db.hovered = false; db.pressed = false; this.styleDirectorButton(db); });
    btn.onTriggerDown.add(() => { db.pressed = true; this.styleDirectorButton(db); });
    btn.onTriggerUp.add(() => {
      db.pressed = false;
      this.styleDirectorButton(db);
      onPress();
    });

    this.directorButtons.push(db);
    return db;
  }

  private styleDirectorButton(db: DirectorButton): void {
    const f = db.frame;
    if (db.pressed) {
      f.bg = scaleRgb(db.accent, 0.5, 0.95);
      f.borderSize = 0.09;
      f.border = withAlpha(COLOR_TEXT_HEADING, 1.0);
    } else if (db.hovered || db.latched) {
      f.bg = scaleRgb(db.accent, 0.3, 0.92);
      f.borderSize = 0.08;
      f.border = withAlpha(db.accent, 1.0);
    } else {
      f.bg = scaleRgb(db.accent, 0.08, 0.92);
      f.borderSize = 0.05;
      f.border = withAlpha(db.accent, 0.9);
    }
    applyGlass(f);
  }

  private buildLeafTestHarnessObject(parent: SceneObject): void {
    const existing = findByName(parent, "DriftDecisionCard");
    if (!existing) {
      const card = global.scene.createSceneObject("DriftDecisionCard");
      card.setParent(parent);
      card.getTransform().setLocalPosition(new vec3(0, 0, 0));
      card.getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001));
      card.enabled = false;
    }
  }

  private applyAllGlass(): void {
    for (const s of this.glassStyles) applyGlass(s);
  }

  // ==========================================================================
  // Real AI Vision Scanner & RapidRouter Inference
  // ==========================================================================

  public triggerRealAiVisionScan(): void {
    // Recording path: deterministic local stand-in through the real ProposalGate (no network).
    // The live RapidRouter call stays available behind RapidRouterVisionService.useLiveRapidRouter.
    const live = this.visionService && this.visionService.useLiveRapidRouter;
    if (!live && this.visionStandIn) {
      this.visionStandIn.runNextScan(); // verdict arrives via AI_VISION_STATE_CHANGED
      return;
    }
    if (this.isAiScanning) return;
    this.isAiScanning = true;
    this.aiScanTimer = VisionConfig.hudLookingDelaySec;
    this.aiExpandUntil = this.clock + VisionConfig.hudLookingDelaySec + EXPAND_PULSE_SEC;

    if (this.visionService) {
      this.visionService.analyzeSearStage(VisionConfig.probeStage).then((evalResult) => {
        this.aiLatestMessage = evalResult.displayText;
        this.aiExpandUntil = this.clock + EXPAND_PULSE_SEC;
      });
    }
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  private bindEventListeners(): void {
    this.eventBus.on("TRIGGER_AI_VISION_PROBE", () => {
      this.triggerRealAiVisionScan();
    });

    this.eventBus.on("AI_VISION_STATE_CHANGED", (data: any) => {
      if (!data || data.state !== "RESULT") return;
      this.visionMetric = data.hudMetric || "";
      this.visionAction = data.hudAction || "";
      this.visionAccent =
        data.verdict === "REJECTED" ? COLOR_CORAL_ALERT : data.verdict === "OPTIMAL" ? COLOR_EMERALD_DONE : COLOR_VIOLET_AI;
      this.visionKey = `vision:${data.scan}`;
      this.visionUntil = this.clock + VISION_VERDICT_SEC;
    });

    this.eventBus.on("STATION_STEP_COMPLETED", (data: any) => {
      if (data && data.stationId === "PREP") {
        this.isPrepTransferred = true;
        this.transferExpandUntil = this.clock + EXPAND_PULSE_SEC;
      }
    });

    this.eventBus.on("DRIFT_RECORDED", (data: any) => {
      const delta = data && data.deltaSeconds ? data.deltaSeconds : 25.0;
      this.isDriftActive = true;
      this.isHeld = false;
      this.autoApplyCountdown = 3.0;
      this.plateAnchorTargetSec = 400 + delta;
      const driftCard = findByName(this.getSceneObject(), "DriftDecisionCard");
      if (driftCard) driftCard.enabled = true;
    });

    this.eventBus.on("HOLD_CONFIRMED", (data: any) => {
      this.isDriftActive = false;
      this.autoApplyCountdown = -1.0;
      this.isHeld = !!(data && data.isHeld);
      this.holdExpandUntil = this.clock + EXPAND_PULSE_SEC;
    });

    this.eventBus.on("VISUAL_BROWNING_CHECK", (data: any) => {
      if (data && data.advisoryMessage) {
        this.aiLatestMessage = data.advisoryMessage;
        this.aiExpandUntil = this.clock + EXPAND_PULSE_SEC;
      }
    });

    this.eventBus.on("TIME_WARP_TOGGLED", (data: any) => {
      this.isTimeWarp = !!(data && data.multiplier && data.multiplier > 1);
      if (this.warpButton) {
        this.warpButton.latched = this.isTimeWarp;
        this.styleDirectorButton(this.warpButton);
      }
    });

    this.eventBus.on("PLATING_CONVERGENCE", () => {
      this.isPlated = true;
      this.isDriftActive = false;
    });

    // WS9-P3
    this.eventBus.on("SALMON_FLIP_STARTED", () => {
      this.isSalmonFlipping = true;
    });
    this.eventBus.on("SALMON_FLIPPED", () => {
      this.isSalmonFlipping = false;
      this.isSalmonFlipped = true;
    });
    this.eventBus.on("DISH_PLATED", () => {
      this.isDishReady = true;
    });
    this.eventBus.on("AUTO_COOK_STATE", (data: any) => {
      const running = !!(data && data.running);
      this.autoCaption = running && data.caption ? String(data.caption) : "";
      if (this.autoButtonContent) {
        try {
          this.autoButtonContent.text = running ? "Stop" : "Auto Cook";
        } catch (e) {
          // label refresh is cosmetic
        }
      }
      if (this.autoButton && this.autoButton.latched !== running) {
        this.autoButton.latched = running;
        this.styleDirectorButton(this.autoButton);
      }
    });

    this.eventBus.on("RESET_REQUESTED", () => {
      this.isDishReady = false;
      this.isSalmonFlipped = false;
      this.isSalmonFlipping = false;
      this.isPrepTransferred = false;
      this.isDriftActive = false;
      this.isHeld = false;
      this.isPlated = false;
      this.autoApplyCountdown = -1.0;
      this.plateAnchorTargetSec = 400;
      this.plateAnchorDisplaySec = 400;
      this.aiLatestMessage = "";
      this.isAiScanning = false;
      this.holdExpandUntil = -1;
      this.transferExpandUntil = -1;
      this.aiExpandUntil = -1;
      this.visionUntil = -1;
      this.visionKey = "";
      const driftCard = findByName(this.getSceneObject(), "DriftDecisionCard");
      if (driftCard) driftCard.enabled = false;
    });
  }

  // ==========================================================================
  // Station view models (what each pill should say right now)
  // ==========================================================================

  private skilletView(): StationView {
    const sRem = this.dag ? this.dag.getSkilletRemaining() : 60;
    const t = formatMMSS(sRem);
    if (this.isDishReady) {
      return { metric: "SALMON PLATED", action: "CRISPY SIDE UP", accent: COLOR_EMERALD_DONE, metricColor: COLOR_EMERALD_DONE, expanded: false, key: "dish" };
    }
    if (this.isPlated) {
      return { metric: "SALMON DONE", action: "REST, THEN PLATE", accent: COLOR_EMERALD_DONE, metricColor: COLOR_EMERALD_DONE, expanded: false, key: "plated" };
    }
    if (this.isAiScanning) {
      return { metric: "AI SCANNING", action: "HOLD PAN STILL", accent: COLOR_VIOLET_AI, metricColor: COLOR_VIOLET_AI, expanded: true, key: "scan" };
    }
    if (this.visionKey !== "" && this.clock < this.visionUntil) {
      return { metric: this.visionMetric, action: this.visionAction, accent: this.visionAccent, metricColor: this.visionAccent, expanded: true, key: this.visionKey };
    }
    if (this.aiLatestMessage && this.clock < this.aiExpandUntil) {
      return { metric: `SEAR ${t}`, action: this.aiLatestMessage.toUpperCase(), accent: COLOR_VIOLET_AI, metricColor: COLOR_TEXT_HEADING, expanded: true, key: "ai:" + this.aiLatestMessage };
    }
    if (this.isDriftActive) {
      return { metric: `SEAR ${t}`, action: "LOWER BURNER NOW", accent: COLOR_CORAL_ALERT, metricColor: COLOR_CORAL_ALERT, expanded: true, key: "drift" };
    }
    if (this.isHeld) {
      return { metric: `HOLD ${t}`, action: "BURNER LOW - HELD", accent: COLOR_CYAN_PREP, metricColor: COLOR_CYAN_PREP, expanded: this.clock < this.holdExpandUntil, key: "held" };
    }
    // WS9-P3: once the spatula has turned the fillet the pill stops asking for a flip
    if (this.isSalmonFlipping) {
      return { metric: `SEAR ${t}`, action: "FLIPPING - 45 DEG", accent: COLOR_GOLD_HEAT, metricColor: COLOR_GOLD_HEAT, expanded: true, key: "flipping" };
    }
    if (this.isSalmonFlipped) {
      if (sRem <= 0) {
        return { metric: "CRUST DONE", action: "READY TO PLATE", accent: COLOR_EMERALD_DONE, metricColor: COLOR_EMERALD_DONE, expanded: true, key: "crust" };
      }
      return { metric: `FLIPPED ${t}`, action: "CRUST SIDE UP", accent: COLOR_EMERALD_DONE, metricColor: COLOR_TEXT_HEADING, expanded: true, key: "flipped" };
    }
    if (sRem > 0 && sRem <= 10) {
      return { metric: `SEAR ${t}`, action: sRem <= 3 ? "FLIP NOW" : "READY TO FLIP", accent: COLOR_GOLD_HEAT, metricColor: COLOR_GOLD_HEAT, expanded: true, key: "flip" };
    }
    return { metric: `SEAR ${t}`, action: "FLIP AT ZERO", accent: COLOR_GOLD_HEAT, metricColor: COLOR_TEXT_HEADING, expanded: this.clock < this.holdExpandUntil, key: "sear" };
  }

  private sauceView(): StationView {
    const pRem = this.dag ? this.dag.getSaucepotRemaining() : 50;
    const t = formatMMSS(pRem);
    if (this.isDishReady) {
      return { metric: "SAUCE SPOONED", action: "OVER THE SALMON", accent: COLOR_EMERALD_DONE, metricColor: COLOR_EMERALD_DONE, expanded: false, key: "dish" };
    }
    if (this.isPlated) {
      return { metric: "SAUCE DONE", action: "SPOON OVER SALMON", accent: COLOR_EMERALD_DONE, metricColor: COLOR_EMERALD_DONE, expanded: false, key: "plated" };
    }
    if (this.isDriftActive) {
      const n = Math.ceil(Math.max(0, this.autoApplyCountdown));
      return {
        metric: `${t} +25s`,
        action: this.autoApplyCountdown > 0 ? `START SHIFTS IN ${n}s` : "START DEFERRED",
        accent: COLOR_VIOLET_AI,
        metricColor: COLOR_VIOLET_AI,
        expanded: true,
        key: "drift",
      };
    }
    if (this.isPrepTransferred) {
      const fresh = this.clock < this.transferExpandUntil;
      return { metric: `SIMMER ${t}`, action: "SHALLOTS IN - STIR", accent: COLOR_CYAN_PREP, metricColor: COLOR_TEXT_HEADING, expanded: fresh, key: "simmer" };
    }
    return { metric: `SAUCE ${t}`, action: "WAITS ON PREP", accent: COLOR_CYAN_PREP, metricColor: COLOR_TEXT_HEADING, expanded: false, key: "wait" };
  }

  private prepView(): StationView {
    const slices = this.prepBlueprint ? this.prepBlueprint.getSliceIndex() : 0;
    const pct = this.prepBlueprint ? Math.round(this.prepBlueprint.getFillRatio() * 100) : 0;
    const isComplete = this.prepBlueprint ? this.prepBlueprint.isComplete() : false;
    if (this.isPlated || this.isPrepTransferred) {
      return { metric: "PREP CLEAR", action: "BOARD DONE", accent: COLOR_EMERALD_DONE, metricColor: COLOR_EMERALD_DONE, expanded: false, key: "clear" };
    }
    if (this.isDriftActive) {
      return { metric: `CUT ${slices}/8  +25s`, action: "KEEP SLICING", accent: COLOR_CORAL_ALERT, metricColor: COLOR_CORAL_ALERT, expanded: true, key: "drift" };
    }
    if (isComplete) {
      return { metric: "PORTION 100%", action: "TAP TRANSFER", accent: COLOR_EMERALD_DONE, metricColor: COLOR_EMERALD_DONE, expanded: true, key: "ready" };
    }
    const metric = pct > 0 ? `CUT ${slices}/8 - ${pct}%` : `CUT ${slices}/8`;
    return { metric, action: "SLICE ON GUIDES", accent: COLOR_CYAN_PREP, metricColor: COLOR_TEXT_HEADING, expanded: true, key: "cut" };
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  private setTextIfChanged(t: Text, s: string): void {
    if (t.text !== s) t.text = s;
  }

  private applyView(p: Pill | undefined, v: StationView, force: boolean): void {
    if (!p) return;
    if (p.key !== v.key) {
      if (p.key !== "") p.pulse = 1.0; // attention pop on state change
      p.key = v.key;
    }
    if (p.metricStr !== v.metric) this.setPillMetric(p, v.metric);
    this.setTextIfChanged(p.actionText, v.action);
    p.targetH = v.expanded ? PILL_H_EXPANDED : PILL_H_COLLAPSED;

    const accentChanged = !p.accent.equal(v.accent);
    if (accentChanged || force) {
      p.accent = v.accent;
      p.glass.border = withAlpha(v.accent, 0.95);
      applyGlass(p.glass);
      if (p.stem) {
        p.stem.bg = withAlpha(v.accent, 0.75);
        p.stem.border = withAlpha(v.accent, 0.75);
        applyGlass(p.stem);
      }
      if (p.foot) {
        p.foot.bg = withAlpha(v.accent, 0.95);
        applyGlass(p.foot);
      }
    }
    p.metricColor = v.metricColor;
    // label stays white unless the state recolours the whole metric; the value run + icon carry the accent
    p.metricText.textFill.color = v.metricColor;
    p.valueText.textFill.color = v.accent;
    if (p.iconImage && (accentChanged || force)) p.iconImage.mainMaterial.mainPass.baseColor = v.accent;
  }

  private layoutPill(p: Pill): void {
    const h = p.curH;
    p.glassObj.getTransform().setLocalPosition(new vec3(0, h / 2, 0));
    p.glass.rr.size = new vec2(PILL_W, h);
    p.glass.rr.cornerRadius = Math.min(PILL_H_COLLAPSED / 2, h / 2);
    p.glass.radius = p.glass.rr.cornerRadius;

    const t = Math.max(0, Math.min(1, (h - PILL_H_COLLAPSED) / (PILL_H_EXPANDED - PILL_H_COLLAPSED)));
    const my = h - PILL_PAD - PILL_METRIC_H / 2;
    const moveY = (o: SceneObject): void => {
      const tr = o.getTransform();
      const lp = tr.getLocalPosition();
      tr.setLocalPosition(new vec3(lp.x, my, lp.z));
    };
    moveY(p.metricText.getSceneObject());
    moveY(p.valueText.getSceneObject());
    if (p.iconImage) moveY(p.iconImage.getSceneObject());
    const actionObj = p.actionText.getSceneObject();
    actionObj.getTransform().setLocalPosition(new vec3(0, PILL_PAD + PILL_ACTION_H / 2, 0.03));
    const show = t > 0.35;
    if (actionObj.enabled !== show) actionObj.enabled = show;
    if (show) {
      p.actionText.textFill.color = withAlpha(this.actionColor(p.accent), (t - 0.35) / 0.65);
    }
  }

  /** Second line: near-white with a hint of the state accent (reads as white like the render). */
  private actionColor(accent: vec4): vec4 {
    return new vec4(0.84 + 0.16 * accent.r, 0.84 + 0.16 * accent.g, 0.84 + 0.16 * accent.b, 1.0);
  }

  private animatePill(p: Pill | undefined, dt: number): void {
    if (!p) return;
    const diff = p.targetH - p.curH;
    if (Math.abs(diff) > 0.002) {
      p.curH += diff * Math.min(1, dt * 9.0);
      if (Math.abs(p.targetH - p.curH) < 0.004) p.curH = p.targetH;
      this.layoutPill(p);
    } else if (p.actionText.getSceneObject().enabled) {
      p.actionText.textFill.color = this.actionColor(p.accent);
    }
    if (p.pulse > 0) {
      p.pulse = Math.max(0, p.pulse - dt * 2.5);
      const s = 1 + 0.07 * Math.sin(p.pulse * Math.PI);
      p.root.getTransform().setLocalScale(new vec3(s, s, s));
    }
  }

  private refreshChronometer(): void {
    if (!this.chronoText) return;
    // WS9-P3: Auto Cook progress caption takes over the capsule while it runs
    if (this.autoCaption !== "") {
      this.setChrono(this.autoCaption);
      this.chronoText.textFill.color = COLOR_TEXT_HEADING;
      if (this.chronoValue) this.chronoValue.textFill.color = COLOR_GOLD_HEAT;
      this.setChronoBorder(COLOR_GOLD_HEAT);
      return;
    }
    if (this.isDishReady) {
      this.setChrono("DISH READY");
      this.chronoText.textFill.color = COLOR_EMERALD_DONE;
      this.setChronoBorder(COLOR_EMERALD_DONE);
      return;
    }
    if (this.isPlated) {
      this.setChrono("READY TO PLATE");
      this.chronoText.textFill.color = COLOR_EMERALD_DONE;
      this.setChronoBorder(COLOR_EMERALD_DONE);
      return;
    }
    const shifted = this.plateAnchorTargetSec > 400;
    this.setChrono(`PLATE IN ${formatMMSS(this.plateAnchorDisplaySec)}`);
    this.chronoText.textFill.color = COLOR_TEXT_HEADING;
    if (this.chronoValue) this.chronoValue.textFill.color = shifted ? COLOR_VIOLET_AI : COLOR_EMERALD_DONE;
    this.setChronoBorder(shifted ? COLOR_VIOLET_AI : COLOR_EMERALD_DONE);
  }

  private setChronoBorder(c: vec4): void {
    if (!this.chronoGlass) return;
    const want = withAlpha(c, 0.95);
    if (!this.chronoGlass.border.equal(want)) {
      this.chronoGlass.border = want;
      applyGlass(this.chronoGlass);
    }
  }

  private refreshAll(force: boolean = false): void {
    this.applyView(this.skilletPill, this.skilletView(), force);
    this.applyView(this.saucePill, this.sauceView(), force);
    this.applyView(this.prepPill, this.prepView(), force);
    this.refreshChronometer();
  }

  private onUpdate(): void {
    const dt = getDeltaTime();
    this.clock += dt;

    if (this.startFrameWarmup < 8) {
      // UIKit shapes initialise on OnStart; re-assert styles for a few frames.
      this.startFrameWarmup++;
      this.applyAllGlass();
    }

    if (this.autoApplyCountdown > 0) {
      this.autoApplyCountdown -= dt;
      if (this.autoApplyCountdown <= 0) {
        this.autoApplyCountdown = 0;
        print("[MiseFlowUI] Autonomous schedule shift confirmed: all stations re-synchronized.");
      }
    }

    if (this.plateAnchorDisplaySec !== this.plateAnchorTargetSec) {
      const diff = this.plateAnchorTargetSec - this.plateAnchorDisplaySec;
      this.plateAnchorDisplaySec += diff * Math.min(1.0, dt * 3.5);
      if (Math.abs(diff) < 0.2) this.plateAnchorDisplaySec = this.plateAnchorTargetSec;
    }

    if (this.isAiScanning) {
      this.aiScanTimer -= dt;
      if (this.aiScanTimer <= 0) this.isAiScanning = false;
    }

    this.refreshAll();
    this.animatePill(this.skilletPill, dt);
    this.animatePill(this.saucePill, dt);
    this.animatePill(this.prepPill, dt);

    for (const db of this.directorButtons) {
      const target = db.pressed ? 0.93 : db.hovered ? 1.06 : 1.0;
      if (Math.abs(db.scale - target) > 0.001) {
        db.scale += (target - db.scale) * Math.min(1, dt * 14);
        // Scale only the neon frame: scaling the Button itself would move its
        // collider mid-press and could drop hover/trigger events.
        db.frameObj.getTransform().setLocalScale(new vec3(db.scale, db.scale, 1));
      }
    }
  }
}
