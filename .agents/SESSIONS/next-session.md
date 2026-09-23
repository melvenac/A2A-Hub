<!-- generated from .agents/state.json rev 21 by open-brain v1.7.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 15)_

### Pick up here

Loop 1 is DONE in git: PRs #3-#7 merged (master 003f57d) on Aaron's direct word "merge all five"; v1.8.0 tagged at 34ac98b (the PR #3 merge; code byte-identical to the accepted e886b6b) on his direct word "tag the release as v1.8.0 and push the tag"; T-049 and T-051 closed. NOT LIVE YET. Next, when Atlas says SIA hub traffic is quiet, each step on Aaron's word and SERVER FIRST: (1) redeploy tcm: `npx convex deploy`, then the image, then a real send (docs/redeploying-tcm.md; tag the outgoing image for rollback); (2) update ~/Projects/A2A-Hub (still at f7f102d; every SIA seat's hub-talk), restart the main stack and do a real send, which closes A6's deferred live start. Then Loop 2 = T-001. Follow-up candidates: T-053, T-054, T-055; T-050 needs a live Cursor-hook trial; T-052 comes from Gauge's observations.

### Watch out

- Shared work with SIA (T-050 and delivery of T-049/T-051) runs under D-003: questions for Aaron go through Atlas (SIA planner), quoted both ways; outward acts need Aaron's word for that act. Aaron may also give it directly in this repo's session. Check relayed claims against source before recording them.
- D-005: seats push their OWN working branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force, never another seat's branch; read back with ls-remote. Merges, tags, redeploys, main-checkout updates and live Convex writes still need Aaron's word for that act.
- SIA holds: Atlas calls them before SIA full-suite runs (another was due on 2026-09-23 for sia-qa-76 scoring A3). During a hold: no builds or test runs from any A2A-Hub seat, and stay idle. Document pushes are not covered.
- No tcm redeploy while SIA hub traffic is live; ask Atlas first. Receipts reach SIA only after BOTH the tcm redeploy (SIA's room lives on tcm) AND the main-checkout update (for hub-talk).
- One writer for the record while the planner holds the loop: other seats send handoff text to Relay rather than running ob_state from a tree behind the live revision.
- ob_state's `session` parameter stamps EVERY set_handoff in the call. Record another seat's handoff in its own call with that seat's session number.
- Three seats share one session counter: Rivet and Gauge both used 16 (logs renamed Session_16_developer.md / Session_16_qa.md).
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

**Open PRs:** _None._

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** _None._

**Rulings made mid-loop:** 
- Session 15: Loop 1 = T-049 + T-051; T-001 moves to Loop 2.
- Accepted on e886b6b (Gauge report 2, all rows PASS); merged in PRs #3-#7 at 003f57d on Aaron's direct word "merge all five"; tagged v1.8.0 at 34ac98b on his direct word "tag the release as v1.8.0 and push the tag".
- Delivery order: server first (tcm redeploy), then the main checkout. Atlas's preference, agreed by Relay.

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
