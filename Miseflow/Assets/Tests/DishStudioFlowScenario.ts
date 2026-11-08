import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { AutoCookController } from "../Scripts/AutoCookController";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishRevealDirector } from "../Scripts/DishRevealDirector";
import { DishStudio } from "../Scripts/DishStudio";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { SpatialBriefingDeck } from "../Scripts/SpatialBriefingDeck";
import { RecipeCompilerService } from "../Scripts/AI/RecipeCompilerService";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DISH_01 = "01_salmon_beurre_blanc";
const DISH_03 = "03_wok_hakka_noodles";
const NOT_FOUND = "Dish not found. Enter the correct dish name.";

function near(a: vec3, b: vec3): boolean {
  return Math.abs(a.x - b.x) < 1e-5 && Math.abs(a.y - b.y) < 1e-5 && Math.abs(a.z - b.z) < 1e-5;
}

function label3d(name: string): string {
  const o = findSceneObjectByName(name);
  if (!o) return "";
  const t = (o.getComponent("Component.Text3D") as Text3D) || (o.getComponent("Component.Text") as any);
  return t ? String(t.text) : "";
}

/**
 * DishStudioFlowScenario.ts
 * LEAF Scenario 13 (P5): Dish Studio mode + card flow + staged one-by-one reveal.
 *  1. Opening the studio hides the whole setup without resetting it; Btn_StudioBack restores it exactly
 *     (StationsRoot scale and the chop progress label unchanged, still dish 01).
 *  2. Speak in Preview degrades gracefully (notice, HOME); Auto Cook is ignored while the studio is open.
 *  3. A heard nonsense query -> "Heard" card with Edit -> Confirm -> the exact not-found card, input re-opens,
 *     setup stays hidden, no other dish loaded.
 *  4. Typed "hakka noodles" -> deck -> Skip at once while items are still loading -> setup returns, the loading
 *     panel shows, items pop in one by one (DISH_ITEM_READY in order ... DISH_REVEALED), panel hides.
 *  5. Quick-pick dish 01 -> Skip -> no re-reveal / no panel. Reset -> dish 01, studio closed, setup visible.
 */
@component
export class DishStudioFlowScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    print("[LEAF] Running Scenario 13: DishStudioFlowScenario...");
    const interactor = new MiseFlowLeafInteractor();
    const bus = MiseFlowEventBus.getInstance();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(500);

    const studio = DishStudio.getInstance();
    const deck = SpatialBriefingDeck.getInstance();
    const reveal = DishRevealDirector.getInstance();
    const auto = AutoCookController.getInstance();
    expect(studio).toBeTruthy();
    expect(deck).toBeTruthy();
    expect(reveal).toBeTruthy();
    expect(auto).toBeTruthy();
    const root = findSceneObjectByName("StationsRoot");
    const layer = findSceneObjectByName("DiegeticLayer");
    const compiler = layer.getComponent(RecipeCompilerService.getTypeName()) as RecipeCompilerService;
    expect(compiler).toBeTruthy();
    expect(studio.isOpen()).toBe(false);
    const studioRoot = findSceneObjectByName("DishStudioRoot");
    expect(studioRoot).toBeTruthy();
    expect(studioRoot.enabled).toBe(false);

    // 1. hide / Back restores exactly (state kept: one chop done before opening)
    await interactor.tapButton("Btn_StepChop");
    await sleep(400);
    const scale0 = root.getTransform().getLocalScale();
    const prepLabel0 = label3d("PrepStatusLabel");
    expect(prepLabel0.length > 0).toBe(true);
    await interactor.tapButton("Btn_CycleDish");
    await sleep(300);
    expect(studio.isOpen()).toBe(true);
    expect(studio.isSetupHidden()).toBe(true);
    expect(studioRoot.enabled).toBe(true);
    expect(root.getTransform().getWorldScale().x < 0.01).toBe(true);
    expect(findSceneObjectByName("Btn_StudioSpeak").isEnabledInHierarchy).toBe(true);
    expect(findSceneObjectByName("Btn_StudioKeyboard").isEnabledInHierarchy).toBe(true);
    expect(findSceneObjectByName("Btn_StudioChip_5")).toBeTruthy();
    await interactor.tapButton("Btn_StudioBack");
    await sleep(300);
    expect(studio.isOpen()).toBe(false);
    expect(studioRoot.enabled).toBe(false);
    expect(near(root.getTransform().getLocalScale(), scale0)).toBe(true);
    expect(label3d("PrepStatusLabel")).toBe(prepLabel0);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);

    // 2. Speak in Preview -> graceful notice; Auto Cook ignored while open
    await interactor.tapButton("Btn_CycleDish");
    await sleep(300);
    await interactor.tapButton("Btn_StudioSpeak");
    await sleep(300);
    expect(studio.getScreen()).toBe("HOME");
    expect(studio.getNoticeText().length > 0).toBe(true);
    await interactor.tapButton("Btn_AutoCook");
    await sleep(300);
    expect(auto.isRunning()).toBe(false);
    expect(studio.isOpen()).toBe(true);

    // 3. nonsense heard -> Heard card (Edit available) -> Confirm -> exact not-found card, input re-opens
    let notFound = 0;
    const onNf = () => notFound++;
    bus.on("DISH_NOT_FOUND", onNf);
    bus.emit("STUDIO_TEXT_SUBMITTED", { text: "zzqx blorf", source: "SPEECH" });
    await sleep(250);
    expect(studio.getScreen()).toBe("REVIEW");
    expect(studio.getReviewHeader()).toBe("HEARD");
    expect(studio.isEditAvailable()).toBe(true);
    expect(studio.getReviewText()).toBe("zzqx blorf");
    await interactor.tapButton("Btn_StudioConfirm");
    // with a key present the Chef Director may take a few seconds to say "not a dish"; offline it answers at once
    for (let i = 0; i < 160 && notFound === 0; i++) await sleep(250);
    await sleep(300);
    bus.off("DISH_NOT_FOUND", onNf);
    expect(notFound).toBe(1);
    expect(studio.getScreen()).toBe("HOME");
    expect(studio.getNoticeText()).toBe(NOT_FOUND);
    const nfText = findSceneObjectByName("StudioNoticeText").getComponent("Component.Text") as Text;
    expect(nfText.text).toBe(NOT_FOUND);
    expect(findSceneObjectByName("StudioNoticeText").isEnabledInHierarchy).toBe(true);
    expect(findSceneObjectByName("Btn_StudioKeyboard").isEnabledInHierarchy).toBe(true);
    expect(studio.isSetupHidden()).toBe(true);
    expect(deck.isOpen()).toBe(false);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);

    // 4. typed dish -> deck -> Skip while loading -> loading panel + one-by-one reveal
    const prevTick = compiler.stagingTickSec;
    const ready: number[] = [];
    let revealed = false;
    let maxPanelRevealed = -1;
    let panelSeen = false;
    const onReady = (d: any) => ready.push(d ? d.index : -1);
    const onRevealed = () => (revealed = true);
    bus.on("DISH_ITEM_READY", onReady);
    bus.on("DISH_REVEALED", onRevealed);
    try {
      compiler.stagingTickSec = 0.3;
      bus.emit("STUDIO_TEXT_SUBMITTED", { text: "hakka noodles", source: "KEYBOARD" });
      await sleep(250);
      expect(studio.getReviewHeader()).toBe("TYPED");
      expect(studio.isEditAvailable()).toBe(false);
      await interactor.tapButton("Btn_StudioConfirm");
      await sleep(900);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_03);
      expect(deck.isOpen()).toBe(true);
      expect(studio.isSetupHidden()).toBe(true);
      const total = compiler.getStagedItems().length;
      expect(total >= 10).toBe(true);
      expect(ready.length < total).toBe(true);
      await interactor.tapButton("Btn_BriefingSkip");
      expect(studio.isOpen()).toBe(false);
      expect(studio.isSetupHidden()).toBe(false);
      let waited = 0;
      while (!revealed && waited < 15000) {
        if (reveal.isPanelVisible()) {
          panelSeen = true;
          if (reveal.getRevealedCount() < total) maxPanelRevealed = Math.max(maxPanelRevealed, reveal.getRevealedCount());
        }
        await sleep(150);
        waited += 150;
      }
      print(`[LEAF] Scenario 13 reveal: ${total} items, panel ${panelSeen}, revealed ${reveal.getRevealedCount()}, ${reveal.getPanelStatus()}`);
      expect(revealed).toBe(true);
      expect(panelSeen).toBe(true);
      expect(maxPanelRevealed > 0 && maxPanelRevealed < total).toBe(true); // items arrived one by one
      expect(ready.length).toBe(total);
      for (let i = 0; i < ready.length; i++) expect(ready[i]).toBe(i);
      expect(reveal.getRevealedCount()).toBe(total);
      await sleep(600);
      expect(reveal.isPanelVisible()).toBe(false);
    } finally {
      compiler.stagingTickSec = prevTick;
      bus.off("DISH_ITEM_READY", onReady);
      bus.off("DISH_REVEALED", onRevealed);
    }

    // 5. dish 01 via quick pick: no re-reveal, no loading panel
    let revealed01 = false;
    const onRev01 = (d: any) => (revealed01 = !!d && d.dishId === DISH_01);
    bus.on("DISH_REVEALED", onRev01);
    await interactor.tapButton("Btn_CycleDish");
    await sleep(300);
    await interactor.tapButton("Btn_StudioChip_0");
    await sleep(900);
    expect(deck.isOpen()).toBe(true);
    await sleep(2500); // all items staged
    await interactor.tapButton("Btn_BriefingSkip");
    await sleep(300);
    bus.off("DISH_REVEALED", onRev01);
    expect(revealed01).toBe(true);
    expect(reveal.isPanelVisible()).toBe(false);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);

    await interactor.tapButton("Btn_Reset");
    await sleep(700);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);
    expect(studio.isOpen()).toBe(false);
    expect(near(root.getTransform().getLocalScale(), scale0)).toBe(true);
    print("[LEAF] Scenario 13 PASSED: studio hide/back, graceful speak, not-found card, staged one-by-one reveal with loading panel, dish 01 no re-reveal.");
  }
}
