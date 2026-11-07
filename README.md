# MiseFlow AR v5

MiseFlow AR is a Snap Spectacles lens (Lens Studio) for the Learn AR with SPECS hackathon (deadline 2026-11-09 2:00 PM PST). It choreographs multi-burner cooking as a schedule (a DAG of timed tasks) and shows it in the kitchen: burner rings, counter conduits, and a spatial prep-drift resolver that reflows the schedule when prep slips. v5 adds a universal dish flow: pick a prebuilt dish or name any dish, and the lens builds the props and cooks it step by step.

Everything is verified in the Lens Studio Preview only. No Spectacles hardware was available.

## What it does

- **Default dish:** Salmon beurre blanc is "Prebuilt Cookings" dish #1. It is the boot and Reset state and is never changed by the v5 work.
- **Prep Drift Resolver:** when prep slips +25 s, an amber conduit pulse travels from the board to the saucier, the sauce start arc slides back and leaves a ghost arc, the skillet gets a Heat Guard ring, and the chronometer moves 06:40 to 07:05.
- **AI Dish (Dish Studio):** the AI Dish button opens a full-view studio with two cards, Speak (AsrModule) and Keyboard (AR keyboard). The whole kitchen is hidden, not destroyed; the small Back button restores it exactly (it is not a Reset). Speech shows "Heard" with Edit, then Confirm. An unknown dish shows "Dish not found. Enter the correct dish name." and reopens input.
- **Briefing cards:** near-square cards, one at a time, with `<`, `>`, Skip and a final "Let's cook". Two page-table loaders (ingredients, starch, protein, spices; and vessels, tools, service ware) run in parallel while you swipe.
- **Reveal:** after "Let's cook" the props appear one by one behind an animated loading panel.
- **Cooking:** the dish runs step by step from its own `steps[]`. A step card explains each step (the Steps chip toggles it). Play manually or press Auto Cook.

### Dishes and catalogue

Six prebuilt dishes: 01 salmon beurre blanc, 02 mushroom dum biryani, 03 wok-tossed hakka noodles, 04 prime ribeye au poivre, 05 paneer tikka makhani, 06 butter-garlic tiger prawn pasta.

Procedural catalogue (low-poly meshes built in code, no imported models): 17+ vegetables in 3 stages (whole / partial / cut), starches (rice, noodles, pasta, dough) in 3 stages, 9 proteins with a dual-surface doneness, vessels and tools (wok/kadai, handi with lid, ladle, stockpot with strainer basket, tawa, knives, whisk, chopsticks, tongs, ramekins, deep bowls, serving handi), and spices, dairy, oils and legumes.

Nine kinematic primitives: ROCK_CHOP, TWO_STAGE_POUR, SPATULA_FLIP_180, PAN_TOSS_ROLL, LADLE_ORBITAL_STIR, NOODLE_LIFT_TOSS, RICE_DUM_LAYER, WHISK_EMULSION, CONVERGENCE_PLATING.

## AI: what is real and what is a stand-in

- The only provider is the Anthropic Messages API, called through InternetModule. No other AI service or SDK is used.
- Live AI is **off**. Model ids live only in `Miseflow/Assets/Scripts/AI/AiModelConfig.ts` and are empty placeholders. Live calls also need `ANTHROPIC_API_KEY` in a repo-root `.env`, copied by `tools\sync-env.ps1` into the local `LocalSecrets.ts`.
- The live dish-compile and vision calls have **not been tested end to end**.
- The demo path is offline: preset dish matching, and a deterministic vision stand-in that cycles 0.89 (approved), 0.94 (approved, shows the spatula flip guide), 0.41 (rejected by the 0.55 confidence gate). Every result goes through the real `ProposalGate.evaluate`.
- A key embedded in a Lens can be extracted. Use one only for preview or recording, never in a published Lens. No key is committed.
- The AR keyboard and ASR voice cannot be exercised in Lens Studio Preview with SPECS 27 simulation (they show a notice). Tests use the dish chips and the event bus text path instead.

## Run it

1. Open `Miseflow/Miseflow` in Lens Studio 5.24 or newer.
2. In Preview, reset the camera: MovePreviewCamera position (0, 25.1, -21.4), lookAt (0, -4.9, -73.4) (about -30 degrees pitch; the Camera Object uses DeviceTracking, so this is a preview pose).
3. Use the on-screen dock, or keys: `1` step cut, `2` fill portion, `3` transfer, `4` AI vision scan, `5` +25 s drift, `6` 10x time warp, `7` Auto Cook, `8` AI dish quick-cycle (cycles the prebuilt dishes), `0` Reset. The Reset button does the same as `0`.

## Verification

- 0 TypeScript errors.
- 16 LEAF scenarios under `Miseflow/Assets/Tests`, each passing when run alone: station-setup-scenario, metric-blade-stepping-scenario, volumetric-portion-dome-scenario, transfer-arc-scenario, time-warp-plating-scenario, prep-drift-resolver-scenario, gaze-wayfinding-beacon-scenario, proposal-gate-rejection-scenario, spatula-flip-guide-scenario, auto-cook-full-flow, universal-dish-page-table, multi-dish-auto-cook, dish-studio-flow, step-engine, dish-biryani-cook, dish-noodles-cook.
- Each LEAF run takes minutes because the plugin is slow to start. Run scenarios one at a time from the LEAF panel in Preview.

## Known gaps

- The original dish-01 vegetables are over the 400-triangle budget used for the new items.
- The sauce pool looks bright red in dish 03 (a noodle dish).
- In manual play some steps can complete on their timers instead of on the action.
- A few screenshots are missing (for example dish 02 plated and the dish 01 end state).
- The AR keyboard and voice input are untested in Preview.
- Dishes 04 and 05 were only checked in probe runs (all steps done, plated).
- Hand fatigue and real-kitchen feel are unproven without hardware.

## Upgrade log

### v3 -> v4.0 "Diegetic Cockpit" upgrade: plan started `2026-11-02 15:18:18 +05:30`

Goal: rebuild the visual and spatial layer (judges see only the Preview video) while keeping the DAG engine and LEAF scenarios intact.

- 2026-11-02 15:18:18 +05:30 - plan approved, todo.md created, baseline starting.
- 2026-11-02 15:46:13 +05:30 - baseline done (6/6 LEAF, 0 TS errors); camera and geometry fixes.
- 2026-11-02 16:07:18 +05:30 - station pills and grouped Director HUD done; conduits and rings written.
- 2026-11-02 17:22:32 +05:30 - gaze beacon, spatula flip guide, 3-state vision stand-in and confidence gate done; 9/9 LEAF.

v4 was committed as `1ef5283`. v5 work (Dish Studio, catalogue, step engine, kinematics) is tracked in `todo.md`.

## Recording checklist (Lens Studio Preview, 1080p/60, under 3:00)

Before recording: set the preview camera pose above, press Reset, confirm 0 TypeScript errors and LEAF 16/16, and check that the log is clean.

| Time | Act | Action | Narration beat |
|---|---|---|---|
| 0:00-0:25 | 1 Hook | Chef-POV over the counter on the default salmon dish: skillet, saucier locked by the cyan conduit, board | "Recipes are written as lists. Cooking happens as a schedule. MiseFlow is the first recipe that waits for you." |
| 0:25-1:05 | 2 Dish Studio | Tap AI Dish; show the Speak and Keyboard cards (voice and keyboard show a notice in Preview, so enter "mushroom dum biryani" with the dish chip or the typed-text path); Heard/Typed card, Confirm; swipe the briefing cards; Let's cook; props appear one by one behind the loading panel | "Name any dish. The lens loads the ingredients and vessels while you read the briefing." |
| 1:05-1:50 | 3 Step-by-step cooking | Cook the biryani with the step card visible (Steps chip), a few manual steps | "Each step has its own card. The dish comes from its own step list." |
| 1:50-2:15 | 4 Drift moment | Key 5 (+25 s drift): amber conduit pulse, ghost arc, Heat Guard ring, chronometer 06:40 -> 07:05, edge beacon. Optional: Key 4 scans (0.89, 0.94, 0.41 rejected) | "The schedule reflows so the fish never burns." Say the vision is a stand-in with a real safety gate. |
| 2:15-2:50 | 5 Finish and proof | Key 7 Auto Cook finishes and plates; show design-brief.md and LEAF 16/16 | "Planned with plan-lens, built with CLAD and the Lens Studio MCP, verified by 16 LEAF scenarios." |

Use dish 01 for the drift moment if the dish 02 timing does not fit.
