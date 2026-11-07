import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishStudio } from "../Scripts/DishStudio";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { SpatialBriefingDeck } from "../Scripts/SpatialBriefingDeck";
import { StepEngine } from "../Scripts/StepEngine";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DISH_01 = "01_salmon_beurre_blanc";
const DISH_02 = "02_mushroom_dum_biryani";

interface StepEv {
  kind: string;
  dishId: string;
  index: number;
  stepId: string;
}

/**
 * StepEngineScenario.ts
 * LEAF Scenario 14 (K1a): per-dish step engine + step card.
 *  1. Dish 02 via the Dish Studio chip -> Skip -> reveal -> STEP_STARTED for step 0 (brunoise), StepCard shows it.
 *  2. 8 x Step Cut (the real chop path) -> STEP_COMPLETED step 0 + STEP_STARTED step 1.
 *  3. Btn_StepGuide hides the card (engine keeps tracking); a second tap shows it again.
 *  4. Btn_Reset -> dish 01 at step 0.
 */
@component
export class StepEngineScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    print("[LEAF] Running Scenario 14: StepEngineScenario...");
    const interactor = new MiseFlowLeafInteractor();
    const bus = MiseFlowEventBus.getInstance();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(600);

    const engine = StepEngine.getInstance();
    const studio = DishStudio.getInstance();
    const deck = SpatialBriefingDeck.getInstance();
    expect(engine).toBeTruthy();
    expect(studio).toBeTruthy();
    expect(deck).toBeTruthy();
    if (!engine.isCardVisible()) await interactor.tapButton("Btn_StepGuide");
    expect(engine.isCardVisible()).toBe(true);
    expect(engine.getDishId()).toBe(DISH_01);
    expect(engine.getCurrentIndex()).toBe(0);
    expect(engine.getSteps().length).toBe(7);

    const evs: StepEv[] = [];
    const onStart = (d: any) => evs.push({ kind: "S", dishId: d ? d.dishId : "", index: d ? d.index : -1, stepId: d ? d.stepId : "" });
    const onDone = (d: any) => evs.push({ kind: "C", dishId: d ? d.dishId : "", index: d ? d.index : -1, stepId: d ? d.stepId : "" });
    const has = (kind: string, dishId: string, index: number) => evs.some((e) => e.kind === kind && e.dishId === dishId && e.index === index);
    let revealed = false;
    const onRevealed = (d: any) => (revealed = !!d && d.dishId === DISH_02);
    bus.on("STEP_STARTED", onStart);
    bus.on("STEP_COMPLETED", onDone);
    bus.on("DISH_REVEALED", onRevealed);
    try {
      // 1. dish 02 through the studio (chip 1) -> Skip -> one-by-one reveal
      await interactor.tapButton("Btn_CycleDish");
      await sleep(300);
      await interactor.tapButton("Btn_StudioChip_1");
      await sleep(900);
      expect(deck.isOpen()).toBe(true);
      expect(has("S", DISH_02, 0)).toBe(false); // nothing starts before the reveal
      await sleep(2500);
      await interactor.tapButton("Btn_BriefingSkip");
      let waited = 0;
      while (!revealed && waited < 15000) {
        await sleep(150);
        waited += 150;
      }
      expect(revealed).toBe(true);
      await sleep(600);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_02);
      expect(engine.getDishId()).toBe(DISH_02);
      expect(engine.getSteps().length).toBe(8);
      expect(has("S", DISH_02, 0)).toBe(true);
      expect(engine.getCurrentIndex()).toBe(0);
      const card = findSceneObjectByName("StepCard");
      expect(card).toBeTruthy();
      expect(card.enabled).toBe(true);
      expect(card.isEnabledInHierarchy).toBe(true);
      const title = findSceneObjectByName("StepCardTitle").getComponent("Component.Text") as Text;
      expect(title.text).toBe(engine.getSteps()[0].title);
      expect(title.text.length > 0).toBe(true);
      expect(findSceneObjectByName("StepCardBody")).toBeTruthy();
      expect(findSceneObjectByName("StepProgress")).toBeTruthy();

      // 2. the real chop path completes step 0
      for (let i = 0; i < 8; i++) {
        await interactor.tapButton("Btn_StepChop");
        await sleep(150);
      }
      await sleep(1200);
      expect(has("C", DISH_02, 0)).toBe(true);
      expect(has("S", DISH_02, 1)).toBe(true);
      expect(engine.getCurrentIndex()).toBe(1);
      expect(engine.getStepStates()[0]).toBe("done");
      await sleep(600);
      expect(title.text).toBe(engine.getSteps()[1].title);

      // 3. STEPS chip hides / shows the card; the engine keeps its place
      await interactor.tapButton("Btn_StepGuide");
      expect(engine.isCardVisible()).toBe(false);
      expect(card.enabled).toBe(false);
      expect(engine.getCurrentIndex()).toBe(1);
      await interactor.tapButton("Btn_StepGuide");
      await sleep(500);
      expect(engine.isCardVisible()).toBe(true);
      expect(card.enabled).toBe(true);

      // 4. Reset -> dish 01 step 0
      evs.length = 0;
      await interactor.tapButton("Btn_Reset");
      await sleep(800);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_01);
      expect(engine.getDishId()).toBe(DISH_01);
      expect(engine.getCurrentIndex()).toBe(0);
      expect(has("S", DISH_01, 0)).toBe(true);
      expect(studio.isOpen()).toBe(false);
      await sleep(400);
      expect(title.text).toBe(engine.getSteps()[0].title);
    } finally {
      bus.off("STEP_STARTED", onStart);
      bus.off("STEP_COMPLETED", onDone);
      bus.off("DISH_REVEALED", onRevealed);
      if (!engine.isCardVisible()) engine.setCardVisible(true);
    }
    print("[LEAF] Scenario 14 PASSED: dish 02 steps start at the reveal, chop completes step 0, step card + Steps toggle, Reset -> dish 01 step 0.");
  }
}
