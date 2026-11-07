import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishStudio } from "../Scripts/DishStudio";
import { MetricPrepBlueprint } from "../Scripts/MetricPrepBlueprint";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { SpatialBriefingDeck } from "../Scripts/SpatialBriefingDeck";
import { StationPropsBuilder } from "../Scripts/StationPropsBuilder";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DISH_01 = "01_salmon_beurre_blanc";
const DISH_02 = "02_mushroom_dum_biryani";
const REVEAL_WAIT_MS = 8000;

function near(a: vec3, b: vec3): boolean {
  return Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4 && Math.abs(a.z - b.z) < 1e-4;
}

/**
 * UniversalDishPageTableScenario.ts
 * LEAF Scenario 11 (WS17, P5 flow): Btn_CycleDish opens the Dish Studio (setup hidden, not reset); the typed
 * text "mushroom dum biryani" (STUDIO_TEXT_SUBMITTED, the AR keyboard does not render in Preview) is confirmed ->
 * preset 02 through the page tables -> card deck with the real DMA status line (all ingredients hit, all vessels &
 * accessories loaded) while the dish is staged (DISH_LOAD_STAGED + one DISH_ITEM_READY per item, in order).
 * Btn_BriefingNext walks the cards one at a time; the last card shows Btn_LetsCook -> studio closes, setup
 * returns, items pop in one by one (DISH_REVEALED), the cut grid / knife step use the dish's 0.8 cm spacing only
 * after the reveal; Btn_Reset restores dish 01 (1.5 cm) with the studio closed. Mesh swaps are asset-phase work.
 */
@component
export class UniversalDishPageTableScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    print("[LEAF] Running Scenario 11: UniversalDishPageTableScenario...");
    const interactor = new MiseFlowLeafInteractor();
    const bus = MiseFlowEventBus.getInstance();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(500);

    const deck = SpatialBriefingDeck.getInstance();
    const studio = DishStudio.getInstance();
    expect(deck).toBeTruthy();
    expect(studio).toBeTruthy();
    const root = findSceneObjectByName("StationsRoot");
    expect(root).toBeTruthy();
    const prep = root.getComponent(MetricPrepBlueprint.getTypeName()) as MetricPrepBlueprint;
    const props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    expect(prep).toBeTruthy();
    expect(props).toBeTruthy();
    expect(findSceneObjectByName("Btn_CycleDish")).toBeTruthy();
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);
    expect(prep.spacingCm).toBe(1.5);
    expect(deck.isOpen()).toBe(false);
    expect(studio.isOpen()).toBe(false);
    const rootScale = root.getTransform().getLocalScale();
    const pan = findSceneObjectByName("SkilletPan");
    const panScale = pan ? pan.getTransform().getLocalScale() : vec3.one();

    const seen = { staged: 0, total: 0, ready: [] as number[], revealed: false, completed: 0 };
    const onStaged = (d: any) => {
      seen.staged++;
      seen.total = d && d.total ? d.total : 0;
    };
    const onReady = (d: any) => seen.ready.push(d ? d.index : -1);
    const onRevealed = () => (seen.revealed = true);
    const onCompleted = () => seen.completed++;
    bus.on("DISH_LOAD_STAGED", onStaged);
    bus.on("DISH_ITEM_READY", onReady);
    bus.on("DISH_REVEALED", onRevealed);
    bus.on("BRIEFING_COMPLETED", onCompleted);
    try {
      // AI Dish -> studio home, setup hidden (not destroyed / reset)
      await interactor.tapButton("Btn_CycleDish");
      await sleep(300);
      expect(studio.isOpen()).toBe(true);
      expect(studio.getScreen()).toBe("HOME");
      expect(findSceneObjectByName("DishStudioRoot").enabled).toBe(true);
      expect(root.getTransform().getWorldScale().x < 0.01).toBe(true);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);

      // typed text -> "Typed" card (no edit step) -> Confirm
      bus.emit("STUDIO_TEXT_SUBMITTED", { text: "mushroom dum biryani", source: "KEYBOARD" });
      await sleep(250);
      expect(studio.getScreen()).toBe("REVIEW");
      expect(studio.getReviewHeader()).toBe("TYPED");
      expect(studio.isEditAvailable()).toBe(false);
      await interactor.tapButton("Btn_StudioConfirm");
      await sleep(1200);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_02);
      expect(studio.getScreen()).toBe("DECK");
      expect(deck.isOpen()).toBe(true);
      expect(deck.getCardIndex()).toBe(0);
      expect(root.getTransform().getWorldScale().x < 0.01).toBe(true);
      const status = deck.getStatusLine();
      print(`[LEAF] Scenario 11 DMA status: ${status}`);
      const im = status.match(/(\d+)\/(\d+) INGREDIENTS HIT/);
      expect(!!im).toBe(true);
      expect(Number(im![1])).toBe(Number(im![2]));
      expect(Number(im![2]) >= 5).toBe(true);
      const vm = status.match(/(\d+)\/(\d+) VESSELS/);
      expect(!!vm).toBe(true);
      expect(Number(vm![1])).toBe(Number(vm![2]));
      expect(Number(vm![2]) >= 6).toBe(true);
      expect(seen.staged).toBe(1);
      expect(seen.total >= 10).toBe(true);
      // hooks are deferred: the grid still shows dish 01 spacing behind the cards
      expect(props.getCutSpacingCm()).toBe(1.5);

      // one card at a time; the last card adds Let's cook
      const n = deck.getCardCount();
      expect(n).toBe(4);
      for (let i = 1; i < n; i++) {
        await interactor.tapButton("Btn_BriefingNext");
        await sleep(350);
        expect(deck.getCardIndex()).toBe(i);
        expect(studio.isOpen()).toBe(true);
      }
      expect(deck.isLastCard()).toBe(true);
      expect(findSceneObjectByName("Btn_LetsCook").isEnabledInHierarchy).toBe(true);
      expect(findSceneObjectByName("Btn_BriefingNext").isEnabledInHierarchy).toBe(false);
      await interactor.tapButton("Btn_LetsCook");
      await sleep(200);
      expect(seen.completed).toBe(1);
      expect(deck.isOpen()).toBe(false);
      expect(studio.isOpen()).toBe(false);
      expect(near(root.getTransform().getLocalScale(), rootScale)).toBe(true);

      let waited = 0;
      while (!seen.revealed && waited < REVEAL_WAIT_MS) {
        await sleep(200);
        waited += 200;
      }
      expect(seen.revealed).toBe(true);
      expect(seen.ready.length).toBe(seen.total);
      for (let i = 0; i < seen.ready.length; i++) expect(seen.ready[i]).toBe(i);
      if (pan) expect(near(pan.getTransform().getLocalScale(), panScale)).toBe(true);
      const bp = DishBlueprintApplier.getActiveBlueprint();
      expect(prep.spacingCm).toBe(bp.cutSpacingCm);
      expect(prep.spacingCm).toBe(0.8);
      expect(props.getCutSpacingCm()).toBe(0.8);
    } finally {
      bus.off("DISH_LOAD_STAGED", onStaged);
      bus.off("DISH_ITEM_READY", onReady);
      bus.off("DISH_REVEALED", onRevealed);
      bus.off("BRIEFING_COMPLETED", onCompleted);
    }

    // Reset -> dish 01 (1.5 cm) with the studio and deck closed
    await interactor.tapButton("Btn_Reset");
    await sleep(700);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);
    expect(prep.spacingCm).toBe(1.5);
    expect(props.getCutSpacingCm()).toBe(1.5);
    expect(deck.isOpen()).toBe(false);
    expect(studio.isOpen()).toBe(false);
    print("[LEAF] Scenario 11 PASSED: studio -> typed dish -> page tables -> card deck -> Let's cook -> staged reveal, reset to dish 01.");
  }
}
