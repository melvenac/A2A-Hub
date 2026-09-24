<!-- generated from .agents/state.json rev 34 by open-brain v1.8.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 16)_

### Pick up here

Relay session 16 (checkpoint 2, 2026-09-24 ~06:40Z). LOOP 3 (T-003, per-agent keys) IS DESIGNED AND APPROVED, waiting on the SIA hold. Design FINAL: loop/3-per-agent-keys 88a8e0f (+ a0eaa89 build note: start-stack.ps1 honours A2A_KEY_DIR). Rulings: docs/loops/loop-3-ruling-1.md (R1 stored keyStatus, R2 cutover), loop-3-ruling-2.md (approved to build; B1 new names on old client, B2 getByKeyHash stays null) -- both answered in design section 11. Gauge's criteria ACCEPTED: qa/loop-3-harness-keys a522deb (docs/loops/loop-3-qa-criteria.md; harness change 0ca2358). Relay ruled Gauge's Qs: N.5 split (a: scratch A2A_KEY_DIR in QA; b: live main-stack start on Aaron's word -- never start-stack.ps1 in the QA tree); the hold lift covers the throwaway QA stack (asked the SIA planner to confirm at the lift); instrument additions approved. GATES: build when the SIA planner lifts the local hold; merge needs Q1 (Aaron, via SIA planner, expected morning 2026-09-24) + Gauge acceptance + Aaron's word; every tcm act per design section 4.2 on Aaron's word inside a SIA-named quiet window (not yet named: grok may run an A7 session if QA 94 rejects A6). Also this session: Loop 2 = T-001 closed (V-003); T-017 P1; T-057 (Convex port, P1), T-058, T-059 opened. All on docs/session-16-t017, NOT MERGED.

### Watch out

- SIA HOLD (narrowed ~03:25Z): no A2A-Hub local stack, builds, test runs or new seats on THIS machine (covers a2a-rivet-63, a2a-qa-5f). Reading, docs, git, hub traffic, tcm OK. FULL STOP (no commands, no git) when the SIA planner calls one; QA 94's suite is next. Grok's A6 session finished ~06:2xZ, so the no-tcm-restart condition is lifted, but grok is NOT in a quiet window for the key cutover until SIA's candidate A is decided. Lifting the hold is the SIA planner's call.
- Questions for Aaron on SHARED work (anything SIA depends on: T-050, hub transport changes, hub-talk's contract) go through the live SIA planner under D-003, quoted both ways. Find it with ListAgents. A2A-Hub-only work goes to Aaron directly.
- D-005: seats push their OWN working branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force, never another seat's branch; read back with ls-remote. Merges, tags, tcm deploys, main-checkout updates, starting or stopping the local stack, and live Convex writes each need Aaron's word for that act.
- tcm: `ssh melvenac@tcm`. Auto mode blocks production reads; Aaron switches to manual mode to approve each command. The next deploy must rotate a2a-hub.old first. tcm's source is a tar, not a git tree. Reading tcm's Convex: `convex data <table>` with --limit <= ~99999; generate the admin key inside tcm's shell, never print it. SIA's seats spell tcm http://100.124.212.87:4000 -- key directories are keyed on that spelling.
- T-056 diagnosis so far (read-only replay, 2026-09-23): every hub call alice's loop makes returns 200; the queue is empty; model id current. Fault is in reply generation or posting. Next: rerun docs/loops/t-056-alice-sim.mjs or read the 'A2A alice' window for '[alice] poll error'. Needs the local stack running (held).
- One writer for the record while the planner holds a loop; other seats send handoff text to Relay. ob_state writes the CHECKED-OUT tree: switch to the docs branch carrying the latest revision first (session 16: detached origin/master was rev 25 while the branch held 26+).
- start-stack.ps1 reuses anything listening on 3210/4000, so never run it from a seat worktree. Stopping the stack means killing the node and backend PIDs.
- Relay's error shape in sessions 15-16: asserting a fact about an artifact without reading it, and reporting a line when it found a class (Loop 3 brief named 3 dev-key sites; there are 7 -- Gauge found 6, Relay the 7th). Read first; search for the class.
- Decisions are append-only in ob_state; a correction is a new decision pointing at the old.
- SIA's seats run load-sensitive test suites on this machine. Aaron's standing ruling: work normally; pause only when a SIA seat asks for a controlled rerun.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both.
- What did Aaron mean by "Relay can rebuild the tcm hub when ready" (via Atlas, ~05:50Z)? Relay did NOT rebuild: tcm runs 003f57d and master differs only in docs/.agents. Ask Aaron directly.

### Loop state

**Open PRs:** _None._

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** 
- Q1 via SIA planner (queued there): may hub-talk's key contract change as in Loop 3 design section 3.5, with the section 3.6/4.2 cutover?
- Q2 direct: clark, cursor, general -- migrate, release, or leave each? (forge/probe: SIA ruled keep + migrate)
- Q3 direct: which name should the browser client (client/) use?
- Direct: what was the tcm rebuild for?
- Direct: merge docs/session-16-t017 (record rev 26-32, Loop 2 report, Loop 2/3 briefs, Loop 3 rulings 1-2)?

**Rulings made mid-loop:** 
- Loop 2 (T-001) run by Relay on Aaron's word in session 16, verbatim "you do it, turning on manual mode"; read-only; closed with V-003.
- tcm rebuild NOT performed despite Aaron's go-ahead relayed by Atlas ("Relay can rebuild the tcm hub when ready", ~05:50Z): nothing to ship.
- Loop 3 brief Amendment 1: all 6 of Gauge's objections accepted (fe0ef05).
- Loop 3 ruling 1 (c34a792): R1 + R2 required; name format struck (T-059); T-057, T-058 opened.
- Loop 3 ruling 2 (e709329): approved to build subject to B1, B2; rev 2 (88a8e0f) accepted without further ruling.
- SIA planner ruled forge/probe: keep and migrate, never release.
- Gauge's Loop 3 criteria (a522deb) accepted; N.5 split; hold lift to cover throwaway QA stack (confirm at lift).

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
