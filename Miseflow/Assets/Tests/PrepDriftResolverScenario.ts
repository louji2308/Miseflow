import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

/**
 * PrepDriftResolverScenario.ts
 * LEAF Scenario 6: Validates Prep Drift Resolver (Hero Feature).
 * Tests +25s prep delay injection, downstream task deferral, active cooking protection,
 * explainable alert display, and user-confirmed hold flow.
 */
@component
export class PrepDriftResolverScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 6: PrepDriftResolverScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(300);

    // Step 0: Ensure clean initial state before testing Prep Drift Resolver
    await interactor.tapButton("Btn_Reset");
    await sleep(300);

    // Step 1: Simulate +25s prep delay injection
    await interactor.tapButton("Btn_ToggleHold");
    await sleep(400);

    // Step 2: Assert Prep station reflects the slippage
    const prepLabelObj = findSceneObjectByName("PrepStatusLabel");
    expect(prepLabelObj).toBeTruthy();
    const prepText = prepLabelObj.getComponent("Component.Text3D") as Text3D || prepLabelObj.getComponent("Text3D") as Text3D;
    expect(prepText.text.indexOf("PREP SLIPPED") !== -1).toBe(true);

    // Step 3: Assert downstream Saucepot is deferred (WAIT_BEFORE_START policy)
    const potLabelObj = findSceneObjectByName("SaucepotStatusLabel");
    expect(potLabelObj).toBeTruthy();
    const potText = potLabelObj.getComponent("Component.Text3D") as Text3D || potLabelObj.getComponent("Text3D") as Text3D;
    expect(potText.text.indexOf("DEFERRED (+25s)") !== -1).toBe(true);

    // Step 4: Assert Skillet is guarded (USER_DECISION policy - not silently paused)
    const skilletLabelObj = findSceneObjectByName("SkilletStatusLabel");
    expect(skilletLabelObj).toBeTruthy();
    const skilletText = skilletLabelObj.getComponent("Component.Text3D") as Text3D || skilletLabelObj.getComponent("Text3D") as Text3D;
    expect(skilletText.text.indexOf("ALERT: VERIFY BURNER") !== -1).toBe(true);

    // Step 4b: Assert 3D DriftDecisionCard is surfaced with explainable alert
    const driftCard = findSceneObjectByName("DriftDecisionCard");
    expect(driftCard).toBeTruthy();
    expect(driftCard.enabled).toBe(true);

    // Step 5: User confirms physical burner action and acknowledges hold
    await interactor.tapButton("Btn_ToggleHold");
    await sleep(400);
    expect(skilletText.text.indexOf("HOLD ACKNOWLEDGED") !== -1).toBe(true);

    print("[LEAF] Scenario 6 PASSED: Prep Drift Resolver dependency replanning & safety guardrails verified.");
  }
}
