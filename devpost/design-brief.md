---
status: approved
---

# Design brief: Miseflow AR v5

<!-- Spatial Kitchen Flow Orchestrator, v5 universal dish flow on the v4 diegetic rebuild. Ready for CLAD build. -->

## The one spatial moment
Standing at your kitchen counter with messy hands and several tasks underway, your prep slips. The **Prep Drift Resolver** answers in the world, not on a screen. When prep slips +25s:
- An amber conduit pulse travels across the countertop from the cutting board to the saucier.
- The saucier start-arc slides back by +25s and leaves a ghost arc where it used to start.
- The active skillet gets an amber/red Heat Guard ring, so the running sear is protected, not silently moved.
- The chronometer moves from 06:40 to 07:05.

You see what moved, what did not, and why, without touching a screen. v5 adds a second moment: you name a dish and the counter fills with that dish's ingredients and vessels, one item at a time, then the lens walks you through it step by step.

## Why it belongs on glasses
- **Shares your view:** Status lives on the burners, the counter and above each pan, where you are already looking.
- **Draws in the world at true scale:** Chrono-rings sit on the burners and conduits run along the counter in centimeters, leaving food and knife paths clear.
- **Leaves your body free:** SIK pinch, hand tracking and voice input keep wet, greasy hands off phones and laptops.
- **Why it's better than a phone:** A phone shows disconnected countdowns and cannot show a delay travelling from one station to the next. MiseFlow shows the dependency in space.

## Product or overlay
- **Type:** World-anchored spatial overlay on three stations (`PrepBoardStation`, `SkilletStation`, `SaucepotStation`), with a 3D Rehearsal Mode of virtual props for the Lens Studio Interactive Preview. In v5 the props are procedural meshes built in code, swapped per dish.
- **Dishes:** Six prebuilt dishes: 01 salmon beurre blanc (default, never changed), 02 mushroom dum biryani, 03 wok-tossed hakka noodles, 04 prime ribeye au poivre, 05 paneer tikka makhani, 06 butter-garlic tiger prawn pasta. Catalogue: 17+ vegetables in 3 stages, starches (rice, noodles, pasta, dough), 9 proteins, vessels and tools (wok/kadai, handi with lid, ladle, stockpot with basket, tawa, knives, whisk, chopsticks, tongs, service ware), spices, dairy, oils, legumes.
- **Kinematic primitives (9):** ROCK_CHOP, TWO_STAGE_POUR, SPATULA_FLIP_180, PAN_TOSS_ROLL, LADLE_ORBITAL_STIR, NOODLE_LIFT_TOSS, RICE_DUM_LAYER, WHISK_EMULSION, CONVERGENCE_PLATING.
- **What the real version would sense:** Task start and complete confirmations plus advisory optical checks of the sear.
- **Honest stand-ins (kept obvious in the scene):**
  - `VisionScanStandIn` cycles on each AI Vision press: `EXTEND_SEAR` 0.89 (approved), `OPTIMAL_CRUST` 0.94 (approved, triggers the spatula guide), `STEAM_OCCLUDED` 0.41 (rejected by the ProposalGate confidence floor of 0.55, schedule untouched). Every result passes through the real `ProposalGate.evaluate`.
  - Dish compile and vision can call the Anthropic Messages API through InternetModule, but only if a model id is set in `Assets/Scripts/AI/AiModelConfig.ts` (currently empty, so live AI is off) and `ANTHROPIC_API_KEY` is supplied via `.env` and `tools\sync-env.ps1`. That live path has not been tested end to end. The demo uses offline preset matching.
  - A key embedded in a Lens is extractable, so use one for preview or recording only.
  - The prep delay is an injected, deterministic +25s; demo time is accelerated and labelled.
- **Honest sensing boundaries:** No food-safety thermometry, no mass estimation, no autonomous burner control.

## Where things live
Diegetic first: status sits on the objects it describes.
- **Camera:** Pitched about -30 deg, a chef's view down at the counter and stove.
- **Burner chrono-rings (`DiegeticChronoRing`):** A ring on each burner counts down that station's task and shows a ghost arc when a start has slid.
- **Counter conduits (`DAGCounterConduit`):** Prep to Sauce, plus a convergence conduit to the plate. Dormant until used, and they carry the amber drift pulse.
- **Station pills:** Two lines above each piece of cookware (task, then state or next action).
- **Step cards (`StepCard`):** A card near each station pill explains the current step; the Steps chip (`Btn_StepGuide`) toggles it.
- **Director HUD:** A compact capsule dock with COOK, SIM and AUTO groups, including Auto Cook and AI Dish.
- **Dish Studio (`DishStudio`):** A full-view mode that hides the whole setup (scale set near zero, nothing destroyed) and shows only Speak and Keyboard cards plus a small Back button.
- **`DiegeticLayer`:** The parent of the diegetic and hero pieces, built at startup by `MiseFlowSpatialUI.ensureHeroComponents`.
- **Stations:** `PrepBoardStation` front-right, `SkilletStation` to its left, `SaucepotStation` behind the skillet, all inside the 65 to 110 cm binocular zone.

## Hands and input
- **Primary input:** SIK pinch on the Director HUD buttons, with hover glow and backing plates.
- **Dish entry:** Speak (AsrModule one-shot) or Keyboard (AR keyboard via TextInputSystem). Speech shows "Heard" with an Edit step, then Confirm; typed text goes straight to Confirm. Neither works in Preview with SPECS 27 simulation (they show a notice), so the six dish chips and a bus text path stand in for tests.
- **Preview keys:** `1` step cut, `2` fill portion, `3` transfer, `4` AI vision, `5` +25s drift, `6` 10x warp, `7` Auto Cook, `8` AI dish quick-cycle (cycles prebuilt dishes in the studio), `0` Reset (see the `MiseFlowSpatialUI` key handler).
- **Manual fallback:** Every action is reachable by SIK pinch or mouse click in preview and is covered by a LEAF scenario.

## When things show
- **Progressive disclosure:** Idle station pills collapse to one line. A pill with an alert expands for about 5 seconds, then collapses.
- **Dish Studio flow:** AI Dish opens the studio. An unknown dish shows "Dish not found. Enter the correct dish name." and reopens input (no silent substitute). Then one near-square briefing card at a time with `<`, `>`, Skip, and "Let's cook" on the last card. Two page-table loaders run in parallel while the user swipes. Back at any point restores the setup exactly.
- **Reveal:** After "Let's cook" the new dish's props appear one by one with an animated loading panel, never all at once.
- **Step-by-step cooking:** The dish runs from its own `steps[]`, manual or Auto Cook.
- **`GazeEdgeBeacon`:** When a critical station (for example an unresolved heat alert) is more than 20 deg off-centre, an edge arrow points toward it.
- **`SpatulaTechniqueGuide`:** Appears when the skillet has 10s or less left on an active sear, or when the scan reports `OPTIMAL_CRUST`.
- **Drift and recovery:** On +25s the conduit pulse, ghost arc and Heat Guard ring appear together and the chronometer moves 06:40 to 07:05.
- **Plating convergence:** At 00:00 the rings lock and the convergence conduit leads to the plate; each dish plates on its own service piece with steam.

## Done criteria
Checked in Lens Studio's preview:
1. **0 TypeScript errors** on compile.
2. **16 LEAF scenarios pass, each run alone:** the 6 original (station setup, metric blade stepping, portion dome, transfer arc, time-warp plating, prep-drift resolver), `gaze-wayfinding-beacon`, `proposal-gate-rejection`, `spatula-flip-guide`, `auto-cook-full-flow`, `universal-dish-page-table`, `multi-dish-auto-cook`, `dish-studio-flow`, `step-engine`, `dish-biryani-cook`, `dish-noodles-cook`.
3. **Prep Drift Resolver moment is visible:** amber conduit pulse, saucier ghost arc, skillet Heat Guard ring, chronometer 06:40 to 07:05.
4. **Gate honesty:** The 0.41 `STEAM_OCCLUDED` scan is rejected and the schedule does not change.
5. **Dish Studio flow works end to end** (via chips and the text path): Back restores the setup, an unknown dish shows the not-found message, Let's cook reveals props one by one, and the dish cooks from its steps.
6. **A 2:50 recording at 1080p** in five acts: hook on salmon, Dish Studio to biryani, step-by-step cooking, drift moment, Auto Cook finish with LEAF 16/16.

## Out of scope
- Articulated hand rig (SIK pinch only).
- Real camera sensing of the food (vision is a stand-in).
- A tested live Anthropic call (the path exists but is untested and off by default).
- Real pan temperature or food-safety claims from RGB.
- Mass estimation from uncalibrated depth.
- Autonomous control of stove burners.
- Cloud multiplayer or remote AI on the critical timing path.

## Risks and open questions
- **Preview camera pose must be reset before recording.** Use `MovePreviewCamera` with position (0, 25.1, -21.4) and lookAt (0, -4.9, -73.4).
- **Camera Object has DeviceTracking,** so its scene transform is ignored at runtime. Pose comes from the preview camera, not the scene.
- **`DiegeticLayer` and hero components are built at startup** by `MiseFlowSpatialUI.ensureHeroComponents`, so they will not appear in the scene hierarchy until the lens runs.
- **AR keyboard and ASR voice are untested in Preview** (SPECS 27 simulation shows a notice).
- **Live AI untested and extractable key:** model ids are empty, so live AI is off; any key in a Lens can be extracted.
- **Known visual gaps:** old dish-01 vegetables exceed 400 triangles; the sauce pool is bright red in dish 03; in manual play some steps complete on timers; a few screenshots are missing.
- **Narrow field of view (37 x 32 deg):** Mitigated by `GazeEdgeBeacon`, compact pills and a layout inside the 1 m zone.
- **Additive display:** Black renders as transparent. Use light, high-luminance tokens over dark backing plates.
- **Physical feel unproven:** Hand fatigue over a hot stove needs real hardware.

## Build notes for CLAD
- Build for SPECS so it runs in Lens Studio's preview. No SPECS device is available.
- Use SIK and UI Kit for every interaction so they work with the mouse in preview and with LEAF.
- Never remove or rewrite the salmon beurre blanc dish; v5 only adds dishes. Boot and Reset return to it.
- Keep each stand-in obvious in the scene and labelled honestly. Anthropic is the only AI provider; model ids live only in `AiModelConfig.ts`.
- Use real-world scale in centimeters and keep content in view during the main task.
- The display is additive: keep text light and readable.
- Write a LEAF scenario for each done criterion, run them in preview one at a time, and report which pass.
