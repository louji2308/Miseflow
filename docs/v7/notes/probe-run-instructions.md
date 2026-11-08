# V7 surface-placement probe: run instructions (orchestrator)

Goal: find out which surface-placement API returns results in the Lens Studio Interactive Preview (Sunlit Room, SPECS 27 simulation) before D1 / S2 (Claim Your Kitchen) is built.

Probe source: `docs/v7/notes/WorldQueryProbe.ts` (class `WorldQueryProbe`, no Inspector inputs, starts in `OnStartEvent`, prints at most 120 lines, every line tagged `[V7PROBE]`).

## 0. Preconditions (do not skip)

- The LEAF agent must be idle. Steps 1, 2 and 7 save/recompile/refresh and would cancel a LEAF run. Steps 3 to 6 only move the preview camera and read logs, but run them after step 2 on a quiet preview anyway.
- Preview source = Sunlit Room, device = SPECS 27 simulation, same as the LEAF baseline (`docs/v7/notes/stage0-leaf-baseline.md`). Check with PreviewPanelTool before starting.
- This run adds a temporary script and scene object. Do not leave the scene saved with the probe in it (step 7 removes both).
- Never use raw HTTP against Lens Studio. Only the MCP tools named below.

## 1. Install the probe script

Copy the file (shell, not an MCP call):

    copy "C:\Users\LOUJAN B\Kinetix-Twin\Miseflow\docs\v7\notes\WorldQueryProbe.ts" "C:\Users\LOUJAN B\Kinetix-Twin\Miseflow\Miseflow\Assets\Scripts\WorldQueryProbe.ts"

Then RecompileTypeScriptTool. It must report no errors. If the compile fails, fix only the probe file (likely culprits: an import path, `SurfaceClassification` not resolving, or an overload on `createEvent`). Imports use the same `SpectaclesInteractionKit.lspkg/...` prefix as `MiseFlowButtonTrigger.ts`.

## 2. Add the V7Probe object (VirtualScene apply)

Optionally `VirtualScene` `read` first to confirm there is no existing object named `V7Probe`. Then:

```json
{
  "command": "apply",
  "instructions": {
    "create": [
      {
        "id": "$temp:probe",
        "name": "V7Probe",
        "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
        "components": [
          {
            "type": "ScriptComponent",
            "properties": { "scriptAsset": "@asset:Scripts/WorldQueryProbe.ts" }
          }
        ]
      }
    ]
  }
}
```

If the apply is refused with a recompile error, run RecompileTypeScriptTool again and resend (validation is all-or-nothing, nothing was created). The probe needs the main camera to exist in the scene (it finds it through SIK's `WorldCameraFinderProvider`, then falls back to a scene search); no wiring is needed.

Order matters: the probe object is root level, so it starts after the SIK objects above it only if it is lower in the hierarchy. It is created last, so it is. Its work happens in `OnStartEvent` anyway.

## 3. First run and baseline log

Call RunAndCollectLogsTool with `mode: "refresh"`, `settleMinMs: 4000`, `settleQuietMs: 2500`, `settleMaxMs: 12000`. The probe prints change-driven (quiet stretches are normal), so a longer quiet window avoids cutting it off.

Grep the result (or `logFile` from `byteOffset`) for `V7PROBE`.

The startup block tells you immediately which APIs even exist at runtime:

| Startup line | What it means |
|---|---|
| `deviceInfoSystem.isEditor()=true` | Confirms the preview is the editor path (expected). |
| `WorldQueryModule loaded: yes` or `require ERROR ...` | The module resolves or not in the simulator. |
| `session A (filter=true) started` / `ERROR ...` | `HitTestSession.start()` works or throws. Session C (classification) may legitimately fail; ignore it for the decision. |
| `DeviceTracking.raycastWorldMesh exists=... hitTestWorldMesh exists=...` | Both present in `StudioLib.d.ts` (checked 8 Nov 2026). `false` means the runtime lacks them. |
| `worldTrackingCapabilities sceneReconstructionSupported=...` | If `false`, MESH probes will return empty regardless of the room. |
| `worldOptions BEFORE ... AFTER ...` | The probe sets `enableWorldMeshesTracking` and classification to true at runtime. If AFTER is still `false`, the setter was refused. |

## 4. Aim the preview camera at the coffee table, then read results

Coordinates in MovePreviewCamera are Inspector coordinates, centimetres. The Sunlit Room dimensions are not recorded in the repo, so calibrate instead of guessing:

1. `MovePreviewCamera` action `getPose` (records the start pose).
2. Take a screenshot (CapturePanelScreenshotTool or CaptureRuntimeViewTool) to see where the round wooden coffee table and the low wooden sideboard are relative to the view.
3. For exact target coordinates, use QueryRuntimeSceneTool (read-only) to find the room mesh objects and their world positions and bounds (look for names containing table, coffee, sideboard, cabinet). If the room is one merged mesh, use the screenshot plus `orbit` to eyeball it.

Aim at the coffee table from about 120 to 150 cm away, eye height around 150 cm, looking down about 30 to 45 degrees onto the table top, so the 30/45 degree rays and the straight-down-from-60 cm ray all cross the top:

```json
{
  "action": "setPosition",
  "x": "<tableX>", "y": 150, "z": "<tableZ + 130, or whichever side is open>"
}
```
```json
{
  "action": "lookAt",
  "x": "<tableX>", "y": "<table top height, typically 40 to 55>", "z": "<tableZ>"
}
```

Or batch both: `MovePreviewCamera` with `commands: [{action:"setPosition",...},{action:"lookAt",...},{action:"getPose"}]`. Note the pose from `getPose` for the report.

The probe reads the camera each tick and prints on change, so no lens refresh is needed after moving the camera. Wait about 3 seconds, then call RunAndCollectLogsTool with `mode: "tail"` (this does not reset the lens and keeps the evidence). Grep for `V7PROBE` and note, for the table view:

- `WQ/A fwd200`, `WQ/A down30_len300`, `WQ/A down45_len300`, `WQ/A straightDown_from60cmAhead_len300`, and the same for `WQ/B`.
- `MESH/raycast` for the same four ray names, and `MESH/hitTest screen(...)`.
- For each: HIT or NULL or NO_CALLBACK or ERROR, `pos`, `n`, `up=<deg>`, `cls`.

Expected sanity for a table top: `up` below 15 degrees, `pos.y` equal to the table height and consistent between the 30, 45 and straight-down rays (within about 3 cm). A hit with `pos.y` near 0 means the ray passed the table and hit the floor, which is also informative.

## 5. Aim at the low wooden sideboard and repeat

Same procedure: `setPosition`/`lookAt` onto the sideboard top (this surface is lower and nearer a wall, which is the likely real kitchen-counter stand-in), wait about 3 seconds, `mode: "tail"`, grep `V7PROBE`. Record the same fields.

## 6. Test a SIK / mouse ray hit with PreviewInteractTool

The SIK probe line (`SIK/- targetingRay`) says `NONE` until an interactor is targeting. To provoke it, hover a hand over a world position on the table top. Use a point you already know lies on the table: take `pos` from a `MESH` or `WQ` HIT from step 4, or read the table top position through QueryRuntimeSceneTool. Then:

```json
{
  "action": "Hover",
  "handType": "right",
  "worldPosition": { "x": "<tableX>", "y": "<table top y + 5>", "z": "<tableZ>" },
  "durationMs": 4000
}
```

(`PreviewInteractTool` needs `AiPreviewAgent.lspkg`; if it is missing the call will error, report that and stop this step.) During the hover, or immediately after, call RunAndCollectLogsTool `mode: "tail"` and grep `V7PROBE`. You want:

- `SIK/- targetingRay ACTIVE start=... end=... inputType=...` (the interactor ray exists in the simulator).
- `WQ/A sikRay`, `WQ/B sikRay`, `MESH/raycast sikRay`: HIT with `pos` close to the table.

Release the hand with `{"action":"Release","handType":"right"}` if the hover leaves one holding (check `handState` in the response). The probe prints at most 120 lines in total, so if the cap line `print cap 120 reached` appears early, restart the lens with RunAndCollectLogsTool `refresh` and redo steps 4 to 6 in the same order (table, sideboard, hover), reading the log after each.

## 7. Clean up (mandatory)

1. Remove the object and the script asset in one VirtualScene apply:

```json
{
  "command": "apply",
  "instructions": {
    "delete": ["@sceneObject:V7Probe", "@asset:Scripts/WorldQueryProbe.ts"]
  }
}
```

2. Delete the copy on disk if the asset delete did not remove it: `del "C:\Users\LOUJAN B\Kinetix-Twin\Miseflow\Miseflow\Assets\Scripts\WorldQueryProbe.ts"` and its `.meta` if present.
3. RecompileTypeScriptTool to confirm a clean compile. Reset the preview camera with `MovePreviewCamera` `reset` (or restore the pose you recorded in step 4).
4. `git status` in `C:\Users\LOUJAN B\Kinetix-Twin\Miseflow` must show no new files under `Miseflow/Assets` and no scene changes. The master copy stays at `docs/v7/notes/WorldQueryProbe.ts`.

## 8. Decision table

"Sane normal" means `up` of 15 degrees or less on a flat table or sideboard top (the D1 rejection threshold), a `pos` whose height matches the surface, and the same result on at least two different rays and over at least three consecutive ticks (not a one-off).

| Observation (Sunlit Room, SPECS 27 sim) | Decision |
|---|---|
| `WQ/A` (and ideally `WQ/B`) HIT with a sane normal on the table or sideboard from at least two of the four camera rays, and ideally on the SIK ray in step 6 | Path A: plain World Query hit test, as written in D1. Use session A (filter true) for the claim reticle. Classification stays device-only. |
| WQ returns NULL, NO_CALLBACK or ERROR for all rays, but `MESH/raycast` (or `MESH/hitTest`) HIT with a sane normal | Path B: `DeviceTracking.raycastWorldMesh` against the room. Remember it needs `worldOptions.enableWorldMeshesTracking = true` and the DeviceTracking component in World mode; the claim controller must set it itself. On device use `cls=Table` from `TrackedMeshFaceClassification` to snap. |
| WQ hits only on the floor or with a bad normal, MESH empty | Treat as Path C for the table surface (see next row). Floor-only hits are not enough for counter placement. |
| Neither WQ nor MESH returns usable hits anywhere (NULL, NO_CALLBACK, ERROR, or `sceneReconstructionSupported=false`) | Path C: a Lens-provided virtual counter plane (a faint slab the claim ray intersects with plain ray-plane math, same as the S1 slab shown faintly in the Preview). This is the fallback the organizer's preview-limits file lists as acceptable. Keep the WQ and MESH code behind a device-only guard so the glasses still use the real surface. |
| WQ works only when the SIK ray is `ACTIVE` but not on the fixed camera rays (or the reverse) | Path A, but drive it from the SIK targeting ray only (that is what the claim reticle does anyway). Record the limitation in the Part J honesty table. |

Also record in the stage 0 report: the camera poses used, the exact `[V7PROBE]` lines for each aim, the startup block, and which session (A or B) behaved.
