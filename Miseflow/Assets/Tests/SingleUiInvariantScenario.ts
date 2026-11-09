import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { DirectorPalette } from "../Scripts/DirectorPalette";
import { DISH_02, enterChicken65, enterDish02, expectNoLegacyOrDockUi, expectTargetsOk, hubOrFail, resetToDish01 } from "./Stage3TestKit";

/**
 * SingleUiInvariantScenario.ts (id "single-ui-invariant-scenario") - v7 Stage 3, plan Part F row single-ui-invariant.
 * Dish 02 (legacy engine) then Chicken 65 (Cook engine): each produces station targets (one per legacy station,
 * one per Cook vessel / board / plate), no dock / palette object is visible with the palette closed, no legacy pill,
 * stem, chronometer capsule, step card or Cook step card is visible.
 * Ends with Btn_Reset (dish 01).
 */
@component
export class SingleUiInvariantScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running SingleUiInvariantScenario...");
    await sleep(500);
    await resetToDish01();
    const hub = hubOrFail();
    const palette = DirectorPalette.getInstance();
    expect(palette, "DirectorPalette missing").toBeTruthy();
    expect((palette as DirectorPalette).isOpen(), "palette must start closed").toBe(false);

    // dish 01 baseline
    let n = expectNoLegacyOrDockUi("dish 01");
    expectTargetsOk("dish 01", hub.getTargets(), 4);
    print(`[Stage3] dish 01: ${hub.getTargets().length} targets, ${n} legacy/dock objects checked hidden`);

    // dish 02: legacy engine, same four stations
    await enterDish02();
    expect(hub.isCookMode()).toBe(false);
    n = expectNoLegacyOrDockUi(`dish ${DISH_02}`);
    expectTargetsOk(`dish ${DISH_02}`, hub.getTargets(), 4);
    expect(!!hub.getPlateTarget(), "dish 02 has no plate target").toBe(true);
    for (const nm of ["Skillet", "Saucepot", "Prep", "Plate"]) expect(!!findSceneObjectByName(`StationTarget_${nm}`), `StationTarget_${nm} missing`).toBe(true);
    print(`[Stage3] dish 02: ${hub.getTargets().length} targets, ${n} legacy/dock objects checked hidden`);
    await resetToDish01();

    // Chicken 65: Cook engine, one target per vessel / board / plate in the plan
    const world = await enterChicken65();
    expect(hub.isCookMode(), "hub did not enter Cook mode").toBe(true);
    const eqCount = Object.keys(world.equipment).length;
    n = expectNoLegacyOrDockUi("chicken 65");
    expectTargetsOk("chicken 65", hub.getTargets(), Math.max(3, eqCount));
    expect(hub.getTargets().length, "one target per equipment entry").toBe(eqCount);
    expect(!!hub.getPlateTarget(), "chicken 65 has no plate target").toBe(true);
    for (const t of hub.getTargets()) {
      let p: SceneObject | null = t.root;
      while (p) {
        expect(p.name !== "StationsRoot" && p.name !== "CookStageRoot", `target ${t.id} sits under ${p.name}`).toBe(true);
        p = p.hasParent() ? p.getParent() : null;
      }
    }
    // legacy targets are not shown in Cook mode (no second UI)
    for (const t of hub.getLegacyTargets()) expect(t.isShown(), `legacy target ${t.id} still shown in Cook mode`).toBe(false);
    print(`[Stage3] chicken 65: ${hub.getTargets().length} targets for ${eqCount} vessels/boards/plate, ${n} legacy/dock objects checked hidden`);
    // TODO(Stage 5): assert the single schedule rail is the only other persistent UI (plan Part F, single-ui-invariant).

    await resetToDish01();
    expect(hub.isCookMode(), "Btn_Reset must leave Cook mode").toBe(false);
    expectTargetsOk("after reset", hub.getTargets(), 4);
    print("[LEAF] SingleUiInvariantScenario PASSED: station targets only, dock and legacy pills hidden.");
  }
}
