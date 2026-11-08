# Stage 0 LEAF baseline (Interactive / Sunlit Room / SPECS 27, onDevice false, default parameters)

Run by the orchestrator, one scenario at a time, after the 16:35Z laptop crash. Code state = commit 9e8b9af plus docs only (no Assets changes). An MCP `run_leaf_scenario` call times out at about 60 s; for longer scenarios the pass line is read from the Lens Studio log (`PASSED: <id>`).

| # | scenario | status | note |
|---|---|---|---|
| 1 | station-setup-scenario | PASS | 16:52Z |
| 2 | metric-blade-stepping-scenario | PASS | |
| 3 | volumetric-portion-dome-scenario | PASS | |
| 4 | transfer-arc-scenario | PASS | |
| 5 | time-warp-plating-scenario | PASS | |
| 6 | prep-drift-resolver-scenario | PASS | |
| 7 | gaze-wayfinding-beacon-scenario | PASS | |
| 8 | proposal-gate-rejection-scenario | PASS | ran 16:40Z before the crash, same code |
| 9 | spatula-flip-guide-scenario | PASS | |
| 10 | auto-cook-full-flow | PASS | |
| 11 | universal-dish-page-table | PASS | |
| 12 | multi-dish-auto-cook | PASS | |
| 13 | dish-studio-flow | PASS | |
| 14 | step-engine | PASS | |
| 15 | dish-biryani-cook | PASS | |
| 16 | dish-noodles-cook | PASS | |
| 17 | live-ai-compile | PASS | 57.7 s; live plan "Lemon Tiramisu" in 49 s; gibberish returned the exact not-found string. MCP call timed out, log shows `PASSED` |
| 18 | cook-plan-chicken65 | PASS | |
| 19 | cook-plan-chapathi | PASS | |
| 20 | cook-plan-generic | PASS | |
| 21 | cook-plan-poori | PASS | |
| 22 | cook-plan-athirasam | PASS | |
| 23 | shape-gallery | PASS | |
| 24 | asset-gallery | PASS | |
