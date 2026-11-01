import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";

@component
export class StationSetupScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 1: StationSetupScenario...");
    await sleep(1000);

    const root = findSceneObjectByName("StationsRoot");
    expect(root).toBeTruthy();
    expect(root.enabled).toBe(true);

    const prepStation = findSceneObjectByName("PrepBoardStation");
    expect(prepStation).toBeTruthy();
    expect(prepStation.enabled).toBe(true);

    const skilletStation = findSceneObjectByName("SkilletStation");
    expect(skilletStation).toBeTruthy();
    expect(skilletStation.enabled).toBe(true);

    const potStation = findSceneObjectByName("SaucepotStation");
    expect(potStation).toBeTruthy();
    expect(potStation.enabled).toBe(true);

    const prepLabelObj = findSceneObjectByName("PrepStatusLabel");
    expect(prepLabelObj).toBeTruthy();
    const prepText = prepLabelObj.getComponent("Component.Text3D") as Text3D || prepLabelObj.getComponent("Text3D") as Text3D;
    expect(prepText).toBeTruthy();
    expect(prepText.text.indexOf("CHOP SHALLOTS") !== -1).toBe(true);

    const debriefCard = findSceneObjectByName("PlatingDebriefCard");
    expect(debriefCard).toBeTruthy();
    expect(debriefCard.enabled).toBe(false);

    print("[LEAF] Scenario 1 PASSED: All 3 stations & status labels verified.");
  }
}
