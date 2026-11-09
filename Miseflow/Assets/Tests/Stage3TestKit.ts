import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishStudio } from "../Scripts/DishStudio";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { StationTarget, StationTargetHub, TARGET_COLLIDER_CM, isVisiblyShown } from "../Scripts/StationTarget";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

/**
 * Stage3TestKit.ts
 * Shared helpers of the v7 Stage 3 scenarios (single-ui-invariant, fov-budget): enter dish 02 (legacy engine, chip 1) or
 * Chicken 65 (Cook engine), always ending with Btn_Reset (dish 01, legacy setup).
 */

export const LEGACY_PILLS = [
  "SkilletStationUI",
  "SauceStationUI",
  "PrepStationUI",
  "SkilletStationUI_Stem",
  "SauceStationUI_Stem",
  "PrepStationUI_Stem",
  "PlateAnchorUI",
  "StepCard",
];

/** Dock / palette objects: with the palette closed none of them may be enabled in the hierarchy. */
export const DOCK_OBJECTS = [
  "DirectorPalette",
  "DirectorPaletteUI",
  "Btn_AutoCook",
  "Btn_CycleDish",
  "Btn_StepGuide",
  "UI_Btn_StepChop",
  "UI_Btn_Transfer",
  "UI_Btn_InspectSear",
  "UI_Btn_TriggerDrift",
  "UI_Btn_TimeWarp",
  "UI_Btn_Reset",
  "UI_Btn_ClaimKitchen",
  "UI_Btn_QuickClaim",
  "UI_Btn_ForgetKitchen",
  "UI_Btn_ShowGhosts",
  "UI_Btn_QuickDish",
  "UI_Btn_LegacyHud",
];

export const DISH_02 = "02_mushroom_dum_biryani";

/** Asserts: no dock/palette object visible, no legacy pill / step card visible. Returns the number of objects inspected. */
export function expectNoLegacyOrDockUi(where: string): number {
  let inspected = 0;
  for (const n of LEGACY_PILLS) {
    const o = findSceneObjectByName(n);
    if (!o) continue;
    inspected++;
    expect(isVisiblyShown(o), `${where}: legacy pill/card ${n} is visible`).toBe(false);
  }
  for (const n of DOCK_OBJECTS) {
    const o = findSceneObjectByName(n);
    if (!o) continue;
    inspected++;
    expect(o.isEnabledInHierarchy, `${where}: dock/palette object ${n} is enabled`).toBe(false);
  }
  const cookCard = findSceneObjectByName("CookStepCard");
  if (cookCard) {
    inspected++;
    expect(isVisiblyShown(cookCard), `${where}: CookStepCard is visible`).toBe(false);
  }
  return inspected;
}

export function expectTargetsOk(where: string, targets: StationTarget[], minCount: number): void {
  expect(targets.length >= minCount, `${where}: ${targets.length} station targets, expected >= ${minCount}`).toBe(true);
  for (const t of targets) {
    expect(t.isShown(), `${where}: target ${t.id} not shown`).toBe(true);
    expect(isVisiblyShown(t.root), `${where}: target ${t.id} not visible`).toBe(true);
    const c = t.getColliderCm();
    expect(c >= TARGET_COLLIDER_CM - 0.001, `${where}: target ${t.id} collider ${c} cm < 4.5`).toBe(true);
  }
}

export async function resetToDish01(): Promise<void> {
  const interactor = new MiseFlowLeafInteractor();
  await interactor.tapButton("Btn_Reset");
  await sleep(900);
}

/** Dish 02 (legacy engine): Btn_CycleDish -> chip 1 -> Skip -> DISH_REVEALED. */
export async function enterDish02(): Promise<void> {
  const interactor = new MiseFlowLeafInteractor();
  const bus = MiseFlowEventBus.getInstance();
  const studio = DishStudio.getInstance();
  expect(studio).toBeTruthy();
  let revealed = false;
  const onRevealed = (d: any) => (revealed = !!d && d.dishId === DISH_02);
  bus.on("DISH_REVEALED", onRevealed);
  try {
    await interactor.tapButton("Btn_CycleDish");
    await sleep(300);
    expect(studio.isOpen()).toBe(true);
    await interactor.tapButton("Btn_StudioChip_1");
    await sleep(1000);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_02);
    await interactor.tapButton("Btn_BriefingSkip");
    for (let i = 0; i < 75 && !revealed; i++) await sleep(200);
  } finally {
    bus.off("DISH_REVEALED", onRevealed);
  }
  expect(revealed, "dish 02 never revealed").toBe(true);
  await sleep(800);
}

/** Chicken 65 (Cook engine): typed dish -> plan -> deck -> Skip -> COOK_WORLD_READY. Returns the world. */
export async function enterChicken65(): Promise<any> {
  const interactor = new MiseFlowLeafInteractor();
  const bus = MiseFlowEventBus.getInstance();
  const studio = DishStudio.getInstance();
  expect(studio).toBeTruthy();
  let plan: any = null;
  let world: any = null;
  const onPlan = (d: any) => (plan = d ? d.plan : null);
  const onWorld = (d: any) => (world = d ? d.world : null);
  bus.on("COOK_PLAN_READY", onPlan);
  bus.on("COOK_WORLD_READY", onWorld);
  try {
    await interactor.tapButton("Btn_CycleDish");
    await sleep(300);
    expect(studio.isOpen()).toBe(true);
    bus.emit("STUDIO_TEXT_SUBMITTED", { text: "chicken 65", source: "KEYBOARD" });
    await sleep(250);
    await interactor.tapButton("Btn_StudioConfirm");
    for (let i = 0; i < 160 && !plan; i++) await sleep(500);
    expect(!!plan, "Chicken 65 plan never arrived").toBe(true);
    await sleep(2000);
    await interactor.tapButton("Btn_BriefingSkip");
    for (let i = 0; i < 240 && !world; i++) await sleep(500);
    expect(!!world, "Cook world never became ready").toBe(true);
  } finally {
    bus.off("COOK_PLAN_READY", onPlan);
    bus.off("COOK_WORLD_READY", onWorld);
  }
  await sleep(1500);
  return world;
}

export function hubOrFail(): StationTargetHub {
  const h = StationTargetHub.getInstance();
  expect(h, "StationTargetHub missing").toBeTruthy();
  return h as StationTargetHub;
}
