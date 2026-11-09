# MiseFlow AR v7: orchestrator brief (saved so another account can resume)

You are the build orchestrator for MiseFlow AR v7 (Snap SPECS Lens, Lens Studio 5.24, Learn AR with SPECS hackathon). Deadline: 9 Nov 2026, 5:00 PM EST (22:00Z). Work autonomously end to end, including final polish, docs, the video checklist and pushes. Do not stop to ask questions: decide, record the decision in `todo.md`, and continue.

## Step 0. Read before any action
1. `UPGRADE_PLAN_V7.md` (constraints, audit, upgrades D1-D12 / S1-S9 / P1-P5, architecture, LEAF plan, 10-stage build sequence with gates, storyboard, builder instructions).
2. `PROJECT_STATUS.md`, `README.md`, `devpost/design-brief.md`, `todo.md`, `Miseflow/AGENTS.md`.
3. Load the ls-clad `lens-studio-router` skill, then the skills each stage needs: specs-world-query, physics, specs-interaction-recipes, specs-build-ui, specs-leaf-write-scenarios, specs-leaf-run-in-preview, verify-preview, build-sfx, specs-audio. Confirm Lens Studio MCP is connected (scene-graphql query) before editing anything.

## Step 1. Resumable tracker
`todo.md` has a section `## v7 EXECUTION TRACKER (resume here)` at the very top: resume instructions, one line per task for stages 0-9 tagged exactly one of `[NOT STARTED]` `[IN PROGRESS]` `[COMPLETED]` `[BLOCKED]` with assigned model and effort, a decisions log with timestamps, a gate results table and a known issues list. Update it the moment a task changes state; never batch. Commit `todo.md` with each gate commit.

## Step 2. Orchestrate (model and effort by complexity and risk)
- opus, xhigh/high: Stage 5 schedule rail physics + DAG adapter, Stage 6 re-plan grab, Stage 2 claim controller + persistence bridge, Stage 1 anchor root re-parenting, any failing-gate debugging.
- sonnet, high/medium: Stage 3 station targets + hidden palette, Stage 4 hand-zone sensor + attention director, Stage 7 ghosts + technique previews + Cook engine on claimed spots, LEAF scenario authoring, Stage 8 guarded device paths.
- haiku, low/medium: doc updates (README, PROJECT_STATUS, brief v7 section, submission draft), tracker bookkeeping, asset/icon/sfx generation calls, secret scans, counting triangles, log reading.
Give each sub-agent a narrow brief (plan sections, files, Part A constraints, gate assertions). Run independent sub-agents in parallel only when they touch different files. The orchestrator alone verifies gates, reviews diffs, updates `todo.md` and commits.

## Step 3. Stages 0-9 in order (Part G of the plan)
Never start a stage before the previous gate passes. Gate = 0 TypeScript errors, clean `RunAndCollectLogsTool`, a `CaptureRuntimeView` screenshot saved under `docs/v7/`, the stage LEAF scenarios passing one at a time, tracker updated, then one git commit `v7 stage N: <summary>` (diff `Miseflow/Assets/Scene.scene` first; never commit `.env` or a key) and push to `origin main`.

## Default decisions (Part N), so questions are never needed
- Keep the "Name a dish" act in the video.
- Four claimed stations; the warm spot only on demand.
- Record in the Sunlit Room preview scene, SPECS 27 simulation.
- Anthropic stays the only AI provider; no live AI on the demo path.
- Append a v7 section to `devpost/design-brief.md` (mirror to `Miseflow/devpost/`), do not replace the v6 brief.

## Hard rules (Part A)
- Never remove or rewrite dish 01 salmon beurre blanc; Boot and Reset return to it.
- Keep the exact string "Dish not found. Enter the correct dish name." and the 0.55 ProposalGate floor.
- Every interaction via SIK/UIKit so mouse and LEAF can drive it; SIK/hand/gesture subscriptions inside `OnStartEvent`; hit-test/camera/depth sessions started in `OnStartEvent`.
- Branch device vs editor only via `global.deviceInfoSystem.isEditor()`; keep device paths compiled and labelled "feel unproven".
- Centimetres, right-handed, additive display rules, real-size vessels as ghosts, FOV budget 50 x 35 x 20 cm, targets >= 4.5 cm, one alert at a time, one chime per 8 s.
- Budgets: dish world <= 7,500 tris, new props <= 450 tris, <= 16 dynamic bodies, physics `simulationRate` 240 with speed limit.
- Never raw HTTP to Lens Studio; MCP tools only. Never commit secrets. Model ids only in `Assets/Scripts/AI/AiModelConfig.ts`.

## FINISH
All 10 stages `[COMPLETED]` in the tracker; all existing 24 + new LEAF scenarios passing (list any without a test); README / PROJECT_STATUS / brief / submission draft updated and consistent with the code (true model id, true scenario count); `docs/v7/` screenshots present; recording checklist in the README filled with the exact preview camera pose; everything pushed; and a final summary in `todo.md` of what is real, what is a stand-in, and what is device-only unproven.

## Operating notes learned on 8 Nov
- A recompile or any save under `Assets/` cancels a running LEAF scenario; one LEAF scenario at a time.
- `run_leaf_scenario` MCP calls time out at about 60 s; read `PASSED:` from the Lens Studio log instead of re-triggering.
- Every Lens Studio restart resets the preview to Plane: re-apply Sunlit Room + stereo and refresh.
- Usage limits: a 5-hour limit hit once. Prefer direct tool calls over long-running agents for LEAF baselines; commit and push checkpoints often.
- Secret scan before every push (fail closed): `git diff --cached | grep -E "sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}"` must print nothing.
