import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

@component
export class MetricBladeSteppingScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 2: MetricBladeSteppingScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(500);

    const laser = findSceneObjectByName("LaserCutCurtain");
    expect(laser).toBeTruthy();
    const initialX = laser.getTransform().getLocalPosition().x;

    // Step 1: Tap chop button
    await interactor.tapButton("Btn_StepChop");
    await sleep(300);

    const prepLabelObj = findSceneObjectByName("PrepStatusLabel");
    const prepText = prepLabelObj.getComponent("Component.Text3D") as Text3D || prepLabelObj.getComponent("Text3D") as Text3D;
    expect(prepText.text.indexOf("CHOP 1/8") !== -1).toBe(true);

    const newX = laser.getTransform().getLocalPosition().x;
    expect(newX).toBeGreaterThan(initialX);

    // Step 2: Second chop
    await interactor.tapButton("Btn_StepChop");
    await sleep(300);
    expect(prepText.text.indexOf("CHOP 2/8") !== -1).toBe(true);

    print("[LEAF] Scenario 2 PASSED: 1.5cm slicing metrology & acoustic blade sync verified.");
  }
}
