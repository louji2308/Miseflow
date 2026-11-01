import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

@component
export class VolumetricPortionDomeScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 3: VolumetricPortionDomeScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(500);

    const dome = findSceneObjectByName("VolumetricPortionDome");
    expect(dome).toBeTruthy();

    // Fill portion 3 times to reach 100% (0.34 * 3 > 1.0)
    await interactor.tapButton("Btn_FillPortion");
    await sleep(200);

    await interactor.tapButton("Btn_FillPortion");
    await sleep(200);

    await interactor.tapButton("Btn_FillPortion");
    await sleep(300);

    const prepLabelObj = findSceneObjectByName("PrepStatusLabel");
    const prepText = prepLabelObj.getComponent("Component.Text3D") as Text3D || prepLabelObj.getComponent("Text3D") as Text3D;
    expect(prepText.text.indexOf("PORTION DOME 100%") !== -1).toBe(true);

    print("[LEAF] Scenario 3 PASSED: Geodesic volumetric portion dome fill verified.");
  }
}
