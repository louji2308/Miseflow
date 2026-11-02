import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { ChoreographyDAG } from "../Scripts/ChoreographyDAG";
import { VisionScanStandIn } from "../Scripts/AI/VisionScanStandIn";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

/**
 * ProposalGateRejectionScenario.ts
 * LEAF Scenario 8: Deterministic safety gate on AI vision proposals.
 * A steam-occluded 0.41-confidence scan proposing +20s must be REJECTED by ProposalGate
 * (confidence floor 0.55), leave the sear timer unchanged, and surface
 * "GATE REJECTED (<0.55)" on the Skillet pill. Control: a 0.89 scan proposing +15s is
 * auto-applied. All via the local stand-in (< 200 ms, no network).
 */
@component
export class ProposalGateRejectionScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 8: ProposalGateRejectionScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(300);

    const root = findSceneObjectByName("StationsRoot");
    expect(root).toBeTruthy();
    const dag = root.getComponent(ChoreographyDAG.getTypeName()) as ChoreographyDAG;
    expect(dag).toBeTruthy();
    const layer = findSceneObjectByName("DiegeticLayer");
    expect(layer).toBeTruthy();
    const standIn = layer.getComponent(VisionScanStandIn.getTypeName()) as VisionScanStandIn;
    expect(standIn).toBeTruthy();

    // Step 1: low-confidence steam scan is rejected below the 0.55 floor
    const before = dag.getSkilletRemaining();
    const rejected = standIn.runScan("STEAM_OCCLUDED");
    expect(rejected.confidence < 0.55).toBe(true);
    expect(rejected.evaluation.decision).toBe("REJECTED");
    expect(rejected.evaluation.effectiveDeltaSeconds).toBe(0);
    expect(rejected.latencyMs < 200).toBe(true);
    await sleep(400);

    // Step 2: schedule untouched
    expect(Math.abs(dag.getSkilletRemaining() - before) < 0.001).toBe(true);

    // Step 3: rejection is visible on the Skillet pill
    const actionObj = findSceneObjectByName("SkilletStationUI_Action");
    expect(actionObj).toBeTruthy();
    const actionText = actionObj.getComponent("Component.Text") as Text;
    expect(actionText).toBeTruthy();
    expect(actionText.text.indexOf("GATE REJECTED (<0.55)") !== -1).toBe(true);

    // Step 4: control - a confident +15s extension is auto-applied by the same gate
    const approved = standIn.runScan("EXTEND_SEAR");
    expect(approved.evaluation.decision).toBe("AUTO_APPLY");
    await sleep(300);
    expect(Math.abs(dag.getSkilletRemaining() - (before + 15)) < 0.001).toBe(true);

    await interactor.tapButton("Btn_Reset");
    await sleep(300);
    print("[LEAF] Scenario 8 PASSED: ProposalGate rejected 0.41-confidence scan; timer unchanged.");
  }
}
