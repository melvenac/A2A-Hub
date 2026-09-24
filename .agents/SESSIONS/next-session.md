<!-- generated from .agents/state.json rev 40 by open-brain v1.8.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 16)_

### Pick up here

Relay session 16 (checkpoint 4, 2026-09-24). Session 16's record through rev 34 is MERGED (PR #10, e166057); revs 35+ are on docs/session-16-b (not merged). LOOP 3 (T-003, per-agent keys) is FULLY PLANNED, with no open questions for Aaron: design FINAL at loop/3-per-agent-keys a2e1562; criteria ACCEPTED at qa/loop-3-harness-keys f09cb01; D-006 (contract + cutover), D-007 (release the 8 dev-key rows), browser page acts as `aaron` (Aaron, verbatim "page should act as aaron"). GATES: Rivet builds when the SIA planner lifts the local hold (the lift covers the throwaway QA stack; every process STOPPED during SIA full stops); Gauge runs acceptance and must message Relay before the H4 clipboard step, so Relay can warn Aaron first; merge on Gauge's acceptance + Aaron's word; tcm acts per design section 4.2, each on Aaron's word, in a SIA-named window (never during SIA candidate A7).

### Watch out

- SIA HOLD (narrowed ~03:25Z): no A2A-Hub local stack, builds, test runs or new seats on THIS machine (covers a2a-rivet-63, a2a-qa-5f). Reading, docs, git, hub traffic, tcm OK. FULL STOP (no commands, no git) when the SIA planner calls one; relay it to Rivet and Gauge, collect both confirmations, report back. SIA candidate A7 (grok session record 95, then QA 96) is in flight: nothing touching grok or atlas. Lifting the hold is the SIA planner's call.
- Questions for Aaron on SHARED work (anything SIA depends on: T-050, hub transport changes, hub-talk's contract) go through the live SIA planner under D-003, quoted both ways. Find it with ListAgents. A2A-Hub-only work goes to Aaron directly. Aaron asked (session 16) for MORE DETAIL in questions: explain what the thing is, where it lives, what changes, and a recommendation.
- D-005: seats push their OWN working branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force, never another seat's branch; read back with ls-remote. Merges, tags, tcm deploys, main-checkout updates, starting or stopping the local stack, and live Convex writes each need Aaron's word for that act.
- tcm: `ssh melvenac@tcm`. Auto mode blocks production reads; Aaron switches to manual mode to approve each command. The next deploy must rotate a2a-hub.old first. tcm's source is a tar, not a git tree. Reading tcm's Convex: `convex data <table>` with --limit <= ~99999; generate the admin key inside tcm's shell, never print it. SIA's seats spell tcm http://100.124.212.87:4000; key directories are keyed on that spelling. No tcm rebuild unless a new version exists (Aaron, session 16).
- T-056 diagnosis so far (read-only replay, 2026-09-23): every hub call alice's loop makes returns 200; the queue is empty; model id current. Fault is in reply generation or posting. Next: rerun docs/loops/t-056-alice-sim.mjs or read the 'A2A alice' window for '[alice] poll error'. Needs the local stack running (held).
- One writer for the record while the planner holds a loop; other seats send handoff text to Relay. ob_state writes the CHECKED-OUT tree: switch to the docs branch carrying the latest revision first.
- start-stack.ps1 reuses anything listening on 3210/4000, so never run it from a seat worktree. Stopping the stack means killing the node and backend PIDs.
- Relay's error shape in sessions 15-16: asserting a fact about an artifact without reading it, and reporting a line when it found a class (Loop 3 brief named 3 dev-key sites; there are 7). Read first; search for the class; validate the search on a known positive.
- Decisions are append-only in ob_state; a correction is a new decision pointing at the old.
- SIA's seats run load-sensitive test suites on this machine. Aaron's standing ruling: work normally; pause only when a SIA seat asks.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both.

### Loop state

**Open PRs:** _None._

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** 
- Merge docs/session-16-b (record revs 35+) when convenient.

**Rulings made mid-loop:** 
- Loop 2 (T-001) run by Relay on Aaron's word, verbatim "you do it, turning on manual mode"; read-only; closed with V-003.
- tcm rebuild: none. Aaron, session 16: "tcm rebuild was assuming a new version was being created. If non, no rebuild."
- Loop 3: brief Amendment 1 (fe0ef05); ruling 1 (c34a792); ruling 2 (e709329) approved to build; rev 2 (88a8e0f) and rev 3 (a2e1562) accepted; migration replaces the row (no stored agents _id anywhere, checked).
- D-006 (Aaron via the SIA planner): hub-talk key contract + staged cutover approved.
- D-007 (Aaron, direct): release all 8 dev-key rows; each agent re-registers fresh.
- Browser page acts as `aaron` (Aaron, direct: "page should act as aaron").
- Gauge's criteria accepted at f09cb01, including the H4 clipboard rule.
- Session 16 record through rev 34 merged: PR #10, e166057, on Aaron's word "yes".

## developer _(written session 16)_

### Pick up here

Loop 1 (T-049 read receipts, T-051 --peer) is ACCEPTED at e886b6b; PR #3 is open for Aaron. The delivery steps below each need Aaron's word. Candidates for a small follow-up loop: T-053 (the hub logs "running" and exits 0 when its port is taken), T-054 (convex dev rewrites the tracked _generated files), T-055 (the baseline routes return 500 on a bad session id; the new routes already use the normalizeId pattern, convex/messages.ts markRead).

### Watch out

- Delivery, each step on Aaron's word. [Relay, recording this: the ORDER was amended after Rivet wrote it. Atlas asked for server first and Relay agreed on 2026-09-23. So: (1) redeploy tcm, Convex functions first (docs/redeploying-tcm.md), then the image, then a real send, cleared with Atlas for live SIA traffic; (2) only then update ~/Projects/A2A-Hub (it runs the stack and is every SIA seat's hub-talk.mjs), restart it, and send for real, which is A6's deferred live start. Rivet's original text had these two steps the other way round.] Until the checkout is updated, seats show "never read" (L4).
- a2a-rivet/.convex/local (deployment anonymous-agent, used on ports 3310 and 3340) and its .env.local are disposable test state. Never point them at 3210.
- Live-check hazards (docs/loops/loop-1-live-setup.md): agents:getByName can't see the agentCard; A3's "mark the caller" mutant is invisible under the shared dev-key, so use per-seat keys; cmd.exe strips JSON quotes from `convex run`, so call node node_modules/convex/bin/main.js with an args array.
- convex dev regenerates the _generated files with line-ending-only diffs (restore them with git checkout) and writes an untracked convex/tsconfig.json.
- The hub falls back to CONVEX_URL 127.0.0.1:3210 when it's unset (src/index.ts:35), which points at the main stack. Set it explicitly.

### Open questions

_None._

## qa _(written session 16)_

### Pick up here

Loop 1 acceptance is complete. Report 2 (docs/loops/loop-1-qa-report-2.md, qa/loop-1 fb441ab, PR #4) is accepted as the verdict on e886b6b, and all of A1–A7 pass. OUTSTANDING: the A6 live start of start-stack.ps1 is UNVERIFIED. Verify it at the main-checkout update step with a real send, once Aaron authorises updating ~/Projects/A2A-Hub after PRs #3/#4 merge. For the next QA stack, follow docs/loops/loop-1-qa/STACK.md: check ports free, start, confirm the listener PID, start from a fresh .convex, run P2 and the self-test, then the rows.

### Watch out

- A hub that says "Hub running on port N" may not be listening: Express 5 logs success on EADDRINUSE and exits 0 (T-053). Confirm the listener PID's parent command line before any test traffic.
- `convex dev --local` dirties a frozen tree: _generated rewrites, and on a FRESH deployment convex/tsconfig.json appears even with --codegen disable (T-054). Use --codegen disable and delete the tsconfig before rows run.
- TaskStop on an npx convex chain leaves convex-local-backend.exe running. Kill the PID tree after checking each command line.
- Under the shared dev-key, a "marks the caller" mutant survives. Use per-seat keys and whole-row snapshots (`convex data`), not agents:getByName.

### Open questions

_None._

## Last session

Session 15 — 2026-09-23 — planner — `9794e748-290e-4f81-a3a5-b406d8e144c7`
