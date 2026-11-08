# MiseFlow AR: project status (as of 8 Nov 2026)

This document describes what the project is and what exists in the repository today. It lists only what is built and what was verified, with its limits. Everything was run in the Lens Studio Preview; no Spectacles hardware was used.

## 1. What MiseFlow is

MiseFlow AR is a Lens for Snap Spectacles (SPECS) built in Lens Studio 5.24 with TypeScript. It is a spatial cooking assistant for a cook running several pans at once.

- **Core idea:** a recipe is a schedule of dependent tasks (a DAG), not a list. The Lens draws that schedule on the kitchen itself instead of on a screen: rings on the burners, status pills above each pan, and lines along the counter.
- **Signature behaviour (Prep Drift Resolver):** when prep slips by +25 s, an amber pulse travels across the counter from the cutting board to the saucier, the sauce start arc slides back and leaves a ghost arc, the skillet gets a Heat Guard ring, and the chronometer moves from 06:40 to 07:05. The cook sees what moved, what did not, and why.
- **Second capability:** the cook can name a dish, and the Lens builds only the equipment, tools and ingredients that dish needs, then runs it step by step.
- **Entry:** built for the "Learn AR with SPECS" hackathon (Snap Inc. / Devpost). It was planned with the Devpost Learn `plan-lens` skill (`devpost/design-brief.md`) and built with Claude Code agents through CLAD and the Lens Studio MCP.

## 2. Environment and stack

| Item | Value |
|---|---|
| Lens Studio | 5.24 (project `Miseflow/Miseflow.esproj`) |
| Language | TypeScript (114 `.ts` files, about 38,000 lines) |
| Libraries | Spectacles Interaction Kit (SIK 0.18), Spectacles UIKit, LEAF test framework (all in `Miseflow/Packages/*.lspkg`, stored with git-lfs) |
| Rendering | Every prop is a procedural mesh built in code. No imported 3D models for food, vessels or tools. |
| Display assumptions | Additive see-through display (black renders transparent), narrow field of view, content kept inside about 1 m. Colours are lifted so nothing goes near-black. |
| AI provider | Anthropic Messages API only, through `InternetModule` |
| Scene | `Miseflow/Assets/Scene.scene`; the heavy UI and Cook components are created at startup by `MiseFlowSpatialUI.ensureHeroComponents` |

Code size by area:

| Area | Files | Lines |
|---|---|---|
| `Assets/Scripts` (core Lens) | 37 | 22,659 |
| `Assets/Scripts/AI` | 12 | 3,743 |
| `Assets/Scripts/Cook` (Chef Director engine) | 17 | 7,081 |
| `Assets/Scripts/Cook/Actions` (cooking motions) | 26 | 2,392 |
| `Assets/Tests` (LEAF scenarios) | 22 | 2,133 |

## 3. Repository layout

- `Miseflow/Assets/Scripts/` core Lens: stations, scheduler, UI, props, motions, step engine, Dish Studio
- `Miseflow/Assets/Scripts/AI/` model config, secrets stub, dish schemas, asset page table, compiler, vision, proposal gate
- `Miseflow/Assets/Scripts/Cook/` the Chef Director engine (plan schema, sanitizer, plan library, director, stage, runtime, actions, props, labels, step card)
- `Miseflow/Assets/Tests/` 24 LEAF scenarios (see section 9)
- `devpost/` design brief, submission draft, reference render (`reference/v4-target-render.webp`); a copy of the brief is also in `Miseflow/devpost/`
- `.agents/skills/plan-lens/` and `agent/skills/plan-lens/` the installed Devpost plan-lens skill pack, with `skills-lock.json`
- `docs/` two design reference screenshots
- `README.md`, `todo.md`, `IDEA & DESIGN.md` (design specification), `PROJECT_STATUS.md` (this file)
- `tools/sync-env.ps1` copies the key from the local `.env` into the local secrets file

## 4. The original station flow (default experience)

### 4.1 Stations and default dish
- Three stations: `PrepBoardStation` (front right), `SkilletStation` (to its left), `SaucepotStation` (behind the skillet), all inside the 65 to 110 cm binocular zone.
- Boot and Reset always return to the default dish: dish 01, salmon beurre blanc (skillet sear, saucier sauce, board prep).
- The camera is pitched about -30 degrees (a chef's view down at the counter). The Camera Object uses DeviceTracking, so the Preview camera pose is what you see.

### 4.2 Scheduling engine
- `ChoreographyDAG.ts`: tasks with dependencies and durations.
- Prep Drift Resolver: reflows the schedule when a task slips (+25 s injected through key 5 or the +25s Drift button), protects a running sear instead of moving it, and moves downstream starts.
- `ProposalGate.ts`: every AI or vision suggestion passes `ProposalGate.evaluate`. The confidence floor is 0.55.
- `VisionScanStandIn.ts`: a deterministic stand-in cycling 0.89 (approved), 0.94 (approved, shows the spatula technique guide) and 0.41 "steam occluded" (rejected by the gate, schedule untouched).

### 4.3 Diegetic spatial UI (status on the objects)
- `DiegeticChronoRing`: a ring on each burner counts that station's task down and shows a ghost arc when a start has slid.
- `ConcentricThermalRing`: heat rings on the pans, including the Heat Guard ring.
- `DAGCounterConduit`: counter conduits (prep to sauce, plus a convergence conduit to the plate); they carry the amber drift pulse. The old vessel-to-vessel connector bars are switched off (`SHOW_CONNECTOR_LINES = false`).
- Station pills: two lines above each piece of cookware (task, then state or next action). Idle pills collapse to one line; a pill with an alert expands for about 5 seconds.
- `GazeEdgeBeacon`: when a critical station is more than 20 degrees off-centre, an edge arrow points to it.
- `SpatulaTechniqueGuide` / `SpatulaFlipRig`: appears when the skillet has 10 s or less left on a sear, or when the scan reports `OPTIMAL_CRUST`.
- Director HUD dock: a capsule dock with COOK (Step Cut, Transfer, AI Vision), SIM (+25s Drift, 10x Warp, Reset) and AUTO (Auto Cook, AI Dish) groups, operated by SIK pinch with hover glow.
- `StepEngine`: step cards near each station pill that explain the current step (the Steps chip toggles them).
- `AutoCookController`: runs a dish end to end, from the dish's own step list; dish 01 uses its own long stage list.

### 4.4 The six prebuilt dishes
01 salmon beurre blanc (default, never changed), 02 mushroom dum biryani, 03 wok-tossed hakka noodles, 04 prime ribeye au poivre, 05 paneer tikka makhani, 06 butter-garlic tiger prawn pasta. Dishes 02-06 run from their own `steps[]`, manually or with Auto Cook, and plate on their own service piece with steam.

### 4.5 Procedural catalogue
- 18 catalogue vegetables (access numbers 101-109 and 122-130), each in three stages (whole, partial, cut pile) with three colour parts.
- Starches (rice, noodles, pasta, dough) in three stages.
- 9 proteins with a dual-surface doneness look.
- Vessels and tools: wok/kadai, biryani handi with a domed lid, ladle, stockpot with a strainer basket, tawa, knives, whisk, chopsticks, tongs, ramekins, deep bowls, serving handi.
- Spices, dairy, oils and legumes (powders, butter, cheese, cream swirl, oil cruet, dal).

### 4.6 Nine kinematic primitives
ROCK_CHOP, TWO_STAGE_POUR, SPATULA_FLIP_180, PAN_TOSS_ROLL, LADLE_ORBITAL_STIR, NOODLE_LIFT_TOSS, RICE_DUM_LAYER, WHISK_EMULSION, CONVERGENCE_PLATING.

## 5. Dish Studio (typing a dish)

- The AI Dish button opens a full-view studio. The whole setup is hidden by scaling it near zero (nothing is destroyed or reset), and only two cards remain: Speak (AsrModule) and Keyboard (AR keyboard through `TextInputSystem`), plus a small Back button.
- Back restores the setup exactly as it was; it is not a Reset.
- Speech shows "Heard" with an Edit step, then Confirm. Typed text goes straight to Confirm. The unknown-dish message is exactly: "Dish not found. Enter the correct dish name."
- `SpatialBriefingDeck`: near-square cards, one at a time, with `<`, `>`, Skip and, on the last card, "Let's cook".
- While the user swipes, two page-table loaders run in parallel (ingredients/starch/protein/spices, and vessels/tools/service ware).
- After "Let's cook" the setup returns and the new dish's props appear one by one behind a loading panel, never all at once.
- Resolution order for a typed dish: preset match (the six dishes) -> offline plan library -> live Chef Director -> "Dish not found".

## 6. Chef Director (the Cook engine, `Assets/Scripts/Cook/`)

A dish that is not one of the six prebuilt dishes is composed by this engine. The six prebuilt dishes keep the original flow.

### 6.1 CookPlan (the plan format)
- Equipment (up to 6): WOK, KADAI, TAWA, SKILLET, POT, SAUCEPAN, BOWL, PLATE, BOARD, FRYER_PAN, STEAMER, HANDI. Burners 1-3.
- Tools (up to 4): SPATULA, LADLE, TONGS, WHISK, SPOON, ROLLING_PIN, KNIFE, SKIMMER, CHOPSTICKS, BRUSH.
- Ingredients (up to 12) with role (PROTEIN, VEG, FLOUR, LIQUID, OIL, SPICE, DOUGH, GARNISH, AROMATIC, DAIRY), a shape cue, raw and done colours, and an optional catalogue hint.
- Steps (3 to 14): each has one of 22 actions (CUT, MARINATE, MIX, COAT, HEAT_OIL, DEEP_FRY, SHALLOW_FRY, SAUTE_TOSS, TEMPER, SIMMER, BOIL, ROLL_DOUGH, KNEAD, COOK_FLAT, FLIP, STEAM_DUM, WHISK, POUR, SEASON, REST, PLATE, GARNISH) or the GENERIC fallback, a vessel, a tool, ingredients, heat, duration (2-20 s), a count and `after` links. `after` links let two vessels work at the same time.
- `CookPlanSanitizer.ts` repairs or rejects every plan (limits, unknown ids, cycles, colours). `CookPlanSchema.ts` also holds the small JSON schema sent to the API.

### 6.2 Where plans come from
- **PlanLibrary** (offline, no key, no network): Chicken 65, Chapathi, Poori, Athirasam, each with aliases. Chicken 65 runs the kadai deep fry beside a small tempering pan.
- **CookDirectorService** (live): one call to Claude `claude-opus-5-5` with high effort, a strict JSON schema, a 180 s timeout and a 10,000-token limit. Failure or a gibberish dish returns "Dish not found".
- A live dish takes about 10-35 s in the Lens.

### 6.3 The stage (`CookStage.ts`, `CookBenchPlan.ts`, `CookLayout.ts`)
- Builds a dynamic bench at the scene root (`CookStageRoot`, placed at the old stations' pose). The old stations are collapsed while Cook mode runs.
- Bench slab: x from -22 to 22 cm, z from -17.5 to 13 cm. A collision-checked layout places burner vessels in a row, board centre-front, plate front-right (with an extra margin so its rim stays on the slab), tools next to the vessel of their first use.
- Kadai/wok are scaled 0.74 (small ones 0.48).
- Only the items the plan lists are built, one per frame, and revealed one by one behind `CookLoadingPanel`. The panel appears only once the briefing deck is closed.
- Measured budgets: Chicken 65 96 objects / 7,024 triangles; Chapathi 65 / 4,128; Poori 53 / 3,936; a live Tomato Soup plan 86 / 7,592.

### 6.4 Props (`ShapeRecipe.ts`, `ShapeRecipeBuilder.ts`, `CookProps.ts`)
- A small op-list shape system builds irregular chicken chunks (never cubes), rolling pin, wooden board, curry leaf sprig, lemon wedge, flour dish, dough ball, flatbread disc, skimmer, wooden spoon and brush, each within a 450-triangle limit.
- Vessels: graphite carbon-steel kadai with brass handles, tawa with walnut grip, skillet, copper saucepan, copper-and-steel bowl, plate with a slate-blue rim band and gold line, plus spatula, knife, ladle and the tools above.
- Vegetables use the catalogue stages and also have whole, cut and paste forms.

### 6.5 Runtime (`CookRuntime.ts`, `ItemState.ts`)
- Steps run as a DAG over `after`; a step is its action's animation plus a 0.8 s dwell.
- MANUAL is the default (one step per Do step press). AUTO runs every ready step. Every new dish and every exit resets to the inspector speed (1x) and to AUTO off.
- `ItemState` tracks each ingredient's look (raw, marinated, coated, fried, cooked, toasted, sauced) as colour, roughness and glow.
- Shape transformations: a vegetable swaps whole to cut pieces halfway through a CUT step, is never left whole once a step uses it, and becomes a paste in soup/chutney/sauce dishes; plated food follows.
- Tools aim their handle away from the vessel toward where they rest, and swing while stirring.

### 6.6 Actions (22 motions plus a generic one, `Cook/Actions/`)
Each action is its own module driven by a shared kit (`CookActionKit.ts`): cut (rock-chop), marinate, mix, coat, heat oil, deep fry, shallow fry, saute/toss, temper, simmer, boil, roll dough (the disc is sized to the vessel it goes into next), knead, cook flat (tawa, blisters, puff), flip, steam dum, whisk, pour, season, rest, plate, garnish, generic.
- Oil and liquid: the surface is drawn at the same height the actions use and fitted to the vessel's inner wall (no gap, no overflow). Deep-fry oil depth is 0.72.
- Flat food (poori, chapathi, dosa, fritter discs) is handled by `FlatFryKit.ts`: one disc at a time, it floats and puffs in the oil, flips inside the vessel, is lifted, drained and carried onto the plate.
- Plating finds the cooked food whatever its role, stacks flat items, and keeps fried discs where they were set down.
- Fried food rest spots are clamped to the bench slab.
- Steam: heated vessels steam per action while a step cooks, fade when the heat goes off, and hot plated food steams for about 16 s.

### 6.7 On-screen elements in Cook mode
- `CookStepCard`: step index and action, title, a short explanation, progress dots, a "NEXT: ..." line, and buttons Do step, Auto, New dish and Exit.
- `CookItemLabels`: name tags for only the current step's vessel, tool and ingredients (at most 5, in one row, in front of the vessel, fading when the step ends).
- `CookLoadingPanel`: "Setting up <dish>" with a progress bar and chips for each item (loading, ready, placed).

## 7. AI integration

- Only provider: Anthropic Messages API, via `InternetModule`. Model ids live only in `Assets/Scripts/AI/AiModelConfig.ts`: every job (compiler, vision, coach, synthesizer, director, smith) is `claude-opus-5-5`. Effort is high for all except the ingredient synthesizer (medium).
- A job is live only when it has a model id and a key. Otherwise the offline presets, plan library and scripted stand-ins are used.
- Live pieces: Chef Director plan (verified in Preview, including a generated tomato soup plan), dish blueprint compiler (verified), ingredient synthesizer.
- The live vision call is not tested end to end; vision in the Lens is the scripted stand-in plus the real `ProposalGate`.
- The Shape Smith call (AI shape recipe for unknown ingredients) is defined in the config but not connected; unknown ingredients use role, colour and shape hints.

## 8. Secrets handling

- The key lives in the gitignored `.env`. `tools/sync-env.ps1` copies it into the local `Assets/Scripts/AI/LocalSecrets.ts`, which is marked `skip-worktree` so it is never committed.
- The committed `LocalSecrets.ts` is an empty stub; no key string exists in the git history.
- A key embedded in a Lens can be extracted, so a key is used for Preview only.
- An old key from early history was revoked.

## 9. Tests (LEAF)

24 scenarios are registered in `Assets/Tests/LeafIndex.ts`; each is run one at a time (a recompile cancels a running scenario):

station-setup-scenario, metric-blade-stepping-scenario, volumetric-portion-dome-scenario, transfer-arc-scenario, time-warp-plating-scenario, prep-drift-resolver-scenario, gaze-wayfinding-beacon-scenario, proposal-gate-rejection-scenario, spatula-flip-guide-scenario, auto-cook-full-flow, universal-dish-page-table, multi-dish-auto-cook, dish-studio-flow, step-engine, dish-biryani-cook, dish-noodles-cook, live-ai-compile, cook-plan-chicken65, cook-plan-chapathi, cook-plan-generic, cook-plan-poori, cook-plan-athirasam, shape-gallery, asset-gallery.

Cook scenarios check: all steps start and finish with 0 action errors, budgets, a collision-free layout, tools and vessels on the bench, no stray objects off the bench, name tags (1-5 at a time), vegetable forms, a clean start (MANUAL, speed 1), and for poori the disc stays inside the kadai during the flip and ends on the plate.

Last results (8 Nov, Lens Studio Preview): `cook-plan-poori`, `cook-plan-athirasam`, `cook-plan-chicken65`, `cook-plan-chapathi` pass; `cook-plan-generic` (live tomato soup) passed earlier the same day; `dish-studio-flow` and `step-engine` passed earlier the same day. Before the Cook-engine work all 16 original scenarios passed; the full 24 were not re-run in one pass after the latest changes. `live-ai-compile` and `cook-plan-generic` skip when no key or network is available.

## 10. Git state

- Branch `main`, remote `https://github.com/louji2308/Miseflow` (public).
- 16 commits after this file is committed (15 before it). Recent: `eabb7ce` ignore the local `.claude/` symlink, `2355b3d` track the plan-lens skill pack and lock file, `f5fe1fe` athirasam plan, steam, normal-speed start, robust plating, `3414eb2` deep-fry rework, `e314fcc` design spec v3.0 and reference images, `7dd5e30` Opus 5.5, premium props, vegetable transformations, name tags, `41e6478` Chef Director.
- First commit: 27 Oct 2026.
- Not yet pushed to GitHub: `3414eb2`, `f5fe1fe`, `2355b3d`, `eabb7ce` and the commit that adds this file.
- Working tree: clean.
- `.gitignore` now holds only the secret rules (`.env`, `.env.*`) and the local `.claude/` symlink folder.

## 11. Known limits and stand-ins (current facts)

- Everything was verified in the Lens Studio Preview only; hand comfort and real-kitchen feel are unproven.
- The Speak and Keyboard cards do not work in Preview with SPECS 27 simulation (they show a notice); tests use the dish chips and an event-bus text path.
- Vision is a scripted stand-in (0.89 / 0.94 / 0.41) behind the real gate; the prep delay is an injected +25 s; demo time can be accelerated (10x warp, speed multipliers).
- The props are virtual and animate by themselves; nothing is anchored to a real kitchen in Preview.
- Two engines exist side by side: the original station flow (dish 01-06) and the Cook engine (any other dish). Cook mode hides the original stations.
- Live Chef Director plans take 10-35 s and fail without network; library dishes are instant.
- Unknown ingredients use generic shapes; only a handful of protein shapes exist besides the irregular chicken.
- The original dish-01 vegetables exceed the 400-triangle budget used for the newer items; the sauce pool looks bright red in dish 03; in manual play some legacy steps complete on timers.
- Documentation currently out of date: `README.md`, `devpost/design-brief.md` and `devpost/submission-draft.md` still say `claude-sonnet-5-5`, "21 LEAF scenarios" and the older object counts; the code uses `claude-opus-5-5` and 24 registered scenarios.
- `Miseflow/Assets/Scene.scene` is rewritten by Lens Studio when the LEAF plugin runs (bridge object ids), so it can show as modified without a real change.
