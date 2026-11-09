import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { HandZoneSensor } from "../Scripts/HandZoneSensor";
import { MiseFlowEventBus } from "../Scripts/MiseFlowEventBus";
import { hubOrFail, resetToDish01 } from "./Stage3TestKit";

/**
 * HandZoneTargetScenario.ts (id "hand-zone-target-scenario") - v7 Stage 4, plan D5 / Part F row hand-zone-target.
 * A puppet hand (HandZoneSensor.setSimulatedHand) 10 cm from the board: the board target opens within 0.5 s and the sensor
 * reports the board with a growing dwell; the hand moves away: HAND_LEFT_STATION, the card stays 5 s, then collapses.
 * Visible fallback: pinching the target ("I am here") emits HAND_AT_STATION and opens it with no hand tracked at all.
 */
export const HAND_ZONE_BOARD = "PREP";

@component
export class HandZoneTargetScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running HandZoneTargetScenario...");
    await resetToDish01();
    const sensor = HandZoneSensor.getInstance();
    expect(sensor, "HandZoneSensor missing").toBeTruthy();
    const s = sensor as HandZoneSensor;
    const hub = hubOrFail();
    const board = hub.getTarget(HAND_ZONE_BOARD);
    expect(board, "board target missing").toBeTruthy();
    const target = board!;
    const bus = MiseFlowEventBus.getInstance();

    const arrived: string[] = [];
    const left: string[] = [];
    const onAt = (d: any) => arrived.push(String(d && d.stationId));
    const onLeft = (d: any) => left.push(String(d && d.stationId));
    bus.on("HAND_AT_STATION", onAt);
    bus.on("HAND_LEFT_STATION", onLeft);

    try {
      // start from a collapsed board target with nobody near it
      s.setSimulatedHand(null);
      target.close();
      await sleep(500);
      expect(target.isOpen(), "board target should start collapsed").toBe(false);
      arrived.length = 0;
      left.length = 0;

      const boardPos = s.getStationWorldPos(HAND_ZONE_BOARD);
      expect(boardPos, "board station position unknown").toBeTruthy();
      const bp = boardPos as vec3;
      const near = new vec3(bp.x + 10, bp.y, bp.z);
      print(`[LEAF] board at (${bp.x.toFixed(1)}, ${bp.y.toFixed(1)}, ${bp.z.toFixed(1)}), puppet hand 10 cm to its right`);

      // 1. hand arrives: open within 0.5 s
      s.setSimulatedHand(near);
      await sleep(450);
      expect(s.getHandStation("right"), "sensor did not assign the hand to the board").toBe(HAND_ZONE_BOARD);
      expect(s.isHandAt(HAND_ZONE_BOARD)).toBe(true);
      expect(arrived.indexOf(HAND_ZONE_BOARD) >= 0, "HAND_AT_STATION not emitted for the board").toBe(true);
      expect(target.isOpen(), "board target did not open within 0.5 s").toBe(true);
      expect(target.getLastTrigger()).toBe("HAND_AT_STATION");

      // 2. dwell grows while the hand stays, the card stays open past the 5 s rule
      await sleep(5600);
      expect(s.getDwellSeconds(HAND_ZONE_BOARD) > 5.0, `dwell ${s.getDwellSeconds(HAND_ZONE_BOARD)} s should exceed 5 s`).toBe(true);
      expect(target.isOpen(), "card closed while the hand was still there").toBe(true);

      // 3. hand leaves: HAND_LEFT_STATION, still open for 5 s, then collapsed
      s.setSimulatedHand(new vec3(bp.x + 80, bp.y, bp.z));
      await sleep(300);
      expect(s.getHandStation("right")).toBe(null);
      expect(s.isHandAt(HAND_ZONE_BOARD)).toBe(false);
      expect(s.getDwellSeconds(HAND_ZONE_BOARD)).toBe(0);
      expect(left.indexOf(HAND_ZONE_BOARD) >= 0, "HAND_LEFT_STATION not emitted").toBe(true);
      expect(target.isOpen(), "card collapsed immediately after the hand left").toBe(true);
      await sleep(3700); // 4.0 s after leaving
      expect(target.isOpen(), "card collapsed before the 5 s rule").toBe(true);
      await sleep(2000); // 6.0 s after leaving
      expect(target.isOpen(), "card still open 6 s after the hand left").toBe(false);
      expect(target.getState()).toBe("DOT");

      // 4. visible fallback: pinching the target is "I am here" (no hand tracked)
      s.setSimulatedHand(null);
      arrived.length = 0;
      left.length = 0;
      target.close();
      await sleep(300);
      expect(target.isOpen()).toBe(false);
      target.tapCircle("LEAF");
      await sleep(250);
      expect(arrived.indexOf(HAND_ZONE_BOARD) >= 0, "pinch-here did not emit HAND_AT_STATION").toBe(true);
      expect(target.isOpen(), "pinch-here did not open the target").toBe(true);
      await sleep(1200);
      expect(left.indexOf(HAND_ZONE_BOARD) >= 0, "pinch-here did not end with HAND_LEFT_STATION").toBe(true);
    } finally {
      s.setSimulatedHand(null);
      bus.off("HAND_AT_STATION", onAt);
      bus.off("HAND_LEFT_STATION", onLeft);
    }

    await resetToDish01();
    print("[LEAF] HandZoneTargetScenario PASSED: hand near the board opens its target within 0.5 s, collapses 5 s after leaving, pinch-here fallback works.");
  }
}
