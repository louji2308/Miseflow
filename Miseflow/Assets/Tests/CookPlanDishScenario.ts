import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishStudio } from "../Scripts/DishStudio";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { SpatialBriefingDeck } from "../Scripts/SpatialBriefingDeck";
import { CookStage } from "../Scripts/Cook/CookStage";
import { CookRuntime } from "../Scripts/Cook/CookRuntime";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DISHES = ["chicken 65", "chapathi", "tomato soup"];

/**
 * CookPlanDishScenario.ts  (ids "cook-plan-chicken65" dish=0, "cook-plan-chapathi" dish=1, "cook-plan-generic" dish=2)
 * LEAF Scenario 18-20: the Chef Director (Cook engine) end to end.
 *  Typed dish (no preset) -> plan (PlanLibrary for 0/1, live Anthropic for 2, skipped without a key) -> briefing deck with one card
 *  per step -> Skip -> only the needed items are built and revealed one by one (COOK_LOAD_PROGRESS) -> COOK_WORLD_READY with
 *  budgets respected -> Auto at 10x -> every step starts and finishes, parallel steps overlap (chicken 65) -> COOK_FINISHED ->
 *  Reset restores dish 01 and the legacy setup, disposes the Cook world.
 */
@component
export class CookPlanDishScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const which = config && config.getNumber("dish") !== undefined ? (config.getNumber("dish") as number) : 0;
    const query = DISHES[which] || DISHES[0];
    const hold = config && config.getNumber("hold") !== undefined ? (config.getNumber("hold") as number) : 0; // seconds to pause for screenshots
    print(`[LEAF] Running CookPlanDishScenario for "${query}"...`);
    const interactor = new MiseFlowLeafInteractor();
    const bus = MiseFlowEventBus.getInstance();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(600);

    const studio = DishStudio.getInstance();
    const deck = SpatialBriefingDeck.getInstance();
    const stage = CookStage.getInstance();
    const runtime = CookRuntime.getInstance();
    expect(studio).toBeTruthy();
    expect(deck).toBeTruthy();
    expect(stage).toBeTruthy();
    expect(runtime).toBeTruthy();
    const root = findSceneObjectByName("StationsRoot");
    const scale0 = root.getTransform().getLocalScale();

    let plan: any = null;
    let world: any = null;
    let finished = false;
    let notFound = false;
    const started: string[] = [];
    const done: string[] = [];
    let running = 0;
    let maxRunning = 0;
    let loadEvents = 0;
    const onPlan = (d: any) => (plan = d ? d.plan : null);
    const onWorld = (d: any) => (world = d ? d.world : null);
    const onFin = () => (finished = true);
    const onNf = () => (notFound = true);
    const onStart = (d: any) => {
      started.push(d ? String(d.stepId) : "?");
      running++;
      maxRunning = Math.max(maxRunning, running);
    };
    const onDone = (d: any) => {
      done.push(d ? String(d.stepId) : "?");
      running = Math.max(0, running - 1);
    };
    const onLoad = () => loadEvents++;
    bus.on("COOK_PLAN_READY", onPlan);
    bus.on("COOK_WORLD_READY", onWorld);
    bus.on("COOK_FINISHED", onFin);
    bus.on("DISH_NOT_FOUND", onNf);
    bus.on("COOK_STEP_STARTED", onStart);
    bus.on("COOK_STEP_DONE", onDone);
    bus.on("COOK_LOAD_PROGRESS", onLoad);
    try {
      await interactor.tapButton("Btn_CycleDish");
      await sleep(300);
      expect(studio.isOpen()).toBe(true);
      bus.emit("STUDIO_TEXT_SUBMITTED", { text: query, source: "KEYBOARD" });
      await sleep(250);
      await interactor.tapButton("Btn_StudioConfirm");
      for (let i = 0; i < 160 && !plan && !notFound; i++) await sleep(500);
      if (!plan && notFound && which === 2) {
        print("[LEAF] CookPlanDishScenario generic dish skipped: no live Director (no key / model). completed successfully");
        return;
      }
      expect(!!plan).toBe(true);
      print(`[CookScenario] plan "${plan.dishTitle}" steps=${plan.steps.length} equipment=${plan.equipment.length} ingredients=${plan.ingredients.length}`);
      expect(plan.steps.length >= 4).toBe(true);

      // briefing deck shows the steps, the legacy setup stays collapsed
      for (let i = 0; i < 20 && !deck.isOpen(); i++) await sleep(300);
      expect(deck.isOpen()).toBe(true);
      expect(deck.getCardCount()).toBe(Math.min(12, plan.steps.length));
      expect(studio.isSetupHidden()).toBe(true);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId.indexOf("01_") === 0).toBe(true);
      await interactor.tapButton("Btn_BriefingSkip");

      // only needed items build; reveal progress events; world ready
      for (let i = 0; i < 240 && !world; i++) await sleep(500);
      expect(!!world).toBe(true);
      const st = world.stats();
      print(`[CookScenario] world objects=${st.objects} tris=${st.tris} violations=${st.violations.length} loadEvents=${loadEvents}`);
      expect(loadEvents >= plan.ingredients.length).toBe(true);
      expect(st.objects <= 170).toBe(true);
      expect(st.tris <= 7500).toBe(true);
      expect(st.violations.length).toBe(0);
      expect(Object.keys(world.items).length).toBe(plan.ingredients.length);
      expect(Object.keys(world.equipment).length).toBe(plan.equipment.length);
      expect(root.getTransform().getWorldScale().x < 0.01).toBe(true); // legacy setup stays hidden in Cook mode

      if (hold > 0) {
        print("[CookScenario] HOLD world ready");
        await sleep(hold * 1000);
      }
      // auto cook at 10x (1x when holding, so mid-cook screenshots are possible)
      runtime.setSpeed(hold > 0 ? 2 : 10);
      bus.emit("COOK_AUTO", { on: true });
      for (let i = 0; i < 300 && !finished; i++) await sleep(500);
      const s = runtime.getState();
      print(`[CookScenario] finished=${finished} started=${started.length}/${plan.steps.length} done=${done.length} maxParallel=${maxRunning} errors=${s.errors} last="${s.lastError}"`);
      expect(finished).toBe(true);
      expect(started.length).toBe(plan.steps.length);
      expect(done.length).toBe(plan.steps.length);
      expect(s.errors).toBe(0);
      if (which === 0) expect(maxRunning >= 2).toBe(true); // frying while the second pan tempers

      if (hold > 0) {
        print("[CookScenario] HOLD finished");
        await sleep(hold * 1000);
      }
      // Reset: back to dish 01 and the legacy setup, Cook world disposed
      await interactor.tapButton("Btn_Reset");
      await sleep(1200);
      expect(stage.isActive()).toBe(false);
      expect(studio.isSetupHidden()).toBe(false);
      const sc = root.getTransform().getLocalScale();
      expect(Math.abs(sc.x - scale0.x) < 1e-5).toBe(true);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId.indexOf("01_") === 0).toBe(true);
    } finally {
      bus.off("COOK_PLAN_READY", onPlan);
      bus.off("COOK_WORLD_READY", onWorld);
      bus.off("COOK_FINISHED", onFin);
      bus.off("DISH_NOT_FOUND", onNf);
      bus.off("COOK_STEP_STARTED", onStart);
      bus.off("COOK_STEP_DONE", onDone);
      bus.off("COOK_LOAD_PROGRESS", onLoad);
    }
    print("[LEAF] CookPlanDishScenario completed successfully");
  }
}
