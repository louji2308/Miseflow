# MiseFlow AR v4.0 – Master TODO (handover-ready)

**Goal: WIN Learn AR with SPECS** (deadline 2026-11-09 14:00 PST). Judges see only the <3 min Lens Studio Preview video.
Source: Drive doc "MiseFlow AR v4.0 – Winning Master Blueprint & Audit" (account taylankaraca78). Plan: `~/.claude/plans/parsed-tumbling-bird.md`. Visual target: `devpost/reference/v4-target-render.webp`.

## HANDOVER – read first if you are a new agent
- **States (exactly three, in this order):** `## Yet to complete` → `## In progress` → `## Completed`. Move a line between sections as work changes; never duplicate; update this file BEFORE and AFTER every task.
- **Project:** `Miseflow/` (Lens Studio, TS). Scripts `Miseflow/Assets/Scripts`, tests `Miseflow/Assets/Tests` (LeafIndex.ts, 9 scenarios). README.md has the upgrade log + recording checklist; design brief at `devpost/design-brief.md` (identical copy in `Miseflow/devpost/`).
- **Tools:** drive Lens Studio only via MCP (`mcp__lens-studio__*`, `mcp__lens-studio-codemode__execute`); one agent at a time may drive the preview. Recompile with RecompileTypeScriptTool, then run LEAF in preview.
- **Preview camera pose (re-set before screenshots/recording):** MovePreviewCamera pos (0,25.1,-21.4) lookAt (0,-4.9,-73.4). Camera Object has DeviceTracking so Scene.scene camera transform is ignored.
- **DiegeticLayer, EdgeBeacon_*, SpatulaGuideRoot, VisionScanReticle are built at startup by `MiseFlowSpatialUI.ensureHeroComponents`** (not saved in Scene.scene) – intentional.
- **Hard invariants:** all 9 LEAF scenarios pass; never rename LEAF-asserted objects/strings (StationsRoot, PrepBoardStation, SkilletStation, SaucepotStation, Prep/Skillet/SaucepotStatusLabel, LaserCutCurtain, VolumetricPortionDome, TransferArcTube, PlatingDebriefCard, DriftDecisionCard, Btn_*, EdgeBeacon_*, SpatulaGuideRoot, VisionScanReticle; substrings "CHOP SHALLOTS", "CHOP n/8", "PORTION DOME 100%", "PREP TRANSFERRED", "DROP SHALLOTS", "DEFERRED (+25s)", "PLATED", "ALERT: VERIFY BURNER", "HOLD ACKNOWLEDGED", "GATE REJECTED (<0.55)").
- **Secrets:** never commit keys. Anthropic key lives in repo-root `.env` (ignored); `powershell -File tools\sync-env.ps1` writes the ignored `Assets/Scripts/AI/LocalSecrets.ts`. A key embedded in a Lens is extractable: local preview/recording only, never publish a Lens built with it.
- **Git:** last commit `4dbadbf` (WS7 Anthropic switch + WS8 restyle). WS9 work is uncommitted until the user asks. Unrelated untracked files (.agents, .claude, agent/, docs/, debate rooms, *_PLAN.md, skills-lock.json, IDEA & DESIGN.md edits) are the user's – do not commit them unless asked.
- **Owner key:** [H]=haiku 5.5 low · [S]=sonnet 5.5 medium · [O]=opus 5.5 high · [ME]=orchestrator

---

## Yet to complete

### WS11 – Make AI Vision real (discussion in progress; waiting for the user's choice)
- [x] Hardcoded vision values centralized in `Assets/Scripts/AI/VisionConfig.ts` (model, endpoint, version, prompts, schema, confidence floor 0.55, caps, scripted `offlineScans`); scripted scans kept ONLY as offline fallback; default `liveByDefault=false`. **NOT yet compiled or LEAF-tested** (haiku could not compile while WS10 runs) → after WS10 finishes: RecompileTypeScriptTool + 10/10 LEAF.
- [ ] Decide with user: (1) real vision on AI Vision button (frame → claude-sonnet-5-5 → JSON → ProposalGate → DAG), (2) drift re-plan assistant (task graph → Claude → validated re-plan + coaching line), (3) recipe-to-DAG compiler (stretch), (4) voice (skip)
- [ ] Spike: one live call from Lens Studio preview (does InternetModule fetch work in preview? latency?) with the key from `.env` via `tools\sync-env.ps1`
- [ ] Devpost page returned 403 to WebFetch and the Devpost connector is unauthenticated; rules/criteria taken from the Drive audit (Design, Technical Implementation, Innovation, Presentation; <3 min preview video; judges don't run the repo)

### WS10 – User feedback after WS9 (screenshot `images/3.png`: blue curved "wire" from board to saucier during transfer)
- [ ] 1 Remove the wire-like blue ribbon during transfer (TransferArcTube must stay ENABLED for LEAF but be visually invisible; bowl carrying the food is the only visual)
- [ ] 2 Add steam to the final plated dish
- [ ] 3 Saucier starts EMPTY (no sauce at start)
- [ ] 4 Transfer happens twice in sequence: first the measured PORTION (volumetric portion) into the saucier, second the diced VEGETABLES; sauce visibly builds up (base → red sauce with herbs); Btn_Transfer LEAF strings unchanged; Auto Cook updated for the longer transfer; reset empties again
- [ ] 5 Steam on pan and saucier only in the correct time windows: skillet steam while searing, saucier steam only after ingredients are in until plating tilt; none when idle/empty
- [ ] 6 Slightly change the colour of the counter base (subtle shift, keep additive-display brightness; report before/after hex)
- [ ] 7 Recompile 0 errors, 10/10 LEAF, screenshots; update README/design brief mention

### WS9 – User-requested realism + full-flow pass (user request after WS8; image `images/2.png` = skillet close-up showing oversized plate and too-broad burner arcs)
**WS9 design decisions (follow these):**
- Veg row on the board, left→right, whole at start, colours exactly as now: red onion (purple), garlic (white/cream), greens/parsley (green), tomato (red), yellow chilli (yellow).
- The 8 `Step Cut` presses ("CHOP n/8", LaserCutCurtain advances, VolumetricPortionDome fills) convert veg progressively, NOT all at once. Suggested map: cuts 1-2 onion (half-cut then diced), 3 garlic, 4-5 greens, 6-7 tomato, 8 yellow chilli; each cut changes only that veg (whole → partly cut → diced pile, same colour). Reset restores whole veg. LEAF contract unchanged (Btn_StepChop x2 → "CHOP 1/8","CHOP 2/8"; Btn_FillPortion x3 → "PORTION DOME 100%").
- Bowl (beside board) = prep bowl: after chopping, Transfer sweeps the diced veg board → bowl → into the saucier (existing TransferArcTube/PREP TRANSFERRED/DROP SHALLOTS strings stay).
- Plate = final plating: when skillet + sauce + prep are done (plating convergence), salmon (seared, flipped) moves onto the plate, sauce is spooned over it, bowl garnish on top; PlatingDebriefCard shows "PLATED". Plate radius reduced.
- Burner arcs (skillet + saucier): smaller radius, tighter gap between the arc dashes; keep thin broken style.
- Pan handle and saucier handle: more realistic (tapered, riveted/loop-hole for pan, long steel handle with curve for saucier).
- Spatula (fish turner): real physical prop with thin angled slotted blade + handle, proper size; animation: slides under the salmon, lifts, ROTATES the fillet 180° in a parabolic arc and lands it flipped (crust side changes), returns. Keeps SpatulaGuideRoot name; hologram arc may stay as subtle guide.
- New **Auto Cook** button in the Director HUD (own AUTO chip): runs the whole flow automatically start→finish (chop 8 cuts → transfer to bowl/saucier → sear → flip → sauce → plate), then ends with the plated dish. Must stop cleanly on Reset; must not break existing Btn_* names/tests.
- Then continue polishing one by one (see sub-tasks).
**Sub-tasks:**
- [x] P1 props & layout (done: arcs/plate/handles/progressive veg/bowl; 9/9 LEAF; uncommitted)
- [x] P2 spatula prop + physical flip animation of the salmon (done: SpatulaFlipRig.ts, 3.3 s flip, golden underside, steam burst; 9/9 LEAF; uncommitted)
- [x] P3 Auto Cook button + full automated sequence + plating + bowl transfer wiring (done: AutoCookController.ts, PlatingFinisher.ts, Btn_AutoCook, scenario 10; 10/10 LEAF; uncommitted)
- [ ] P4 polish pass (only after user feedback): veg bits are small; "AUTO DISH READY" text; confirm live (non-LEAF) run by user in the preview; Pinch/Poke on HUD buttons is "obstructed by Collider" in preview (pre-existing, not investigated)
- [ ] Update README storyboard (Auto Cook can replace manual key presses in the recording; key 7 = Auto Cook) and design brief

### WS8 follow-ups (remaining visual gaps vs `devpost/reference/v4-target-render.webp`, seen in v5_after_*.png)
- [ ] [O] Plate looks washed-out/translucent grey: give it a solid matte light-grey PBR with a visible rim
- [ ] [O] Spatula guide callouts overlap the salmon ("CONF 0.94", "45 DEG ENTRY"): move labels off the fillet
- [ ] [O] Long pill text ("CRUST OPTIMAL 0.94") shrinks too small: shorten text or widen the pill
- [ ] [O] Diced veg still blocky: smaller, softer pieces; add real reflections/specular on saucier if feasible
- [ ] Slab must stay mid-grey (dark surfaces render see-through on the additive display) – do NOT darken to the render's charcoal
- [ ] GenerateTexture / GenerateFast3DAssets need Lens Studio login (not attempted); try only if the user logs in
- [ ] [S] Re-run 9/9 LEAF + 0 TS errors + clean logs after any further restyle

### WS7 – live Anthropic vision verification (needs the user's key)
- [ ] User puts `ANTHROPIC_API_KEY=` in repo-root `.env`, runs `powershell -File tools\sync-env.ps1`
- [ ] [S] Enable `useLiveRapidRouter`, trigger AI Vision once, confirm the HTTPS call works from Lens Studio InternetModule (headers x-api-key / anthropic-version accepted, JSON parses, timeout works)
- [ ] [S] Confirm refusal / error path degrades to UNSURE (0 confidence → ProposalGate rejects) without breaking the demo
- [ ] Switch `useLiveRapidRouter` back OFF for the final recording (deterministic stand-in)

### WS6 – Submission assets
- [ ] Record 1080p/60 Preview video, trim to <3:00 (follow README "Recording checklist")
- [ ] Devpost text: problem, wedge, tech (CLAD, Lens Studio MCP, plan-lens, LEAF 9/9)
- [ ] Final review pass (correctness + policy reviewers)
- [ ] Commit WS9 work when the user asks

### Open issues / optional
- [ ] Director HUD hover glow not verified (WS8 may change it)
- [ ] LEAF panel lists 6 scenarios but 9 run by id (cosmetic)
- [ ] (Optional) RamekinPourDetector.ts: drag ramekin → tilt → transfer ribbon (skipped earlier to protect tests)
- [ ] (Optional) Scrub old RapidRouter key from git history (key already revoked by user; needs force-push to public repo – only if user asks)

---

## In progress

- [ ] [O] **WS10 – Transfer/steam/base polish** (agent running, code mode): see "WS10" in Yet-to-complete list below for the 5 sub-items. Also pending: user's go-ahead to commit WS9 (+WS10).

---

## Completed

### Setup
- [x] [ME] Located audit in Drive (new account taylankaraca78) and read it
- [x] [ME] Explored project; plan written and approved; todo.md created

### WS0 + WS1 – Baseline, camera, geometry
- [x] Baseline: 0 TS errors, 6/6 LEAF, screenshot
- [x] Levitating saucier fixed (saucier rear-centre, plate front-centre), skillet wireframe/box artifact removed, stray cube removed, knife lifted
- [x] Salmon raised + recoloured + Maillard bars; laser cut lines emissive cyan; slab enlarged with light rim; additive-display-friendly materials
- [x] Preview camera pose chosen (see handover)

### WS2 – Diegetic DAG layer
- [x] `DAGCounterConduit.ts`: Conduit_PrepToSauce (cyan → amber on DRIFT_RECORDED → emerald on transfer) + Conduit_Convergence to plate; conduit rerouted/wider; [LOCKED] label fixed
- [x] `DiegeticChronoRing.ts`: skillet 24-tick ring + INVARIANT tick + Heat Guard; saucier start-arc + ghost arc on drift
- [x] Amber/emerald/drift states verified in screenshots

### WS3 – Progressive-disclosure UI
- [x] Station cards → 2-line pills above own cookware; idle collapse, alerted expand ~5s
- [x] Compact grouped Director HUD (COOK | SIM) with coloured borders; chronometer pill (06:40 → 07:05 on drift)

### WS4 – Hero features
- [x] `GazeEdgeBeacon.ts` (>20° show, <15° hide)
- [x] `SpatulaTechniqueGuide.ts` (≤10s or OPTIMAL crust; 45° entry / gentle roll)
- [x] `AI/VisionScanStandIn.ts`: EXTEND_SEAR 0.89 / OPTIMAL_CRUST 0.94 / STEAM_OCCLUDED 0.41 rejected by ProposalGate floor 0.55; local, <2 ms
- [x] Live RapidRouter call off by default (`useLiveRapidRouter=false`)

### WS5 – LEAF 6 → 9
- [x] Scenarios gaze-wayfinding-beacon, proposal-gate-rejection, spatula-flip-guide registered in LeafIndex.ts; 9/9 pass, 0 TS errors, clean logs

### WS6 (partial) – docs
- [x] README upgrade log + 2:50 recording checklist + testing notes
- [x] `devpost/design-brief.md` rewritten to v4 (both copies identical)
- [x] v4 work committed as `00fdcf2`

### WS9 – realism + full flow (done, uncommitted; 10/10 LEAF, 0 TS errors)
- [x] P1: burner arcs tight, plate -25%, pan + saucier handles, progressive veg (cuts 1-2 onion, 3 garlic, 4-5 parsley, 6-7 tomato, 8 chilli; whole → partial → diced), prep bowl (empty until Transfer; VolumetricPortionDome hidden until Fill Portion)
- [x] P2: `SpatulaFlipRig.ts` slotted fish-turner prop (`SpatulaProp`), 3.3 s physical flip of the salmon (golden crust underside), steam burst, events SALMON_FLIP_STARTED/SALMON_FLIPPED, `SpatulaTechniqueGuide.playFlip(onDone)`
- [x] P3: `AutoCookController.ts` (Btn_AutoCook / key 7 / Stop; ~64-68 s at speed 1: start 2s, 8 chops x1.4s, portion, prep ready, board→bowl→saucier, sear 14s, 10x warp, flip 3.3s, sauce, plating ~6s, dish ready), `PlatingFinisher.ts` (salmon onto plate crust-up, sauce pour, parsley garnish, "DISH READY"), skillet pill FLIPPED/CRUST DONE, scenario 10 `auto-cook-full-flow` (speed param, default 8)

### WS8 – Visual restyle v5 (done, committed 4dbadbf; 9/9 LEAF, 0 TS errors)
- [x] 6 generated albedo textures in `Assets/Textures/` (brushed slab, end-grain wood, salmon crust, sauce, cast iron, steam) + 5 icons in `Assets/Icons/` + `Assets/Materials/ImageMaterial.mat`
- [x] `StationPropsBuilder.ts`: textured PBR (`makeTexturedPbr`), bevelled slab, thin broken amber/cyan burner arcs, matte plate, end-grain board with diced veg, black knife handle, salmon fillet + rosemary + steam, sauce with herbs
- [x] `DiegeticChronoRing.ts` thin arc dashes; `DAGCounterConduit.ts` hairline lines + [LOCKED] lock capsule with leader
- [x] `MiseFlowSpatialUI.ts`: capsule pills with icon, white label + accent value, leader lines; PLATE IN cloche pill; Director dock with COOK/SIM chips + outlined buttons
- [x] Before/after screenshots in the session scratchpad (v5_before_idle / v5_after_idle / v5_after_drift / v5_after_vision_optimal)

### WS7 – Anthropic vision (code written, live call not yet tested)
- [x] API key leak: user revoked old RapidRouter key; key removed from source (history still contains it, now harmless)
- [x] `RapidRouterVisionService.ts` switched to Anthropic Messages API: model `claude-sonnet-5-5`, `output_config.effort: "medium"`, JSON-schema structured output, no temperature/thinking/prefill, refusal/parse failure → UNSURE; class + public method names unchanged
- [x] Key plumbing: `tools/sync-env.ps1`, ignored `LocalSecrets.ts` (+ committed `LocalSecrets.example.ts`), `.env.example`, `.gitignore` entries verified with `git check-ignore`
- [x] Compiles with 0 errors
