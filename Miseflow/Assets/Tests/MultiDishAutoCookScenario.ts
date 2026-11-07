import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { AutoCookController } from "../Scripts/AutoCookController";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishStudio } from "../Scripts/DishStudio";
import { LadleOrbitalStir } from "../Scripts/LadleOrbitalStir";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { PanTossRoll } from "../Scripts/PanTossRoll";
import { SpatialBriefingDeck } from "../Scripts/SpatialBriefingDeck";
import { SpatulaTechniqueGuide } from "../Scripts/SpatulaTechniqueGuide";
import { StationPropsBuilder } from "../Scripts/StationPropsBuilder";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DEFAULT_TEST_SPEED = 8.0;
const MAX_WAIT_MS = 120000;
const DISH_02 = "02_mushroom_dum_biryani";

/**
 * MultiDishAutoCookScenario.ts
 * LEAF Scenario 12 (WS17, P5 flow): AI Dish opens the Dish Studio, quick-pick dish 02 (Mushroom Dum Biryani),
 * skip the card deck, wait for the staged one-by-one reveal (DISH_REVEALED), run Auto Cook
 * at test speed and assert the dish-specific choreography: 8 cuts at the dish's 0.8 cm spacing, the
 * two-pour transfer, the #332 ladle orbital stir request (LADLE_STIR_REQUESTED; LadleProp is an
 * asset-phase mesh, so today the stir is the logged no-op NOOP_NO_PROP - asserted as such), the
 * KINE_PAN_TOSS_ROLL (PAN_TOSS_REQUESTED + SALMON_FLIPPED with technique KINE_PAN_TOSS_ROLL on the
 * existing fillet stand-in, no mushroom meshes yet), then PlatingFinisher DISH_PLATED with the
 * PlatingDebriefCard up. Asserts state/events, not the on-hold asset meshes. Ends with Reset (dish 01).
 */
@component
export class MultiDishAutoCookScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const s = config ? config.getNumber("speed") : undefined;
    const speed = s !== undefined && s > 0 ? s : DEFAULT_TEST_SPEED;
    print(`[LEAF] Running Scenario 12: MultiDishAutoCookScenario (speed ${speed}x)...`);
    const interactor = new MiseFlowLeafInteractor();
    const bus = MiseFlowEventBus.getInstance();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(500);

    const auto = AutoCookController.getInstance();
    const deck = SpatialBriefingDeck.getInstance();
    expect(auto).toBeTruthy();
    expect(deck).toBeTruthy();
    const layer = findSceneObjectByName("DiegeticLayer");
    const guide = layer.getComponent(SpatulaTechniqueGuide.getTypeName()) as SpatulaTechniqueGuide;
    expect(guide).toBeTruthy();
    const root = findSceneObjectByName("StationsRoot");
    const props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    expect(props).toBeTruthy();
    const stir = LadleOrbitalStir.getInstance();
    const toss = PanTossRoll.getInstance();
    expect(stir).toBeTruthy();
    expect(toss).toBeTruthy();

    // P5 flow: AI Dish opens the studio -> quick-pick chip 02 -> card deck -> Skip -> staged reveal
    const studio = DishStudio.getInstance();
    expect(studio).toBeTruthy();
    let revealed = false;
    const onRevealed = () => (revealed = true);
    bus.on("DISH_REVEALED", onRevealed);
    await interactor.tapButton("Btn_CycleDish");
    await sleep(300);
    expect(studio.isOpen()).toBe(true);
    await interactor.tapButton("Btn_StudioChip_1");
    await sleep(1000);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_02);
    expect(deck.isOpen()).toBe(true);
    await interactor.tapButton("Btn_BriefingSkip");
    let rw = 0;
    while (!revealed && rw < 8000) {
      await sleep(200);
      rw += 200;
    }
    bus.off("DISH_REVEALED", onRevealed);
    expect(revealed).toBe(true);
    expect(deck.isOpen()).toBe(false);
    expect(studio.isOpen()).toBe(false);

    const seen = { cuts: 0, badSpacing: 0, chops: 0, filled: false, poured: false, ladle: 0, toss: 0, flipTech: "", dish: false };
    const onCut = (d: any) => {
      seen.cuts++;
      if (!d || Math.abs(d.spacingCm - 0.8) > 1e-6) seen.badSpacing++;
    };
    const onVeg = () => seen.chops++;
    const onFilled = () => (seen.filled = true);
    const onPoured = () => (seen.poured = true);
    const onLadle = () => seen.ladle++;
    const onToss = () => seen.toss++;
    const onFlipped = (d: any) => (seen.flipTech = d && d.technique ? String(d.technique) : "KINE_SPATULA_FLIP_180");
    const onDish = () => (seen.dish = true);
    bus.on("CUT_REFERENCE_STEP", onCut);
    bus.on("PREP_VEG_STATE_CHANGED", onVeg);
    bus.on("PREP_BOWL_FILLED", onFilled);
    bus.on("PREP_BOWL_POURED", onPoured);
    bus.on("LADLE_STIR_REQUESTED", onLadle);
    bus.on("PAN_TOSS_REQUESTED", onToss);
    bus.on("SALMON_FLIPPED", onFlipped);
    bus.on("DISH_PLATED", onDish);
    const tossCount0 = toss.getTossCount();
    const prevSpeed = auto.speed;
    let dishDuringRun = "";
    try {
      auto.speed = speed;
      await interactor.tapButton("Btn_AutoCook");
      expect(auto.isRunning()).toBe(true);
      await sleep(600);
      dishDuringRun = DishBlueprintApplier.getActiveBlueprint().dishId; // Auto Cook keeps the selected dish
      let waited = 0;
      while (auto.isRunning() && waited < MAX_WAIT_MS) {
        await sleep(250);
        waited += 250;
      }
      expect(auto.isRunning()).toBe(false);
    } finally {
      auto.speed = prevSpeed;
      bus.off("CUT_REFERENCE_STEP", onCut);
      bus.off("PREP_VEG_STATE_CHANGED", onVeg);
      bus.off("PREP_BOWL_FILLED", onFilled);
      bus.off("PREP_BOWL_POURED", onPoured);
      bus.off("LADLE_STIR_REQUESTED", onLadle);
      bus.off("PAN_TOSS_REQUESTED", onToss);
      bus.off("SALMON_FLIPPED", onFlipped);
      bus.off("DISH_PLATED", onDish);
    }
    print(`[LEAF] Scenario 12 run: dish ${dishDuringRun}, cuts ${seen.cuts}, ladle ${seen.ladle} (${stir.getResult()}), toss ${seen.toss}, flip ${seen.flipTech}`);

    expect(dishDuringRun).toBe(DISH_02);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(DISH_02);
    // 8 cuts at the dish spacing
    expect(seen.cuts).toBe(8);
    expect(seen.badSpacing).toBe(0);
    expect(seen.chops >= 8).toBe(true);
    // two-pour transfer
    expect(seen.filled).toBe(true);
    expect(seen.poured).toBe(true);
    expect(props.isBowlPouredIntoSaucier()).toBe(true);
    // #332 ladle stir: requested; no-op until the asset phase adds LadleProp (PLAYED once it exists)
    expect(seen.ladle >= 1).toBe(true);
    const r = stir.getResult();
    expect(r === "NOOP_NO_PROP" || r === "PLAYED").toBe(true);
    // KINE_PAN_TOSS_ROLL replaced the spatula flip for this dish
    expect(seen.toss >= 1).toBe(true);
    expect(toss.getTossCount() > tossCount0).toBe(true);
    expect(seen.flipTech).toBe("KINE_PAN_TOSS_ROLL");
    expect(guide.isFlipped()).toBe(true);
    // plating
    expect(seen.dish).toBe(true);
    const card = findSceneObjectByName("PlatingDebriefCard");
    expect(card).toBeTruthy();
    expect(card.enabled).toBe(true);

    await interactor.tapButton("Btn_Reset");
    await sleep(700);
    expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe("01_salmon_beurre_blanc");
    expect(guide.isFlipped()).toBe(false);
    print("[LEAF] Scenario 12 PASSED: dish 02 Auto Cook -> 0.8 cm cuts, two-pour, ladle stir request, pan toss, plated.");
  }
}
