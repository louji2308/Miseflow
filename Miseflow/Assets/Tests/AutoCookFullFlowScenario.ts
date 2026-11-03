import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { AutoCookController } from "../Scripts/AutoCookController";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { SpatulaTechniqueGuide } from "../Scripts/SpatulaTechniqueGuide";
import { StationPropsBuilder } from "../Scripts/StationPropsBuilder";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DEFAULT_TEST_SPEED = 8.0;
const MAX_WAIT_MS = 120000;

function labelText(name: string): string {
  const o = findSceneObjectByName(name);
  if (!o) return "";
  const t = (o.getComponent("Component.Text3D") as Text3D) || (o.getComponent("Text3D") as Text3D);
  return t ? t.text : "";
}

/**
 * AutoCookFullFlowScenario.ts
 * LEAF Scenario 10: Auto Cook runs the whole service start -> finish. Taps Btn_AutoCook with a
 * test-only pacing multiplier, waits for the run to end and asserts the plated state: debrief card
 * up, skillet + saucier labels PLATED, salmon flipped, bowl filled + poured into the saucier, dish
 * plated. Also checks Stop/Reset cancel cleanly. One retry separates a timing flake from a failure.
 */
@component
export class AutoCookFullFlowScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const s = config ? config.getNumber("speed") : undefined;
    const speed = s !== undefined && s > 0 ? s : DEFAULT_TEST_SPEED;
    print(`[LEAF] Running Scenario 10: AutoCookFullFlowScenario (speed ${speed}x)...`);
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.attempt(speed);
        print(`[LEAF] Scenario 10 PASSED (attempt ${attempt}): Auto Cook chop -> bowl -> saucier -> flip -> sauce -> plated dish.`);
        return;
      } catch (e) {
        lastErr = e;
        print(`[LEAF] Scenario 10 attempt ${attempt} failed: ${e}`);
        const auto = AutoCookController.getInstance();
        if (auto && auto.isRunning()) auto.stop();
        await sleep(600);
      }
    }
    throw lastErr;
  }

  private async attempt(speed: number): Promise<void> {
    const interactor = new MiseFlowLeafInteractor();
    const bus = MiseFlowEventBus.getInstance();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(600);

    const auto = AutoCookController.getInstance();
    expect(auto).toBeTruthy();
    expect(findSceneObjectByName("Btn_AutoCook")).toBeTruthy();
    const layer = findSceneObjectByName("DiegeticLayer");
    const guide = layer.getComponent(SpatulaTechniqueGuide.getTypeName()) as SpatulaTechniqueGuide;
    expect(guide).toBeTruthy();
    const root = findSceneObjectByName("StationsRoot");
    const props = root.getComponent(StationPropsBuilder.getTypeName()) as StationPropsBuilder;
    expect(props).toBeTruthy();

    const seen = { bowlFilled: false, bowlPoured: false, flipped: false, dish: false, chops: 0 };
    const onFilled = () => (seen.bowlFilled = true);
    const onPoured = () => (seen.bowlPoured = true);
    const onFlipped = () => (seen.flipped = true);
    const onDish = () => (seen.dish = true);
    const onVeg = () => seen.chops++;
    bus.on("PREP_BOWL_FILLED", onFilled);
    bus.on("PREP_BOWL_POURED", onPoured);
    bus.on("SALMON_FLIPPED", onFlipped);
    bus.on("DISH_PLATED", onDish);
    bus.on("PREP_VEG_STATE_CHANGED", onVeg);
    const prevSpeed = auto.speed;
    try {
      // Stop cancels cleanly mid-run
      auto.speed = speed;
      await interactor.tapButton("Btn_AutoCook");
      expect(auto.isRunning()).toBe(true);
      await sleep(900);
      expect(AutoCookController.isAutoRunning()).toBe(true);
      // a manual press during the run is ignored and does not stop Auto Cook
      await interactor.tapButton("Btn_StepChop");
      expect(AutoCookController.isAutoRunning()).toBe(true);
      await interactor.tapButton("Btn_AutoCook"); // Stop
      expect(auto.isRunning()).toBe(false);
      await sleep(400);
      expect(props.getChopCount()).toBe(0);
      expect(guide.isFlipped()).toBe(false);

      // full run
      seen.bowlFilled = seen.bowlPoured = seen.flipped = seen.dish = false;
      seen.chops = 0;
      auto.speed = speed;
      await interactor.tapButton("Btn_AutoCook");
      expect(auto.isRunning()).toBe(true);
      let waited = 0;
      while (auto.isRunning() && waited < MAX_WAIT_MS) {
        await sleep(250);
        waited += 250;
      }
      expect(auto.isRunning()).toBe(false);
    } finally {
      auto.speed = prevSpeed;
      bus.off("PREP_BOWL_FILLED", onFilled);
      bus.off("PREP_BOWL_POURED", onPoured);
      bus.off("SALMON_FLIPPED", onFlipped);
      bus.off("DISH_PLATED", onDish);
      bus.off("PREP_VEG_STATE_CHANGED", onVeg);
    }

    const card = findSceneObjectByName("PlatingDebriefCard");
    expect(card).toBeTruthy();
    expect(card.enabled).toBe(true);
    expect(labelText("SkilletStatusLabel").indexOf("PLATED") !== -1).toBe(true);
    expect(labelText("SaucepotStatusLabel").indexOf("PLATED") !== -1).toBe(true);
    expect(guide.isFlipped()).toBe(true);
    expect(seen.flipped).toBe(true);
    expect(seen.bowlFilled).toBe(true);
    expect(seen.bowlPoured).toBe(true);
    expect(seen.dish).toBe(true);
    expect(seen.chops >= 8).toBe(true);
    expect(props.isBowlPouredIntoSaucier()).toBe(true);
    expect(findSceneObjectByName("PlateSaucePool").enabled).toBe(true);
    expect(findSceneObjectByName("PlatingReticleRoot").enabled).toBe(false);

    // Reset restores the kitchen
    await interactor.tapButton("Btn_Reset");
    await sleep(500);
    expect(guide.isFlipped()).toBe(false);
    expect(props.isBowlFilled()).toBe(false);
    expect(props.getChopCount()).toBe(0);
    expect(findSceneObjectByName("PlateSaucePool").enabled).toBe(false);
  }
}
