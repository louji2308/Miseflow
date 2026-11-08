# MiseFlow AR v7: Master Upgrade Plan ("The Recipe That Lives on Your Counter")

| Field | Value |
|---|---|
| Status | PROPOSED. Plan only. No project code was changed while writing this. |
| Date | 8 November 2026 |
| Target | Learn AR with SPECS (Snap Inc. / Devpost). Deadline in the rules file: 9 Nov 2026, 5:00 PM EST (10 Nov, 3:30 AM IST). |
| Baseline | `PROJECT_STATUS.md` (v6, Chef Director), Lens Studio 5.24, SIK 0.18, UIKit, LEAF, 24 scenarios, 114 TypeScript files |
| Sources cross-examined | `PROJECT_STATUS.md`, the hackathon rules and rubric report, the concept-video transcript, 15 organizer screenshots, the organizer's own `plan-lens` reference files in `.agents/skills/plan-lens/references/`, `Support/StudioLib.d.ts`, the CLAD capability skills, the live Preview configuration |
| How to use | Read Part A (constraints) and Part B (audit) once. Build from Part D (upgrades) and Part G (sequence). Verify with Part F (tests). Present with Part H (demo). |

This document is written to be handed to a builder agent through CLAD. It is dependency-ordered so that the Lens is demonstrable and better than v6 at every stage gate, not only at the end.

---

## Part A. Hard constraints (non-negotiable)

Every item below is a rule the build must obey. The source of each rule is named so nobody argues with it later.

### A1. Hackathon rules (pass/fail stage)

- [ ] The Lens is planned with the Devpost Learn `plan-lens` skill. `devpost/design-brief.md` must describe the Lens that judges actually see. A v7 section must be added in the owner's words before submission (the skill asks before replacing an existing brief; appending is acceptable).
- [ ] The Lens is built through CLAD and the Lens Studio MCP. Evidence lives in the repo history, the skill-pack lock file and the brief. Keep `skills-lock.json` and `.agents/skills/plan-lens/` tracked.
- [ ] LEAF scenarios cover the done criteria and are run in the Preview. Report which pass and which criteria have no test.
- [ ] Public repository (GitHub) containing the Lens Studio project files and the `devpost/` folder. All local commits pushed.
- [ ] Demo video: public on YouTube, strictly under 3:00, shows the Lens working end to end in the Lens Studio Preview, briefly explains design and the AI-assisted process, no third-party music or trademarks, English.
- [ ] Devpost description explains what it does, who it is for, main features, what was learned. Honest about stand-ins.
- [ ] Original work. Disclose pre-existing code (the v3 to v6 codebase built during this hackathon window from 27 Oct 2026 is new work; say so). Third-party packages are Snap's own (SIK, UIKit, LEAF).
- [ ] Do not record, identify or follow people. The demo is the owner's own space (the Preview room).

### A2. Organizer design habits (the judges' lens)

From the concept video and `ar-design-rules.md`:

- [ ] Put information on the thing it is about. No website floating in front of the face.
- [ ] Show it when it is needed, then get out of the way. Every glance must earn its place.
- [ ] A few big targets. Pinch is the new tap. Forgiving hit areas.
- [ ] Keep it where they are already looking. Nothing behind the shoulder. Out-of-view attention is a sound plus a small arrow.
- [ ] Real scale in centimetres. Content roughly 0.6 to 1.6 m away, a little below eye level. Arms low.
- [ ] Narrow view: about 37° by 32°. Usable area about 23 x 38 cm at 55 cm and 53 x 77 cm at 110 cm.
- [ ] Additive display: black is transparent. Light content over dark backplates.
- [ ] A real app, not a demo. Comfortable, not tiring. Better than the laptop version.
- [ ] Preview is the stage: walking around, placing things on tables and floors, buttons, pinches and grabs all work. Recognition of real things is faked honestly ("fake the moment it recognizes something, then build what happens next").

### A3. Project invariants (from the brief and the codebase)

- [ ] Dish 01 (salmon beurre blanc) is never removed or rewritten. Boot and Reset return to it.
- [ ] Anthropic is the only AI provider. Model ids live only in `Miseflow/Assets/Scripts/AI/AiModelConfig.ts`. No live AI call on the critical demo path. Offline presets and `PlanLibrary` carry the demo.
- [ ] Secrets: key only in the git-ignored `.env`, copied by `tools/sync-env.ps1` into the skip-worktree `LocalSecrets.ts`. Never commit a key. A key embedded in a Lens is extractable, so keys are for Preview only.
- [ ] `ProposalGate.evaluate` guards every AI or vision suggestion. Confidence floor stays 0.55.
- [ ] The unknown-dish message stays exactly: "Dish not found. Enter the correct dish name."
- [ ] Every interaction uses SIK or UIKit so the mouse and LEAF can drive it. SIK event subscriptions bind inside `OnStartEvent`, never in `onAwake`.
- [ ] Never use raw HTTP against Lens Studio. Use the MCP tools (`scene-graphql`, `asset-graphql`, `VirtualScene`, `ExecuteEditorCode`, `RecompileTypeScriptTool`, `RunAndCollectLogsTool`, `CaptureRuntimeView`, `PreviewInteractTool`).
- [ ] Units are centimetres. Right-handed. Identity camera faces world -Z.
- [ ] Performance: any dish world stays under the existing 7,500-triangle cap. New props under 450 triangles each. Physics bodies under 16 dynamic at once.
- [ ] `Miseflow/Assets/Scene.scene` is rewritten by the LEAF plugin at run time. Diff it before committing.
- [ ] LEAF scenarios run one at a time. A recompile cancels a running scenario.
- [ ] Commit only when the owner asks. One commit per stage gate is the proposal.

### A4. Platform facts that bound the design (verified 8 Nov 2026)

Verified in `Miseflow/Support/StudioLib.d.ts` and the CLAD skills:

| Capability | API present in LS 5.24 | Preview behaviour | Device behaviour |
|---|---|---|---|
| Surface hit test | `WorldQueryModule`, `HitTestSession`, `HitTestSessionOptions.filter`, result position and normal | Snap's own example is tested in the Preview with mouse and tap. Verify in Stage 0. | Full. Classification (`SurfaceClassification.Table`) is wearable-only and experimental. |
| World mesh | `DeviceTracking.raycastWorldMesh`, `hitTestWorldMesh`, `createTrackedWorldPoint`, `WorldOptions.enableWorldMeshesClassificationTracking`, `TrackedMeshFaceClassification.Table` | Docs list Interactive Preview support. Verify in Stage 0. | Full, with Table, Floor, Wall, Seat classes. |
| Spatial anchors | `AnchorModule.openSession`, `AnchorSession.createWorldAnchor(mat4)`, `saveAnchor(anchor, SaveOptions.scope)`, `resolveAnchor(id)`, `AnchorComponent.state`, `onStateChanged` | The editor never localizes. Use `global.persistentStorageSystem` as the labelled stand-in. | Spectacles only. Needs Lens Studio 5.12+ and Spectacles OS 5.63+. |
| Hand data | SIK `HandInputData`, `TrackedHand.isTracked`, `indexTip`, `wrist`, `onPinchDown`; `GestureModule` palm tap, grab, pinch strength, targeting ray | Raw hand events do not fire. The mouse is one hand doing a pinch through SIK's `MouseInteractor`. The LEAF puppet hand can pinch and drag at world positions. | Full. |
| Physics | `Physics.BodyComponent`, `ColliderComponent`, `WorldSettingsAsset.simulationRate` 30 to 240, speed limits, Fixed, Point, Hinge constraints, collision events | Works ("simple physics" is listed as working in the Preview). | Works. About 100 bodies budget on older Spectacles. |
| Camera frames | `CameraModule.createCameraRequest`, `Default_Color` in editor, `requestImage` device-only | Stream works in editor with `Default_Color`. | Camera plus internet triggers Transparent Permission, still publishable. |
| Depth | `DepthModule.createDepthFrameSession` | Preview does not stream depth. | Experimental API. |
| Speech and keyboard | `AsrModule`, `TextInputSystem` | Device only. Pair every voice action with a button. | Full. |
| Preview environments | `PreviewPanelTool` sources: Colorful Home, Evening Room, Sunlit Room, Evening Outdoor, Sunlit Outdoor, Plane, VirtualHands | The project currently previews on the empty Plane scene with SPECS 27 simulation. | Not applicable. |

---

## Part B. Forensic audit: what v6 gets wrong for glasses

### B1. The diagnosis in one paragraph

MiseFlow v6 is a strong scheduling engine and a large procedural prop library rendered as a self-playing miniature kitchen that is tuned for one fixed laptop camera pose. The Lens contains zero uses of World Query, world-mesh raycasts, spatial anchors, the camera module, depth, hand data or physics bodies. The only collider in the code exists so SIK buttons can be pressed (`Miseflow/Assets/Scripts/MiseFlowButtonTrigger.ts:111`). Everything the organizer's screenshots celebrate (content on the real table, boards that stay beside the hoop, a label with a leader line to the exact part, a block tower you pull apart) is absent.

### B2. Evidence table

| # | Finding | Evidence | How a judge reads it |
|---|---|---|---|
| 1 | Every label faces a phantom viewer at one hard-coded pose | `MiseFlowSpatialUI.ts:68` (`CAM_LOCAL` constant), `:113` (`faceCamera` uses the constant), pills, dock and chronometer all call it. Only `GazeEdgeBeacon.ts:189` reads the real camera. | "Walk one metre left and the UI turns its back on you. This was built for a screenshot." |
| 2 | The kitchen floats in a grey void | Preview config: Interactive, scene "Plane", device SPECS 27. `docs/current-state.png` shows a slab over a grid. | "Placing on tables works in the Preview and they did not use it." |
| 3 | Nothing is placed on or remembered in the world | No `WorldQueryModule`, `hitTestWorldMesh`, `AnchorModule` or `AnchorComponent` anywhere in `Assets/Scripts`. Counter spawns at `StationsRoot (0, -17.5, -76)`. | "No world-lock proof, no persistence." |
| 4 | A dollhouse, not an overlay | Bench 44 x 30 cm, kadai scaled 0.74 or 0.48, skillet and saucier far under real size. | "Content at real size, where it belongs" is the organizer's second slide. |
| 5 | The Lens cooks itself | 22 Cook actions and 9 kinematic primitives are keyframed. Auto Cook runs the dish. The cook presses nothing physical. | "A demo you watch for a couple of seconds." |
| 6 | The hero moment is typed, not sensed | +25 s drift is a button and key 5. Vision is a 3-state cycle. Time is warped. | "The Lens never notices anything." |
| 7 | Debug rig shipped as product UI | Director dock: 8 buttons in 3 groups, 1.3 cm tall (`MiseFlowSpatialUI.ts:784`), including SIM controls. Keys 1 to 0 drive the demo. | "A menu full of small buttons." Keys do not exist on glasses. |
| 8 | Two products in one Lens | Dishes 01 to 06 use pills and the dock; any other dish uses `CookStepCard` with its own buttons. | "Not one coherent experience." |
| 9 | Layout does not fit the glasses | Counter 44 cm wide, chronometer 19 cm above, dock 13 cm in front. Usable area at 55 cm is about 23 x 38 cm. | "Only reads on the wide Preview capture." |
| 10 | Attention is silent | 5 audio references, none an alert. No chime. | The organizer's worked example ends with "chime and point an arrow." |
| 11 | AI rides an extractable key on a slow path | Live plans 10 to 35 s, fail offline. The offline library already carries the demo (correct). | Neutral if kept off the critical path. |
| 12 | Documents disagree with the code | README and brief: Sonnet id, 21 scenarios, LEAF 16/16 in the storyboard. Code: Opus id, 24 scenarios. | "Did they check their own submission?" |
| 13 | Five commits unpushed, template origin undisclosed | `Miseflow.esproj:32` `fromTemplateName: Default` while `:54` targets Spectacles. | Minor. Disclose in one sentence. |

### B3. The organizer's three questions, answered for v6

- Does it use what I am looking at? No. Nothing reads the world or the hands.
- Does it put something in my space where it belongs? Partly. It puts a miniature kitchen in front of the start pose.
- Does it free my hands or keep my eyes up? No. The cook watches a counter cook itself and pinches 1.3 cm buttons on a dock.
- Would it be just as good on a phone? Mostly yes. That is the sentence that loses the Innovation criterion.

---

## Part C. The v7 concept

### C1. One sentence

MiseFlow v7 is a recipe that lives on your counter: you claim your burners, board and plate once by pinching on them, and the cooking schedule becomes a world-locked rail of task pucks along the counter that collide when you run late, pin the pan that is on heat, and call you with a chime and an arrow to the station that needs your hands.

### C2. The one spatial moment

You are cutting shallots at your board. You are slow. On the rail beside the counter the prep puck lengthens and physically pushes the sauce puck later. The sauce puck runs into the sear puck, which is pinned because the salmon is on heat. The contact glows coral, the skillet ring grows a Heat Guard ring and its target says "Lower to hold." The plate puck slides to 07:05 and leaves a ghost tick at 06:40. Nothing was typed. The kitchen noticed.

### C3. Why it is better than the laptop version

- A laptop shows a Gantt chart. v7 puts the chart on the counter between the real board and the real stove, at the scale of the work.
- A phone cannot know your hand is at the board. v7 opens the board's one target when your hand arrives.
- A phone cannot pin a ring to your real burner across sessions. v7 remembers the kitchen.
- A phone cannot be pushed. v7 lets you shove the plate puck two minutes later when dinner is late and tells you what to do with the pan already cooking.

### C4. The three organizer questions, answered for v7

- Uses what I am looking at: hit-tested claims on the counter, hand position per station, gaze-aware attention, device camera path behind the gate.
- Puts something in my space: flush rings on claimed burners, a rail along the counter, ghost pans at real size, leader lines to the exact vessel.
- Frees my hands and keeps eyes up: one big target per station, pinch is the only input, chime and arrow for off-view stations, no HUD, no keys.

---

## Part D. Upgrades, clearly demonstrated

Each upgrade has: the problem today, the exact specification, the reason judges reward it, what the viewer sees in the Preview, and how LEAF verifies it. Design upgrades are D1 to D12. Spatial and engineering upgrades are S1 to S9. Presentation upgrades are P1 to P5.

### D1. Claim Your Kitchen (placement as the recognition stand-in)

- Problem: the kitchen spawns at a fixed pose in a grey void. Recognition of real pans is impossible in the Preview and v6 fakes it with a text pill.
- Spec: on first launch a claim reticle follows the pointing ray's hit on real geometry. Ring 12 cm, aligned to the hit normal, three chevrons, caption inside the ring (1.0 cm cap height): "Pinch on your left burner", then right burner, board, plate. Progress shown as four dots on the reticle. Pinch release confirms. Pinching the ring again within 3 s undoes. Hit normals more than 15° from up are rejected with "Find a flat spot." Spots must be at least 18 cm apart and within 120 cm of each other. A fifth optional "warm spot" is offered only when a plan needs a third burner.
- Preview path: plain World Query hit test (no classification). Fallback if hit tests fail in the simulator: `DeviceTracking.raycastWorldMesh` against the room, and as a last resort a virtual counter plane the Lens provides, which the organizer's preview-limits file lists as acceptable.
- Device path: world-mesh hit with `TrackedMeshFaceClassification.Table` snaps the ring to the counter.
- Why judges reward it: "Placing things on tables" is on the organizer's "works in the preview" slide and in two screenshots. It is the honest "fake the recognition moment" done spatially instead of with a "found it" button.
- Demonstration: in Sunlit Room, four pinches on the wooden table, rings light flush, ghost vessels appear at real size.
- LEAF: `claim-stations-scenario` (Part F).

### D2. Kitchen memory (persistence)

- Problem: nothing is remembered. The 6DoF persistence benchmark (scoreboards fixed beside the hoop) is not demonstrated.
- Spec: on device each claim creates a world anchor from the ring's world transform and saves it with Private scope in area "kitchen". Anchor ids and roles are stored in persistent storage. On launch the session resolves each id and an `AnchorComponent` drives the station pose; rings appear only when tracking state is good. In the editor the poses are stored in `global.persistentStorageSystem` and restored on relaunch, under a small label "Preview memory stand-in. On SPECS this uses Spatial Anchors." A "Forget kitchen" action in the hidden palette clears the area and the store.
- Why judges reward it: proves world-locked persistence in the video by relaunching the Lens and watching the kitchen return without re-claiming.
- Demonstration: refresh the Preview, stations return within 0.5 cm, no claim UI.
- LEAF: `kitchen-recall-scenario`.

### D3. Live head-pose billboarding and walk-around proof

- Problem: `faceCamera` orients everything to a constant.
- Spec: every label yaws toward the SIK world camera each frame (yaw only, pitch fixed slightly toward the viewer). Rings stay flush, never billboard. No object is ever parented to the camera.
- Demonstration: a 5-second WASD orbit in the video. Labels follow, rings stay on the burners.
- LEAF: `fov-budget-scenario` asserts no object is parented under the camera and that label yaw tracks a simulated camera move.

### D4. One big target per station (replaces pills, dock and step cards)

- Problem: 8 buttons at 1.3 cm, pills with two lines, separate step cards, two UIs.
- Spec: each station owns one UIKit circular button, 4.5 cm minimum, placed 8 cm above the vessel rim on the cook's side so it never covers food, yaw-billboarded. Three states. Dot: 1.2 cm, 40% brightness. Open: a 12 x 7 cm backplate card with the step title (1.0 cm cap height), timer (1.8 cm tabular numerals), a one-line hint (0.8 cm, max four words), and the Done button (the 4.5 cm circle becomes the button). Alert: Open plus coral accent plus chime. The plate target's open card carries two actions: "Plate" and "Name a dish" (opens Dish Studio). Reset lives in the hidden palette.
- Opening rules: hand within 25 cm of the station for 0.4 s, or step start, or 10 s before a timer ends, or a drift or heat event, or gaze within 12° for 1 s. Closing: 5 s after the hand leaves with no alert.
- Why judges reward it: this is the organizer's risotto example made literal ("a small dot that opens into the step and timer only when it needs me, one big pinch button per pan").
- Demonstration: hand to the board, dot opens, pinch Done, dot closes.
- LEAF: `hand-zone-target-scenario`, `single-ui-invariant-scenario`.

### D5. Hands as the sensor

- Problem: progress is typed. The Lens never knows where the cook is.
- Spec: a hand-zone sensor assigns each tracked hand to the nearest claimed station within 25 cm and keeps a dwell timer. Arrival opens the target. Dwell past the planned task end is the drift signal that feeds the DAG, replacing the +25 s button in product use. Device: SIK hand data (index tip and wrist). Editor: the active interactor's hit point, because raw hand events do not fire. LEAF: the puppet hand pinch-held at a world position. Visible fallback everywhere: pinching the target means "I am here."
- Why judges reward it: "uses what I am looking at" without a camera, and it turns the hero moment from an injected event into a sensed one.
- LEAF: `hand-zone-target-scenario`, `rail-drift-contact-scenario`.

### D6. Attention director (chime plus arrow)

- Problem: alerts are visual only and a 37° view misses them.
- Spec: one alert at a time. Priority: heat guard, then a step starting at an off-view station, then a timer under 10 s. A 0.4 s two-tone chime generated license-clean with the local sound skill, spatialised at the station's position, repeats every 8 s while unresolved. The existing edge beacon points to the station. Resolved when gaze is within 15°, a hand arrives, or Done is pinched. Never more than one chime per 8 s.
- Why judges reward it: the organizer's exact prescription for out-of-view attention.
- LEAF: `attention-chime-beacon-scenario`.

### D7. Ghost props at real scale (the overlay made visible in the Preview)

- Problem: the vessel library is a dollhouse that pretends to be the kitchen.
- Spec: the existing procedural vessels, board and plate render as ghosts: 35% alpha, silver rim light, no shadow, at real size (skillet 26 cm, saucier 18 cm, board 35 x 25 cm, plate 27 cm). In the Preview ghosts are on by default with a dim 0.7 cm caption "ghost = your real pan". On device ghosts show only during claiming and for 3 s after a step starts at that station, then hide. A "Show ghosts" toggle lives in the hidden palette.
- Why judges reward it: the kitchen reads as an overlay on a real table, honestly labelled, and the asset investment is preserved.
- LEAF: `ghost-preview-scenario` asserts alpha under 0.4 and timed hiding.

### D8. Technique previews (the 22 motions become teaching, not theatre)

- Problem: the food animates itself for the whole cook.
- Spec: at step start the matching kinematic primitive or Cook action plays once at the station for at most 2.5 s with ghost tools, then fades. One preview at a time. Never loops. Auto Cook survives only inside the hidden palette as a rehearsal mode.
- Why judges reward it: "coaching a skill while you do it" is one of the organizer's three named strengths. The organizer's worked example also wanted the Lens to "teach a technique."
- LEAF: `ghost-preview-scenario`.

### D9. Progressive disclosure budget

- Spec: in steady state only these are visible: flush rings, the rail, the collapsed dots, and the conduits. The chronometer lives on the plate puck and on the plate target, not in a floating capsule. Cards open one at a time per station. The briefing deck and loading panel remain as they are, since they are modal moments.
- Why judges reward it: "show it when it is needed, then get out of the way."

### D10. Field-of-view and comfort budget

- Spec: working distance 70 to 90 cm, pitch -25° to -35°. All steady-state content within a 50 x 35 cm band on the counter plus 20 cm of height. Pinch targets between counter height +8 and +20 cm, so arms stay low. Nothing at the display edges except the beacon. Stations outside the view are reached by chime and arrow by design.
- In the Preview the claim guidance encourages spots within a 50 cm span so the video stays readable.
- LEAF: `fov-budget-scenario`.

### D11. Additive-display colour, type and motion system

- Colour: keep the existing palette (heat gold, drift amber, prep cyan, AI violet, alert coral, done emerald, silver). Rule: no fill below 25% luminance except backplates (85% alpha dark glass). Ghosts are silver at 35% alpha.
- Type: one family. Station names in capitals. Timers in tabular numerals. Sizes by distance: title 1.0 cm, timer 1.8 cm, hint 0.8 cm, captions 0.7 cm at 80 cm viewing distance.
- Motion: open and close 0.25 s ease-out-quad. Puck springs settle a 25 s shift in about 0.6 s. Alerts pulse at 1 Hz.
- Microcopy: verbs first, four words maximum: "Lower to hold", "Start the sauce", "Cut 3 of 8", "Plate in 07:05".

### D12. Edge and empty states

- No surface under the ray: "Look at your counter."
- Hand tracking lost: targets still work by pinch. No error shown.
- Anchors fail to resolve on device: "Kitchen not recognised. Reclaim?" with one big button.
- Network down: library dishes only, a small "offline" caption in Dish Studio.
- Plan needs three burners with two claimed: a warm-spot ghost appears beside the right burner, captioned "warm spot".
- Claimed spots too close for real-size vessels: vessels scale to fit and a caption says "scaled to fit".

### S1. Kitchen anchor root

- Spec: a new root object whose pose comes from claims or anchors replaces the fixed counter pose. Local +X runs along the counter edge from the left burner toward the plate, +Y is the hit normal, the counter plane is local y = 0. Both the legacy station flow and the Cook engine bench re-parent under it, so object names and LEAF lookups survive. The slab is hidden on device and shown faintly in the Preview.

### S2. Claim controller and recognizer stand-in

- Spec: owns the reticle, the hit-test session (started in `OnStartEvent`), validation, undo, and the device classification path. Publishes `STATION_CLAIMED` events. The existing `VisionScanStandIn` is renamed in role to the claim recognizer; on device it may also accept a camera-grounded suggestion through the unchanged `ProposalGate`.

### S3. Persistence bridge

- Spec: one component with two implementations behind `global.deviceInfoSystem.isEditor()`: anchors on device, persistent storage in the editor. API: `remember(stationRole, worldTransform)`, `recall(): Promise<StationPose[]>`, `forget()`.

### S4. Station target component

- Spec: a self-contained UIKit button plus backplate builder with no Inspector inputs, driven by events: `STEP_STARTED`, `TIMER_UNDER_10`, `HAND_AT_STATION`, `HAND_LEFT_STATION`, `ALERT_RAISED`, `ALERT_RESOLVED`. Emits `STEP_DONE_PINCHED`, `OPEN_DISH_STUDIO`, `PALETTE_REQUESTED` (hold-pinch 1.5 s on the plate target).

### S5. Schedule rail (physics)

- Geometry: a static trough along the counter edge 8 cm in front of the stations line. Length 55 to 60 cm in the Preview, scaled to the span between board and stove on device. Three lanes, one per station, 5 cm wide each, low lips 1 cm high so pucks cannot leave their lane. A fourth short lane at the right end holds the plate puck. Time scale: plan length maps to the rail length with 20% spare at the right. A 7-minute plan on 55 cm gives about 7.6 s per cm, so a 25 s slip moves a puck about 3.3 cm.
- Pucks: rounded boxes, 5 cm wide, 2 cm tall, length = duration divided by scale with a 4 cm minimum. Under 200 triangles each. Station accent colour, step label on top (0.7 cm), a lock glyph on pinned pucks.
- Bodies: dynamic `BodyComponent` boxes resting on the trough under default gravity, friction high, bounciness 0, damping tuned so motion settles in under 0.6 s. Physics world settings: `simulationRate` 240 and a relative speed limit of about 100 cm/s because colliders under 10 cm tunnel at the default rate.
- Drive: each puck has a kinematic target x computed from the DAG schedule. A scripted spring applies velocity toward the target. Nothing writes a dynamic body's transform directly.
- Lateness: an active task that has not been marked done grows its collider and mesh to the right every frame (remaining duration grows). Within its lane it pushes the next puck physically. Across lanes, DAG dependencies are one-way tethers evaluated each physics tick: if a downstream puck's left edge is earlier than the upstream puck's right edge, an impulse pushes it right. The existing conduit visuals draw these tethers.
- Pinned tasks: a task whose heat is on and whose policy is user-decision (the sear) becomes a static collider. A dynamic puck contacting it raises `HEAT_GUARD`.
- Read-back: puck displacement is converted to seconds and applied to the DAG with a 0.5 cm dead zone and at most one schedule update per 250 ms, which prevents oscillation. The DAG remains the single authority and sends new targets back.
- Now bead: a luminous bead travels along the rail with time. A task should start when the bead reaches its puck. A ghost tick marks the original finish when the plate puck slides.
- Why it is not a gimmick: pucks move themselves. The cook touches the rail only for the "dinner is late" re-plan. Contacts occur only when the schedule actually conflicts, so collisions are information, not decoration.

### S6. Re-plan grab

- Spec: the plate puck carries SIK `InteractableManipulation` constrained to its lane. On grab the body becomes kinematic; on release it becomes dynamic again with the release velocity. Sliding right asks the DAG for a later plating target; wait-before-start tasks glide right, fixed-duration tasks keep their length, the pinned sear stays and its ring shows "Hold at low heat." Sliding left compresses the chain; the physics shows the infeasible squeeze, the rail flashes coral and the pucks spring back to the minimum feasible plan.
- LEAF: `replan-grab-scenario`.

### S7. Cook engine on claimed spots

- Spec: `CookLayout` places burner vessels on the claimed burners, the board items on the claimed board, service ware on the plate, and tools within 12 cm of their first-use vessel. The collision check runs against claimed geometry. A third burner uses the warm spot. The dynamic bench slab is ghosted. All Cook steps feed the same rail and station targets as the legacy dishes.

### S8. Hidden Director palette

- Spec: the SIM and debug controls (inject +25 s, 10x warp, reset, quick claim, show ghosts, forget kitchen, rehearsal mode) move to a palette that opens by hold-pinching the plate target for 1.5 s, by palm tap on device, or by key D in the Preview. It is never shown in the video except for the warp caption. Keyboard shortcuts 1 to 0 remain for LEAF and development.

### S9. Device-only sensing paths, compiled and guarded

- Spec: camera capture through `CameraModule` on device feeds the existing image request builder in `RapidRouterVisionService.buildRequestBody` and passes through `ProposalGate`. Depth-grounded label placement follows the depth-cache pattern. Both are guarded by `isEditor()` and documented as "feel unproven." The video does not depend on them.

### P1. Record in a room, not a void

- Switch the Preview source to Sunlit Room (or Colorful Home), keep SPECS 27 simulation, stand about 80 cm from the table, pitch about -30°. Set the pose with `MovePreviewCamera` and write the numbers into the README.

### P2. Prove world lock on camera

- A 5-second orbit after claiming. No cuts during the orbit.

### P3. Captions answer the judges' questions

- Three captions, each under six words, appear once: "Uses what you look at", "Lives on your counter", "Hands free, eyes up." A fourth labels stand-ins: "Ghost pans stand in for real ones."

### P4. Proof segment under 15 seconds

- Brief, CLAD and MCP evidence, LEAF count with the true number, honest limits.

### P5. No typed interaction on screen

- Every action in the video is a pinch or a grab. Keys are used only off camera to set up.

---

## Part E. Architecture

### E1. Scene hierarchy (target)

```
Camera Object            DeviceTracking, World mode (unchanged)
SpectaclesInteractionKit (unchanged)
Lighting                 (unchanged)
KitchenAnchorRoot        pose from claims or anchors
├── Stations
│   ├── Station_BurnerL  AnchorComponent on device; chrono ring, heat ring, ghost vessel, target
│   ├── Station_BurnerR  same
│   ├── Station_Board    cut ticks, ghost board, target
│   ├── Station_Plate    convergence ring, ghost plate, target (Plate / Name a dish)
│   └── Station_Warm     optional, created on demand
├── ScheduleRail         trough, lanes, pucks, now bead, plate lane, ghost ticks
├── Conduits             DAG edges (reuses DAGCounterConduit)
├── StationsRoot         legacy dish 01 to 06 props, re-parented, slab hidden
└── CookStageRoot        Cook engine bench, placed on claimed spots, slab ghosted
ClaimReticle             visible only while claiming
AttentionDirector        beacon plus spatial audio
DirectorPalette          hidden debug and simulation controls
DishStudio               unchanged
LEAF bridge objects      unchanged
```

### E2. Components: new, changed, unchanged, removed

| Component | Disposition | Notes |
|---|---|---|
| `KitchenAnchorRoot` controller | New | Owns the root pose, re-parenting, slab visibility |
| Claim controller | New | Reticle, hit test session, validation, undo, device classification |
| Persistence bridge | New | Anchors on device, persistent storage in editor |
| Station target | New | One UIKit button per station, three states |
| Hand-zone sensor | New | Nearest station, dwell, editor fallback |
| Attention director | New | Priorities, chime, beacon reuse |
| Schedule rail, rail puck, rail adapter | New | Physics trough, bodies, DAG read-back |
| Ghost materializer | New | Alpha material swap, timed visibility |
| Technique preview player | New | Plays one primitive or action once |
| Director palette | New | Replaces the dock's SIM and AUTO groups |
| `MiseFlowSpatialUI` | Changed | Remove dock from product, replace pills, use live head pose, route events |
| `DAGCounterConduit` | Changed | Draws the cross-lane tethers and the drift pulse as a contact flash |
| `DiegeticChronoRing`, `ConcentricThermalRing` | Changed | Align to hit normal, flush, lifted 0.3 cm |
| `ChoreographyDAG` | Unchanged core | Gains the rail adapter hook and a lateness input |
| `GazeEdgeBeacon` | Changed | Driven by the attention director, gains audio |
| `VisionScanStandIn`, `ProposalGate` | Role change, unchanged gate | Stand-in becomes the claim recognizer |
| `CookStage`, `CookLayout`, `CookBenchPlan` | Changed | Claimed-spot placement, ghosted slab |
| `CookStepCard`, `StepEngine` | Changed | Content moves into station targets |
| `AutoCookController`, kinematic primitives, Cook actions | Demoted | Technique previews and rehearsal mode |
| `DishStudio`, `SpatialBriefingDeck`, `PlanLibrary`, generators, shape recipes | Unchanged | Entry moves to the plate target |
| Keyboard shortcuts | Kept, hidden | LEAF and development only |
| Director dock | Removed from product | Lives on as the hidden palette |

### E3. Event flow

Events on the existing `MiseFlowEventBus`: `STATION_CLAIMED`, `KITCHEN_RECALLED`, `HAND_AT_STATION`, `HAND_LEFT_STATION`, `STEP_STARTED`, `STEP_DONE_PINCHED`, `TASK_LATE`, `PUCK_DISPLACED`, `HEAT_GUARD`, `ALERT_RAISED`, `ALERT_RESOLVED`, `REPLAN_REQUESTED`, `OPEN_DISH_STUDIO`, `PALETTE_REQUESTED`.

Authority: the DAG computes the schedule. The rail adapter translates schedule to puck targets and displacement back to seconds. Station targets and rings render DAG state. The hand-zone sensor and the targets are the only inputs in product use.

### E4. Platform branching

One function decides: `global.deviceInfoSystem.isEditor()`. Editor: storage stand-in, interactor hit point for hands, quick claim available, ghosts on, keys enabled. Device: anchors, hand data, world-mesh classification, camera path, palm tap for the palette.

### E5. Budgets

| Budget | Limit |
|---|---|
| Triangles per dish world | 7,500 (existing cap) |
| Rail geometry | 600 |
| Puck | 120 each, 14 pucks maximum |
| Ring | 300 each |
| Dynamic bodies | 16 |
| Physics worlds | 1 |
| Alerts | 1 at a time, 1 chime per 8 s |
| Open cards | 1 per station |

---

## Part F. LEAF test plan

Existing 24 scenarios stay. `station-setup-scenario` is updated to the anchored hierarchy. `prep-drift-resolver-scenario` keeps the injected path through the palette for determinism and gains a natural-lateness variant. New scenarios:

| Scenario | Drives | Asserts |
|---|---|---|
| `claim-stations-scenario` | Puppet pinch at four table positions | Four stations under the root, y within 1 cm of the surface, normals within 15° of up, spacing at least 18 cm |
| `kitchen-recall-scenario` | Claim, then relaunch or call recall | Stations restored within 0.5 cm, claim UI not shown |
| `rail-forms-scenario` | Load dish 01 | Puck count equals task count, lengths equal duration times scale within 5%, sear puck static |
| `rail-drift-contact-scenario` | Do not pinch Done for prep, advance time | Prep puck longer, sauce puck moved by at least the slip times scale minus tolerance, DAG sauce start plus 25 s within 2 s, plate puck moved, ghost tick exists, chronometer text changed |
| `pinned-sear-heat-guard-scenario` | Push chain reaches the sear puck | Sear puck position unchanged within 0.2 cm, `HEAT_GUARD` raised, coral ring enabled, hint contains "hold" |
| `replan-grab-scenario` | Drag the plate puck +15 cm then -15 cm | Plating target later by the right seconds, wait tasks moved, sear unchanged, then infeasible flag, pucks within 1 cm of the feasible minimum |
| `hand-zone-target-scenario` | Puppet pinch-hold 10 cm from the board, then move away | Target Open within 0.5 s, collapsed 5 s after leaving |
| `attention-chime-beacon-scenario` | Simulated camera yaw 40°, raise a skillet alert | Beacon visible, chime played once, repeat after 8 s, resolved on turning back |
| `single-ui-invariant-scenario` | Load dish 02, then chicken 65 | Both produce targets and a rail, no dock object enabled, no legacy pills |
| `fov-budget-scenario` | Steady state | All enabled UI within the 50 x 35 x 20 cm band, nothing parented under the camera, labels yaw with a simulated camera move |
| `ghost-preview-scenario` | Start a step | One preview plays at most 2.5 s then disables, ghost alpha under 0.4 |
| `cook-on-claimed-spots-scenario` | Chicken 65 | Vessels within 2 cm of claimed burners, board items on the board, tools within 12 cm of first use |

Done criteria without a test must be listed in the brief as "no test" with the reason.

---

## Part G. Build sequence with gates

Every stage ends with: zero TypeScript errors, clean logs from `RunAndCollectLogsTool`, a `CaptureRuntimeView` screenshot, and the named LEAF scenarios passing one at a time. The demo is better than v6 at every gate.

| Stage | Work | Gate | Demo holds? |
|---|---|---|---|
| 0 Baseline | Branch `v7-spatial`. Switch Preview to Sunlit Room, SPECS 27. Verify World Query and world-mesh hits in the Preview. Record the camera pose. Run the 24 scenarios. | 24 pass. Hit test verified or fallback chosen. | v6 in a room |
| 1 Root and head pose | Kitchen anchor root, re-parent both engines, live billboarding. | 24 pass. Orbit shows labels following. | Placed, head-aware |
| 2 Claim and memory | Claim controller, persistence bridge, device anchor path guarded. | `claim-stations`, `kitchen-recall`. | Placed, remembered |
| 3 Targets and palette | Station targets replace pills and step cards. Dock becomes the hidden palette. Plate target opens Dish Studio. | `single-ui-invariant`, `fov-budget`, updated `station-setup`. | One product, big targets |
| 4 Hands and attention | Hand-zone sensor, attention director, chime asset. | `hand-zone-target`, `attention-chime-beacon`. | Sensed, called |
| 5 Rail v1 | Trough, lanes, pucks, physics settings, DAG adapter, lateness growth, tethers, pinned sear. | `rail-forms`, `rail-drift-contact`, `pinned-sear-heat-guard`. | The hero exists |
| 6 Re-plan | Plate puck manipulation, infeasible spring-back. | `replan-grab`. | The hero is tactile |
| 7 Ghosts and previews | Ghost materializer, technique previews, Cook engine on claimed spots, real-size vessels. | `ghost-preview`, `cook-on-claimed-spots`, existing cook scenarios. | Overlay reads on video |
| 8 Device paths | Hand data, classification, camera capture, depth placement, all guarded. | Compiles, no editor regressions. | Unchanged in Preview |
| 9 Ship | Brief v7 section, README, submission text, video, push. | Part I checklist complete. | Submitted |

If time runs out, cut from the bottom. Stages 0 to 3 already turn the diorama into a placed, remembered, head-aware overlay with one UI. Stage 5 is the hero.

---

## Part H. Demo storyboard (under 2:55)

| Time | Act | On screen | Caption or line |
|---|---|---|---|
| 0:00 to 0:12 | Hook | Sunlit Room, empty table, hands visible | "Recipes are lists. Cooking is a schedule. MiseFlow puts the schedule on your counter." |
| 0:12 to 0:40 | Claim | Four pinches on the table, rings flush, ghost pans at real size, 5-second orbit | "Pinch your burners, board and plate once." Caption: "Lives on your counter" |
| 0:40 to 1:05 | Mise | Rail unrolls, pucks glide, now bead moves. Hand to the board, dot opens, pinch Done, prep puck locks | Caption: "Uses what you look at" |
| 1:05 to 1:45 | Hero | Stay at the board. Prep puck grows, pushes the sauce puck, hits the pinned sear, coral contact, Heat Guard ring, "Lower to hold", plate puck to 07:05 with a ghost tick at 06:40 | "You are late. The kitchen noticed." |
| 1:45 to 2:05 | Re-plan and attention | Grab the plate puck two minutes later, upstream pucks glide, sear stays. Turn away, chime, arrow, turn back | "Dinner is late? Push it." Caption: "Hands free, eyes up" |
| 2:05 to 2:30 | Any dish | Plate target, Name a dish, chicken 65 from the library, equipment lands on the claimed spots, one deep-fry technique preview, rail re-forms | "Name any dish. It lands on your kitchen." |
| 2:30 to 2:42 | Memory | Refresh the Lens, stations return without re-claiming | "It remembers your kitchen." Caption: "Ghost pans stand in for real ones" |
| 2:42 to 2:55 | Proof | Brief, CLAD and MCP, LEAF count, honest limits | "Planned with plan-lens, built with CLAD, verified by LEAF." |

Recording checklist: camera pose set and logged, Reset pressed, zero TypeScript errors, clean log, 1080p at 60, voice only or license-clean generated music, no keys on camera.

---

## Part I. Documentation and compliance tasks

- [ ] Append a "v7" section to `devpost/design-brief.md` in the owner's words covering the spatial moment, placement, hands, when things show, done criteria, stand-ins and risks. Keep the v6 history. Mirror to `Miseflow/devpost/design-brief.md`.
- [ ] README: v7 flow, Preview environment and camera pose, hidden palette, true model id, true scenario count, honest limits, one sentence on template origin.
- [ ] `devpost/submission-draft.md`: what, who, features, learned. Honest table of real versus stand-in versus device-only.
- [ ] `PROJECT_STATUS.md`: update after each gate.
- [ ] Push every commit. Verify the repository is public and the `devpost/` folder is present.
- [ ] Video under 3:00, public on YouTube, link in Devpost.
- [ ] Secret scan before every push.

---

## Part J. Honesty table (what is real where)

| Capability | Preview | Device |
|---|---|---|
| Placement by pinch on a surface | Real (World Query or world-mesh hit) | Real, with Table classification |
| Kitchen memory | Stand-in (persistent storage), labelled | Real (Spatial Anchors), untested |
| Head-aware labels | Real | Real |
| Hands at stations | Stand-in (interactor hit point, puppet hand), pinch fallback | Real hand tracking, untested |
| Lateness drift | Real (time against the plan) | Real |
| Rail physics and contacts | Real | Real, performance untested |
| Re-plan grab | Real | Real |
| Chime and arrow | Real | Real |
| Ghost pans | Stand-in for real cookware, labelled | Hidden in steady state |
| Vision on the pan | Not shown | Guarded path, untested |
| Voice and keyboard entry | Notice shown, chips and text path | Real |
| Live Chef Director plan | Works with a key, not on the demo path | Works with network |

---

## Part K. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| World Query returns nothing in the simulator | Medium | Stage 0 verifies. Fallback to world-mesh raycast, then to a Lens-provided counter plane |
| Physics jitter on camera | Medium | Rate 240, speed limit, dead zone, update throttle, damping; pucks never set transforms directly |
| Tunnelling of small pucks | Low with rate 240 | Lips on the trough, speed limit, 4 cm minimum length |
| Hand-zone stand-in feels fake in the video | Medium | Show the pinch fallback too; caption the stand-in |
| Scope creep from two engines | High | Stage 3 forces one UI before any physics work |
| LEAF plugin slowness | Known | One scenario per run, batch verification per stage |
| Brief and build diverge | High | Part I task is a gate, not an afterthought |
| Anchor API behaviour on device | Unknown | Guarded path, labelled "feel unproven" |
| Video over three minutes | Medium | Storyboard budgeted at 2:55 with a 5 s margin |

---

## Part L. Judge scoring rationale

| Criterion | How v7 earns it |
|---|---|
| Design | One journey: claim, cook, get pushed, re-plan, plate. One target per station. Information on the burner, the board, the plate and the counter. Shows when needed. Comfortable distances and arm height. |
| Technical implementation | World Query or world mesh, anchors with an editor stand-in, SIK hands and manipulation, UIKit targets, physics bodies and contacts bound to a real scheduler, spatial audio, CLAD and MCP throughout, LEAF on every criterion. |
| Innovation | The schedule as a physical object whose collisions are dependencies and whose pinned puck is the pan on heat. Lateness sensed, not typed. Better than a phone by construction. |
| Presentation | A room, a claim, an orbit, a collision, a grab, a chime, a recall, a proof, in under three minutes, with captions that answer the organizer's questions. |

---

## Part M. Instructions for the builder agent

1. Read this file, `devpost/design-brief.md`, `PROJECT_STATUS.md`, `Miseflow/AGENTS.md` and the CLAD router skill before touching the scene.
2. Work stage by stage from Part G. Do not start a later stage before the gate passes.
3. Scene edits go through `VirtualScene` and `scene-graphql` first, `ExecuteEditorCode` only for bulk or Editor-API-only work. Never raw HTTP.
4. New scripts are self-contained TypeScript components with no Inspector inputs unless the asset cannot be created in code. Create objects and attach components at runtime from one bootstrap, as `MiseFlowSpatialUI.ensureHeroComponents` already does.
5. Bind SIK, hand and gesture subscriptions inside `OnStartEvent`. Start hit-test, camera and depth sessions in `OnStartEvent`.
6. Branch on `global.deviceInfoSystem.isEditor()` exactly once per capability in the bridge components. Keep device paths compiled.
7. Turn on physics debug draw while authoring the rail. Turn it off before the gate screenshot.
8. After every edit: `RecompileTypeScriptTool`, `RunAndCollectLogsTool`, `CaptureRuntimeView`, then the stage's LEAF scenarios one at a time.
9. Never modify dish 01 content, the not-found string, the confidence floor, the provider, or the secrets flow.
10. Report each gate with: scenarios run and results, triangle and body counts, a screenshot, and what remains unproven.
11. Commit only when the owner asks. Diff `Scene.scene` before staging.

---

## Part N. Open decisions for the owner

1. Keep the "Name a dish" act in the video, or spend those 25 seconds on a longer hero sequence?
2. Four claimed stations by default, or five with the warm spot always present?
3. Sunlit Room or Colorful Home for the recording?
4. Anthropic stays the only provider (default yes). Remote Service Gateway is noted as the platform alternative and is out of scope unless you say otherwise.
5. Should the brief be re-run through `plan-lens` as a fresh interview, or appended with a v7 section in your words? Appending is the proposal.

---

## Part O. Rejected ideas and why

- Add gravity to the food: a toy, not a tool. Physics belongs to the schedule, where contacts mean something.
- Drop the existing counter onto the preview table and call it placement: still a dollhouse, still one UI per engine.
- More AI calls: not rewarded by the rubric, slow, and a key risk.
- Voice commands as the primary input: do not work in the Preview and are discouraged for commands by the ASR guidance.
- A bigger HUD: the exact anti-pattern on the organizer's slide.
- Two-cook colocated kitchen: cannot be shown convincingly in the Preview.
- Ghost replay of a previous cook: persistence theatre without a kitchen to replay in.
- Heat-safety hand guard: valuable on device, invisible in the Preview. Candidate for after the hackathon.

---

## Part P. Glossary

- Claim: a pinch on a real surface that assigns a station role to a spot.
- Station: a claimed spot with a role: left burner, right burner, board, plate, warm.
- Target: the one big button each station owns.
- Rail: the physics trough along the counter that holds the task pucks.
- Puck: a rigid body representing one task. Length is duration. Position is time.
- Pinned puck: a static puck for a task on heat that must not be moved silently.
- Tether: a one-way dependency push between pucks in different lanes.
- Now bead: the marker that travels along the rail with elapsed time.
- Ghost: a translucent prop standing in for real cookware.
- Stand-in: an honest replacement for a capability the Preview cannot show.
