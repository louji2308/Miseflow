import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { getPreset } from "../Scripts/AI/DishLibraryConfig";
import { expectAllSteps, runDishCook } from "./DishBiryaniCookScenario";

/**
 * DishNoodlesCookScenario.ts
 * LEAF Scenario 16 (K1b): dish 03 Wok-Tossed Hakka Noodles via the Dish Studio, Auto Cook at test speed: every step
 * of its steps[] completes, NOODLE_TOSS_REQUESTED fired, the noodle lift-toss kinematic completed and the dish plated
 * (deep bowl). Ends with Reset (dish 01). Optional "chip" (default 2 = dish 03) runs another noodle / pasta dish the
 * same way (5 = dish 06 prawn pasta: basket lift + tongs).
 */
@component
export class DishNoodlesCookScenario extends Scenario {
  async run(config?: ScenarioConfig): Promise<void> {
    const s = config ? config.getNumber("speed") : undefined;
    const speed = s !== undefined && s > 0 ? s : 8.0;
    const c = config ? config.getNumber("chip") : undefined;
    const chip = c !== undefined && c >= 1 && c <= 5 ? Math.floor(c) : 2;
    const bp = getPreset(chip);
    print(`[LEAF] Running Scenario 16: DishNoodlesCookScenario (${bp.dishId}, speed ${speed}x)...`);
    const r = await runDishCook(chip, bp.dishId, ["NOODLE_TOSS_REQUESTED"], speed);
    expect(r.dishId).toBe(bp.dishId);
    expect(r.total).toBe(bp.steps.length);
    expectAllSteps(r);
    expect(r.counts["NOODLE_TOSS_REQUESTED"] >= 1).toBe(true);
    expect(r.kinematics.indexOf("KINE_NOODLE_LIFT_TOSS") >= 0).toBe(true);
    expect(r.plated).toBe(true);
    print(`[LEAF] Scenario 16 PASSED: ${bp.dishId} cooked step by step (noodle lift + toss), plated.`);
  }
}
