import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { findSceneObjectByName, sleep } from "Leaf.lspkg/Utils/common/Utils";
import { AttentionDirector, CHIME_INTERVAL_SEC } from "../Scripts/AttentionDirector";
import { GazeEdgeBeacon } from "../Scripts/GazeEdgeBeacon";
import { HandZoneSensor } from "../Scripts/HandZoneSensor";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { hubOrFail, resetToDish01 } from "./Stage3TestKit";

/**
 * AttentionChimeBeaconScenario.ts (id "attention-chime-beacon-scenario") - v7 Stage 4, plan D6 / Part F row attention-chime-beacon.
 * Simulated camera yaw 40 deg (GazeEdgeBeacon.setSimulatedCameraYaw, the existing hook) and a skillet alert:
 *  A. the edge beacon is visible on the skillet side, the skillet target is in the ALERT state and the chime plays exactly once;
 *  B. the chime repeats after the real 8 s interval (no time warp, no shortened hook: the scenario waits it out);
 *  C. turning back within 15 deg resolves the alert (how = GAZE) and hides the beacon;
 *  D. one alert at a time (queue, priority preemption), one chime per 8 s across alerts, resolve by hand and by Done.
 */

@component
export class AttentionChimeBeaconScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running AttentionChimeBeaconScenario...");
    await resetToDish01();

    const director = AttentionDirector.getInstance();
    expect(director, "AttentionDirector missing").toBeTruthy();
    const dir = director as AttentionDirector;
    const sensor = HandZoneSensor.getInstance();
    expect(sensor, "HandZoneSensor missing").toBeTruthy();
    const layer = findSceneObjectByName("DiegeticLayer");
    expect(layer).toBeTruthy();
    const beacon = layer.getComponent(GazeEdgeBeacon.getTypeName()) as GazeEdgeBeacon;
    expect(beacon).toBeTruthy();
    const left = findSceneObjectByName("EdgeBeacon_Left");
    const right = findSceneObjectByName("EdgeBeacon_Right");
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    const hub = hubOrFail();
    const skilletTarget = hub.getTarget("SKILLET");
    expect(skilletTarget, "skillet target missing").toBeTruthy();
    const bus = MiseFlowEventBus.getInstance();

    const raised: string[] = [];
    const resolved: string[] = [];
    const onRaised = (d: any) => raised.push(`${d && d.stationId}:${d && d.kind}`);
    const onResolved = (d: any) => resolved.push(`${d && d.stationId}:${d && d.how}`);
    bus.on("ALERT_RAISED", onRaised);
    bus.on("ALERT_RESOLVED", onResolved);

    const targetYaw = beacon.getTargetYawDeg();
    try {
      dir.clearAlerts("TEST");
      await sleep(300);
      raised.length = 0;
      resolved.length = 0;
      const chime0 = dir.getChimeCount();
      expect(dir.getActiveAlert(), "an alert is active before the test").toBe(null);

      // A. skillet alert with the head turned 40 deg away (skillet is to the left of the view)
      beacon.setSimulatedCameraYaw(targetYaw + 40);
      await sleep(400);
      expect(left.enabled).toBe(false);
      expect(right.enabled).toBe(false);
      dir.raiseTestAlert("SKILLET", "HEAT_GUARD");
      await sleep(700);
      const a = dir.getActiveAlert();
      expect(a, "no active alert").toBeTruthy();
      expect(a!.stationId).toBe("SKILLET");
      expect(a!.kind).toBe("HEAT_GUARD");
      expect(raised.indexOf("SKILLET:HEAT_GUARD") >= 0, "ALERT_RAISED not emitted").toBe(true);
      expect(beacon.getVisibleSide(), "beacon not on the skillet side").toBe("LEFT");
      expect(left.enabled).toBe(true);
      expect(right.enabled).toBe(false);
      expect(beacon.getLabelText().indexOf("SKILLET") !== -1).toBe(true);
      expect(hub.getAlertOwner(), "skillet target did not get the alert slot").toBe("SKILLET");
      expect(skilletTarget!.getState()).toBe("ALERT");
      expect(dir.getChimeCount(), "chime must play exactly once").toBe(chime0 + 1);
      const t1 = dir.getLastChimeTime();
      expect(t1 > 0).toBe(true);
      await sleep(3000);
      expect(dir.getChimeCount(), "chime repeated too early").toBe(chime0 + 1);

      // B. repeats after 8 s (real time, no warp)
      let waited = 0;
      while (dir.getChimeCount() < chime0 + 2 && waited < 9000) {
        await sleep(250);
        waited += 250;
      }
      expect(dir.getChimeCount(), "chime did not repeat").toBe(chime0 + 2);
      const t2 = dir.getLastChimeTime();
      const gap = t2 - t1;
      print(`[LEAF] chime gap ${gap.toFixed(2)} s`);
      expect(gap >= CHIME_INTERVAL_SEC - 0.05, `second chime after ${gap.toFixed(2)} s, expected >= 8 s`).toBe(true);
      expect(gap < CHIME_INTERVAL_SEC + 1.0, `second chime after ${gap.toFixed(2)} s, expected about 8 s`).toBe(true);
      expect(dir.getActiveAlert() !== null, "alert resolved by itself").toBe(true);

      // C. turning back resolves it
      beacon.setSimulatedCameraYaw(targetYaw + 5);
      await sleep(1300);
      expect(dir.getActiveAlert(), "alert not resolved after turning back").toBe(null);
      expect(resolved.indexOf("SKILLET:GAZE") >= 0, `ALERT_RESOLVED how=GAZE missing (${resolved.join(",")})`).toBe(true);
      expect(beacon.getVisibleSide()).toBe("NONE");
      expect(left.enabled).toBe(false);
      expect(hub.getAlertOwner()).toBe(null);
      expect(dir.getChimeCount(), "extra chime while resolving").toBe(chime0 + 2);

      // D. one alert at a time and one chime per 8 s across alerts
      beacon.setSimulatedCameraYaw(targetYaw + 40);
      await sleep(300);
      dir.raiseTestAlert("SKILLET", "STEP_START");
      dir.raiseTestAlert("PREP", "TIMER_UNDER_10"); // lower priority: queued
      await sleep(300);
      expect(dir.getActiveAlert()!.stationId).toBe("SKILLET");
      expect(dir.getPendingCount()).toBe(1);
      dir.raiseTestAlert("PLATING", "HEAT_GUARD"); // higher priority: preempts, skillet goes back to the queue
      await sleep(300);
      expect(dir.getActiveAlert()!.stationId, "heat guard did not preempt").toBe("PLATING");
      expect(dir.getPendingCount()).toBe(2);
      expect(hub.getAlertOwner()).toBe("PLATING");
      // the last chime was < 8 s ago: no new chime yet (never more than one per 8 s)
      expect(dir.getChimeCount(), "second alert chimed inside 8 s of the last chime").toBe(chime0 + 2);
      let waitedD = 0;
      while (dir.getChimeCount() < chime0 + 3 && waitedD < 9000) {
        await sleep(250);
        waitedD += 250;
      }
      expect(dir.getChimeCount()).toBe(chime0 + 3);
      const gapD = dir.getLastChimeTime() - t2;
      print(`[LEAF] cross-alert chime gap ${gapD.toFixed(2)} s`);
      expect(gapD >= CHIME_INTERVAL_SEC - 0.05, `cross-alert chime gap ${gapD.toFixed(2)} s`).toBe(true);

      // resolve by hand arrival (plating), then by Done (the promoted skillet alert)
      const platePos = sensor!.getStationWorldPos("PLATING");
      expect(platePos).toBeTruthy();
      sensor!.setSimulatedHand(new vec3((platePos as vec3).x, (platePos as vec3).y + 3, (platePos as vec3).z + 4));
      await sleep(500);
      expect(resolved.indexOf("PLATING:HAND") >= 0, `PLATING resolved by hand missing (${resolved.join(",")})`).toBe(true);
      sensor!.setSimulatedHand(null);
      expect(dir.getActiveAlert()!.stationId, "queued skillet alert not promoted").toBe("SKILLET");
      bus.emit("STEP_DONE_PINCHED", { stationId: "SKILLET", engine: "LEGACY", dishId: "", stepId: "", index: -1, source: "LEAF", advanced: false });
      await sleep(400);
      expect(resolved.indexOf("SKILLET:DONE") >= 0, `SKILLET resolved by Done missing (${resolved.join(",")})`).toBe(true);
    } finally {
      beacon.clearSimulatedCameraYaw();
      sensor!.setSimulatedHand(null);
      dir.clearAlerts("TEST");
      bus.off("ALERT_RAISED", onRaised);
      bus.off("ALERT_RESOLVED", onResolved);
    }

    await resetToDish01();
    print("[LEAF] AttentionChimeBeaconScenario PASSED: beacon + one chime, repeat after 8 s, resolve by gaze / hand / Done, one alert at a time.");
  }
}
