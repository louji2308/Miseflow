import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

@component
export class TimeWarpPlatingScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 5: TimeWarpPlatingScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(500);

    // Step 1: Fire transfer to start the multi-station reactive cooking clock
    await interactor.tapButton("Btn_Transfer");
    await sleep(300);

    // Step 2: Tap Time Warp button for 10x fast forward
    await interactor.tapButton("Btn_ToggleTimeWarp");
    await sleep(300);

    // Step 3: Wait 7.0 seconds for timers to converge (70s simulated cooking > 60s skillet)
    await sleep(7000);

    const debriefCard = findSceneObjectByName("PlatingDebriefCard");
    expect(debriefCard).toBeTruthy();
    expect(debriefCard.enabled).toBe(true);

    const skilletLabelObj = findSceneObjectByName("SkilletStatusLabel");
    const skilletText = skilletLabelObj.getComponent("Component.Text3D") as Text3D || skilletLabelObj.getComponent("Text3D") as Text3D;
    expect(skilletText.text.indexOf("PLATED") !== -1).toBe(true);

    const potLabelObj = findSceneObjectByName("SaucepotStatusLabel");
    const potText = potLabelObj.getComponent("Component.Text3D") as Text3D || potLabelObj.getComponent("Text3D") as Text3D;
    expect(potText.text.indexOf("PLATED") !== -1).toBe(true);

    print("[LEAF] Scenario 5 PASSED: 10x time-warp and T-zero multi-station plating convergence verified.");
  }
}
