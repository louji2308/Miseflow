---
status: approved
---

# Design brief: Miseflow AR v4.0

<!-- Approved by the learner. Spatial Kitchen Flow Orchestrator, diegetic rebuild. Ready for CLAD build. -->

## The one spatial moment
Standing at your kitchen counter with messy hands and several tasks underway, your prep slips. The **Prep Drift Resolver** answers in the world, not on a screen. When prep slips +25s:
- An amber conduit pulse travels across the countertop from the cutting board to the saucier.
- The saucier start-arc slides back by +25s and leaves a ghost arc where it used to start.
- The active skillet gets an amber/red Heat Guard ring, so the running sear is protected, not silently moved.
- The chronometer moves from 06:40 to 07:05.

You see what moved, what did not, and why, without touching a screen.

## Why it belongs on glasses
- **Shares your view:** Status lives on the burners, the counter and above each pan, where you are already looking.
- **Draws in the world at true scale:** Chrono-rings sit on the burners and conduits run along the counter in centimeters, leaving food and knife paths clear.
- **Leaves your body free:** SIK pinch and hand tracking keep wet, greasy hands off phones and laptops.
- **Why it's better than a phone:** A phone shows disconnected countdowns and cannot show a delay travelling from one station to the next. MiseFlow shows the dependency in space.

## Product or overlay
- **Type:** World-anchored spatial overlay on three stations (`PrepBoardStation`, `SkilletStation`, `SaucepotStation`), with a 3D Rehearsal Mode of virtual props (`ButcherBlockBoard`, `ChefSkillet`, `SimmerSaucepot`, virtual salmon) for the Lens Studio Interactive Preview.
- **What the real version would sense:** Task start and complete confirmations plus advisory optical checks of the sear.
- **Honest stand-ins (kept obvious in the scene):**
  - `VisionScanStandIn` cycles on each AI Vision press: `EXTEND_SEAR` 0.89 (approved), `OPTIMAL_CRUST` 0.94 (approved, triggers the spatula guide), `STEAM_OCCLUDED` 0.41 (rejected by the ProposalGate confidence floor of 0.55, schedule untouched). Every result passes through the real `ProposalGate.evaluate`.
  - The live RapidRouter call is off by default (`RapidRouterVisionService.useLiveRapidRouter = false`).
  - The prep delay is an injected, deterministic +25s; demo time is accelerated and labelled.
- **Honest sensing boundaries:** No food-safety thermometry, no mass estimation, no autonomous burner control.

## Where things live
Diegetic first: status sits on the objects it describes.
- **Camera:** Pitched about -30 deg, a chef's view down at the counter and stove.
- **Burner chrono-rings (`DiegeticChronoRing`):** A ring on each burner counts down that station's task and shows a ghost arc when a start has slid.
- **Counter conduits (`DAGCounterConduit`):** Prep to Sauce, plus a convergence conduit to the plate. Dormant until used, and they carry the amber drift pulse.
- **Station pills:** Two lines above each piece of cookware (task, then state or next action).
- **Director HUD:** A compact COOK | SIM panel for the demo controls.
- **`DiegeticLayer`:** The parent of the diegetic pieces, built at startup by `MiseFlowSpatialUI.ensureHeroComponents`.
- **Stations:** `PrepBoardStation` front-right, `SkilletStation` to its left, `SaucepotStation` behind the skillet, all inside the 65 to 110 cm binocular zone.

## Hands and input
- **Primary input:** SIK pinch on the Director HUD buttons, with hover glow and backing plates.
- **Preview keys:** `1`, `3`, `4`, `5`, `6` trigger the demo steps in Interactive Preview (see `MiseFlowSpatialUI` key handler).
- **Manual fallback:** Every action is reachable by SIK pinch or mouse click in preview and is covered by a LEAF scenario.

## When things show
- **Progressive disclosure:** Idle station pills collapse to one line. A pill with an alert expands for about 5 seconds, then collapses.
- **`GazeEdgeBeacon`:** When a critical station (for example an unresolved heat alert) is more than 20 deg off-centre, an edge arrow points toward it.
- **`SpatulaTechniqueGuide`:** Appears when the skillet has 10s or less left on an active sear, or when the scan reports `OPTIMAL_CRUST`.
- **Drift and recovery:** On +25s the conduit pulse, ghost arc and Heat Guard ring appear together and the chronometer moves 06:40 to 07:05.
- **Plating convergence:** At 00:00 the rings lock and the convergence conduit leads to the plate.

## Done criteria
Checked in Lens Studio's preview:
1. **0 TypeScript errors** on compile.
2. **9/9 LEAF scenarios pass.** The 6 original (station setup, metric blade stepping, portion dome, transfer arc, time-warp plating, prep-drift resolver) plus `gaze-wayfinding-beacon`, `proposal-gate-rejection` and `spatula-flip-guide`.
3. **Prep Drift Resolver moment is visible:** amber conduit pulse, saucier ghost arc, skillet Heat Guard ring, chronometer 06:40 to 07:05.
4. **Gate honesty:** The 0.41 `STEAM_OCCLUDED` scan is rejected and the schedule does not change.
5. **A 2:50 recording at 1080p** that shows the above end to end.

## Out of scope
- Articulated hand rig (SIK pinch only).
- Real camera sensing of the food (vision is a stand-in).
- Ramekin drag-pour (skipped).
- Real pan temperature or food-safety claims from RGB.
- Mass estimation from uncalibrated depth.
- Autonomous control of stove burners.
- Cloud multiplayer or remote AI on the critical timing path.

## Risks and open questions
- **Preview camera pose must be reset before recording.** Use `MovePreviewCamera` with position (0, 25.1, -21.4) and lookAt (0, -4.9, -73.4).
- **Camera Object has DeviceTracking,** so its scene transform is ignored at runtime. Pose comes from the preview camera, not the scene.
- **`DiegeticLayer` is built at startup** by `MiseFlowSpatialUI.ensureHeroComponents`, so it will not appear in the scene hierarchy until the lens runs.
- **Narrow field of view (37 x 32 deg):** Mitigated by `GazeEdgeBeacon`, compact pills and a layout inside the 1 m zone.
- **Additive display:** Black renders as transparent. Use light, high-luminance tokens over dark backing plates.
- **Physical feel unproven:** Hand fatigue over a hot stove needs real hardware.

## Build notes for CLAD
- Build for SPECS so it runs in Lens Studio's preview. No SPECS device is available.
- Use SIK and UI Kit for every interaction so they work with the mouse in preview and with LEAF.
- Keep each stand-in obvious in the scene and labelled honestly.
- Use real-world scale in centimeters and keep content in view during the main task.
- The display is additive: keep text light and readable.
- Write a LEAF scenario for each done criterion, run them in preview, and report which pass.
