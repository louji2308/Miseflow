import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { ChoreographyDAG } from "../Scripts/ChoreographyDAG";
import { SpatulaTechniqueGuide } from "../Scripts/SpatulaTechniqueGuide";
import { VisionScanStandIn } from "../Scripts/AI/VisionScanStandIn";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

/**
 * SpatulaFlipGuideScenario.ts
 * LEAF Scenario 9: Holographic spatula flip guide.
 * Guide is dark while the sear is far from done, activates when the active sear reaches
 * 00:05 (flip window), shows the spatula, Hermite flip ribbon and both callouts, clears on
 * reset, and can also be raised by a vision OPTIMAL_CRUST confirmation.
 */
@component
export class SpatulaFlipGuideScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 9: SpatulaFlipGuideScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(900);

    const root = findSceneObjectByName("StationsRoot");
    expect(root).toBeTruthy();
    const dag = root.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    expect(dag).toBeTruthy();
    const layer = findSceneObjectByName("DiegeticLayer");
    expect(layer).toBeTruthy();
    const guide = layer.getComponent(SpatulaTechniqueGuide.getTypeName()) as SpatulaTechniqueGuide;
    expect(guide).toBeTruthy();
    const guideRoot = findSceneObjectByName("SpatulaGuideRoot");
    expect(guideRoot).toBeTruthy();

    // Step 1: idle -> no guide
    expect(guide.isGuideActive()).toBe(false);
    expect(guideRoot.enabled).toBe(false);

    // Step 2: start the coordinated clock; 60s sear is not yet in its flip window
    await interactor.tapButton("Btn_Transfer");
    await sleep(300);
    expect(dag.getTaskState("skillet_sear_skin")).toBe("ACTIVE");
    expect(guide.isGuideActive()).toBe(false);

    // Step 3: fast-forward the sear to 00:05 -> flip window opens the guide
    dag.proposeCookingExtension("skillet_sear_skin", 5 - dag.getSkilletRemaining());
    await sleep(300);
    expect(dag.getSkilletRemaining() <= 10).toBe(true);
    expect(guide.getActivationReason()).toBe("FLIP_WINDOW");
    expect(guideRoot.enabled).toBe(true);
    expect(findSceneObjectByName("SpatulaHologram")).toBeTruthy();
    expect(findSceneObjectByName("FlipArcRibbon")).toBeTruthy();
    const entry = findSceneObjectByName("SpatulaCallout_Entry_Text").getComponent("Component.Text") as Text;
    const roll = findSceneObjectByName("SpatulaCallout_Roll_Text").getComponent("Component.Text") as Text;
    expect(entry.text.indexOf("45 DEG ENTRY") !== -1).toBe(true);
    expect(roll.text.indexOf("GENTLE ROLL") !== -1).toBe(true);

    // Step 4: reset clears it
    await interactor.tapButton("Btn_Reset");
    await sleep(1000);
    expect(guide.isGuideActive()).toBe(false);
    expect(guideRoot.enabled).toBe(false);

    // Step 5: vision OPTIMAL_CRUST confirmation also raises the guide
    const standIn = layer.getComponent(VisionScanStandIn.getTypeName()) as VisionScanStandIn;
    expect(standIn).toBeTruthy();
    const res = standIn.runScan("OPTIMAL_CRUST");
    expect(res.evaluation.decision).toBe("NOOP_SAFE");
    await sleep(300);
    expect(guide.getActivationReason()).toBe("VISION_OPTIMAL");
    expect(guideRoot.enabled).toBe(true);

    await interactor.tapButton("Btn_Reset");
    await sleep(300);
    print("[LEAF] Scenario 9 PASSED: Spatula flip guide activates at 00:05 and on OPTIMAL vision.");
  }
}
