import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { ClaimController } from "../Scripts/ClaimController";
import { KitchenAnchorRoot } from "../Scripts/KitchenAnchorRoot";
import {
  CLAIM_SPOTS,
  PINCH_ABOVE,
  TABLE_CX,
  TABLE_CZ,
  TABLE_Y,
  claimFourSpots,
  listenClaimEvents,
  measureSurface,
  pinchPoint,
  reticleVisible,
  resetToPristine,
  stationChildren,
  stationUpTiltDeg,
  stationWorld,
} from "./ClaimTestKit";

/**
 * ClaimStationsScenario.ts (v7 Stage 2, plan D1)
 * Claim your kitchen: four pinches on the Sunlit Room coffee table through the real surface pipeline.
 */
@component
export class ClaimStationsScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running ClaimStationsScenario...");
    await sleep(1000);
    const events = listenClaimEvents();
    try {
      // Clean start
      resetToPristine();
      await sleep(300);
      expect(stationChildren().length, "Station_* must be absent at start").toBe(0);

      const cc = ClaimController.ensure();
      const kitchen = KitchenAnchorRoot.ensure();
      expect(cc.begin(), "begin() must succeed").toBe(true);
      expect(cc.isClaiming()).toBe(true);
      expect(kitchen.isContentHidden(), "kitchen content parked while claiming").toBe(true);

      // Drive the claims. Measured (Stage 2 and this scenario's first draft): a LEAF puppet pinch in free space
      // (LeafHandInteractor hand.makeGesture("pinch", wrist)) leaves ClaimController at 0 claims, because the
      // simulated hand never reaches the table (the hand gate drops hands more than 250 cm from the eyes, the table
      // is 298 cm away) and the hand interactor trigger stays None. claimFromPinchPoint runs the same downward
      // mesh cast, normal averaging and validation as a real pinch.
      const accepted = await claimFourSpots(cc);
      expect(accepted, "four claims accepted").toBe(4);
      await sleep(400);
      expect(cc.isClaiming(), "claim pass finished").toBe(false);
      expect(events.kitchenClaimed, "KITCHEN_CLAIMED emitted once").toBe(1);
      expect(events.stationClaimed.length, "STATION_CLAIMED x4").toBe(4);

      const stations = stationChildren();
      expect(stations.length, "exactly four Station_* under KitchenAnchorRoot").toBe(4);
      const worlds: vec3[] = [];
      for (const s of CLAIM_SPOTS) {
        const w = stationWorld(s.role);
        expect(w !== null, `Station for ${s.role} missing`).toBe(true);
        worlds.push(w);
        const o = ClaimController.findStation(s.role);
        expect(o.getParent().name, `${o.name} parent`).toBe("KitchenAnchorRoot");
        const rep = events.stationClaimed.find((e) => e.role === s.role);
        expect(rep !== undefined, `${s.role} claim event`).toBe(true);
        expect(Math.abs(w.y - rep.position.y) <= 1, `${s.role} y ${w.y} vs reported ${rep.position.y}`).toBe(true);
        const meas = measureSurface(w.x, w.z);
        if (meas) expect(Math.abs(w.y - meas.y) <= 1, `${s.role} y ${w.y} vs measured ${meas.y}`).toBe(true);
        // The simulator's world mesh is coarse: the table top reads -142.84 .. -141.39 across the four spots.
        expect(Math.abs(w.y - TABLE_Y) <= 2, `${s.role} y ${w.y} vs table ${TABLE_Y}`).toBe(true);
        const tilt = stationUpTiltDeg(o);
        expect(tilt <= 15, `${s.role} up tilt ${tilt} deg`).toBe(true);
        print(`[LEAF] ${o.name} world (${w.x.toFixed(2)}, ${w.y.toFixed(2)}, ${w.z.toFixed(2)}) tilt ${tilt.toFixed(1)} surface ${rep.surface} measured ${meas ? meas.y.toFixed(2) : "n/a"}`);
      }
      for (let i = 0; i < worlds.length; i++) {
        for (let j = i + 1; j < worlds.length; j++) {
          const d = worlds[i].distance(worlds[j]);
          expect(d >= 18, `stations ${i} and ${j} only ${d} cm apart`).toBe(true);
        }
      }

      const rp = kitchen.getPose().position;
      const horiz = Math.sqrt((rp.x - TABLE_CX) * (rp.x - TABLE_CX) + (rp.z - TABLE_CZ) * (rp.z - TABLE_CZ));
      expect(horiz <= 90, `kitchen root ${horiz} cm from table centre`).toBe(true);
      expect(Math.abs(rp.y - TABLE_Y) <= 3, `kitchen root y ${rp.y} vs table ${TABLE_Y}`).toBe(true);
      expect(rp.distance(KitchenAnchorRoot.DEFAULT_POS) > 50, "kitchen moved off P0").toBe(true);
      expect(kitchen.isContentHidden(), "kitchen content shown again").toBe(false);
      expect(reticleVisible(), "reticle hidden after the pass").toBe(false);
      print(`[LEAF] kitchen root (${rp.x.toFixed(2)}, ${rp.y.toFixed(2)}, ${rp.z.toFixed(2)}), ${horiz.toFixed(1)} cm from table centre`);

      // Negative test: a fresh pass; too close to, and too far from, an existing claim.
      cc.cancel();
      expect(cc.begin()).toBe(true);
      const a = CLAIM_SPOTS[0];
      expect(cc.claimFromPinchPoint("BURNER_L", pinchPoint(a.x, a.z)), "first claim accepted").toBe(true);
      expect(cc.getClaims().length).toBe(1);
      // 10 cm from the claim (< 18 cm)
      expect(cc.claimFromPinchPoint("BURNER_R", pinchPoint(a.x + 10, a.z)), "10 cm spacing must be rejected").toBe(false);
      expect(cc.getClaims().length, "claim count after too-close pinch").toBe(1);
      // far point on the room floor, more than 120 cm from the claim
      const far = new vec3(a.x + 140, TABLE_Y + PINCH_ABOVE, a.z);
      expect(cc.claimFromPinchPoint("BURNER_R", far), "140 cm spread must be rejected").toBe(false);
      expect(cc.getClaims().length, "claim count after too-far pinch").toBe(1);
      expect(cc.isClaiming(), "pass still running").toBe(true);
      cc.cancel();
      expect(cc.isClaiming()).toBe(false);
    } finally {
      events.dispose();
      resetToPristine();
      await sleep(200);
    }
    print("[LEAF] ClaimStationsScenario PASSED: four claims on the table, spacing/tilt/height verified, negative cases rejected.");
  }
}
