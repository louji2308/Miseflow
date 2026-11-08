import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishStudio } from "../Scripts/DishStudio";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { isLiveEnabled } from "../Scripts/AI/AiModelConfig";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

/**
 * LiveAiCompileScenario.ts  (id "live-ai-compile")
 * LEAF Scenario 17: the REAL Anthropic Chef Director call. Needs ANTHROPIC_API_KEY (tools/sync-env.ps1) and a director model id;
 * on a clean clone it is skipped (passes).
 *  1. Typed "lemon tiramisu" (no preset, not in PlanLibrary) -> COOK_PLAN_READY with a plan of >= 4 steps, a plate, no salmon.
 *  2. Reset, then typed gibberish -> DISH_NOT_FOUND with the exact message; the active legacy dish is still dish 01.
 */
@component
export class LiveAiCompileScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    print("[LEAF] Running Scenario 17: LiveAiCompileScenario...");
    const interactor = new MiseFlowLeafInteractor();
    const bus = MiseFlowEventBus.getInstance();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(500);
    if (!isLiveEnabled("director")) {
      print("[LEAF] LiveAiCompileScenario skipped: no ANTHROPIC_API_KEY / director model (clean clone). completed successfully");
      return;
    }
    const studio = DishStudio.getInstance();
    await interactor.tapButton("Btn_CycleDish");
    await sleep(300);
    expect(studio.isOpen()).toBe(true);

    let ready: any = null;
    let nf: any = null;
    const onReady = (d: any) => (ready = d || { ok: true });
    const onNf = (d: any) => (nf = d || { ok: true });
    bus.on("COOK_PLAN_READY", onReady);
    bus.on("DISH_NOT_FOUND", onNf);
    try {
      const t0 = getTime();
      bus.emit("STUDIO_TEXT_SUBMITTED", { text: "lemon tiramisu", source: "KEYBOARD" });
      await sleep(250);
      await interactor.tapButton("Btn_StudioConfirm");
      for (let i = 0; i < 140 && !ready && !nf; i++) await sleep(500);
      print(`[LiveAI] lemon tiramisu -> planReady=${!!ready} notFound=${!!nf} after ${(getTime() - t0).toFixed(1)}s`);
      expect(!!ready).toBe(true);
      const plan = ready.plan;
      print(`[LiveAI] plan "${plan.dishTitle}" steps=${plan.steps.length} equipment=${plan.equipment.length} ingredients=${plan.ingredients.length}`);
      expect(plan.steps.length >= 4).toBe(true);
      expect(plan.equipment.length >= 2).toBe(true);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId.indexOf("01_") === 0).toBe(true);

      // gibberish -> not found (Reset first: it leaves Cook mode and brings the legacy setup back)
      await sleep(500);
      await interactor.tapButton("Btn_Reset");
      await sleep(1500);
      ready = null;
      nf = null;
      await interactor.tapButton("Btn_CycleDish");
      await sleep(400);
      expect(studio.isOpen()).toBe(true);
      bus.emit("STUDIO_TEXT_SUBMITTED", { text: "asdfgh qwerty zzz", source: "KEYBOARD" });
      await sleep(250);
      await interactor.tapButton("Btn_StudioConfirm");
      for (let i = 0; i < 140 && !ready && !nf; i++) await sleep(500);
      print(`[LiveAI] gibberish -> planReady=${!!ready} notFound=${!!nf}`);
      expect(!!nf).toBe(true);
      expect(!!ready).toBe(false);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId.indexOf("01_") === 0).toBe(true);
    } finally {
      bus.off("COOK_PLAN_READY", onReady);
      bus.off("DISH_NOT_FOUND", onNf);
    }
    print("[LEAF] LiveAiCompileScenario completed successfully");
  }
}
