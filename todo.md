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
- **Git:** last commit `00fdcf2` (v4 upgrade). Uncommitted since: Anthropic switch (WS7) + restyle (WS8) + this file. Unrelated untracked files (.agents, .claude, agent/, docs/, debate rooms, *_PLAN.md, skills-lock.json, IDEA & DESIGN.md edits) are the user's – do not commit them unless asked.
- **Owner key:** [H]=haiku 5.5 low · [S]=sonnet 5.5 medium · [O]=opus 5.5 high · [ME]=orchestrator

---

## Yet to complete

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
- [ ] Commit WS7/WS8 work

### Open issues / optional
- [ ] Director HUD hover glow not verified (WS8 may change it)
- [ ] LEAF panel lists 6 scenarios but 9 run by id (cosmetic)
- [ ] (Optional) RamekinPourDetector.ts: drag ramekin → tilt → transfer ribbon (skipped earlier to protect tests)
- [ ] (Optional) Scrub old RapidRouter key from git history (key already revoked by user; needs force-push to public repo – only if user asks)

---

## In progress

- [ ] [ME] Waiting for the user's go-ahead to commit WS7 + WS8 (not committed yet)

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

### WS8 – Visual restyle v5 (done, uncommitted; 9/9 LEAF, 0 TS errors)
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
