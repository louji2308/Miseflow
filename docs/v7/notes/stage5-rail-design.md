# Stage 5/6 Schedule Rail: physics + DAG adapter design

Status: design only (read-only analysis, 9 Nov 2026). Nothing under `Miseflow/Assets` was touched.
Sources: `UPGRADE_PLAN_V7.md` (A, S5, S6, D5, E3-E5, F, G5/G6, K), `todo.md` tracker (D-001..D-014),
`docs/v7/notes/stage1-audit.md` §4, the scripts named below, `Miseflow/Support/StudioLib.d.ts`, the ls-clad physics
skill references, and the SIK package source under `Miseflow/Cache/TypeScript/Src/Packages`.
The Lens Studio knowledge base could not be used ("Please log into your Snapchat account", see D-003), so every
platform claim below is from the d.ts, the skill and the SIK source, with file:line.

Frame (stage1-audit §4, KitchenAnchorRoot.ts:442-459): kitchen local +X along the counter from the left burner
toward the plate, +Y the surface normal, y = 0 the counter plane, +Z toward the cook. The kitchen root rotation is
yaw-only (MiseFlowEventBus.ts:258-262), so the rail frame equals the kitchen frame with an x/z offset only.

---

## 1. DAG facts and the minimal additions

### 1.1 What exists today (ChoreographyDAG.ts)

| Fact | Where |
|---|---|
| Task record: `id, stationId (PREP/SKILLET/SAUCEPOT/PLATING), dependencies[], plannedDurationSeconds, remainingDurationSeconds, state, interruptionPolicy` | :17-27 |
| States `NOT_READY, READY, ACTIVE, NEEDS_ATTENTION, PAUSED_BY_USER, COMPLETE`; policies `WAIT_BEFORE_START, USER_DECISION, FIXED_DURATION, MANUAL_CONFIRMATION` | :3-15 |
| Four fixed tasks: `prep_shallots` (45 s, no deps, WAIT), `skillet_sear_skin` (60 s, no deps, FIXED_DURATION), `sauce_reduction` (50 s, deps prep, WAIT), `plating_garnish` (20 s, deps sear + sauce, WAIT) | :106-160 |
| Durations are inspector inputs 60/50/45 captured at awake as boot durations | :67-74, :90, :94 |
| There are **no start times and no cook clock**. `onUpdate` only decrements `remaining` of ACTIVE tasks while `isRunning`, scaled by `timeMultiplier` (10x warp) | :510-526, :215-220 |
| Prep is never timed: `isRunning` becomes true only in `startTimers()`, called when prep completes (`STATION_STEP_COMPLETED PREP`) | :164-169, :374-383 |
| `startTimers` makes sear AND sauce ACTIVE at prep completion (so in code the sear starts after prep, although it has no dependency) | :374-383, :366-371 |
| Drift resolver `injectPrepDrift(delta)`: `driftDelaySeconds += delta`, prep `remaining += delta`, sauce listed as deferred if NOT_READY, sear set to `NEEDS_ATTENTION` if ACTIVE **or READY**, emits `SCHEDULE_REVISED {affectedTasks, revisedFinishDeltaSeconds, explanation, recommendedAction}` | :246-284 |
| +25 s enters via `DRIFT_RECORDED {deltaSeconds}` (palette / key 5 / LEAF) or `DAG_HOLD_TOGGLED` | :183-199 |
| Hold / revert: `HOLD_CONFIRMED` -> `confirmUserHold` (sear PAUSED_BY_USER) or `revertPrepDrift` / `releaseHold` | :201-213, :289-316 |
| Convergence: both sear and sauce COMPLETE -> `PLATING_CONVERGENCE` | :528-541 |
| Per-dish retime `applyDishBlueprint(bp)`: prep/sear/sauce durations from the blueprint, dish 01 restores boot values | :400-446 |
| Getters today: `getTaskState, getPlannedDuration, getTaskTitle, getSkilletRemaining/Progress, getSaucepotRemaining/Progress, getLatestExplanation, isTimeWarpActive, isDagHeld` | :448-508 |

The "06:40" chronometer is **not** DAG time. It is a story clock in the UI: `plateAnchorTargetSec = 400` and on
`DRIFT_RECORDED` it becomes `400 + delta` (MiseFlowSpatialUI.ts:261-262, :1147-1155, reset :1244-1245, display
easing :1501-1505, view for station targets `getPlateView()` :560-567, StationTarget.ts:64, :967).
Downstream consumers of `SCHEDULE_REVISED`: the skillet thermal ring turns coral (ConcentricThermalRing.ts:144-151)
and StationTarget raises DRIFT alerts on SAUCEPOT and PREP (StationTarget.ts:769-772). The skillet hint on drift is
"LOWER BURNER NOW" (MiseFlowSpatialUI.ts:1283), held "BURNER LOW - HELD" (:1286).

### 1.2 Dish mapping

Dish 01 (DishLibraryConfig.ts:51-58: prep 45, sear 60, sauce 50; DAG plate 20 s) as the rail sees it:

| Task | Lane | Plan (s) | Rule |
|---|---|---|---|
| prep_shallots | BOARD | 0-45 | ASAP |
| skillet_sear_skin | BURNER_L (skillet) | 35-95 | ALAP to plating (heat task), pinned |
| sauce_reduction | BURNER_R (saucier) | 45-95 | ASAP after prep |
| plating_garnish | PLATE | 95-115 | after sear and sauce |

Makespan T = 115 s. The ALAP sear is the only schedule consistent with the DAG guardrail, which already treats a
READY sear as "on heat" (ChoreographyDAG.ts:264-271). Plate story clock: `plateClock = 400 + (plateStart - 95)`, so
06:40 at baseline and 07:05 after +25 s.

The 7 steps of dish 01 (DishLibraryConfig.ts:99-107) are StepEngine content (cards); the rail shows the 4 DAG tasks,
not the 7 steps. Dishes 02-06 use the same four tasks with their own durations via `applyDishBlueprint`.

Cook-engine dishes (Chicken 65, chapathi, poori, athirasam, and live plans): `CookStep {id, equipmentId, durationSec,
heat, after[]}` (CookPlanSchema.ts:61-75); runtime deps = `after`, or the previous step when `after` is empty
(CookRuntime.ts:213-219); each step lasts its action plus `STEP_DWELL_SEC = 0.8` (CookRuntime.ts:32, :284-289);
speed scaling `CookRuntime.speed` (:77, :196-198); state via `getState()` running/done/pending/ready (:131-155).
Lane = equipment: `burner 1` -> BURNER_L, `burner 2` -> BURNER_R, `burner 3` -> BURNER_R (warm), `burner 0` ->
BOARD, `plateEquipmentId` -> PLATE (CookPlanSchema.ts:38-43, :86). Pinned = `heat != "OFF"` and running/dwell.
Chicken 65 (PlanLibrary.ts:43-91), durations + 0.8: marinate 8.8, coat 6.8, heat_oil 6.8, deep_fry 14.8,
temper 8.8, saute_toss 8.8, plate_dish 6.8, garnish 5.8; ASAP makespan 51.8 s; 8 pucks; the kadai lane holds three
consecutive pucks (heat_oil, deep_fry, saute_toss), which is where in-lane physical pushes happen.

### 1.3 Rail time scale (reconciling 55 cm / 7 min with the real numbers)

The plan's "7-minute plan on 55 cm = 7.6 s/cm, 25 s = 3.3 cm" assumed a 420 s plan. The real dish-01 DAG plan is
115 s, Chicken 65 is 52 s. Rule (deterministic, LEAF-friendly):

- `RAIL_LEN_CM = 60` (plan allows 55-60; 60 leaves room for a +15 cm re-plan drag). Device scaling to the claimed
  span is deferred (constant in the Preview keeps LEAF numbers fixed).
- `PLAN_SPAN_CM = 40` (the plan occupies 2/3; the right third is spare for slips and re-plans).
- `secPerCm = max(1, ceil(2 * T / 40) / 2)` (0.5 s/cm steps). Dish 01: 115/40 = 2.875 -> **3.0 s/cm**.
  Chicken 65: 1.295 -> **1.5 s/cm**. A 420 s plan: 10.5 s/cm.
- Visual puck length = `max(4, dur/secPerCm) - 0.2` (0.2 cm dependency gap at the right end, 4 cm minimum).
- 10x warp: the rail runs on the DAG cook clock, which advances `dt * timeMultiplier`, so geometry is identical and
  only speeds scale: Now bead 0.33 cm/s at 1x, 3.33 cm/s at 10x; natural lateness growth at the same rate. Both are far
  under the 40 cm/s drive limit.
- A +25 s slip on dish 01 = **8.33 cm** (not 3.3 cm). The settle budget (0.6 s) is met for 8.33 cm, see §3.4.

### 1.4 Minimal DAG additions (ChoreographyDAG.ts + new pure `ScheduleModel.ts`)

Keep every existing method, event and string (prep-drift-resolver must keep passing). Add:

1. Task fields: `heat: "OFF"|"LOW"|"MED"|"HIGH"` (sear HIGH, sauce LOW, prep/plate OFF), `pinOnHeat: boolean`
   (sear true), `driftSec` (injected), `latenessSec` (natural), `actualStartSec?`, `actualFinishSec?`,
   `notBeforeSec?` (read-back), `pinnedStartSec?`.
2. Cook clock: `cookClockSec`, advanced in `onUpdate` by `getDeltaTime() * timeMultiplier` while `cookRunning`
   (independent of `isRunning`, which still gates the timers). `beginCook(source)` sets prep ACTIVE and
   `actualStartSec = clock`; triggers: first prep cut (`CUT_REFERENCE_STEP`), `STEP_DONE_PINCHED` for PREP,
   `HAND_AT_STATION PREP` (Stage 4), palette "Start cook", `startTimers()` if not begun, LEAF hook. Getters
   `getCookClockSec()`, `isCookRunning()`; test hook `setCookClockForTest(sec, paused)`.
3. Lateness input: `reportLateness(taskId, lateBySec, source: "CLOCK"|"HAND"|"INJECT")`, monotonic per task.
   The DAG itself computes CLOCK lateness for an ACTIVE manual task (prep): `max(0, clock - start - planned - drift)`.
   `injectPrepDrift` additionally does `prep.driftSec += delta` (existing behaviour unchanged).
4. Pin policy: `isPinned(id) = pinOnHeat && state in {READY, ACTIVE, NEEDS_ATTENTION, PAUSED_BY_USER}` for
   legacy tasks (mirrors :266); Cook tasks pinned while running with heat. On first pin, freeze
   `pinnedStartSec = current scheduled start` (dish 01: 35 s at boot, so the sear is static from the first frame).
5. `getSchedule(): ScheduledTask[]` = pure `ScheduleModel.compute(tasks, clock, plateTarget)` returning
   `{id, stationId, lane, start, finish, dur, planned, state, policy, pinned, heat, deps}`. Algorithm:
   effective `dur = planned + driftSec + latenessSec` (COMPLETE uses actuals); fixed starts for COMPLETE / ACTIVE /
   pinned; forward ASAP pass `start = max(depsFinish, notBefore, clock if cooking and not started, 0)`; plate start
   = max of predecessor finishes, raised to `userPlateTarget` when set; backward ALAP pass for unpinned, unstarted
   heat tasks and (only while a user plate target exists) unstarted WAIT_BEFORE_START tasks; drop `notBefore` when
   the ASAP start already reaches it.
6. Plate getters: `getPlateStartSec()`, `getPlateBaselineSec()` (95 for dish 01), `getPlateClockSec()` =
   `400 + plateStart - baseline`, `getMakespanSec()`, `getHoldSec(pinnedId)` = `plateStart - pinnedFinish`.
7. Re-plan: `requestPlatingTarget(plateStartSec, source): {applied, minFeasible, infeasible}`; `clearPlatingTarget()`.
8. Read-back: `setNotBefore(taskId, sec)` (absolute, idempotent, ignored for pinned/started/FIXED tasks).
9. Change hook: `getScheduleRevision()` counter (bumps when any start/finish moves > 0.1 s) for pollers, plus
   `TASK_LATE {taskId, lateBySec}` on each whole-second crossing, throttled to <= 4 Hz. Emit `SCHEDULE_REVISED`
   once per slip episode (first crossing of 1 s lateness) and never per tick, because its consumers re-trigger alerts
   (ConcentricThermalRing.ts:144, StationTarget.ts:769). A `CookPlanSource` adapter offers the same
   `getSchedule()` for Cook dishes, built from `CookRuntime.getState()`, `deps` and `durationSec + 0.8`.

UI coupling (Stage 5.6): `MiseFlowSpatialUI.plateAnchorTargetSec` reads `dag.getPlateClockSec()` each frame
(fallback 400 + delta), and on HEAT_GUARD the skillet view action becomes "LOWER TO HOLD" (:1283).

---

## 2. Platform feasibility (with proof)

| Question | Answer | Proof |
|---|---|---|
| Create a WorldSettingsAsset at runtime? | **Yes.** `Physics.WorldSettingsAsset.create()` | StudioLib.d.ts:35620-35625 (LSV 183; this d.ts has LSV 282 APIs, e.g. :35290) |
| Writable fields | `gravity` (:35664), `simulationRate` 30-240 step 30 (:35666-35671), `absoluteSpeedLimit` cm/s, 0 = off (:35686-35692), `relativeSpeedLimit` = max distance per step as a fraction of shape size, default 0.5 (:35693-35699), `defaultMatter`, `defaultFilter`, layer matrix | d.ts |
| Assign at runtime? | **Yes, on a WorldComponent**: `WorldComponent.worldSettings` is a plain settable field | d.ts:23889-23920 (`worldSettings` :23919, `updateOrder` :23912) |
| Root world settings | Scene asset has `PhysicsRootWorldSettings: 00000000-...` (null), so root settings are the read-only default; `Physics.getRootWorldSettings()` (d.ts:35350) returns null until an editor asset is assigned (physics skill gotchas "The default WorldSettingsAsset is read-only") | Assets/Scene.scene:19 |
| Ground Is Zero | Root-world infinite floor at world y = 0. **Both** kitchen poses are below it: legacy P0 y = -17.73 (KitchenAnchorRoot.ts:108) and the Sunlit Room table y = -142.5. A dynamic puck in the root world would sit inside the half-space and be ejected upward. Custom `WorldComponent` worlds do not inherit Ground Is Zero (skill SKILL.md §1, gotchas). | Decision: **the rail lives in its own WorldComponent world.** No editor-time change is needed. |
| Create body/collider at runtime | `createComponent("Physics.BodyComponent")` / `"Physics.ColliderComponent"`; the project already does it | MiseFlowButtonTrigger.ts:111-117; type map d.ts:38853-38856 |
| Box shape at runtime | `Shape.createBoxShape()` then `shape.size = vec3` | d.ts:24020, :24129-24146 |
| fitVisual | default true; **must be set false after assigning `shape`** (assignment resets it) | d.ts:22560-22566; skill api-surface.md:225, :233 |
| Dynamic vs static | `BodyComponent.dynamic` (false = static collider) | d.ts:23461-23467 |
| Mass / damping | `mass` (kg, :23469-23473), `damping`, `angularDamping` 0..1 (:23480-23493) | d.ts |
| Velocity command | `velocity` cm/s, `angularVelocity` rad/s, read/write on ColliderComponent | d.ts:22602-22615; `clearMotion()` :22467-22472 |
| Forces | `addForce(force, Physics.ForceMode.{Force, Acceleration, Impulse, VelocityChange})` | d.ts:23418, :35328-35345 |
| Collision events | `onCollisionEnter/Stay/Exit` (event1<...EventArgs>), args `.collision.collider`, `.collision.contacts[] {position, normal, impulse, distance}` | d.ts:22513-22525, :22194-22222, :22240-22274 |
| Events need a dynamic side | Static-static pairs fire nothing | skill gotchas "Collision events only fire when one side is dynamic" |
| Overlap / intangible | `intangible` (no collision response, still overlaps/raycasts), `onOverlapEnter/Stay/Exit` | d.ts:22574-22580, :22527-22543 |
| Matter (friction) at runtime | **No.** `class Matter` has no `create()` (d.ts:23583-23636; the skill's `Physics.Matter.create()` line is not in this d.ts). Default friction 0.5, dynamicBounciness 0, staticBounciness 1 (d.ts:23601-23635, product = 0, so no bounce). Custom friction needs an editor asset (§8.3). | d.ts |
| Filter at runtime | `Physics.Filter.create()` | d.ts:35542-35598 |
| Constraints | `addPointConstraint(target, pos)` / `removeConstraint` | d.ts:23450-23460 |
| SIK hits colliders in custom worlds? | **Yes.** SIK target providers use `Physics.createGlobalProbe()` (all worlds) | SIK `Core/Interactor/MouseTargetProvider.ts:25`, `IndirectTargetProvider.ts:22`, `PhysicalInteractionProvider.ts:72`; LEAF `BaseLeafInteractor.ts:350` |
| SIK axis lock | `enableX/Y/ZTranslation` lock **world** axes, not lane axes, so they cannot constrain a yawed lane | SIK `InteractableManipulation.ts:1726-1734` |
| SIK manipulate a proxy | `setManipulateRoot(transform)`, `setCanRotate(false)`, `setCanScale(false)`, `onManipulationStart/Update/End`, `isManipulating()` | InteractableManipulation.ts:453, :489, :506, :630-646, :786 |

Exact runtime world setup (RailWorld.ts):
```ts
const world = railRoot.createComponent("Physics.WorldComponent") as WorldComponent;
const ws = Physics.WorldSettingsAsset.create();
ws.simulationRate = 240;          // 4 sub-steps per 60 fps frame
ws.absoluteSpeedLimit = 100;      // cm/s (the plan's "about 100 cm/s")
ws.relativeSpeedLimit = 0.2;      // <= 0.2 x shape size per step (2 cm puck -> 0.4 cm/step = 96 cm/s at 240 Hz)
ws.gravity = new vec3(0, 0, 0);   // see §3.1 (levitating pucks); G1 alternative: kitchenDirToWorld(0,-300,0)
world.worldSettings = ws;
world.updateOrder = 1;            // after the root world (SIK button colliders)
```
Pucks must be descendants of `RailRoot` to belong to this world (d.ts:23883). Verify in step 1 (§8) that the
created world simulates; if `create()` throws or bodies do not move, use §7.

---

## 3. Puck dynamics

### 3.1 Bodies and the levitation decision

- Every puck = one SceneObject `Puck_<taskId>` with one `BodyComponent` (box `size = (len, 2.0, 4.4)`), a visual
  child, a label child. Scale stays 1 (resize through `shape.size`, skill gotcha "parent scale").
- Zero gravity in the rail world; pucks hover 0.15 cm above the trough floor, held by the y/z velocity terms.
  Reason: Matter cannot be created at runtime, default friction 0.5 against the floor fights the x velocity drive
  (stick-slip jitter, risk K "physics jitter on camera"), and a tilted claim (up to 15 deg) would make world gravity
  pull pucks along the lane. Puck-to-puck, puck-to-lip and puck-to-fence contacts remain full rigid-body contacts.
  Option G1 (if the owner wants literal "resting under gravity"): gravity `kitchenDirToWorld((0,-300,0))`, drop the
  y term, accept friction 0.5 (deceleration ~150 cm/s^2 between frames, compensated by the drive law).
- Mass: pending 1 kg; ACTIVE (growing) 5 kg so it wins pushes; plate puck while grabbed: static (§4).
- `damping = 0`, `angularDamping = 1`, `debugDrawEnabled = RailController.DEBUG_DRAW` (on while authoring, off for
  gate screenshots, plan Part M.7).

### 3.2 Drive law (per UpdateEvent, before the physics phase; rail local = kitchen local minus rail origin)

```
p   = kitchen.worldToKitchen(body pos) - railOrigin           (KitchenAnchorRoot.ts:442)
ex  = xTargetCentre - p.x
vxd = clamp(K * ex, -VMAX, VMAX)                              K = 12 /s, VMAX = 40 cm/s
vx  = vxPrev + clamp(vxd - vxPrev, -AMAX*dt, AMAX*dt)         AMAX = 400 cm/s^2
if (yield) vx = max(vx, vMeasured.x)                          yield = contact from the left in the last 0.25 s
if (|ex| < 0.02 && |vx| < 0.2) vx = 0                         sleep band
vy  = clamp(15 * (yHover - p.y), -10, 10); vz = clamp(15 * (zLane - p.z), -10, 10)
body.velocity = kitchen.kitchenDirToWorld(new vec3(vx, vy, vz))   (:454)
body.angularVelocity = kitchenDirToWorld(clamp(10 * axisAngle(qErr), 2 rad/s))   // back to lane-aligned
```
`xTargetCentre = (startX + endX) / 2` with `startX = start/secPerCm`, `endX = startX + visualLen`. A growing puck
needs no special code: its left edge (start, fixed in the past) stays, its size grows, its centre target moves right
at half the growth rate and the spring follows. Nothing writes a dynamic body's transform.

### 3.3 Geometry (rail local cm; z toward the cook)

- Rail origin: `x0 = stationCentroidX - 30`, `z = stationLineZ + 8` (back lip), `y = 0`. Without claims (legacy P0)
  the station line is the slab front edge z = 10.5 (StationPropsBuilder.ts:590-591), so the rail sits just in front of
  the slab. With claims, `stationLineZ` = mean local z of `Station_*` (ClaimController.ts:86-90, :264-316).
- Rows, back to front, pitch 5.6 cm (5.0 lane + 0.6 lip), centres z = 3.1, 8.7, 14.3, 19.9 from the back lip:
  `Rail_Lane_BurnerL` (skillet), `Rail_Lane_BurnerR` (sauce), `Rail_Lane_Board` (prep), `Rail_Lane_Plate`
  (short: x from 24 to 60 cm, nearest the cook so it is easy to grab). Order chosen so prep->sauce are adjacent and the
  sear fence only has to span one neighbouring lane.
- Lips: 1.0 cm high visual, collider 1.0 x 1.4 x 0.8 cm (x full length, y height, z thickness >= 2 steps at the
  speed limit). End stops at x = 0 and x = 60 (and x = 24 in the plate row), collider thickness 1.0 cm.
- Puck: 4.4 cm wide (0.3 cm clearance per side), 2.0 cm tall, hover y = 1.15 (centre).

### 3.4 Settle time

Step of e0 = 8.33 cm (+25 s on dish 01): accel ramp 0.1 s (2 cm), saturated at 40 cm/s until e = VMAX/K = 3.33 cm
(about 0.08 s), then exponential `e = 3.33 exp(-12 t)` to 0.1 cm in ln(33)/12 = 0.29 s. Total about 0.47 s < 0.6 s.
For the plan's 3.3 cm case: about 0.33 s. "Settled" = |ex| < 0.1 cm and |vx| < 0.5 cm/s for every puck.

### 3.5 Tunnelling

Smallest collider dimension 0.8 cm (lips); max per-step travel at 240 Hz with the 100 cm/s limit = 0.42 cm and
with VMAX 40 = 0.17 cm; relative limit 0.2 also caps it. No CCD exists (skill "Hard limits"), so these margins and the
4 cm minimum puck length are the mitigation. Pucks never exceed 40 cm/s except a thrown plate puck, clamped on
release to 40 cm/s.

### 3.6 Pushes without jitter

- Targets are a pure function of DAG state and the cook clock, recomputed every frame (`getSchedule()` is cheap,
  <= 14 tasks), so a downstream target moves in the same frame as the upstream growth. Two velocity commands never
  disagree about where a dependent puck should be.
- In-lane contacts (Cook kadai lane, re-plan squeezes) are real: the heavier ACTIVE puck pushes; the pushed puck enters
  `yield` (never commands a negative velocity against its pusher for 0.25 s after the last contact from the left).
- No bounce: dynamicBounciness 0 x staticBounciness 1 = 0 (d.ts:23619-23635).

### 3.7 Cross-lane tethers (per tick)

For each DAG edge u -> d in different lanes: `need = endX(u) + 0.2 - startX(d)`. If `need > 0.05`, apply a velocity
floor `vx(d) = max(vx(d), min(VMAX, K * need))` in the same frame (no impulses, no accumulation). In steady state the
DAG targets already satisfy every edge, so tethers act only during transients and make the chain visibly "pull".
Visual: `Rail_Tether_<u>_<d>`, a thin bent quad strip (<= 12 tris) from u's right end to d's left end, amber while
`need > 0`, silver otherwise. The existing DAGCounterConduit stays as is (it only exposes `getPrepConduitState`,
DAGCounterConduit.ts:540); a contact-flash hook on it is optional polish.

### 3.8 Now bead, ghost tick, labels

- `RailNowBead`: visual only (no collider), 8-tri emissive diamond, x = clock / secPerCm, y = 2.6 (above lips),
  spans the rows as a 0.15 cm luminous line (`RailNowLine`, 12 tris). Parked dim at x = 0 before `beginCook`.
- `GhostTick_Plate`: created once the plate start differs from baseline by > 0.5 cm; x = baseline/secPerCm
  (dish 01: 31.667), 0.2 cm silver bar across the plate row with label "06:40" (0.7 cm). Destroyed on reset.
- Plate puck label = `formatMMSS(dag.getPlateClockSec())` ("06:40" -> "07:05"); other pucks show the task title
  shortened to 14 chars; pinned puck shows the lock glyph.

### 3.9 Pinned puck, hold fence, HEAT_GUARD

- Pinned puck (sear): `BodyComponent.dynamic = false` from the first frame it is pinned (static collider), placed by
  transform once (allowed: not dynamic). Its position never changes while pinned (LEAF tolerance 0.2 cm).
- `HoldFence_<taskId>`: a separate static `ColliderComponent` child of RailRoot, box (0.6, 1.8, 5.0), standing in the
  lane(s) of every other predecessor of the pinned task's successor (dish 01: the sauce lane), left face at
  `pinnedEndX + HOLD_TOL_SEC/secPerCm` (HOLD_TOL_SEC = 3 s -> 1.0 cm; dish 01 x = 32.667). Meaning: "if the sauce
  finishes more than 3 s after the salmon, the salmon must hold on heat".
- Contact = `onCollisionEnter` on the dynamic sauce puck whose `e.collision.collider` is a fence (events need a
  dynamic side). On the first contact: emit `HEAT_GUARD {taskId, stationId: "SKILLET", holdSec: dag.getHoldSec(),
  hint: "Lower to hold", contactX, source: "RAIL_CONTACT"}`; if no AttentionDirector exists yet, also emit
  `ALERT_RAISED {stationId: "SKILLET", kind: "HEAT_GUARD", hint: "Lower to hold"}` (StationTarget.ts:785-787 already
  consumes it); flash the contact coral 0.6 s; then set `fence.intangible = true` (yield) so the sauce continues to its
  DAG target and the fence becomes the visible "hold tail" (coral hatched extension on the sear puck up to the plate
  start). Re-arm (`intangible = false`) on `HOLD_CONFIRMED`, `ALERT_RESOLVED SKILLET`, sauce COMPLETE, or reset.
- The skillet ring is already coral after `SCHEDULE_REVISED` (ConcentricThermalRing.ts:144-151); Stage 5 adds the
  "LOWER TO HOLD" action text so the hint contains "hold".

### 3.10 Feedback-loop avoidance

1. Puck targets never depend on puck positions (only on DAG + clock), except the grabbed plate puck.
2. Read-back writes are absolute and idempotent: `setNotBefore(task, startFromX)` and `requestPlatingTarget(sec)`;
   they cannot accumulate a slip twice, and the DAG drops a `notBefore` its own ASAP already reaches.
3. Read-back fires only when `|x - target| > 0.5 cm` persists 250 ms with `|v| < 1 cm/s` (a stuck or user-moved
   puck), for unstarted WAIT_BEFORE_START tasks only, at most one DAG write per 250 ms (global throttle), with a
   re-entrancy guard (no write while handling a DAG event).
4. `PUCK_DISPLACED {taskId, deltaSec, accepted}` is logged/emitted for every read-back.

---

## 4. Re-plan (Stage 6)

- Plate puck gets SIK `Interactable` + `InteractableManipulation` on the puck object (its BodyComponent is the
  collider SIK's global probe hits), with `setManipulateRoot(PlateGrabProxy.getTransform())`,
  `setCanRotate(false)`, `setCanScale(false)`. SIK moves only the invisible proxy, never the body. Bind in
  `OnStartEvent` (plan A3).
- Grab (`onManipulationStart`): `body.dynamic = false` (static, transform-driven, matching S6), store the grab
  offset. Update: project the proxy world position into rail local x (world lock of axes is useless, see §2), clamp
  to `[minX, laneEndX - len]` where `minX` is 4 cm left of the current feasible minimum (lets the user feel the
  squeeze), set the puck transform, record x history. Every 250 ms call `dag.requestPlatingTarget(x*secPerCm)` so the
  wait pucks glide live.
- Release (`onManipulationEnd`): final `requestPlatingTarget`; `body.dynamic = true`; `body.velocity =
  kitchenDirToWorld((clamp(vRelease, -40, 40), 0, 0))` from the last 3 frames; the spring then brings it to the DAG's
  applied target.
- Slide right: plate start = request; unstarted WAIT tasks go ALAP (glide right), FIXED tasks keep their length, the
  pinned sear stays and its hold grows -> hint "Hold at low heat" (`HEAT_GUARD` with `hint: "Hold at low heat"`).
- Slide left below the feasible minimum: DAG returns `infeasible = true`, `applied = minFeasible`; emit
  `REPLAN_REQUESTED {requestedSec, appliedSec, infeasible, deltaSec}`; `Rail_Trough` flashes coral 0.6 s; pucks spring
  back to the minimum feasible plan (in-lane squeeze contacts happen naturally while the puck was held left).
- Fallback if toggling `dynamic` at runtime misbehaves: keep the body dynamic during the grab and velocity-drive it
  to the proxy x with K = 25, VMAX 60, mass 20 kg.

---

## 5. Observable API (LEAF)

Hierarchy: `KitchenAnchorRoot / RailRoot` (WorldComponent + RailController) with children `Rail_Trough`
(floor + lips + end stops, compound statics), `Rail_Lane_BurnerL|BurnerR|Board|Plate` (lane markers),
`Puck_<taskId>` (children `PuckVisual`, `PuckLabel`, `PuckLock` on pinned), `HoldFence_<taskId>`, `RailNowBead`,
`RailNowLine`, `GhostTick_Plate`, `Rail_Tether_<u>_<d>`, `PlateGrabProxy`, `Rail_Tick_<n>` (minute ticks).

`RailController` (static `getInstance()`):
```
isBuilt(); getDishKey(); getSecPerCm(); getRailLengthCm(); getPuckIds(): string[]; getPuckCount()
getPuck(id): {id, lane, xStart, xEnd, lengthCm, nominalLengthCm, targetXStart, dynamic, pinned, settled, vx}
getNowX(); getGhostTickX(): number | null; getPlateLabel(); getPlateClockSec()
getDynamicBodyCount(); getTriangleCount(); isSettled(); getPhysicsMode(): "BODIES" | "KINEMATIC"
getHeatGuardCount(); getLastHeatGuard(); getContacts(): {a, b, x, t}[]; isInfeasibleFlashOn(); getLastReplan()
test hooks: testBeginCook(); testSetClock(sec, paused); testInjectLateness(taskId, sec); testDragPlate(dxCm); testRelease(vx)
```
New bus names: `RAIL_BUILT {dishKey, puckCount, secPerCm}`, `RAIL_SETTLED {revision}`; payloads for the reserved
`TASK_LATE`, `PUCK_DISPLACED`, `HEAT_GUARD`, `REPLAN_REQUESTED` (MiseFlowEventBus.ts:77-87) as defined above.

Expected numbers, dish 01 (secPerCm 3.0, rail 60 cm, gap 0.2; x in rail-local cm, visual extents):

| Puck | Lane | x start -> end at boot | length (nominal) | after +25 s |
|---|---|---|---|---|
| Puck_prep_shallots | Board | 0 -> 14.800 | 14.800 (15.000) | 0 -> 23.133 (len 23.133) |
| Puck_skillet_sear_skin | BurnerL, static | 11.667 -> 31.467 | 19.800 (20.000) | unchanged |
| Puck_sauce_reduction | BurnerR | 15.000 -> 31.467 | 16.467 (16.667) | 23.333 -> 39.800 (+8.333) |
| Puck_plating_garnish | Plate | 31.667 -> 38.133 | 6.467 (6.667) | 40.000 -> 46.467 (+8.333) |

Puck count 4; dynamic bodies 3; HoldFence_skillet_sear_skin left face x = 32.667; GhostTick_Plate x = 31.667 after
the slip; plate label "06:40" -> "07:05"; DAG sauce start 45 -> 70 s; holdSec 25; settle < 0.6 s after injection.
Lengths compared to nominal pass the plan's 5% rule (worst: plate 6.467 / 6.667 = 3.0%).
Chicken 65: secPerCm 1.5, 8 pucks, nominal lengths 5.87, 4.53, 4.53, 9.87, 5.87, 5.87, 4.53, 4.00 (garnish
3.87 raised to the 4 cm minimum).

Scenarios:
- `rail-forms-scenario`: reset; wait `RAIL_BUILT`; assert puck count == DAG task count (4), each
  `|lengthCm + 0.2 - max(4, planned/secPerCm)| <= 5%`, sear `pinned && !dynamic`, names present, tris <= 600 + 4*120.
- `rail-drift-contact-scenario`: natural variant: `testBeginCook()`, warp 10x until clock >= 70 s without Done on prep
  (or injected variant: `DRIFT_RECORDED 25`); wait `isSettled()`; assert prep length >= 23.0, sauce xStart moved >=
  8.333 - 0.5, DAG sauce start = 70 +- 2 s, plate moved, `GhostTick_Plate` exists, plate label != "06:40",
  chronometer text changed.
- `pinned-sear-heat-guard-scenario`: as above; assert sear xStart unchanged within 0.2 cm, `getHeatGuardCount() >= 1`,
  HEAT_GUARD payload stationId SKILLET, the skillet ring material is the coral one, skillet hint contains "hold"
  (case-insensitive).
- `replan-grab-scenario` (clock paused at 0 via `testSetClock(0, true)`): drag plate +15 cm -> plate target 95 + 45 =
  140 s (+-1.5 s), sauce start +45 s, sear unchanged within 0.2 cm, hint "Hold at low heat"; then drag to 15 cm left
  of the original slot (x 16.667; the grab clamps it at feasibleMin - 4 cm = 27.667, request 83 s; the plate row's
  end stop is at 24) -> `infeasible == true`, `REPLAN_REQUESTED` seen, plate puck xStart
  within 1 cm of 31.667 after settle. (Clarification of Part F: "-15 cm" is measured from the original slot; returning
  exactly to the original is feasible and would not test the squeeze.) Drive with `testDragPlate` first, then with the
  LEAF puppet hand pinch-drag for the SIK path.

---

## 6. Budgets and mesh recipe

| Item | Tris |
|---|---|
| Trough floor (box) | 12 |
| Lips: 3 full + 2 partial (box each) | 60 |
| End stops 3 | 36 |
| Minute ticks (dish 01: 60/3 = every 20 cm, 3 ticks) | 36 |
| Now bead 8 + now line 12 | 20 |
| Ghost tick | 12 |
| Hold fence | 12 |
| Tethers (dish 01: 3 edges x 12) | 36 |
| **Rail total** | **224 <= 600** |
| Puck: chamfered octagon prism (plan view chamfer 0.6 cm), top 6 + top bevel ring 16 + sides 16, no bottom | 38 |
| Lock glyph (box 12 + 4-segment shackle 8) | 20 |
| **Puck max** | **58 <= 120** |

Build with the exported `MeshAcc` (StationPropsBuilder.ts:140; `v` :173, `tri` :391 (auto-orients by normals),
`quad` :404, `box` :410, `triCount` :461, `toMesh` :490) and the exported material helpers `makePbrMaterial` /
`makeEmissiveMaterial` (:17, :35; check signatures). `buildRoundedSlab` (:523) is module-private and far too dense
(10 corner segments). Growing pucks rebuild their mesh only when the length changes by > 0.1 cm, at most 10 Hz
(38 tris, trivial). Pucks <= 14 per dish: if a plan has more steps, merge consecutive same-lane steps into one puck
("3 steps"). Dynamic bodies: dish 01 = 3, Chicken 65 <= 8, hard cap 14 (< 16). One extra physics world (budget
"Physics worlds 1" in E5 counts the rail world; the root world only holds static SIK button colliders).

---

## 7. Risks and the kinematic fallback

| Risk | Mitigation |
|---|---|
| Runtime `WorldSettingsAsset.create()` / runtime WorldComponent does not simulate in the Preview | Step 1 smoke test (§8) decides `physicsMode` before Stage 5 builds on it |
| Ground Is Zero ejects pucks (root world) | Own world; never put pucks in the root world |
| Changing `shape.size` on a live body is ignored | Re-assign `body.shape = shape`, then `fitVisual = false`; verify in step 3 |
| Toggling `dynamic` at runtime glitches | Pinned pucks are built static from the start; re-plan fallback in §4 |
| Kitchen pose changes (claim/recall) with live dynamic children | Destroy and rebuild the rail on KITCHEN_POSE_CHANGED / KITCHEN_CLAIMED / KITCHEN_RECALLED |
| Pucks intercept SIK rays aimed at station targets | Targets are 8 cm above the vessels, the rail is low and in front; check in the fov scenario |
| SCHEDULE_REVISED storms re-trigger alerts | One per slip episode, TASK_LATE for ticks (§1.4.9) |
| Recompile during LEAF | Unchanged project rule: one writer, one scenario at a time |

Kinematic fallback (`physicsMode = "KINEMATIC"`, chosen automatically if the smoke test fails, or forced by a
palette toggle): same objects and names, `ColliderComponent` (static) on every puck so SIK can still grab the plate
puck, transforms driven by the same spring law integrated in script (allowed, nothing is dynamic), contacts computed
analytically each frame (interval overlap per lane, fence crossing), HEAT_GUARD emitted with `source:
"RAIL_ANALYTIC"`. Assertions that change: `getDynamicBodyCount()` 0 instead of 3; "sear static" becomes `pinned &&
!dynamic` (still true); contact assertions read `getContacts()` (analytic) instead of physics events. Positions,
lengths, DAG numbers, HEAT_GUARD, ghost tick and re-plan numbers are identical. Honest wording for docs/video: "The
schedule moves the pucks with spring motion; collisions are computed from the plan, not simulated by the physics
engine" (Part J row "Rail physics and contacts" becomes "Simulated motion, computed contacts").

---

## 8. Implementation checklist (each step keeps the Lens working)

Rule for every step: one writer in `Assets/`, `RecompileTypeScriptTool` 0 errors, `RunAndCollectLogsTool` clean,
then the step's check. Runtime checks use `QueryRuntimeSceneTool` (object exists, world position) and log lines.

1. `Assets/Scripts/Rail/RailWorld.ts` (new, static `ensure(parent)`): creates `RailRoot` under KitchenAnchorRoot,
   the WorldComponent + settings of §2, and in the editor only a 2-second smoke test: one 4 cm test box with velocity
   (10,0,0) cm/s, logs `[RailWorld] smoke dx=<cm> mode=BODIES|KINEMATIC`, then destroys it.
   Check: log shows dx about 20 cm/2 s (pass >= 15) and `mode=BODIES`; RailRoot present via QueryRuntimeSceneTool.
   Wire `RailController.ensure()` next to `DirectorPalette.ensure()` in `ensureHeroComponents`
   (MiseFlowSpatialUI.ts:332-337).
2. `Assets/Scripts/ScheduleModel.ts` (new, pure) + ChoreographyDAG additions of §1.4 (fields, cook clock,
   `beginCook`, `reportLateness`, `isPinned`, `getSchedule`, plate getters, `requestPlatingTarget`, `setNotBefore`,
   revision counter, TASK_LATE). Check: log `[ScheduleEngine] schedule prep 0-45 sear 35-95 sauce 45-95 plate 95-115`
   at boot; existing `prep-drift-resolver-scenario` and `step-engine-scenario` still PASS.
3. `Assets/Scripts/Rail/RailGeometry.ts` (trough, lips, end stops, ticks, lane markers via MeshAcc; static colliders
   as compound children) and `Assets/Scripts/Rail/SchedulePuck.ts` (body, shape, visual, label, lock, drive law,
   resize with re-assign + fitVisual=false). Check: `RAIL_BUILT` log with 4 pucks, tris <= 600 + 4*58,
   `getPuck("plating_garnish").xStart` = 31.667 +- 0.1 after 1 s, debug draw screenshot.
4. `Assets/Scripts/Rail/RailAdapter.ts`: `LegacyDagSource` + `CookPlanSource` -> per-frame targets, lanes,
   secPerCm, tethers, read-back with dead zone/throttle, `PUCK_DISPLACED`. Check: inject +25 (palette / key 5) ->
   log `[Rail] settled 0.4x s`, sauce +8.333, plate label "07:05"; Chicken 65 forms 8 pucks at 1.5 s/cm.
5. `Assets/Scripts/Rail/RailController.ts` (owner: build/rebuild on dish, reset, pose change; observable API §5;
   HEAT_GUARD fence; Now bead; ghost tick). Check: natural lateness at 10x shows prep growth and the coral contact;
   log `[Rail] HEAT_GUARD skillet_sear_skin hold=25.0`.
6. UI hooks (Stage 5.6): chronometer from `getPlateClockSec()`, "LOWER TO HOLD" on HEAT_GUARD, conduit flash
   optional. Check: chronometer text and skillet target hint change in a CaptureRuntimeView.
7. LEAF: `rail-forms`, `rail-drift-contact` (natural + injected), `pinned-sear-heat-guard`, natural variant of
   `prep-drift-resolver`, then the D-013 regression subset; Stage 5 gate is a full regression pass.
8. Stage 6: `Assets/Scripts/Rail/PlateReplanGrab.ts` (SIK on the plate puck, proxy, projection, dynamic toggle,
   release velocity, infeasible flash). Check: `testDragPlate(15)` -> plate target 140 s; puppet-hand drag in the
   Preview; `replan-grab-scenario`.

### 8.1 Editor-time setup: none required

The default path creates the world settings at runtime (d.ts:35625) and assigns them to a runtime WorldComponent
(d.ts:23919). No scene or asset mutation is needed, which also keeps `Scene.scene` diffs clean.

### 8.2 Fallback editor setup (only if runtime `create()` fails)

Load `asset-graphql` with ToolSearch, introspect the mutation names first, then:
```
asset-graphql: createAsset(assetType: "WorldSettingsAsset", name: "RailWorldSettings")   -> <wsId>
asset-graphql: setProperty(id: <wsId>, propertyPath: "simulationRate",     value: 240, valueType: NUMBER)
asset-graphql: setProperty(id: <wsId>, propertyPath: "absoluteSpeedLimit", value: 100, valueType: NUMBER)
asset-graphql: setProperty(id: <wsId>, propertyPath: "relativeSpeedLimit", value: 0.2, valueType: NUMBER)
asset-graphql: setProperty(id: <wsId>, propertyPath: "gravity", value: [0,0,0], valueType: VEC3)
asset-graphql: setProperty(id: <sceneAssetId 0a1ccb1a-fe88-4fbb-9883-e3af3c75fd99>, propertyPath: "physicsRootSettings",
                           value: "<wsId>", valueType: REFERENCE)
```
Then `RailWorld` reads `Physics.getRootWorldSettings()` (non-null now) and assigns it to its own WorldComponent
(still its own world, so Ground Is Zero still does not apply). Setting the root asset also affects the static SIK
button colliders (harmless: they never move). Diff `Scene.scene` before committing.

### 8.3 Optional editor asset for friction (only for option G1)

`asset-graphql: createAssetFromPreset(presetName: "Matter", name: "RailMatter")`, `friction 0.2`,
`dynamicBounciness 0`; assign as `ws.defaultMatter` from script via the root settings route above. Not needed for
the default zero-gravity design.
