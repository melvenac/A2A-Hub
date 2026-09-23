<!-- generated from .agents/state.json rev 19 by open-brain v1.7.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 15)_

### Pick up here

Loop 1 ACCEPTED: Gauge's report 2 (qa/loop-1 fb441ab) passes A1-A7 on e886b6b; the live start-stack check is UNVERIFIED and deferred. PRs #3 (code), #4 (QA evidence) and #5 (record) are open for Aaron to merge. After the merge: close T-049 and T-051. Delivery waits for Atlas's all-clear (SIA traffic was live overnight on 2026-09-23). Then, each step on Aaron's word and SERVER FIRST (Atlas's preference, agreed): (1) redeploy tcm: `npx convex deploy`, then the image, then a real send; (2) only then update ~/Projects/A2A-Hub (every SIA seat's hub-talk), restart the main stack and do a real send, which is A6's deferred live start. Loop 2 = T-001.

### Watch out

- Shared work with SIA (T-049/T-050/T-051) runs under D-003: questions for Aaron go through Atlas (SIA planner), quoted both ways; outward acts need Aaron's word for that act. Aaron may also give it directly in this repo's session. Check relayed claims against source before recording them.
- D-005: seats push their OWN working branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force, never another seat's branch; read back with ls-remote. Merges, tags, redeploys, main-checkout updates and live Convex writes still need Aaron's word for that act.
- One writer for the record while the planner holds the loop: other seats send handoff text to Relay rather than running ob_state from a tree behind the live revision (Rivet's proposal, session 16). Running it from such a tree forks the record.
- ob_state's `session` parameter stamps EVERY set_handoff in the call. Record another seat's handoff in its own call with that seat's session number (session 15: stamping the planner handoff 16 by mistake needed a fix revision).
- While SIA QA runs, Atlas can call a pause: no builds or test runs from Rivet or Gauge until Atlas says done. Git pushes of documents are not covered by the pause.
- No tcm redeploy while SIA hub traffic is live; ask Atlas first. A redeploy is image plus `npx convex deploy`, verified with a real send. Receipts reach SIA only after BOTH the tcm redeploy (SIA's room lives on tcm) AND the main-checkout update (for hub-talk).
- Every SIA seat runs ~/Projects/A2A-Hub/scripts/hub-talk.mjs (Atlas, 2026-09-23; Grok's exact invocation is unconfirmed). That checkout was at f7f102d, and a GitHub merge does not update it.
- The main stack (3210/4000) was DOWN on the night of 2026-09-23. start-stack.ps1 reuses anything already listening on 3210/4000, so never run it from a seat worktree.
- Seat test stacks: Rivet 3310/4100 (and others), Gauge 3410/4410/4420. Check a port is free and the listener PID is your own before trusting it (T-053).
- A3-type checks need per-seat keys: under the shared dev-key, a GET-marks-caller regression survives (T-003 note).
- Relay's error shape in session 15, twice: asserting a fact about an artifact (the ruling's backticks, Gauge's instrument) without reading it. Read first. The entries are in Session_15.md.
- Decisions are append-only in ob_state (no op amends one); a correction is a new decision pointing at the old, as D-004 does for D-003.
- Check the highest task id before opening a task.
- The main checkout's .claude/settings.local.json does not carry over to the worktrees, so each seat starts with fresh permission prompts.
- SIA's seats run load-sensitive test suites on this machine. Aaron's standing ruling: work normally; pause only when a SIA seat asks for a controlled rerun.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both. Dogfooding the hub would exercise T-008 and T-017, but it makes the seats depend on the thing they are changing.

### Loop state

**Open PRs:** 
- #3 loop/1-read-receipts @ e886b6bd4bd233da36a7cb6f5ce150b266d52f9c — QA: accepted — Gauge report 2 (qa/loop-1 fb441ab): A1-A7 PASS; A6 live start UNVERIFIED (deferred). Merges cleanly into ce2fdca; the merged tree differs from the tested tree only in record/doc files (git merge-tree).
- #4 qa/loop-1 @ fb441ab5d1c3283bcc46682ee65ab094834cdbe3 — QA: not_required — Gauge's criteria, reports 1 and 2, instruments and run logs. Documents only.
- #5 docs/loop-1-acceptance — QA: not_required — The record after acceptance (rev 16, plus revs 17-18 with the handoffs). Documents only.

**SHA frozen for QA:** `e886b6bd4bd233da36a7cb6f5ce150b266d52f9c`

**Questions pending for Aaron:** 
- Merge PRs #3, #4 and #5?

**Rulings made mid-loop:** 
- Session 15: Loop 1 = T-049 + T-051; T-001 moves to Loop 2.
- PR #1 (brief) merged at 2eb7928 and PR #2 (ruling 1, D-005) at ce2fdca, both on Aaron's direct word.
- Gauge Q1: A6's live start is UNVERIFIED, deferred to the main-checkout update. Gauge Q2: left members are observation-only -> T-052.
- Report 1 on cb7cda7: A2.6, A6.3 and A7 FAIL. A6.3 was kept as written; Rivet added the a2aTasks section rather than the criterion being narrowed. T-055 was opened for the baseline 500 class.
- A7 instrument ruled (a), unchanged, before the re-run: each rule goes on one header line.
- Re-frozen at e886b6b; report 2 ALL PASS.
- Delivery order: server first (tcm redeploy), then the main checkout. Atlas's preference, agreed by Relay; A4 showed both skews safe, and server first keeps new-client/old-server from ever happening live.

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

Session 15 — 2026-09-22 — planner — `f11f4c14-93fb-4b0f-8ba2-a716a1187e70`
