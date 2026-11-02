import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { GazeEdgeBeacon } from "../Scripts/GazeEdgeBeacon";
import { MiseFlowLeafInteractor } from "./MiseFlowLeafInteractor";

/**
 * GazeWayfindingBeaconScenario.ts
 * LEAF Scenario 7: Gaze wayfinding beacon.
 * With a simulated camera yaw, verifies that an off-axis critical skillet (unresolved drift
 * heat alert) raises the matching edge beacon past 20 deg, holds it through the 15-20 deg
 * hysteresis band, fades it inside 15 deg, mirrors to the right side, and stays dark when
 * nothing is critical.
 */
@component
export class GazeWayfindingBeaconScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running Scenario 7: GazeWayfindingBeaconScenario...");
    const interactor = new MiseFlowLeafInteractor();
    await sleep(300);
    await interactor.tapButton("Btn_Reset");
    await sleep(300);

    const layer = findSceneObjectByName("DiegeticLayer");
    expect(layer).toBeTruthy();
    const beacon = layer.getComponent(GazeEdgeBeacon.getTypeName()) as GazeEdgeBeacon;
    expect(beacon).toBeTruthy();
    const left = findSceneObjectByName("EdgeBeacon_Left");
    const right = findSceneObjectByName("EdgeBeacon_Right");
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();

    const targetYaw = beacon.getTargetYawDeg();
    try {
      // Step 1: skillet 40 deg off-axis but nothing critical -> no beacon
      beacon.setSimulatedCameraYaw(targetYaw + 40);
      await sleep(400);
      expect(beacon.isCriticalActive()).toBe(false);
      expect(left.enabled).toBe(false);
      expect(right.enabled).toBe(false);

      // Step 2: prep drift raises the skillet heat alert -> left beacon (skillet is to the left)
      await interactor.tapButton("Btn_ToggleHold");
      await sleep(500);
      expect(beacon.isCriticalActive()).toBe(true);
      expect(beacon.getVisibleSide()).toBe("LEFT");
      expect(left.enabled).toBe(true);
      expect(right.enabled).toBe(false);
      expect(beacon.getLabelText().indexOf("SKILLET: VERIFY LOW HEAT") !== -1).toBe(true);

      // Step 3: hysteresis band (18 deg) keeps it up
      beacon.setSimulatedCameraYaw(targetYaw + 18);
      await sleep(300);
      expect(beacon.getVisibleSide()).toBe("LEFT");

      // Step 4: turning back within 15 deg fades it out
      beacon.setSimulatedCameraYaw(targetYaw + 5);
      await sleep(900);
      expect(beacon.getVisibleSide()).toBe("NONE");
      expect(left.enabled).toBe(false);

      // Step 5: mirror case -> skillet 30 deg to the right
      beacon.setSimulatedCameraYaw(targetYaw - 30);
      await sleep(500);
      expect(beacon.getVisibleSide()).toBe("RIGHT");
      expect(right.enabled).toBe(true);
      expect(left.enabled).toBe(false);
    } finally {
      beacon.clearSimulatedCameraYaw();
    }

    await interactor.tapButton("Btn_Reset");
    await sleep(300);
    print("[LEAF] Scenario 7 PASSED: Gaze edge beacon wayfinding (20/15 deg hysteresis) verified.");
  }
}
