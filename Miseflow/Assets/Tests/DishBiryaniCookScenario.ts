import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { AutoCookController } from "../Scripts/AutoCookController";
import { DishBlueprintApplier } from "../Scripts/DishBlueprintApplier";
import { DishStudio } from "../Scripts/DishStudio";
import { MiseFlowEventBus, MiseFlowEventType } from "../Scripts/MiseFlowEventBus";
import { StepEngine } from "../Scripts/StepEngine";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

const DEFAULT_TEST_SPEED = 8.0;
const MAX_WAIT_MS = 150000;

export interface DishCookResult {
  dishId: string;
  total: number;
  started: number[];
  completed: number[];
  counts: { [ev: string]: number };
  kinematics: string[];
  plated: boolean;
}

/**
 * Shared K1b dish smoke run: Btn_CycleDish opens the Dish Studio -> chip -> Skip -> staged reveal -> Auto Cook at test
 * speed. Records STEP_STARTED / STEP_COMPLETED indices, counts of the given bus events and KINEMATIC_COMPLETED ids.
 * Ends with Btn_Reset (dish 01).
 */
export async function runDishCook(chip: number, dishId: string, events: MiseFlowEventType[], speed: number): Promise<DishCookResult> {
  const interactor = new MiseFlowLeafInteractor();
  const bus = MiseFlowEventBus.getInstance();
  await sleep(300);
  await interactor.tapButton("Btn_Reset");
  await sleep(600);
  const auto = AutoCookController.getInstance();
  const studio = DishStudio.getInstance();
  const engine = StepEngine.getInstance();
  expect(auto).toBeTruthy();
  expect(studio).toBeTruthy();
  expect(engine).toBeTruthy();

  let revealed = false;
  const onRevealed = (d: any) => (revealed = !!d && d.dishId === dishId);
  bus.on("DISH_REVEALED", onRevealed);
  await interactor.tapButton("Btn_CycleDish");
  await sleep(300);
  expect(studio.isOpen()).toBe(true);
  await interactor.tapButton(`Btn_StudioChip_${chip}`);
  await sleep(1000);
  expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe(dishId);
  await interactor.tapButton("Btn_BriefingSkip");
  let rw = 0;
  while (!revealed && rw < 15000) {
    await sleep(200);
    rw += 200;
  }
  bus.off("DISH_REVEALED", onRevealed);
  expect(revealed).toBe(true);
  await sleep(400);

  const res: DishCookResult = { dishId: "", total: 0, started: [], completed: [], counts: {}, kinematics: [], plated: false };
  const subs: { ev: MiseFlowEventType; cb: (d?: any) => void }[] = [];
  const on = (ev: MiseFlowEventType, cb: (d?: any) => void) => {
    bus.on(ev, cb);
    subs.push({ ev: ev, cb: cb });
  };
  on("STEP_STARTED", (d: any) => {
    if (d && d.dishId === dishId && res.started.indexOf(d.index) < 0) res.started.push(d.index);
  });
  on("STEP_COMPLETED", (d: any) => {
    if (d && d.dishId === dishId && res.completed.indexOf(d.index) < 0) res.completed.push(d.index);
  });
  on("KINEMATIC_COMPLETED", (d: any) => res.kinematics.push(d && d.kinematic ? String(d.kinematic) : "?"));
  on("DISH_PLATED", () => (res.plated = true));
  for (const ev of events) {
    res.counts[ev] = 0;
    on(ev, () => (res.counts[ev] = (res.counts[ev] || 0) + 1));
  }
  const prevSpeed = auto.speed;
  try {
    auto.speed = speed;
    await interactor.tapButton("Btn_AutoCook");
    expect(auto.isRunning()).toBe(true);
    await sleep(600);
    res.dishId = DishBlueprintApplier.getActiveBlueprint().dishId;
    let waited = 0;
    while (auto.isRunning() && waited < MAX_WAIT_MS) {
      await sleep(250);
      waited += 250;
    }
    expect(auto.isRunning()).toBe(false);
    res.total = engine.getSteps().length;
  } finally {
    auto.speed = prevSpeed;
    for (const s of subs) bus.off(s.ev, s.cb);
  }
  print(`[LEAF] dish ${res.dishId}: steps ${res.total}, started [${res.started.join(",")}], completed [${res.completed.join(",")}], events ${JSON.stringify(res.counts)}, kinematics [${res.kinematics.join(",")}], plated ${res.plated}`);
  await interactor.tapButton("Btn_Reset");
  await sleep(700);
  expect(DishBlueprintApplier.getActiveBlueprint().dishId).toBe("01_salmon_beurre_blanc");
  return res;
}

export function expectAllSteps(r: DishCookResult): void {
  expect(r.total > 0).toBe(true);
  for (let i = 0; i < r.total; i++) {
    expect(r.started.indexOf(i) >= 0).toBe(true);
    expect(r.completed.indexOf(i) >= 0).toBe(true);
  }
}

/**
 * DishBiryaniCookScenario.ts
 * LEAF Scenario 15 (K1b): dish 02 Mushroom Dum Biryani via the Dish Studio, Auto Cook at test speed: every step of its
 * steps[] starts and completes in order, the ladle stir and the dum seal were requested, the dum kinematic completed
 * and the dish plated (serving handi). Ends with Reset (dish 01).
 */
@component
export class DishBiryaniCookScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const s = config ? config.getNumber("speed") : undefined;
    const speed = s !== undefined && s > 0 ? s : DEFAULT_TEST_SPEED;
    print(`[LEAF] Running Scenario 15: DishBiryaniCookScenario (speed ${speed}x)...`);
    const r = await runDishCook(1, "02_mushroom_dum_biryani", ["DUM_SEAL_REQUESTED", "LADLE_STIR_REQUESTED"], speed);
    expect(r.dishId).toBe("02_mushroom_dum_biryani");
    expect(r.total).toBe(8);
    expectAllSteps(r);
    expect(r.counts["DUM_SEAL_REQUESTED"] >= 1).toBe(true);
    expect(r.counts["LADLE_STIR_REQUESTED"] >= 1).toBe(true);
    expect(r.kinematics.indexOf("KINE_RICE_DUM_LAYER") >= 0).toBe(true);
    expect(r.plated).toBe(true);
    print("[LEAF] Scenario 15 PASSED: dish 02 cooked step by step (ladle, dum layer + seal), plated.");
  }
}
