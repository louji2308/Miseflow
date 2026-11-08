# Stage 0 LEAF baseline

Runner: LEAF baseline runner (one scenario at a time, Lens Studio preview, Interactive / Sunlit Room / SPECS 27, onDevice false, default parameters).

| scenario | start UTC | end UTC | status | note |
|---|---|---|---|---|
| station-setup-scenario | 16:28Z | 16:30Z | timeout (attempt 1) | MCP run_leaf_scenario call returned 'The operation timed out.' |
| station-setup-scenario | 16:30Z | 16:31Z | timeout (attempt 2) | MCP call timed out again. Log tail (60000 bytes): attempt 1 actually logged 'PASSED: station-setup-scenario' at 22:00:09 local (6.3s); attempt 2 logged 'Running scenario' at 22:00:17 with no completion line. Harness-side timeout, not a scenario failure. |
| metric-blade-stepping-scenario | 16:31Z | 16:33Z | timeout (attempt 1) | run_leaf_scenario timed out; follow-up tail read also timed out, so the MCP bridge looks unresponsive |
