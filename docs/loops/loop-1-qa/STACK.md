# Loop 1 — the QA stack (Gauge)

**Tree:** `~/Worktrees/a2a-qa` only. **Never** `:3210`/`:4000` (main stack) and never Rivet's
ports (`:3310`/`:3311` Convex, `:4100`/`:4200` hubs, seen 2026-09-23). Rivet's setup steps had not
landed when this was written. Any departure from them is recorded here once they do.

| Part | Port | How |
|---|---|---|
| QA Convex | `:3410` (site `:3411`) | `CONVEX_AGENT_MODE=anonymous node node_modules/convex/bin/main.js dev --local --local-cloud-port 3410 --local-site-port 3411 --typecheck disable --codegen disable` |
| QA hub | `:4410` | `PORT=4410 CONVEX_URL=http://127.0.0.1:3410 node --env-file=.env --import tsx src/index.ts` |
| Fault proxy X | `:4420` → `:4410` | `QA_PROXY_PORT=4420 QA_UPSTREAM=http://127.0.0.1:4410 node docs/loops/loop-1-qa/fault-proxy.mjs` |

## Order, and the checks between steps

1. **Check every port free first**, in any state and both address families
   (`Get-NetTCPConnection -LocalPort <p>`). A taken port is not a warning.
2. Start Convex. Wait for `Convex functions ready`. Confirm `git status --porcelain` shows no
   tracked change.
3. Start the hub. **Confirm the `:4410` listener PID is this process.** Its parent's command line
   carries `PORT=4410 CONVEX_URL=http://127.0.0.1:3410`. The hub's own "Hub running on port N"
   line proves nothing (T-053).
4. Run `p2-isolation.mjs` with `QA_HUB` and `QA_CONVEX` set. **No test counts until it prints
   PASS.** On a DB that already holds `qa-probe`, P2 fails by design. Start from a fresh
   `.convex/` instead.

## Why each flag

- **`CONVEX_AGENT_MODE=anonymous`**: the deployment is local to this tree
  (`a2a-qa/.convex/local/default`, gitignored). It cannot create a cloud project on Aaron's
  account, and it cannot share storage with the main stack's logged-in local deployment.
- **`--codegen disable`**: without it, `convex dev` (convex 1.34.0) rewrites the tracked
  `convex/_generated/*` and creates `convex/tsconfig.json`, so a frozen candidate stops being
  frozen (T-054; accepted by Relay 2026-09-23).
- **Explicit `CONVEX_URL`**: `src/index.ts:35` defaults to `127.0.0.1:3210`, the main stack.
- **Stopping**: stopping the background shell does **not** stop `convex-local-backend.exe`. Kill
  the whole process chain by PID, after checking each command line names `3410`/`4410`.

## Record of the setup run (2026-09-23)

- **08:32Z, P2 FAIL.** The hub was started on `:4200`, which Rivet's hub (pid 6240) already held.
  The QA hub printed "running" and exited 0. The probe registered `qa-probe` through Rivet's hub
  into Rivet's `:3310`. The row was left there, and Rivet and Relay were told. It was an error
  entry of Gauge's: `:4200` was not in the port check.
- **08:34Z, P2 PASS** on `:4410` → `:3410`. The hub's listener PID was confirmed as this tree's
  process first.
- **Instruments validated, 2026-09-23, on master code (`ce2fdca`):** `selftest.mjs` passed 9/9
  against `:4420` → `:4410` → `:3410`:
  - `hub-talk` exits 0 on a turn and 2 on a timeout;
  - cursor files land in `QA_TMP`, and none in the real temp dir;
  - `--inbox` through the proxy is byte-identical to direct;
  - `reads=500` gives 500 through the proxy while direct gives 404;
  - `drop` destroys the socket, and `delay:2000` holds it for 2053 ms;
  - `inject` lands exactly one new turn.
