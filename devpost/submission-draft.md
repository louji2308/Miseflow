# MiseFlow AR v6: Devpost submission draft

Learn AR with SPECS. Deadline 2026-11-09 2:00 PM PST. Everything below was verified in Lens Studio Preview only; no Spectacles hardware was used.

## Inspiration / problem
Recipes are written as lists, but cooking is a schedule. When you cook two or three things at once, a late chop quietly breaks the timing of the sauce and the sear. A phone shows separate countdowns and cannot show how one delay spreads to the next task. Hands are wet or greasy, and the counter is where you are looking anyway. That made glasses the natural place for it.

## What it does
MiseFlow AR is a Snap Spectacles lens that plans cooking as a schedule of dependent tasks and draws it on the kitchen itself: rings on the burners, conduits along the counter, short pills above each pan.

- **Prep Drift Resolver.** If prep slips by 25 seconds, an amber pulse travels from the board to the saucier, the sauce start slides back and leaves a ghost arc, the skillet gets a Heat Guard ring, and the clock moves from 06:40 to 07:05. You see what moved and what did not.
- **Default dish.** Salmon beurre blanc is the first of six prebuilt dishes and is always the starting state.
- **Dish Studio (v5).** The AI Dish button opens a full-view studio with Speak and Keyboard cards. Back returns to the kitchen exactly as it was. An unknown dish gets "Dish not found. Enter the correct dish name." Briefing cards (`<`, `>`, Skip, "Let's cook") play while ingredients and vessels load in parallel, then the props appear one by one.
- **Chef Director (v6).** A dish that is not one of the six prebuilt dishes is composed by a Cook engine. It checks an offline plan library first (chicken 65 and chapathi work with no network or key), then asks Claude for a cook plan, and otherwise says "Dish not found. Enter the correct dish name." A plan has 2-6 pieces of equipment, up to 12 ingredients with real shapes and 4-14 steps, and two vessels can work at once (the kadai deep-fries while a small pan tempers curry leaves). The steps show as cards first, then only the equipment that plan needs is built and revealed.
- **Step-by-step cooking.** Each dish runs from its own step list with a step card. Play it by hand or use Auto Cook.
- **Content.** Six dishes (salmon beurre blanc, mushroom dum biryani, wok-tossed hakka noodles, prime ribeye au poivre, paneer tikka makhani, butter-garlic tiger prawn pasta), 17+ vegetables, starches, 9 proteins, wok, handi with lid, stockpot, tawa, knives, whisk and more, all built as procedural low-poly meshes, plus 9 motion primitives (chop, pour, flip, toss, stir, noodle lift, rice layering, whisk, plating).

## How we built it
- **Plan:** the plan-lens skill wrote the design brief the build followed.
- **Build:** CLAD agents drove Lens Studio through the Lens Studio MCP to write TypeScript and edit the scene.
- **UI and input:** Spectacles Interaction Kit (SIK) and UIKit for pinch buttons, cards and the dock; AsrModule for speech and the AR keyboard (TextInputSystem) for typing.
- **Scheduling:** a DAG engine with a prep-drift resolver and a confidence gate (`ProposalGate`) that every AI suggestion must pass.
- **Testing:** LEAF scenarios run inside Lens Studio Preview. 21 scenarios pass, each run alone, with 0 TypeScript errors.
- **AI:** the only provider is the Anthropic Messages API, called through InternetModule, for compiling a typed dish name into a dish blueprint and for a sear-vision probe. The Chef Director compile is on (model `claude-sonnet-5-5` in `AiModelConfig.ts`) and was verified live in Preview. No key is committed.

## Challenges
- Preview cannot run the AR keyboard or ASR voice (SPECS 27 simulation shows a notice), so we tested the flow through dish chips and an event-bus text path instead.
- Each LEAF run restarts the lens and takes minutes, so we ran scenarios one at a time.
- Building many props procedurally while keeping meshes light for a glasses display, and keeping colours readable on an additive display where black is see-through.
- Adding a universal flow without ever breaking the original salmon dish.

## Accomplishments
- A working drift moment you can read in space, not on a screen.
- A full flow from naming a dish to cooking it step by step, with Back restoring the kitchen exactly.
- Dishes cook through to plating, with Auto Cook.
- A Chef Director that composes a dish outside the six presets, verified live in Preview (a new dish took about 35 s).
- 21 LEAF scenarios passing and 0 TypeScript errors.

## What we learned
- Putting status on the object it describes (the burner, the pan) is clearer than any panel.
- Honest stand-ins with a real gate behind them are easier to trust and to test than a half-working live call.
- A small confidence gate (0.55) turns a vague AI guess into a safe rule.
- Tests that drive the same event bus as the UI let us check flows that Preview cannot take input for.

## What's next
Honest limits first:
- **Live in Preview, not on device.** The Chef Director compile was verified live in Preview. Each new dish takes 10-35 s; preset and library dishes are instant. The live vision call is still untested. A key inside a Lens can be extracted, so a published version needs a server in between.
- **Stand-in vision.** The scan cycles 0.89 (approved), 0.94 (approved, shows the spatula flip guide) and 0.41 (rejected by the 0.55 gate). Real sensing needs hardware.
- **Untested inputs.** The AR keyboard and voice need a real device. In Preview, use the quick-picks or key 9.
- **Known gaps.** The original dish-01 vegetables are heavier than 400 triangles, the sauce pool is bright red in the noodle dish, some manual steps complete on timers, and a few screenshots are missing.
- **Ingredients and shapes.** Unknown ingredients are built from role, colour and shape hints; the per-ingredient AI shape call is designed but not wired. Only a handful of protein shapes exist besides the irregular chicken.
- **Motion.** The new motions were checked in Preview screenshots at 900-1300 px, not on a device.
- **Then:** test on Spectacles, check hand fatigue near heat, and add more dishes.
