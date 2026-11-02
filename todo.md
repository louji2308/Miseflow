# MiseFlow AR v4.0 – Master TODO

**Goal: WIN Learn AR with SPECS** (deadline 2026-11-09 14:00 PST). Judges see only the <3 min Lens Studio Preview video.
Source: Drive doc "MiseFlow AR v4.0 – Winning Master Blueprint & Audit". Plan: `~/.claude/plans/parsed-tumbling-bird.md`.

**States:** `## Not yet touched` → `## In Progress` → `## Completed`. Move a line between sections as work changes; never duplicate it.
**Owner key:** [H]=haiku 5.5 low · [S]=sonnet 5.5 medium · [O]=opus 5.5 high · [ME]=orchestrator
**Hard invariant:** all 6 existing LEAF scenarios stay green; do not rename LEAF-asserted SceneObjects/strings (StationsRoot, PrepBoardStation, SkilletStation, SaucepotStation, Prep/Skillet/SaucepotStatusLabel, LaserCutCurtain, VolumetricPortionDome, TransferArcTube, PlatingDebriefCard, DriftDecisionCard, Btn_*).

---

## Not yet touched

### WS6 – Submission assets [S/ME]
- [ ] Update devpost/design-brief.md (both copies) to v4
- [x] README: architecture, how to run, LEAF count, storyboard
- [x] 2:50 video storyboard checklist (5 acts, keys 1/3/4/5/6)
- [ ] Record 1080p/60 Preview video, trim to <3:00
- [ ] Devpost text: problem, wedge, tech (CLAD, Lens Studio MCP, plan-lens, LEAF 9/9)
- [ ] Final review pass (correctness + policy reviewers), commit

---

## In Progress

- [ ] [ME] Cleanup + WS6 submission assets

---

## Open issues (found by agents)

- [ ] Hard-coded RapidRouter API key in AI/RapidRouterVisionService.ts (being removed)
- [ ] Prep pill partly covers the [LOCKED] label on Conduit_PrepToSauce
- [ ] LEAF panel lists 6 scenarios but 9 run by id (cosmetic)
- [ ] Director HUD hover glow not verified
- [ ] Preview camera pose must be re-set before recording: MovePreviewCamera pos (0,25.1,-21.4) lookAt (0,-4.9,-73.4)
- [ ] DiegeticLayer is built at startup by MiseFlowSpatialUI.ensureHeroComponents (not saved in Scene.scene) - intentional

---

## Completed

- [x] [ME] Located audit in Drive (account taylankaraca78) and read it
- [x] [ME] Explored project (scripts, tests, positions, LEAF contract)
- [x] [ME] Plan written and approved
- [x] [ME] todo.md created

### WS0 + WS1 (done)
- [x] [ME] Snapshot baseline: RecompileTypeScript (0 errors), run 6/6 LEAF, screenshot preview (before.png)
- [x] [ME] Note current Scene.scene git diff so camera edits are reversible
- [x] Translate audit cm coordinates into local space of scaled station roots (skillet 0.68, saucepot 0.74)
- [x] Camera: position ≈ (0,34,46) cm, pitch −30° (via lens-studio-codemode execute)
- [x] Enlarge countertop slab (≈48×1.2×28), light quartz rim + dark vitroceramic inset + cyan bevel
- [x] Saucier + simmer burner → rear-centre; wall height 6.2; handle +32° rear-right
- [x] Porcelain plate + emerald reticle → front-centre (no overlap with saucier)
- [x] Skillet: remove wireframe/collider box on rim, lower front wall or tilt −5°
- [x] Salmon: raise +0.45, coral #FF6B52, golden skin #D9822B, 3 dark Maillard bars
- [x] Butcher block: remove stray white cube, lift Santoku +0.6, laser lines emissive cyan #00F0FF
- [x] Brighten dark materials (additive-display contrast ≥ 7:1 rim/edge lighting)
- [x] Recompile, 6/6 LEAF, screenshot (ws1.png)
- [x] Note: camera pose is a Preview camera pose (MovePreviewCamera pos (0,25.1,-21.4) lookAt (0,-4.9,-73.4)); Camera Object has DeviceTracking so Scene.scene transform is ignored; re-set before recording

### WS3 (done)
- [x] Skillet card → 2-line pill (26pt timer / 18pt action), keep "ALERT: VERIFY BURNER" substring
- [x] Sauce card → pill, keep "DEFERRED (+25s)" and "DROP SHALLOTS"
- [x] Prep card → pill, keep "CHOP SHALLOTS", "CHOP n/8", "PORTION DOME 100%", "PREP TRANSFERRED"
- [x] Idle stations collapse to 1-line; only alerted station expands
- [x] Reposition Sauce card (≈0,12.5,−10.5) and Master Chronometer (≈0,19.5,−10.5) off saucier rim
- [x] Director bar: shrink ~40%, two groups (COOK / SIM), colour-coded borders + hover/press feedback
- [x] Preserve PlatingDebriefCard, DriftDecisionCard behavior
- [x] 6/6 LEAF, screenshot (ws3.png)
- [x] 6/6 LEAF on final build; Director HUD hover glow unverified

### WS2 (written; visual fix in progress)
- [x] `DAGCounterConduit.ts`: Conduit_PrepToSauce (dashed cyan → amber pulse on DRIFT_RECORDED → emerald on TASK_COMPLETED)
- [x] Conduit_Convergence: skillet + saucier + prep → front plate
- [x] `DiegeticChronoRing.ts`: 24-segment radial ring on skillet (R≈9.2) and saucier (R≈6.2)
- [x] Skillet ring extinguishes clockwise, INVARIANT 60s tick at T=0
- [x] Saucier start-window arc slides +25s with ghost arc on drift
- [x] Amber/red Heat Guard ring on skillet when drift alert fires
- [x] Wire to MiseFlowEventBus events only (no DAG logic changes)
- [x] Recompile + screenshot (ws2.png)
- [x] Wire amber/emerald states verified in screenshots (conduit rerouted, wider; amber on drift, emerald after transfer verified in screenshots)
- [x] Prep-to-Sauce line visibility fix (conduit rerouted, wider; amber on drift, emerald after transfer verified in screenshots)

### WS4 (done)
- [x] `GazeEdgeBeacon.ts`: EdgeBeacon_Left/Right, show >20° off-centre, hide <15°
- [x] Spatial sizzle chime on beacon (reuse existing audio if any, else skip silently)
- [x] `SpatulaTechniqueGuide.ts`: cyan Fresnel spatula + Hermite flip arc + 45°/180° callouts
- [x] Trigger spatula at skillet ≤10s or OPTIMAL vision result
- [x] Vision stand-in cycles 3 states: EXTEND_SEAR 0.89 / OPTIMAL_CRUST 0.94 / STEAM_OCCLUDED 0.41 (rejected by ProposalGate floor 0.55)
- [x] Salmon mesh colour changes per scan state; scanner reticle over fillet
- [ ] (SKIPPED, optional) RamekinPourDetector.ts: drag ramekin -> tilt -> transfer ribbon
- [x] Local fallback <200 ms so API latency never stalls recording

### WS5 (done)
- [x] Scenario 7: gaze-wayfinding-beacon
- [x] Scenario 8: proposal-gate-rejection ("GATE REJECTED (<0.55)", timer unchanged)
- [x] Scenario 9: spatula-flip-guide (activates at 00:05)
- [x] Register in Assets/Tests/LeafIndex.ts
- [x] Run all 9: 9/9 pass, 0 TS errors, 0 runtime warnings
- [x] 9/9 LEAF pass in preview, 0 TS errors
