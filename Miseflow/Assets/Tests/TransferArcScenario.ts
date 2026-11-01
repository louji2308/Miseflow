import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

@component
export class TransferArcScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 4: TransferArcScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(500);

    const arcTube = findSceneObjectByName("TransferArcTube");
    expect(arcTube).toBeTruthy();

    await interactor.tapButton("Btn_Transfer");
    await sleep(300);

    expect(arcTube.enabled).toBe(true);

    const prepLabelObj = findSceneObjectByName("PrepStatusLabel");
    const prepText = prepLabelObj.getComponent("Component.Text3D") as Text3D || prepLabelObj.getComponent("Text3D") as Text3D;
    expect(prepText.text.indexOf("PREP TRANSFERRED") !== -1).toBe(true);

    const potLabelObj = findSceneObjectByName("SaucepotStatusLabel");
    const potText = potLabelObj.getComponent("Component.Text3D") as Text3D || potLabelObj.getComponent("Text3D") as Text3D;
    expect(potText.text.indexOf("DROP SHALLOTS") !== -1).toBe(true);

    print("[LEAF] Scenario 4 PASSED: Spatial transfer arc & cross-station handoff verified.");
  }
}
