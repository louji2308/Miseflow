import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import { ClaimController } from "../Scripts/ClaimController";
import { KitchenAnchorRoot } from "../Scripts/KitchenAnchorRoot";
import { KitchenPersistence } from "../Scripts/KitchenPersistence";
import {
  CLAIM_SPOTS,
  MEMORY_LABEL_NAME,
  childNamed,
  claimFourSpots,
  listenClaimEvents,
  reticleVisible,
  resetToPristine,
  stationChildren,
  stationWorld,
} from "./ClaimTestKit";

/**
 * KitchenRecallScenario.ts (v7 Stage 2, plan D2)
 * Claim four spots, simulate a relaunch inside the lens (Station_* cleared, kitchen back at P0, the persistent store
 * kept), then run the lens's own boot recall path and check the kitchen returns without any claim UI.
 */
@component
export class KitchenRecallScenario extends Scenario {
  async run(): Promise<void> {
    print("[LEAF] Running KitchenRecallScenario...");
    await sleep(1000);
    const events = listenClaimEvents();
    try {
      resetToPristine();
      await sleep(300);
      const cc = ClaimController.ensure();
      const kitchen = KitchenAnchorRoot.ensure();
      const memory = KitchenPersistence.ensure();
      expect(memory.hasMemory(), "store empty at start").toBe(false);
      expect(stationChildren().length, "Station_* absent at start").toBe(0);

      expect(cc.begin()).toBe(true);
      const accepted = await claimFourSpots(cc);
      expect(accepted, "four claims accepted").toBe(4);
      await sleep(400);
      expect(cc.isClaiming()).toBe(false);
      expect(memory.hasMemory(), "kitchen remembered after the claim").toBe(true);

      // Record the claimed state.
      const recorded: { [role: string]: vec3 } = {};
      for (const s of CLAIM_SPOTS) {
        const w = stationWorld(s.role);
        expect(w !== null, `${s.role} station built`).toBe(true);
        recorded[s.role] = w;
      }
      const poseBefore = kitchen.getPose();
      expect(poseBefore.position.distance(KitchenAnchorRoot.DEFAULT_POS) > 50, "kitchen claimed onto the table").toBe(true);
      const stored = await memory.recall();
      expect(stored.length, "five poses stored (KITCHEN + 4 stations)").toBe(5);

      // Simulate a relaunch: clear Station_*, kitchen back at P0, memory label gone, persistent store kept.
      ClaimController.clearStations();
      const staleLabel = childNamed(kitchen.getRoot(), MEMORY_LABEL_NAME);
      if (staleLabel) staleLabel.destroy();
      expect(kitchen.resetPose(), "resetPose").toBe(true);
      await sleep(300);
      expect(stationChildren().length, "Station_* cleared for the relaunch").toBe(0);
      expect(kitchen.getPose().position.distance(KitchenAnchorRoot.DEFAULT_POS) < 0.01, "kitchen back at P0").toBe(true);
      expect(memory.hasMemory(), "store kept across the simulated relaunch").toBe(true);
      expect(childNamed(kitchen.getRoot(), MEMORY_LABEL_NAME) === null, "memory label removed for the relaunch").toBe(true);
      const recalledBefore = events.recalled;

      // The lens's boot recall path (KitchenPersistence.boot, as run at KITCHEN_ROOT_READY / OnStart).
      memory.rebootRecall();
      await sleep(500);

      expect(events.recalled - recalledBefore, "KITCHEN_RECALLED emitted once").toBe(1);
      expect(stationChildren().length, "four stations restored").toBe(4);
      let maxErr = 0;
      for (const s of CLAIM_SPOTS) {
        const w = stationWorld(s.role);
        expect(w !== null, `${s.role} restored`).toBe(true);
        const err = w.distance(recorded[s.role]);
        maxErr = Math.max(maxErr, err);
        expect(err <= 0.5, `${s.role} restored ${err} cm from the recorded position`).toBe(true);
      }
      const poseAfter = kitchen.getPose();
      const rootErr = poseAfter.position.distance(poseBefore.position);
      expect(rootErr <= 0.5, `kitchen root restored ${rootErr} cm from the recorded pose`).toBe(true);
      expect(cc.isClaiming(), "no claim pass after recall").toBe(false);
      expect(reticleVisible(), "reticle hidden after recall").toBe(false);
      expect(kitchen.isContentHidden(), "kitchen content not parked after recall").toBe(false);
      const label = childNamed(kitchen.getRoot(), MEMORY_LABEL_NAME);
      expect(label !== null, "editor memory label exists").toBe(true);
      print(`[LEAF] recall: max station error ${maxErr.toFixed(4)} cm, root error ${rootErr.toFixed(4)} cm`);
    } finally {
      events.dispose();
      resetToPristine();
      await sleep(200);
    }
    print("[LEAF] KitchenRecallScenario PASSED: kitchen restored from memory within 0.5 cm, no claim UI, KITCHEN_RECALLED emitted.");
  }
}
