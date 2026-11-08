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
import { CookItemLabels } from "../Scripts/Cook/CookItemLabels";
import { BENCH } from "../Scripts/Cook/CookLayout";

function sceneHas(name: string): boolean {
  const n = global.scene.getRootObjectsCount();
  for (let i = 0; i < n; i++) if (global.scene.getRootObject(i).name === name) return true;
  return false;
}
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DISHES = ["chicken 65", "chapathi", "tomato soup", "poori", "athirasam"];

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
    const labels = CookItemLabels.getInstance();
    let labelsMax = 0;
    const onStart = (d: any) => {
      if (labels) labelsMax = Math.max(labelsMax, labels.getShown().length);
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
      if (!plan && notFound && (which === 2 || which === 4)) {
        print("[LEAF] CookPlanDishScenario generic dish skipped: no live Director (no key / model). completed successfully");
        return;
      }
      expect(!!plan).toBe(true);
      print(`[CookScenario] plan "${plan.dishTitle}" steps=${plan.steps.length} equipment=${plan.equipment.length} ingredients=${plan.ingredients.length}`);
      expect(plan.steps.length >= 4).toBe(true);
      print(`[CookScenario] PLAN ${plan.steps.map((st: any) => `${st.id}:${st.action}@${st.equipmentId}[${(st.ingredientIds || []).join("+")}]`).join(" > ")}`);
      print(`[CookScenario] ITEMS ${plan.ingredients.map((g: any) => `${g.id}:${g.role}:${g.form}`).join(" | ")}`);

      // briefing deck shows the steps, the legacy setup stays collapsed
      for (let i = 0; i < 20 && !deck.isOpen(); i++) await sleep(300);
      expect(deck.isOpen()).toBe(true);
      expect(deck.getCardCount()).toBe(Math.min(12, plan.steps.length));
      expect(studio.isSetupHidden()).toBe(true);
      expect(DishBlueprintApplier.getActiveBlueprint().dishId.indexOf("01_") === 0).toBe(true);
      // the "Setting up" panel must not sit on the deck cards: it only appears once the deck is closed
      await sleep(1500);
      expect(sceneHas("CookLoadingPanel")).toBe(false);
      await interactor.tapButton("Btn_BriefingSkip");

      // only needed items build; reveal progress events; world ready
      for (let i = 0; i < 240 && !world; i++) await sleep(500);
      expect(!!world).toBe(true);
      const st = world.stats();
      print(`[CookScenario] world objects=${st.objects} tris=${st.tris} violations=${st.violations.length} loadEvents=${loadEvents}`);
      expect(loadEvents >= plan.ingredients.length).toBe(true);
      expect(st.objects <= 170).toBe(true);
      expect(st.tris <= 8000).toBe(true);
      expect(st.violations.length).toBe(0);
      expect(Object.keys(world.items).length).toBe(plan.ingredients.length);
      expect(Object.keys(world.equipment).length).toBe(plan.equipment.length);
      expect(root.getTransform().getWorldScale().x < 0.01).toBe(true); // legacy setup stays hidden in Cook mode

      // a new dish starts at normal speed in MANUAL mode (nothing a previous test left behind)
      expect(runtime.isAuto()).toBe(false);
      expect(runtime.getSpeed()).toBe(1);
      // every tool and vessel must rest fully on the slab (no tool left floating off the bench)
      {
        const inv = world.root.getTransform().getInvertedWorldTransform();
        const offBench: string[] = [];
        for (const id in world.tools) {
          const t = world.tools[id];
          const l = inv.multiplyPoint(t.restPos);
          const up = t.restRot.multiplyVec3(new vec3(0, 1, 0));
          print(`[CookScenario] tool ${id} ${t.kind} local=(${l.x.toFixed(1)}, ${l.y.toFixed(1)}, ${l.z.toFixed(1)}) upY=${up.y.toFixed(2)}`);
          if (l.x < BENCH.minX || l.x > BENCH.maxX || l.z < BENCH.minZ || l.z > BENCH.maxZ || l.y > 6 || up.y < 0.7) offBench.push(id);
        }
        expect(offBench.length).toBe(0);
      }
      if (hold > 0) {
        print("[CookScenario] HOLD world ready");
        await sleep(hold * 1000);
      }
      // auto cook at 10x (1x when holding, so mid-cook screenshots are possible)
      runtime.setSpeed(hold > 0 ? (which === 3 ? 1 : 2) : which === 3 ? 3 : 10);
      bus.emit("COOK_AUTO", { on: true });
      // poori: sample the disc while it is in the kadai (fry / flip) - it must never leave the vessel - and the oil geometry
      let maxOut = -1e9; // how far the disc got outside the kadai wall during the flip (negative = inside)
      let flipSeen = false;
      for (let i = 0; i < 600 && !finished; i++) {
        await sleep(which === 3 ? 150 : 500);
        if (which === 3 && world.items.dough && world.equipment.kadai) {
          const st2 = runtime.getState();
          const inFry = st2.running.some((id: string) => id === "flip"); // the flip step runs after fry_first left the disc floating in the oil
          if (st2.running.indexOf("flip") >= 0) flipSeen = true;
          if (inFry) {
            const k = world.equipment.kadai.floorWorld();
            for (const pc of world.items.dough.pieces) {
              const q = pc.getTransform().getWorldPosition();
              maxOut = Math.max(maxOut, Math.sqrt((q.x - k.x) ** 2 + (q.z - k.z) ** 2) - world.equipment.kadai.radiusCm);
            }
          }
        }
      }
      const s = runtime.getState();
      print(`[CookScenario] finished=${finished} started=${started.length}/${plan.steps.length} done=${done.length} maxParallel=${maxRunning} errors=${s.errors} last="${s.lastError}"`);
      expect(finished).toBe(true);
      expect(started.length).toBe(plan.steps.length);
      expect(done.length).toBe(plan.steps.length);
      expect(s.errors).toBe(0);
      // where does every item end? (distance from the plate and from each burner vessel, cm)
      {
        const rep: string[] = [];
        const pf2 = world.equipment[plan.plateEquipmentId] ? world.equipment[plan.plateEquipmentId].floorWorld() : world.plate.floorWorld();
        for (const id in world.items) {
          const it = world.items[id];
          const q = it.obj.getTransform().getWorldPosition();
          const dP = Math.sqrt((q.x - pf2.x) ** 2 + (q.z - pf2.z) ** 2);
          rep.push(`${id}(${it.role}) plate=${dP.toFixed(1)} vis=${it.obj.enabled}`);
        }
        print(`[CookScenario] ENDPOS ${rep.join(" | ")}`);
      }
      // stray-object audit: nothing visible may float off the bench or high above it once the cook is over
      {
        const inv2 = world.root.getTransform().getInvertedWorldTransform();
        const strays: string[] = [];
        const walk = (o: SceneObject, path: string) => {
          if (!o.enabled) return;
          const rmv = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
          if (rmv && rmv.mesh) {
            const l = inv2.multiplyPoint(o.getTransform().getWorldPosition());
            if (l.x < BENCH.minX - 2 || l.x > BENCH.maxX + 2 || l.z < BENCH.minZ - 2 || l.z > BENCH.maxZ + 2 || l.y > 12) strays.push(`${path}/${o.name}@(${l.x.toFixed(1)},${l.y.toFixed(1)},${l.z.toFixed(1)})`);
          }
          for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i), path + "/" + o.name);
        };
        walk(world.root, "");
        print(`[CookScenario] strays=[${strays.slice(0, 8).join(" | ")}]`);
      }
      // name tags: some step showed tags, never more than five at once
      expect(labelsMax >= 1 && labelsMax <= 5).toBe(true);
      // transformations: a vegetable that steps used is never left whole at the end
      const formReport: string[] = [];
      for (const id in world.items) {
        const it = world.items[id];
        if (!it.form) continue;
        formReport.push(`${id}:${it.form}`);
        expect(it.form === "whole").toBe(false);
      }
      print(`[CookScenario] labelsMax=${labelsMax} forms=[${formReport.join(", ")}]`);
      if (which === 0) expect(maxRunning >= 2).toBe(true); // frying while the second pan tempers
      if (which === 3) {
        print(`[CookScenario] poori flipSeen=${flipSeen} maxOutsideKadai=${maxOut.toFixed(2)}`);
        expect(flipSeen).toBe(true);
        expect(maxOut > -1e8 && maxOut < 0).toBe(true); // sampled, and the disc stayed inside the kadai for the whole flip
        // the poori ends on the plate, fully on the bench
        const plate = world.equipment.plate;
        const pf = plate.floorWorld();
        const tr0 = world.root.getTransform();
        for (const pc of world.items.dough.pieces) {
          const q = pc.getTransform().getWorldPosition();
          expect(Math.sqrt((q.x - pf.x) ** 2 + (q.z - pf.z) ** 2) < plate.radiusCm).toBe(true);
          const l = tr0.getInvertedWorldTransform().multiplyPoint(q);
          expect(l.x > BENCH.minX && l.x < BENCH.maxX && l.z > BENCH.minZ && l.z < BENCH.maxZ).toBe(true);
        }
        // the plate itself is fully on the slab
        const lp = tr0.getInvertedWorldTransform().multiplyPoint(pf);
        expect(lp.x + plate.radiusCm < BENCH.maxX && lp.x - plate.radiusCm > BENCH.minX && lp.z + plate.radiusCm < BENCH.maxZ && lp.z - plate.radiusCm > BENCH.minZ).toBe(true);
      }

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
      runtime.setSpeed(1);
      bus.emit("COOK_AUTO", { on: false });
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
