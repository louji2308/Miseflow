# MiseFlow v7, Stage 3 audit: one big target per station + hidden Director palette

Written 9 Nov 2026 before coding. Paths are relative to `Miseflow/Assets/` unless noted. Units cm, right-handed.
Rule for this stage: never rename an object, never change a LEAF-asserted string; hide, do not destroy.

## 1. Inventory: what creates or drives the old UI

### 1a. Station pills (MiseFlowSpatialUI.ts)
| file:line | what | notes |
|---|---|---|
| Scripts/MiseFlowSpatialUI.ts:512-514 | `buildPill` x3: `SkilletStationUI`, `SauceStationUI`, `PrepStationUI` (children `<name>_Glass/_Icon/_Metric/_Value/_Action`) | roots parented to StationsRoot, `HeadPoseBillboard.register` pitch 14 (l.596) |
| :633-666 | `<name>_Stem`, `<name>_StemFoot` leaders (siblings of the pill under StationsRoot) | billboard pitch 0 (l.650) |
| :1217-1303 | `skilletView / sauceView / prepView`: the text, accent and expanded flag of each pill (metric, action, key) | the pill content logic: single source for hints |
| :1313-1343 `applyView`, :1431-1436 `refreshAll`, :1438-1487 `onUpdate` | per-frame text refresh, runs forever | must keep running (LEAF reads `_Action` text) |
| :707-757 | `PlateAnchorUI` chronometer capsule (`PlateAnchorTime/Value`), `refreshChronometer` :1393 | plate timer: `plateAnchorDisplaySec` 400 + drift |
| :911-933 | `ChefVoiceBannerUI` (dish title + coach cue) | NOT removed (see 4) |
| :361-422 `suppressLegacyVisuals` | existing precedent: hides legacy Btn_*/Lbl_* with scale 0.0001 and `RenderMeshVisual.enabled=false`, never renames | same style is used for the vault |

### 1b. Director dock (MiseFlowSpatialUI.ts)
| file:line | what |
|---|---|
| :762-906 `buildDirectorPalette` | scene object `DirectorPaletteUI` (scale 0.8, billboard deadband 6, frozen while hovered :771) with groups COOK (`UI_Btn_StepChop`, `UI_Btn_Transfer`, `UI_Btn_InspectSear`), SIM (`UI_Btn_TriggerDrift`, `UI_Btn_TimeWarp`, `UI_Btn_Reset`), AUTO (`Btn_AutoCook`, `Btn_CycleDish`, `Btn_StepGuide`) |
| :957-1016 `createDirectorButton` | UIKit `Button` (Capsule/Ghost) + glass frame, `directorButtons[]` |
| :879, :882, :884 | `MiseFlowButtonTrigger` passive triggers on `Btn_AutoCook`, `Btn_CycleDish`, `Btn_StepGuide` |
| :523-526 | `MiseFlowButtonTrigger.registerAction("CYCLE_DISH" -> openDishStudio)` and `"STEP_GUIDE"` |
| :465-503 | keyboard 1-0 (7 auto, 8 quick-cycle, 9 chicken/chapathi demo, 5 drift, 6 warp, 0 reset): stay exactly as they are |
| Scripts/MiseFlowButtonTrigger.ts:45-58, :60-78, :157-228 | name-based action table; `Btn_*` legacy buttons built in StationPropsBuilder have `ensureCollider/Interactable` and call `StationInteractableController` |

### 1c. StepEngine card, Cook card, name tags
| file:line | what |
|---|---|
| Scripts/StepEngine.ts:431-456 `buildCard` | `StepCard` (+`StepCardTitle/Body/Index/Station`, `StepProgress`), under StationsRoot, anchors :54-59, `wantCard` :465, `updateCard` :514 |
| Scripts/StepEngine.ts:171-217 | public API `getSteps/getCurrentIndex/getStepStates/skipToNext/toggleCard`; `STEP_STARTED/COMPLETED` emitted :308, :325 |
| Scripts/Cook/CookStepCard.ts:209-240 `ensureBuilt`, :351 `show` | scene-root `CookStepCard` with `Btn_CookDoStep`, `Btn_CookAuto`, `Btn_CookNewDish`, `Btn_CookExit`; `getSnapshot()` + `press()` API; registered actions `COOK_DO_STEP/COOK_AUTO` (:91) |
| Scripts/Cook/CookItemLabels.ts:105-181 | scene-root `CookTag_<name>` glass tags above the current step's vessel, tool, ingredients (max 5) |
| Scripts/Cook/CookRuntime.ts:181 `doStep`, :405 `COOK_STEP_STARTED` payload `{stepId,index,total,action,title,whatWhy,equipmentId}`, :522 `COOK_STEP_DONE`, :131 `getState().ready` | the Cook "Done" path = `COOK_DO_STEP` |
| Scripts/Cook/CookWorld.ts:84-99 | `world.equipment[id].rimWorld()`, `world.plate`, `plan.steps[].durationSec/equipmentId` |

## 2. Which LEAF scenarios look at which of those, and what they assert
| scenario | names / strings | assertion | consequence for the design |
|---|---|---|---|
| proposal-gate-rejection | `SkilletStationUI_Action` | `.text` contains `GATE REJECTED (<0.55)` | pill objects must stay alive and keep updating text; findSceneObjectByName also finds disabled/hidden objects |
| step-engine | `StepCard`, `StepCardTitle`, `StepCardBody`, `StepProgress`, `Btn_StepGuide` | `card.enabled` AND `card.isEnabledInHierarchy` are true; title text equals step title; Steps chip toggles `enabled` | StepCard must NOT be disabled or under a disabled parent: hide it by scale (vault), and `toggleCard` keeps working |
| station-setup (Stage 1B part) | `SkilletStationUI` | local yaw changes > 5 deg on a simulated 40 cm head move, pitch 14 +-1 | HeadPoseBillboard skips objects whose parent world scale < 0.01 (vault) and disabled ones: retarget this assert at the Skillet StationTarget (allowed: "update station-setup") |
| auto-cook-full-flow, multi-dish, dish-studio-flow, dish-biryani/noodles, cook-plan-*, live-ai | `Btn_AutoCook`, `Btn_CycleDish`, `Btn_Reset`, `Btn_StepChop/Transfer/FillPortion/ToggleHold/ToggleTimeWarp`, `Btn_Studio*`, `Btn_Briefing*`, `Btn_LetsCook` | `MiseFlowLeafInteractor.tapButton` finds the object by name (any enabled state) and calls its `MiseFlowButtonTrigger.triggerAction()`; `dish-studio-flow` also asserts `Btn_Studio*.isEnabledInHierarchy` | dock buttons keep names, parents may change, components keep working while the palette is disabled |
| cook-plan-* | `root(StationsRoot).getWorldScale().x < 0.01` in Cook mode, `CookLoadingPanel` absent at scene root, `world.stats()` object/tri caps | targets must live outside StationsRoot and outside `CookStageRoot` (so they do not count in world stats) |
| gaze-wayfinding-beacon, prep-drift-resolver | `Btn_ToggleHold`, EdgeBeacon_*, DAG hold texts | untouched |
| `CookPlanDishScenario.sceneHas` | root-level `CookLoadingPanel` | keep modal panels at scene root |

Legacy strings that must survive (todo.md hard invariants): `CHOP SHALLOTS`, `CHOP n/8`, `PORTION DOME 100%`, `PREP TRANSFERRED`, `DROP SHALLOTS`, `DEFERRED (+25s)`, `PLATED`, `ALERT: VERIFY BURNER`, `HOLD ACKNOWLEDGED`, `GATE REJECTED (<0.55)`, `Dish not found. Enter the correct dish name.`. None of them is rewritten by this stage.

## 3. Design: keep every asserted name alive, show only station targets

### 3a. Hiding without renaming (the vault)
- New scene object `LegacyUiVault` under StationsRoot, enabled, local scale 0.0001 (same technique as `suppressLegacyVisuals` and DishStudio). The hub re-parents into it (setParent keeps the local transform): `SkilletStationUI`, `SauceStationUI`, `PrepStationUI`, their `_Stem` objects, `PlateAnchorUI`, `StepCard`.
- Everything keeps its name, components, text updates and `enabled` state. Nothing is disabled, so the step-engine asserts and the `_Action` text assert hold. Nothing renders (world scale 0.0001; HeadPoseBillboard skips them).
- `CookStepCard`: stays built and keeps its snapshot/press API and `COOK_DO_STEP` registration; `suppressed` flag (default true) keeps the root disabled. `CookItemLabels` (name tags on the current step's vessel/tool/ingredients, max 5) stays: it is information on the thing, not a pill.
- Debug reveal: the palette entry "Legacy HUD" scales the vault back to 1 (and unsuppresses CookStepCard) for development only.

### 3b. Dock -> palette without renaming
- `DirectorPalette` (new) creates scene-root-adjacent object `DirectorPalette` under KitchenAnchorRoot, adopts the existing `DirectorPaletteUI` dock under it (names `UI_Btn_*`, `Btn_AutoCook`, `Btn_CycleDish`, `Btn_StepGuide` unchanged, triggers unchanged, the `frozen` billboard callback unchanged) and adds a second glass row `Director_Glass_Kitchen` with the new entries.
- Closed = `DirectorPalette` root disabled (after a warm-up so UIKit finished initialising). `tapButton("Btn_AutoCook")` etc. still work on disabled objects (component call, not a hit test).
- Opens on `PALETTE_REQUESTED`, key D in the editor, public `open/close/toggle`. Keys 1-0 untouched in MiseFlowSpatialUI.

### 3c. Station targets (`StationTarget.ts`)
- Pure code, no @input. `StationTarget` (class: UIKit `Button` shape Round/Ghost = pure input surface 4.5 cm + our own glass visuals) and `StationTargetHub` (@component: builds, feeds and destroys targets).
- UIKit `Button` with `setVariant({theme:"SnapOS2", shape:"Round", style:"Ghost"})` is used instead of the deprecated `RoundButton` (UIKit marks RoundButton `@deprecated`, Button has the Round shape; same family the dock already uses). The Button object never moves, so the collider stays put in every state (moving colliders mid-press drops SIK events, see MiseFlowSpatialUI.ts:771).
- Legacy dishes: 4 targets `StationTarget_Skillet/Saucepot/Prep/Plate`, kitchen-local positions = old pill anchors lifted to 8 cm above the rim, 3 cm toward the cook (+Z). Cook dishes: one per `world.equipment` entry (vessel, board, plate) built on `COOK_WORLD_READY`, following `rimWorld()` each frame, destroyed on `COOK_EXIT`.
- Content, single source of truth: title and Done semantics from `StepEngine` (legacy) / `plan.steps` + `CookRuntime` (Cook); timer from `ChoreographyDAG` (`getSkilletRemaining/getSaucepotRemaining`, prep slice count, plate anchor seconds); hint from the pill view logic in MiseFlowSpatialUI (`getStationView`), cut to 4 words.
- Done (legacy): active StepEngine step on this station -> CHOP: `onStepChopPressed`, PORTION: `onFillPortionPressed`, TRANSFER: `onTransferPressed`, other kinds `StepEngine.skipToNext()`; plate: `PlatingFinisher.begin()`; always emits `STEP_DONE_PINCHED`. Done (Cook): `COOK_DO_STEP` (what Btn_CookDoStep did).
- Plate card: `Plate` + `Name a dish` (emits `OPEN_DISH_STUDIO`; MiseFlowSpatialUI subscribes and calls the same `openDishStudio()` as the old AI Dish button, with the same Auto Cook guard). Hold-pinch 1.5 s on the plate circle emits `PALETTE_REQUESTED`.
- Hooks for Stage 4: subscribed now to `HAND_AT_STATION`, `HAND_LEFT_STATION`, `ALERT_RAISED`, `ALERT_RESOLVED`.
- Hidden whenever the Dish Studio is open (`STUDIO_STATE_CHANGED`) and while claiming (kitchen root is parked by `setContentHidden`).

## 4. What stays visible and why
- Visible in steady state: station dots, burner/chrono rings, conduits, slab, props, `ChefVoiceBannerUI` (dish title + coach cue, not a pill or dock; open question for the owner: Stage 5 may fold it into the plate target), Cook name tags during a step.
- Modal moments unchanged: Dish Studio, briefing deck, loading panel, claim reticle.

## 5. Scenarios
- New `single-ui-invariant-scenario`, `fov-budget-scenario` (registered after the existing 26 -> 28); `station-setup-scenario` retargets the billboard assert and asserts 4 StationTargets.
- Rail assertion deferred to Stage 5 (TODO line in the scenario).
