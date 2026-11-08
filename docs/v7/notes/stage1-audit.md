# MiseFlow v7, Stage 1 audit: KitchenAnchorRoot + live head-pose billboarding

Read-only audit, 8 Nov 2026. Nothing under `Miseflow/Assets` was changed, no recompile, no preview refresh.
All paths below are relative to `Miseflow/Assets/` unless stated. Line numbers are from the working tree at audit time.
Units cm, right-handed, identity camera faces -Z.

Terms used below:
- **P0 (default pose)**: the KitchenAnchorRoot pose that reproduces today's world exactly (see section 2).
- **Moved pose**: any other KitchenAnchorRoot pose (a claimed or recalled kitchen). Stage 1 only has to keep P0 pixel-identical, but every consumer is graded for the moved case too, because Stage 2 will move the root.
- **SAFE**: the code uses local coordinates, or world coordinates measured relative to the live transforms.
- **COSMETIC**: works, but a yaw-dependent detail comes out wrong when the root is yawed.
- **BREAKS**: the result is wrong or doubled, or a test assertion gets weaker without failing.

---

## 1. Every reference to StationsRoot / CookStageRoot / the stations, and how each reacts

### 1a. How things are found (name lookups)

| file:line | what | P0 | moved | note |
|---|---|---|---|---|
| Scripts/AutoCookController.ts:212-213 | walks up to "StationsRoot", falls back to self | SAFE | SAFE | component lives under StationsRoot/DiegeticLayer |
| Scripts/DishBlueprintApplier.ts:74 | walks up, **no name check** after the loop | SAFE | SAFE | would return KitchenAnchorRoot if ever hosted outside StationsRoot |
| Scripts/AI/VisionScanStandIn.ts:204-207 | walks up, **no name check** | SAFE | SAFE | same caveat |
| Scripts/KineRegistry.ts:160-164 `stationsRootOf` | walks up, name-checked | SAFE | SAFE | |
| Scripts/LadleOrbitalStir.ts:111-112, PanTossRoll.ts:174-175, PlatingFinisher.ts:205-208, SpatulaTechniqueGuide.ts:274-277, StepEngine.ts:243-245 | walk up, name-checked | SAFE | SAFE | |
| Scripts/DishStudio.ts:611-613 `findUp(.., "StationsRoot")` | walk up | SAFE | SAFE | |
| Scripts/MiseFlowButtonTrigger.ts:151 `findInScene("StationsRoot")` | full recursive search | SAFE | SAFE | |
| Scripts/GazeEdgeBeacon.ts:22-29, 194 `findInScene("SkilletStation")` | full recursive search | SAFE | SAFE | |
| Scripts/Cook/CookMockWorld.ts:59-60, 431 | full recursive search | SAFE | SAFE | |
| Scripts/Cook/CookStage.ts:1072-1078 `findSceneObject` | search **depth limited to 4** from each root | SAFE | SAFE | StationsRoot moves from depth 0 to depth 1. It breaks if a future "Stations/" layer pushes it deeper than 4 |
| Scripts/StationPropsBuilder.ts:1272-1274 | `findByName(root, ...)` for the three stations | SAFE | SAFE | relative to StationsRoot |
| Scripts/ToolGenerators.ts:1016, 1022; VesselGenerators.ts:704, 728, 736, 803 | station lookup under the StationsRoot subtree | SAFE | SAFE | |
| Scripts/SpatulaFlipRig.ts:284 | `findByName(stationsRoot, "SkilletStation")` | SAFE | SAFE | |
| Tests (LEAF `findSceneObjectByName`, recursive over all roots: Leaf.lspkg/Utils/common/Utils.ts:173-208) | StationSetupScenario.ts:11,15,19,23; CookPlanDishScenario.ts:52; AutoCookFullFlowScenario.ts:64; DishStudioFlowScenario.ts:59; MultiDishAutoCookScenario.ts:50; ProposalGateRejectionScenario.ts:25,47; SpatulaFlipGuideScenario.ts:25; UniversalDishPageTableScenario.ts:45; MiseFlowLeafInteractor.ts:30 | SAFE | SAFE | names survive re-parenting. Do not create any second object named StationsRoot / *Station |
| Tests/CookPlanDishScenario.ts:14-17 `sceneHas()` | checks **root objects only** (`getRootObject(i).name`) | SAFE | SAFE | **Silent trap:** line 114 asserts `CookLoadingPanel` is absent. If someone re-parents CookLoadingPanel under KitchenAnchorRoot, the assertion passes for the wrong reason. Keep CookLoadingPanel, CookStepCard, CookItemLabels, DishStudioRoot and the briefing/loading panels at scene root |

### 1b. Code that writes or reads absolute world poses of the setup

| file:line | what | P0 | moved | verdict |
|---|---|---|---|---|
| Scripts/StationPropsBuilder.ts:1263-1265 | `upgradeAllStations()` (OnStart) does `root.setLocalPosition(0,-17.5,-76)` on StationsRoot | SAFE only if the parent is at world identity | **BREAKS**: under a parent at P0 (0,-17.73,-76) the offset is applied twice (counter at z=-152) | **must edit** (see 2) |
| Scripts/StationPropsBuilder.ts:581-602 | layout constants in the StationsRoot frame (slab top y=-0.23) | SAFE | SAFE | defines the kitchen-frame offset (0,+0.23,0) |
| Scripts/Cook/CookStage.ts:1013-1018 | `CookStageRoot` created **at scene root**, copies StationsRoot world pos+rot once at `enter()`, and falls back to the constant (0,-17.5,-76) | SAFE | **BREAKS** (requirement): the bench does not follow a later `setPose`, and it is not under the kitchen root | **must edit** |
| Scripts/Cook/CookStage.ts:587 `toWorld`, 765, 828, 852, 937-940 | Cook world built in CookStageRoot-local, world caches taken after the build | SAFE | SAFE if the pose does not change during a cook; `restPos`/`homePos` are world caches, so a `setPose` mid-cook leaves tools homing to old world points | document: `setPose` while Cook active needs a re-cache or must be refused |
| Scripts/Cook/CookStage.ts:852 `+vec3(0,0.25,0)`, Cook/Actions/CookActionKit.ts:751, CookFlatAction.ts:74-75, FlatFryKit.ts:163-207 | world-up offsets and arcs | SAFE | SAFE for a gravity-aligned (yaw-only) root, BREAKS under tilt | KitchenAnchorRoot must strip pitch/roll |
| Scripts/Cook/CookMockWorld.ts:429-440 | mock bench copies StationsRoot world pose; fallback constant (0,-6,-62) | SAFE | SAFE | test-only path |
| Scripts/GazeEdgeBeacon.ts:284-297, 346-359 | camera and SkilletStation world positions, beacon placed in camera space each frame | SAFE | SAFE | fallbacks (0,25.1,-21.4) and (-11.2,-17.7,-77.5) are used only if the objects are missing |
| Scripts/PlatingFinisher.ts:591-592 | sauce pool `setWorldRotation(angleAxis(25 deg, up))` and world offsets +0.3/+0.45 | SAFE | COSMETIC (pool yaw and offset ignore the kitchen yaw) | optional fix: pre-multiply by the StationsRoot world rotation |
| Scripts/PlatingFinisher.ts:594-595, 601, 618, 628 | streak yaw from the world salmon axis (relative, fine); flakes `rest` random yaw; steam `setWorldRotation(identity)` | SAFE | SAFE / COSMETIC | |
| Scripts/PantryGenerators.ts:1806-1812 | `setWorldRotation(angleAxis(yawDeg, up))` with a slot yaw that is defined in the StationsRoot frame | SAFE | COSMETIC (pantry props mis-yawed by the root yaw) | fix: `stationsRootWorldRot.multiply(angleAxis(yaw))` |
| Scripts/PantryGenerators.ts:554-567, 889, 1392-1404 | world arcs with world-up lift | SAFE | SAFE (yaw-only) | |
| Scripts/LadleOrbitalStir.ts:135,145; VesselGenerators.ts:495,516-538 | rest rotation captured at the start of each motion, world-up lift | SAFE | SAFE (yaw-only) | |
| Scripts/NoodleLiftToss.ts:221, PanTossRoll.ts:188,227, RiceDumLayer.ts:251, PantryChoreographer.ts:290-291, SpatulaTechniqueGuide.ts:300-318 | world scale / inverse-world conversions | SAFE | SAFE | KitchenAnchorRoot scale must stay 1 |
| Scripts/DishStudio.ts:202-230, 282 | hides the setup by setting the StationsRoot **local** scale to HIDDEN_SCALE and restoring it later | SAFE | SAFE | must keep targeting StationsRoot, **never** KitchenAnchorRoot (CookStageRoot must stay visible) |
| Scripts/AI/SpatialSlotAllocator.ts:8-12, 103-129 | slots in StationsRoot / station frames | SAFE | SAFE | |
| Scripts/StudioCardKit.ts:198-230 `placeInView` | camera-relative modal placement (DishStudio, CookStepCard:360, CookLoadingPanel:92, DishRevealDirector:379) | SAFE | SAFE | modal moments are allowed by D9; leave them as they are |
| Tests/CookPlanDishScenario.ts:128, DishStudioFlowScenario.ts:79, UniversalDishPageTableScenario.ts:79,94 | `StationsRoot.getWorldScale().x < 0.01` | SAFE | SAFE | needs the KitchenAnchorRoot scale to be 1 |
| Tests/CookPlanDishScenario.ts:53,245-246; DishStudioFlowScenario.ts:71,87,201; UniversalDishPageTableScenario.ts:56,127 | StationsRoot local scale restored | SAFE | SAFE | |
| Tests/CookPlanDishScenario.ts:135-142, 191-198, 224-233 | CookStageRoot inverse-world checks and `up.y >= 0.7` (world up) | SAFE | SAFE (yaw-only), BREAKS under tilt | |
| Tests/GazeWayfindingBeaconScenario.ts:33-69 | yaw relative to `getTargetYawDeg()` | SAFE | SAFE | |
| Tests/AssetGalleryScenario.ts:33-66, ShapeGalleryScenario.ts | own root at an absolute world point (150,-10,0) | n/a | n/a | independent of the kitchen |
| Assets/Scene.scene (StationsRoot block near line 4014) | authored local (-1.5,-24,-76), overwritten at OnStart by StationPropsBuilder.ts:1265 | n/a | n/a | do not hand-edit (the LEAF plugin rewrites it) |

### 1c. Head-pose (camera constant) consumers: see section 3. All of them BREAK in the moved case (labels face a camera that is not there) and are only approximately right in the Sunlit Room preview.

---

## 2. How StationsRoot is created today, and the safe re-parent

**Today:**
- `Scene.scene` root order: Camera Object (DeviceTracking), Lighting, SpectaclesInteractionKit, **StationsRoot**, LeafIndex, AiPreviewAgent Handler, LEAF Plugin Bridge.
- StationsRoot components in order: ChoreographyDAG, MetricPrepBlueprint, SpatialTransferArc, SpatialVisionInspector, StationInteractableController.
- Children: PrepBoardStation, SkilletStation, SaucepotStation, SpatialTransferArc, WristCommandPill, PlatingDebriefCard, DriftDecisionCard.

**Awake chain:**
- `SpatialVisionInspector.onAwake` (Scripts/SpatialVisionInspector.ts:32-39) creates StationPropsBuilder and MiseFlowSpatialUI on StationsRoot. Their `onAwake` runs inline.
- `MiseFlowSpatialUI.onAwake` (MiseFlowSpatialUI.ts:290-311) runs `ensureHeroComponents` (332-367: DiegeticLayer plus about 25 components, each with an inline onAwake), then `buildSpatialInterface` (517-535: pills, chrono, dock, banner, all parented to StationsRoot).
- StationInteractableController wakes after that.

**OnStart:**
- `StationPropsBuilder` (StationPropsBuilder.ts:1202-1204 then 1263-1292) sets the StationsRoot local position to (0,-17.5,-76), builds the slab `KitchenCountertopSurface` (1319-1329) and the props.
- Nothing reads the StationsRoot world pose before OnStart. The first world-pose readers are GazeEdgeBeacon (per frame), CookStage.enter (on COOK_PLAN_READY) and the motion kits (on demand).

**Kitchen frame:**
- The slab top is y=-0.23 in StationsRoot. The kitchen frame wants the counter plane at y=0, so StationsRoot sits at local **(0,+0.23,0)**, with identity rotation and scale 1, under KitchenAnchorRoot.
- **P0** = KitchenAnchorRoot world position **(0,-17.73,-76)**, identity rotation, scale 1. That gives StationsRoot world (0,-17.5,-76), which is exactly today's pose.
- Kitchen +X is StationsRoot +X: along the counter edge, from the skillet/left burner side toward the board/plate side.
- Kitchen +Z points toward the cook (the old camera sat at +Z 54.6).

**Why not re-parent inside onAwake:**
1. StationsRoot is still mid-awake (StationInteractableController has not woken yet).
2. Moving a root object out of the root list while the engine walks root objects can shift indices. That could skip LeafIndex, which is the next root. This behavior is not documented, so do not depend on it.
3. A later OnStart (StationPropsBuilder.ts:1265) would overwrite the local position anyway.

**Recommended order of operations:**
1. `MiseFlowSpatialUI.ensureHeroComponents` (MiseFlowSpatialUI.ts:332), as its **first** statement:
   - `KitchenAnchorRoot.ensure()` creates the scene-root object "KitchenAnchorRoot" at P0 and adds the KitchenAnchorRoot component (its onAwake runs inline).
   - It does **no** re-parenting.
   - Put the HeadPoseBillboard component on the same object, so it never collapses with StationsRoot.
2. `StationPropsBuilder.ts:1265`: replace the hard-coded local write with `KitchenAnchorRoot.placeStationsRoot(root)`.
   - When the parent is KitchenAnchorRoot, it writes local (0,0.23,0).
   - Otherwise it keeps the legacy (0,-17.5,-76).
   - So the OnStart write is correct whichever order OnStart and adoption run in.
3. `KitchenAnchorRoot` first `UpdateEvent` (one-shot `ensureAdopted()`). This runs after every OnStart and outside the root-iteration phase:
   1. Find StationsRoot with a recursive search.
   2. Return if it is already adopted.
   3. `stations.setParent(kitchenRoot)`. Plain `setParent` is fine because the local pose is written explicitly next. `setParentPreserveWorldTransform` (StudioLib.d.ts:14055) is the alternative, but it would keep the -0.23 offset only implicitly.
   4. `setLocalPosition(0,0.23,0)`, `setLocalRotation(identity)`, **keep the local scale** (DishStudio may have saved it).
   5. Assert that the world position is within 0.01 cm of (0,-17.5,-76) and log it.
   6. Emit `KITCHEN_ROOT_READY`.
   - At frame 1 nothing has rendered differently, so the change is invisible.
4. `CookStage.enter` (CookStage.ts:1013-1018): `root.setParent(kitchen.getRoot())`, then copy StationsRoot's **local** position and rotation (`kitchen.stationsLocalPose()`, which is (0,0.23,0) and identity).
   - Fallback when there is no kitchen root: the legacy world copy.
   - The Cook bench then follows `setPose` and sits beside StationsRoot, not inside it (DishStudio still scale-hides only StationsRoot).
5. Keep `KitchenAnchorRoot` out of every name-lookup collision: unique names `KitchenAnchorRoot` and `KitchenAnchorSlabProxy`, and no object named "Stations".

---

## 3. CAM_LOCAL / faceCamera consumers and the live billboarding design

### 3a. Inventory (all static: computed once at build time against the constant camera (0,42.6,54.6) in the StationsRoot frame)

| file:line | object | parent frame | today | Stage 1 mode |
|---|---|---|---|---|
| Scripts/MiseFlowSpatialUI.ts:71, 113-124 | `CAM_LOCAL`, `faceCamera`, `yawToCamera` | StationsRoot | constant | delete and replace with HeadPoseBillboard |
| MiseFlowSpatialUI.ts:604 | `SkilletStationUI`, `SauceStationUI`, `PrepStationUI` pill roots (3) | StationsRoot | yaw + pitch to the camera | YAW + fixed pitch |
| MiseFlowSpatialUI.ts:658 | `<pill>_Stem` leaders (3), with the `_StemFoot` child | StationsRoot | yaw only | YAW, pitch 0 (stays vertical) |
| MiseFlowSpatialUI.ts:722 | `PlateAnchorUI` chronometer | StationsRoot | yaw + pitch | YAW + fixed pitch |
| MiseFlowSpatialUI.ts:777 | `DirectorPaletteUI` dock (SIK buttons) | StationsRoot | yaw + pitch | YAW + fixed pitch, deadband 6 deg, frozen while a button is hovered or pressed (MiseFlowSpatialUI.ts:1480-1488 warns that moving colliders mid-press drops events) |
| MiseFlowSpatialUI.ts:919 | `ChefVoiceBannerUI` | StationsRoot | yaw + pitch | YAW + fixed pitch |
| Scripts/StepEngine.ts:50-67, 518 | `StepCard` (re-faced on every step) | StationsRoot (via DiegeticLayer) | own copy of CAM_LOCAL | register once; drop the call at 518 |
| Scripts/DAGCounterConduit.ts:110-120 | `DIRECTOR_CAM_LOCAL`, `faceDirectorCamera` (exported) | StationsRoot | constant | keep the export as a thin wrapper over `HeadPoseBillboard.facing()` for compatibility |
| DAGCounterConduit.ts:442 | `Conduit_LockLabel` | DiegeticLayer | static | YAW + fixed pitch |
| Scripts/AI/VisionScanStandIn.ts:326-329 | `VisionScanReticle_Conf` | reticle root | static | YAW + fixed pitch |
| Scripts/SpatulaTechniqueGuide.ts:374-383 | `SpatulaCallout_Entry`, `SpatulaCallout_Roll` | SpatulaGuideRoot (position only) | static | YAW + fixed pitch |
| Scripts/SpatulaFlipRig.ts:698 | flip steam sprites (already updated per frame) | SkilletStation | `faceDirectorCamera(station local pos)` | call `HeadPoseBillboard.facing(obj)` inside the existing loop; do not register |
| Scripts/Cook/CookItemLabels.ts:219-248 | Cook name tags | scene root | already live: copies the **full** camera rotation | optional: switch to `facing()` for yaw-only consistency; not required for Stage 1 |
| GazeEdgeBeacon (346-359), placeInView users | camera-space HUD and modal panels | world | live | leave as is |

**Never billboard:**
- DiegeticChronoRing and ConcentricThermalRing.
- Burner arcs (StationPropsBuilder.ts:1340-1347).
- Conduit segments and convergence lines (DAGCounterConduit.ts:360-430).
- VisionScanReticle ring and brackets.
- FlipArcFrame.
- The slab, props and flush decals.

**Never parent anything to the camera.**

### 3b. Camera position each frame
- `import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"` (default export, `@Singleton`).
- Read `WorldCameraFinderProvider.getInstance().getWorldPosition()`. The method is at BaseWorldCameraProvider.ts:46.
- Call it lazily from the first LateUpdate and wrap it in try/catch. The constructor throws if the camera has no DeviceTracking (BaseCameraFinderProvider.ts:36-39); this project's camera has DeviceTracking.
- Fallback 1: `findSceneCamera()` (StudioCardKit.ts:178).
- Fallback 2: the constant (0,25.1,-21.4).
- Test hook: `setSimulatedCameraWorldPos(p | null)`, mirroring `GazeEdgeBeacon.setSimulatedCameraYaw`. The later fov-budget scenario needs it.

### 3c. Math, per entry, in a LateUpdateEvent (runs after camera tracking and all motion kits)

```
camW   = cameraWorldPos()                                   // once per frame
camL   = parentInvWorld(parent).multiplyPoint(camW)         // cached per parent per frame
d      = camL - obj.localPosition
yawT   = atan2(d.x, d.z)                                    // turns the +Z text normal toward the viewer
yaw    = yaw + wrapPi(yawT - yaw) * (1 - exp(-dt * 12))     // smoothing against device head jitter
if |wrapPi(yaw - lastWritten)| > 0.15 deg (dock: 6 deg):
   obj.setLocalRotation(quat.angleAxis(yaw, vec3.up()).multiply(quat.angleAxis(-pitch, vec3.right())))
```
- `-pitch` about +X tilts the face upward toward a viewer above. This is the same sign convention as the current `faceCamera` (MiseFlowSpatialUI.ts:113-119).
- **Fixed pitch:** `LABEL_PITCH_DEG = 14`. Stems use 0.
- The math is valid because every parent frame is gravity aligned: KitchenAnchorRoot is yaw-only, and stations and guide roots are only scaled or yawed.
- Skip entries that are disabled, and entries whose parent world scale.x < 0.01 (setup hidden by DishStudio). The inverse of a near-zero-scale matrix is ill-conditioned, and they are invisible anyway.
- First frame: snap with no smoothing. `register()` also snaps immediately, so build-time orientation is never stale.

### 3d. Cost
- About 14 registered objects: 3 pills, 3 stems, chrono, dock, banner, StepCard, lock label, vision label, 2 spatula callouts.
- Per frame: 1 camera read, 2-4 inverted-matrix reads (one per distinct parent), 14 × (multiplyPoint + atan2 + 2 angleAxis + 1 multiply).
- `setLocalRotation` runs only past the deadband.
- Well under 0.05 ms. No Canvas or text relayout is triggered by rotation.
- Do not register per-dash or per-segment objects.

### 3e. Readability at the two preview poses (StationsRoot frame)
- **Old Plane pose:** world (0,25.1,-21.4) looking at (0,-4.9,-73.4). Camera at (0,42.6,54.6).
  - Pill yaw is unchanged from today (for example skillet atan2(11.2,58.6) = 10.8 deg).
  - Today's pitch is about 31-33 deg. Fixed 14 deg leaves 17-19 deg off-normal, so the text height reads at cos 19 deg = 0.95. Readable.
  - The -30 deg chef pose (invariant 3) keeps working.
- **Sunlit Room** (start at origin, pitch about -12 deg): the camera is at (0,17.5,76) in the StationsRoot frame.
  - Pills (y about 6, z about -4) see the camera about 8 deg above, so they are 6 deg off-normal.
  - The counter is about 78 cm away and 13 deg below the horizon. That fits A2 (0.6-1.6 m, a little below eye level) and the -12 deg start pitch.
- **WASD orbit (D3 demo):** labels follow in yaw; rings stay flush.

---

## 4. Proposed API: `Assets/Scripts/KitchenAnchorRoot.ts` (+ `Assets/Scripts/HeadPoseBillboard.ts`)

Self-contained, built in code, no `@input`. Plain fields as tunables, following GazeEdgeBeacon.ts:106-117: "runtime-created components keep the first-compiled @input defaults".

```ts
export type SlabMode = "SOLID" | "FAINT" | "HIDDEN";
export type KitchenPoseSource = "DEFAULT" | "CLAIM" | "RECALL" | "LEAF";

@component
export class KitchenAnchorRoot extends BaseScriptComponent {
  static readonly ROOT_NAME = "KitchenAnchorRoot";
  static readonly DEFAULT_POS = new vec3(0, -17.73, -76);       // P0: StationsRoot world (0,-17.5,-76) unchanged
  static readonly STATIONS_LOCAL = new vec3(0, 0.23, 0);        // slab top (-0.23) -> kitchen y = 0
  static getInstance(): KitchenAnchorRoot | null;
  static ensure(): KitchenAnchorRoot;                           // creates scene-root object + component (idempotent)
  static placeStationsRoot(stations: SceneObject): void;        // used by StationPropsBuilder.ts:1265

  getRoot(): SceneObject;
  isAdopted(): boolean;
  ensureAdopted(): boolean;                                     // re-parent StationsRoot (first UpdateEvent)
  adoptCookStage(stageRoot: SceneObject): void;                 // used by CookStage.enter
  stationsLocalPose(): { pos: vec3; rot: quat };

  getPose(): { position: vec3; rotation: quat };
  setPose(position: vec3, rotation: quat, source?: KitchenPoseSource): boolean; // yaw-only: pitch/roll stripped;
                                                                // returns false if the tilt > 15 deg
  setPoseFromCounter(leftBurnerW: vec3, plateW: vec3, normalW: vec3, source?: KitchenPoseSource): boolean;
  resetPose(): void;                                            // back to P0 ("DEFAULT")

  worldToKitchen(p: vec3): vec3;     kitchenToWorld(p: vec3): vec3;
  worldDirToKitchen(d: vec3): vec3;  kitchenDirToWorld(d: vec3): vec3;
  kitchenYawToWorld(yawRad: number): quat;                      // fixes PlatingFinisher / PantryGenerators world yaws

  getSlabMode(): SlabMode;
  setSlabMode(m: SlabMode): void;    // default: isEditor() ? "FAINT" : "HIDDEN"
}
```

**Slab:** the targets are `KitchenCountertopSurface` (StationPropsBuilder.ts:1324) and `Cook_Bench` (CookStage.ts:611).
- Re-apply on `COOK_WORLD_READY`, because the bench is rebuilt per plan.
- HIDDEN: `RenderMeshVisual.enabled = false` (the object stays enabled, so names and children survive).
- FAINT: **clone** the material once (`rmv.mainMaterial.clone()`, because MAT_SLAB may be shared). Scale baseColor rgb by 0.4 (on an additive display, dimmer reads as more transparent) and set alpha 0.35 if the pass blends.
- SOLID: restore the original material.
- Open decision: FAINT is the only visual delta in Stage 1. If the gate demands a pixel-identical comparison, run that capture with SOLID first.

**setPose rules:**
- Refuse (and log) while CookStage is active or Auto Cook is running. The Cook `restPos`/`homePos` and the legacy kinematic rest poses are world caches.
- Alternatively, emit `KITCHEN_POSE_CHANGED` and let owners re-cache.
- Never scale the root.

**Events:** add these to `MiseFlowEventType` (MiseFlowEventBus.ts:7-69), with payload interfaces in the "v5 payloads" style, `// <Payload>` comments, string unions and optional legacy fields.
- `"KITCHEN_ROOT_READY"`: `{ rootName: string; adopted: string[] }`, where adopted is for example `["StationsRoot"]`.
- `"KITCHEN_POSE_CHANGED"`: `{ position: vec3; rotation: quat; source: KitchenPoseSource }`.
- `"KITCHEN_SLAB_MODE_CHANGED"`: `{ mode: SlabMode }`.
- Stage 2 later adds `STATION_CLAIMED` and `KITCHEN_RECALLED` (Plan E3). Reserve the names now; do not emit them.

**HeadPoseBillboard API (separate file):**
```ts
register(obj, { pitchDeg = 14, deadbandDeg = 0.15, smooth = 12, frozen?: () => boolean }): void
unregister(obj): void
facing(obj, pitchDeg = 14): quat
cameraWorldPos(): vec3
setSimulatedCameraWorldPos(p: vec3 | null): void
getRegisteredCount(): number
```
The component lives on the KitchenAnchorRoot object, with a LateUpdateEvent.

---

## 5. LEAF scenarios and invariants

**Scenario edits for Stage 1:**
- `station-setup-scenario` (Tests/StationSetupScenario.ts): keep every existing assert (lines 11-35) and add:
  - `StationsRoot.getParent().name === "KitchenAnchorRoot"`, and KitchenAnchorRoot has no parent.
  - StationsRoot world position within 0.05 of (0,-17.5,-76) at P0.
  - World scale of KitchenAnchorRoot is 1.
  - `KitchenCountertopSurface` exists, and its RMV is enabled in the editor (FAINT or SOLID).
  - No object under `Camera Object` other than the authored children (the D3 rule).
  - Billboard check: `setSimulatedCameraWorldPos(cam + 40 cm to the right)` changes the local yaw of `SkilletStationUI` by more than 5 deg within 0.5 s, its pitch stays 14 deg ±1, `SkilletArc`/burner arcs and `DiegeticChronoRing` rotations stay unchanged, and the test clears the hook in `finally`.
- `cook-plan-chicken65` / `-chapathi` / `-poori` / `-athirasam` / `-generic` (Tests/CookPlanDishScenario.ts): optional assert after line 119 that `world.root.getParent().name === "KitchenAnchorRoot"`. **Do not** move CookLoadingPanel (line 114 `sceneHas`).
- `dish-studio-flow`, `universal-dish-page-table`, `multi-dish-auto-cook`, `auto-cook-full-flow`: no edit; the scale asserts still target StationsRoot. Verify only.
- `gaze-wayfinding-beacon-scenario`, `spatula-flip-guide-scenario`, `proposal-gate-rejection-scenario` (asserts the `SkilletStationUI_Action` text): no edit; names unchanged. Verify only.
- The remaining scenarios (metric-blade, portion-dome, transfer-arc, time-warp-plating, prep-drift, step-engine, dish-biryani/noodles, live-ai-compile, shape/asset gallery): no edit.
- New scenarios (fov-budget and the rest) belong to later stages per Plan G. The Stage 1 gate is "24 pass" plus an orbit capture.

**todo.md "Hard invariants" touched:**
1. LEAF-asserted names. This stage moves `StationsRoot` and with it every asserted child: PrepBoardStation, SkilletStation, SaucepotStation, the three StatusLabels, LaserCutCurtain, VolumetricPortionDome, TransferArcTube, PlatingDebriefCard, DriftDecisionCard, Btn_*, EdgeBeacon_Left/Right, SpatulaGuideRoot, VisionScanReticle. Re-parent only; never rename. Strings are untouched.
2. Boot / Reset to dish 01: untouched, but `Btn_Reset` must not reset the kitchen pose. Keep pose reset as a separate `resetPose()`.
3. "-30 deg chef camera pose": billboarding must stay readable from it (3e).
4. Clean clone compiles with 0 TS errors: both new files must import only SIK and project modules, with no new keys.

Also from Plan A3:
- Scene.scene is rewritten by LEAF, so make no hand edits and diff it before committing.
- A recompile cancels a running scenario: compile only when the LEAF agent is idle.
- Run scenarios one at a time.
- SIK bindings belong in OnStart; HeadPoseBillboard's camera lookup is lazy in LateUpdate, which is compatible.

---

## 6. Implementation checklist (ordered)

1. `Scripts/MiseFlowEventBus.ts`: add the 3 event names and payload interfaces (section 4).
2. `Scripts/KitchenAnchorRoot.ts` (new): static `ensure`, `placeStationsRoot`; first-UpdateEvent `ensureAdopted`; pose, conversion and slab API; emit the events.
3. `Scripts/HeadPoseBillboard.ts` (new): registry, LateUpdate, the SIK camera with 2 fallbacks, the simulated-camera hook.
4. `Scripts/MiseFlowSpatialUI.ts:332`: first line of `ensureHeroComponents`: `const k = KitchenAnchorRoot.ensure();` and add HeadPoseBillboard to `k.getRoot()` if missing. No re-parenting here.
5. `Scripts/StationPropsBuilder.ts:1265`: replace with `KitchenAnchorRoot.placeStationsRoot(root)`. Update the comment at line 581.
6. `Scripts/Cook/CookStage.ts:1013-1018`: parent CookStageRoot to the kitchen root with StationsRoot's local pose; keep the legacy fallback. Update the comments at 963-964 and 1013.
7. `Scripts/MiseFlowSpatialUI.ts:68-71, 113-124, 604, 658, 722, 777, 919`: delete CAM_LOCAL, faceCamera and yawToCamera, and register each object.
   - Dock: `deadbandDeg 6` and `frozen: () => any directorButton hovered or pressed`.
   - Stems: `pitchDeg 0`.
8. `Scripts/StepEngine.ts:50-67, 518`: delete its CAM_LOCAL and faceCamera, register the `StepCard` once in the builder (around line 443), and remove the per-step `setLocalRotation`.
9. `Scripts/DAGCounterConduit.ts:110-120, 442`: make `faceDirectorCamera(pos)` a deprecated wrapper (for SpatulaFlipRig) and register the lock label.
10. `Scripts/AI/VisionScanStandIn.ts:329`, `Scripts/SpatulaTechniqueGuide.ts:377, 383`: register the labels. `Scripts/SpatulaFlipRig.ts:698`: use `HeadPoseBillboard.facing(s.obj)` per sprite.
11. Optional cosmetic fixes: `PlatingFinisher.ts:592` and `PantryGenerators.ts:1812`, using `kitchenYawToWorld` or the StationsRoot world rotation.
12. `Tests/StationSetupScenario.ts`: the additions from section 5. The scenario stays registered in LeafIndex.ts:29 (no index change).
13. When the LEAF agent is idle:
    1. RecompileTypeScriptTool (0 errors).
    2. RunAndCollectLogsTool (look for the adoption log line, and no `[MiseFlowEventBus] Error`).
    3. Run the 24 scenarios one at a time.
    4. MovePreviewCamera on the old pose and on the Sunlit Room pose, CaptureRuntimeView for each.
    5. A short WASD orbit check.
    6. Diff Scene.scene.

## 7. Risks: what could silently break

- **Double offset:** step 5 is forgotten, so the setup jumps 76 cm away. No LEAF test checks the world position today; only the new station-setup assert would catch it.
- **Root-iteration skip:** re-parenting inside onAwake/OnStart could make LeafIndex (the next root) miss its init. Mitigated by adopting in the first UpdateEvent.
- **LEAF lookups:** names survive. The risks are a duplicate name (for example a new "SkilletStation" label), or nesting StationsRoot deeper than 4 (CookStage.ts:1075 depth limit).
- **Silent test weakening:** moving CookLoadingPanel, CookStepCard or DishStudioRoot under the kitchen root makes `sceneHas` (CookPlanDishScenario.ts:14-17) pass vacuously.
- **Gaze beacon math** (GazeEdgeBeacon.ts:157-161, 284-297) is world-relative, so it is safe. With the Sunlit Room camera at the origin, `getTargetYawDeg` changes value, but the scenario is relative to it.
- **DAGCounterConduit and rings:** built in StationsRoot-local (DAGCounterConduit.ts:6-20; DiegeticChronoRing.ts:6), so they move with the root, which is correct. They must never be registered for billboarding.
- **DishStudio hiding by scale** (DishStudio.ts:206-230):
  - The billboarder must skip hidden parents (inverse-matrix blow-up).
  - Nobody may scale KitchenAnchorRoot. Doing so would hide the Cook bench and break the scale tests' meaning.
- **CookStage placement at the old stations pose:**
  - Copying the *world* pose (current code) stops following once `setPose` exists.
  - Copying the local pose under the kitchen root keeps BENCH.topY = -0.23 flush with kitchen y=0.
  - World caches (`restPos`, `homePos`; CookStage.ts:765, 828, 937-940) go stale if the pose changes mid-cook. Refuse `setPose` then.
- **Tilted pose:** many world-up offsets (Cook actions, PlatingFinisher, PantryGenerators, VesselGenerators) and the `up.y >= 0.7` test (CookPlanDishScenario.ts:140) assume gravity alignment. `setPose` must strip pitch and roll.
- **Stage 2 frame definition:** the spec says "+X from the left burner toward the plate". In the legacy layout, skillet (-11.2,-1.5) to plate (0,4.5) is 28 deg off the counter-edge +X. `setPoseFromCounter` must rotate the measured vector by -atan2(6.0,11.2) (or use the burner-to-board edge). Otherwise the legacy content lands yawed 28 deg. This is an owner decision.
- **Dock billboarding:** rotating SIK/UIKit colliders mid-pinch drops events. Use the deadband plus a freeze while hovered. The dock becomes the hidden palette in Stage 3.
- **SIK camera provider:** `getInstance()` throws without DeviceTracking, or if it is called before the camera exists. It must be lazy and guarded, with fallbacks.
- **Additive "faint" slab:** dimming a shared material dims every user. Clone first.
- **Startup timing assumption:** adoption runs one frame late. Any future component that reads the kitchen frame in onAwake or OnStart must use `KitchenAnchorRoot.DEFAULT_POS` math or wait for `KITCHEN_ROOT_READY`.
