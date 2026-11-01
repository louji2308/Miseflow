---
status: approved
---

# Design brief: Miseflow AR v3.0

<!-- Approved by the learner. Spatial Kitchen Flow Orchestrator. Ready for CLAD build. -->

## The one spatial moment
Standing at your kitchen counter with hands messy and multi-component tasks underway, you slice shallots along a 1.5 cm advisory cutting guideline on your cutting board. When prep runs 25 seconds late, instead of static timers falling out of sync or sounding chaotic alarms, MiseFlow’s **Prep Drift Resolver** recalculates your downstream workflow in real time: sliding the unstarted sauce reduction start window by +25s, protecting your active salmon sear from silent alteration, and surfacing an explainable spatial card (*"Prep slipped +25s. Sauce deferred +25s. Skillet is active: verify burner is low"*). Upon confirming the action hands-free, a 3-second luminous Next Action Conduit guides your gaze to the stove, keeping every station synchronized without touching a screen.

## Why it belongs on glasses
- **Shares your view:** The system anchors glanceable status cues and cutting guidelines directly into the physical workspace—on the cutting board, skillet, and saucepot.
- **Draws in the world at true scale:** World-space status rings and temporary direction conduits live at the stations where physical food and cookware reside, leaving the food and knife paths unobstructed.
- **Leaves your body free:** SIK pinch-to-press interactions and hand-tracking keep hands off smartphones, tablets, or laptops while handling raw fish, hot pans, and sharp knives.
- **Why it's better than a phone:** Phones present static, disconnected countdown lists that require touch interaction with wet/greasy hands and fail to adapt when task pacing drifts. MiseFlow orchestrates inter-task dependencies spatially in front of you.

## Product or overlay
- **Type:** World-anchored spatial overlay on physical kitchen stations (`PrepBoardStation`, `SkilletStation`, `SaucepotStation`), with an integrated **3D Rehearsal Mode** providing realistic virtual countertop props (`ButcherBlockBoard`, `ChefSkillet`, `SimmerSaucepot`, virtual salmon) for demonstration inside the Lens Studio Interactive Preview.
- **What the real version would sense:** Explicit user confirmations and task start/complete events, supported by advisory optical appearance checks (visual browning cues).
- **Stand-in for the preview:** SIK-driven interactable controls on the cutting board, cookware, and wrist command pill that advance the slicing guide, simulate portion reference accumulation, inject a deterministic +25s prep delay, trigger the temporary 3D Next Action Conduit, and fast-forward demo time. Every interaction is operable via mouse pinch/click and verifiable by LEAF automated test scenarios.
- **Honest Sensing Boundaries:** The application deliberately avoids uncalibrated claims of mass measurement, autonomous burner control, or optical food-safety thermometry.

## Where things live
- **Where the user is looking during the main task:** Downward at the countertop and stove ($65\text{ cm}–110\text{ cm}$ away, tilted $20^\circ–35^\circ$ below eye level, centered in the binocular overlap zone).
- **`PrepBoardStation`:** Front-right counter ($80\text{ cm}$ away, $36\text{ cm} \times 24\text{ cm}$ footprint). Contains:
  - *Advisory Slicing Guide:* Stepping 1.5 cm dice reference.
  - *Portion Reference Dome:* Visual volume accumulation reference ($45\text{ cm}^3$ equivalent).
  - *Controls:* `Btn_StepChop`, `Btn_FillPortion`, `Btn_Transfer`.
- **`SkilletStation`:** $35\text{ cm}$ to the left ($95\text{ cm}$ away, $26\text{ cm}$ diameter). Features contracting station status rings and advisory visual browning check.
- **`SaucepotStation`:** $25\text{ cm}$ behind the skillet ($110\text{ cm}$ away, $18\text{ cm} \times 18\text{ cm}$ diameter).
- **`NextActionConduit` (SpatialTransferArc):** 3D parabolic tubular conduit spanning from Prep to Saucepot ($55\text{ cm}$ horizontal span). Dormant until triggered, active for 3.0 seconds, then cleanly dissolves.
- **`WristCommandPill`:** Anchored to user's non-dominant wrist ($28\text{ cm}$ away, $14\text{ cm} \times 4\text{ cm}$) featuring Rehearsal Mode toggle, +25s Prep Drift toggle, and Demo Time-Warp toggle.

## Hands and input
- **Primary Input:** Spectacles Interaction Kit (SIK) pinch-to-press buttons with glowing hover states and clean-plate backing pills.
- **`Step Chop`:** SIK button on the cutting board advances the slicing reference guideline forward in 1.5 cm increments.
- **`Fill Portion`:** SIK button on the portion dome simulates ingredient volume accumulation from 0% to 100%.
- **`Transfer to Pot`:** SIK button on the completed portion dome fires the 3D Next Action Conduit into the saucepot.
- **`Check Sear`:** SIK button on the skillet triggers the advisory visual browning scan with explicit user confirmation.
- **`Simulate +25s Drift / Hold`:** SIK toggle triggers the Prep Drift Resolver, recalculating downstream tasks and prompting explainable actions.
- **`Demo Time-Warp`:** Accelerates the multi-burner countdown with a visible `"DEMO TIME"` indicator so judges can experience the full convergence in a 3-minute video.
- **Manual Fallback:** 100% of actions are reachable via direct SIK pinch/click in Interactive Preview.

## When things show
- **Phase 1 (Prep Active):** Slicing guide and portion reference are active (`CryoTeal` `#00E5FF`). Cookware stations remain in standby.
- **Phase 2 (Drift & Recovery):** When prep slips (+25s), the Prep Drift Resolver shifts unstarted saucepot start window forward, displays the explainable decision prompt, and updates status rings (`AlertCoral` `#FF5252`). The cook confirms hold (`HoldViolet` `#B388FF`).
- **Phase 3 (Next Action Transition):** When prep completes, the Next Action Conduit activates, pulsing across the counter for 3 seconds into the saucepot, then dissolves cleanly.
- **Phase 4 (Plating Convergence):** At `00:00`, all active rings lock into their inner golden bezels, and the Plating Debrief Card materializes above the counter (`"3/3 STATIONS SYNCED • READY TO PLATE"`).

## Done criteria
Each one can be checked in Lens Studio's preview by walking around and clicking:
1. **Station Calibration & Rehearsal Setup:** Spawning the stations on the preview table and toggling Rehearsal Mode displays the 3D cutting board, skillet, and pot with clean-plate 3D labels and zero visual clipping.
2. **Advisory Slicing Stepping:** Clicking the cutting board's "Step Chop" control advances the slicing guideline in 1.5 cm increments.
3. **Portion Reference Accumulation:** Clicking "Fill Portion" rises the portion dome accumulation from 0% to 100% and signals ready state.
4. **Next Action Directional Conduit:** Clicking "Transfer to Pot" triggers the 3D parabolic energy conduit from the cutting board into the saucepot for 3 seconds, updating the saucepot badge to `"DROP SHALLOTS IN POT NOW"`.
5. **Prep Drift Resolver & Explainable Schedule:** Injecting +25s prep delay defers the unstarted sauce step, protects the active skillet sear from silent mutation, and displays the explainable guidance card.
6. **Multi-Station Time-Warp & Plating Convergence:** Clicking "Time-Warp" accelerates the rehearsal clock with a visible "DEMO TIME" indicator, showing both status rings contracting in unison and triggering the plating debrief at `00:00`.

## Out of scope
- Claims of measuring real pan temperature or food safety from RGB cameras.
- Estimating physical mass/grams from uncalibrated depth maps.
- Autonomous control over physical kitchen appliances or stove burners.
- Fully automated knife acoustic transient listening without UI confirmation.
- Cloud multiplayer or remote AI on the critical timing path.

## Risks and open questions
- **Narrow Field of View ($37^\circ \times 32^\circ$):** User cannot see all stations simultaneously without turning their head. (Mitigated by compact local station rings, directional conduit, and glanceable layout within the 1 m binocular overlap zone).
- **Additive Optical Waveguide Contrast:** Black renders as transparent. (Mitigated by using `#080A0E` 85% alpha clean-plate occluders under high-luminance tokens `#00E5FF`, `#FFB300`, and `#00E676`).
- **Physical Feel Unproven:** Real hand-tracking fatigue and long-term ergonomic comfort over a hot stove can only be fully evaluated on physical hardware.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Keep text light and readable from where the user stands.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass.
