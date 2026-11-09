# V7 surface-placement probe results (8 Nov 2026)

Preview: Interactive / Sunlit Room / SPECS 27, Lens Studio 5.24.1. Probe: `WorldQueryProbe.ts`, run as-is.

## DECISION: B (with a mandatory virtual-plane fallback)

`DeviceTracking.raycastWorldMesh` / `hitTestWorldMesh` work in the simulator. They hit the coffee table top with a sane normal and `cls=4` (Table) at the right height. World Query (`HitTestSession`) returns hits too, but it behaves like a flat plane at about y = -144 that ignores the real geometry, so it is not trustworthy. Neither API sees the sideboard top.

- Use Path B for the table: `raycastWorldMesh`, with `worldOptions.enableWorldMeshesTracking = true` set by the claim controller. The setter was accepted at runtime.
- On the sideboard, both APIs are wrong in the simulator (details below). The Lens must keep a virtual counter plane (Path C logic) as the fallback and for the preview.
- WQ only "passes" the A rule on the table, and by coincidence: its plane (y about -144) happens to lie within 2 cm of the table top (y about -142.5). It also returned hits for a horizontal SIK ray that never reaches that height, so it is not a real ray cast.

## Startup block (same every run)

- `deviceInfoSystem.isEditor()=true isSpectacles()=true`.
- `WorldQueryModule loaded: yes`. Sessions A (filter=true), B (default) and C (filter + classification) all started.
- `raycastWorldMesh exists=true`, `hitTestWorldMesh exists=true`, `trackingMode actual=2 (World)`.
- `sceneReconstructionSupported=true`, `planesTrackingSupported=true`.
- `worldOptions BEFORE meshes=false classification=false`, `AFTER meshes=true classification=true`.

## Evidence table

Scene coordinates are cm, with the preview camera default at (0,0,0). Rays are the probe's own 30 and 45 degree rays plus the straight-down ray. "up" is the angle between the hit normal and +Y.

| API | Situation | Result | Examples |
|---|---|---|---|
| MESH/raycast + hitTest | Default camera (0,0,0), pitch -12 | NULL (empty array) on all rays | Rays are 300 cm long and the table is farther than that. Not informative. |
| MESH/raycast + hitTest | Table pose (0,-101,-225.7), -30 deg | HIT, `cls=4` (Table), identical on every tick | centre ray pos (0,-142.5,-297.7) n (0,1,0) up 1.6; screen(0.5,0.75) pos (0,-142.9,-276.8) up 4.3; table-edge/curved rays up 7 to 12 (pos y -142.5 to -143) |
| MESH/raycast + hitTest | Sideboard pose (0,-80,-401), -30 deg | HIT but wrong: `cls=0`, wall at z -494 (up 84), or a plane at y -141.4 (z -462, up 7.4) | The visible sideboard top is at y about -120 (see below). The mesh has no sideboard top. |
| MESH/raycast | SIK ray while hovering | NULL | The hand ray was horizontal at y -134.5, above the mesh, so NULL is geometrically correct. |
| WQ/A, WQ/C | Default camera | HIT, plane y -146.0 / -145.8, n (0,1,0), up 0.0, `cls=0` | First tick NULL, hits from the second tick (about 1 s). z drifts between -197 and -324 from tick to tick. |
| WQ/B | Default camera | HIT but intermittent; y -145.8 to -146.4 | Often NULL on single ticks. |
| WQ/A, B, C | Table pose | HIT, plane y -143.5 to -144.4, up 0.0 | A few cm off the true table top. z jitters (-269 to -300) between ticks and between rays, more than the ray geometry explains. Not a stable table-top reading. |
| WQ/A, B, C | Sideboard pose | Mixed: wall hits up 88 at z -492 (y about -133), slanted hits up 17 to 45, a few plane hits at y -144.4 | Not usable. |
| WQ sikRay | Hover on table, ray horizontal at y -134.5 pointing -X | HIT at pos (-77..-113, -144.4, -287), up 0.0 | A horizontal ray at y -134.5 cannot reach y -144.4. WQ answers with the plane regardless of the ray. |
| WQ classification (session C) | any | `cls=0` always | Classification only in the MESH API (`cls=4` for the table). |

Does it change when the camera moves?
- MESH: results depend only on the ray and are stable across ticks and refreshes. The hit position is repeatable to 0.1 cm.
- WQ: the plane y creeps (-146.1 at camera y 0, -145.4 at camera y -63, -144.4 at camera y -101) and hit z jitters by up to 20 cm tick to tick, with a first tick of NULL after every lens reset.

## SIK targeting ray (PreviewInteractTool Hover)

`Hover` at world (0,-137,-298), right hand, 4000 ms, worked (`AiPreviewAgent` is installed, hand state free afterwards).
- `SIK/- targetingRay ACTIVE start=(2,-134.5,-299.7) end=(0,-134.5,-299.6) inputType=2` (the interactor ray exists in the simulator).
- The ray is horizontal and points along -X, not down at the table.
- Other moments in the same run: start (-1.6,-115,-189.6) and (-8.1,-81,3.1), also nearly horizontal.
- To test a SIK ray against the table, the ray has to point down. Hover alone does not do that. Needs a follow-up with `Pinch`/`Drag` or the mouse ray.

## Table and sideboard (Sunlit Room)

Measured with the mesh probe and cross-checked visually (top-down views at three camera heights, magnification method, error about +-2 cm).

- Round wooden coffee table, top: y = -142.5 (mesh) / about -141 (visual). Centre x about 0 to +2, z about -298 (visual -300). Diameter about 87 cm. About 28 cm tall (floor at about y -170).
- The AR card on the table is at (0, -141, -290).
- Low wooden sideboard, top: y about -120 (visual only; the simulator mesh does not contain it). Front edge z about -442, back at the wall z about -492 (mesh wall hit at -494). Centre x = 0. About 47 cm tall.
- Default camera is at the origin, so the table top is about 142 cm below eye level.
- The Sunlit Room is not in the scene graph (`QueryRuntimeSceneTool` finds nothing named table). All numbers above come from the probe and from images.

## Recommended RECORDING CAMERA POSE (Sunlit Room)

- `MovePreviewCamera setPosition` x 0, y -101, z -225.7
- `MovePreviewCamera lookAt` x 0, y -141, z -295
- `getPose` returns position (0,-101,-225.7), rotation x 330.01, y 0, z 0 (pitch -30 deg, no yaw or roll).
- Distance to the aim point: 80 cm. At -30 degrees the camera is 40 cm above the table top and 69 cm back.
- Framing: the vertical FOV is 36.6 degrees, so about 53 cm along the view direction is visible, about 89 cm wide. The 50 x 35 cm area is therefore centred with margin, and the dish card sits just left of centre.
- The pose persists across lens refreshes (verified), so a refresh does not reset it.
- Screenshot taken from this pose: `docs/v7/stage0-baseline.png` (1600 x 951).

## Script fixes

None. `WorldQueryProbe.ts` compiled clean on the first attempt (0 errors) and ran without changes.

## Surprises

1. WQ is not a ray cast in the simulator. It returns a flat plane near y -144 to -146 (not the room floor, which is about y -170) for every ray, including a horizontal one that cannot hit it.
2. The simulator's world mesh is coarse: table top correct (and classified `Table`), sideboard top missing (about 21 cm too low), a wall at z about -494. Do not tune placement offsets to the Sunlit Room mesh.
3. The probe's 120-line cap is used up in 15 to 25 s because WQ results jitter every tick. Each aim needs a lens refresh first. Camera pose survives the refresh.
4. My first table aim (0,-103,-171) was 130 cm short of the table. The room dimensions in the probe instructions are not in the repo, so I calibrated with top-down screenshots (camera 100 cm above, several heights) before the real runs.
5. `VirtualScene apply` rewrote the tracked file `Miseflow/.virtual-scene.json` (tool snapshot, about 8,900 changed lines). I restored it with `git checkout` after cleanup. Expect it to dirty again after any VirtualScene call.
6. The `delete @asset:Scripts/WorldQueryProbe.ts` removed both the `.ts` and `.meta`; the extra disk delete was a no-op.

## Cleanup verification

- V7Probe object deleted. `WorldQueryProbe.ts` and `.meta` gone from `Miseflow/Assets/Scripts`.
- `RecompileTypeScriptTool`: succeeded, 0 errors.
- `RunAndCollectLogsTool refresh`: no `[V7PROBE]` lines, no errors, LeafIndex registered 24 scenarios, StepEngine started normally.
- Preview camera reset to default (0,0,0).
- `git status --short`: only `?? docs/v7/stage0-baseline.png`. `Miseflow/Assets/Scene.scene` unchanged. Nothing added or committed.
