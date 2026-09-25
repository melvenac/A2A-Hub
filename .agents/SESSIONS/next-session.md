<!-- generated from .agents/state.json rev 44 by open-brain v1.9.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 16)_

### Pick up here

ROLL HANDOFF (Relay session 16 -> fresh Relay, 2026-09-25 ~00:00Z; Aaron restarting VS Code). STATE: LOOP 3 (T-003, per-agent keys, v1.9.0) is BUILT and ACCEPTED (V-004, ruling 4) on loop/3-build-r3 fe4eb14. THREE PRs await Aaron's word to merge, with no file overlaps and no CI: #11 (code, head fe4eb14), #12 (QA docs, head b6f1cef), #13 (Relay's docs/session-16-b: rulings 3-4, V-004, T-057, T-003, and this handoff). Session 16's record through rev 34 is already merged (PR #10, e166057). FIRST ACTIONS: (1) ListAgents: find the live SIA planner (it rolls too) and tell it you're the live Relay; (2) ask Aaron: "merge #11, #12, #13?" (asked in session 16, no answer yet); (3) after the merge, Rivet tags v1.9.0 on the merge commit on Aaron's word. THEN, each on Aaron's word: the live local start (N.5(b): alice/bob key files and migration; browser key for aaron via hub-key.mjs); the tcm cutover per the Loop 3 design section 4.2 (T-003's note has the full order, including `sudo gh-runners-pause` before the deploy act and `sudo gh-runners-resume` after, telling the SIA planner before and after). grok/atlas/forge steps only in a SIA-named window after SIA's candidate A is decided (A8 is in flight). Also open: T-056 (alice silence; needs the local stack), T-057 (P1: fix the tracked compose to 127.0.0.1:3210; make hub-only Convex functions internal), T-017 (P1).

### Watch out

- SIA holds: SIA QA measurement moved to a separate PC (SIA D-045, desktop-o4egb1e) from candidate A8, so full stops of A2A seats should end. EXCEPTION: SIA B's Step 0 load test (location undecided): the SIA planner warns first; then every A2A process is killed by PID, ports are shown free, and the three confirmations are collected and sent back. No tcm step touching grok or atlas until SIA's candidate A is decided.
- Questions for Aaron on SHARED work (anything SIA depends on: hub-talk's contract, transport, T-050) go through the live SIA planner under D-003, quoted both ways. A2A-only work goes to Aaron directly. Aaron wants DETAILED questions: what it is, where it lives, what changes, plus a recommendation.
- D-005: seats push their OWN branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force. Merges, tags, tcm acts, main-checkout updates, starting or stopping the local stack, and live Convex writes each need Aaron's word for that act. D-006 approves the cutover PLAN, not its acts. D-007 is Aaron's word for the 8 releases, done at their plan steps.
- tcm: `ssh melvenac@tcm`; Aaron switches to manual mode for production commands. Two SIA CI runners (tcm-1/tcm-2) are live: low priority, egress-firewalled, MemoryMax 5G each, OOMScoreAdjust 500. Before a deploy act: `sudo gh-runners-pause [timeout]` (waits for jobs; exits 1 'NOT paused' on timeout, killing nothing), then `sudo gh-runners-resume`. A pause doesn't survive a reboot. SIA's seats use http://100.124.212.87:4000 for tcm; key dirs are keyed on that spelling. tcm Convex publishes 127.0.0.1:3210 only (relayed evidence). No rebuild unless there's a new version.
- Every convex dev / hub start pins its ports (convex dev --local silently takes 3210/3211 when free), and every pre-existing listener is identified BEFORE starting. start-stack.ps1 is never run from a seat worktree.
- One writer for the record. ob_state writes the CHECKED-OUT tree: switch to the docs branch holding the latest revision first (the latest is on docs/session-16-b until #13 merges). A `;`-chained command after a failed commit still runs the detach, so check the branch before every ob_state call.
- T-056 (alice silence): rerun docs/loops/t-056-alice-sim.mjs or read the alice window for '[alice] poll error'; needs the local stack, on Aaron's word.
- Relay's error shapes: asserting without reading; reporting a line when it had found a class (the Loop 3 brief named 3 dev-key sites of 7; ruling 3 missed listOnline until checked). Read first, search for the class, validate the search on a known positive.
- Decisions are append-only; a correction is a new decision pointing at the old.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both.

### Loop state

**Open PRs:** 
- #11 — QA: accepted — loop/3-build-r3 -> master, head fe4eb14, Loop 3 code v1.9.0 (V-004); merge + v1.9.0 tag on Aaron's word
- #12 — QA: not_required — qa/loop-3-harness-keys -> master, head b6f1cef, QA criteria/report/instruments (docs only)
- #13 — QA: not_required — docs/session-16-b -> master, Relay record revs 35+ (rulings 3-4, V-004, handoffs)

**SHA frozen for QA:** `fe4eb14`

**Questions pending for Aaron:** 
- Merge #11, #12, #13? (asked in session 16, unanswered)

**Rulings made mid-loop:** 
- Loop 2 (T-001) closed: V-003.
- Loop 3: brief + Amendment 1; rulings 1-4 (docs/loops/loop-3-ruling-1..4.md); accepted on fe4eb14 (V-004); H4.2 exact-string wording corrected, not widened.
- D-006 (hub-talk contract + staged cutover), D-007 (release the 8 dev-key rows), browser page acts as `aaron` (Aaron).
- No tcm rebuild without a new version (Aaron).
- tcm runners: pause/resume procedure agreed with the SIA planner (SIA D-043/D-044).

## developer _(written session 16)_

### Pick up here

Rivet (handoff relayed to Relay at session 16's roll, 2026-09-25). Loop 3 (T-003, v1.9.0) is ACCEPTED at fe4eb14 (V-004); PR #11 is OPEN, not merged. Each needs Aaron's word: (1) merge #11, then `git tag -a v1.9.0 <merge-commit>` and push tags; (2) the tcm cutover, design section 4.2: a pre-deploy read-only (log churn for cursor-grok/grok-probe; askPolicy count on the 8 rows); the deploy act (Convex push -> agents:classifyAtDeploy -> agents:release clark/cursor/general/probe -> hub, staying in warn); a new-client worktree; relay as canary via --init-key; atlas/forge/grok in SIA's window; `hub-key.mjs check --names ...` before updating ~/Projects/A2A-Hub; K7 read-only. Nothing touching grok or atlas until SIA's candidate A is decided. The deploy steps are in docs/redeploying-tcm.md. Refs: loop/3-build-r3 fe4eb14 (accepted), loop/3-build 84694b9 (superseded), loop/3-per-agent-keys a2e1562 (the design). a2a-rivet is clean; nothing running.

### Watch out

- `convex dev --local` binds 3210 when it's free: always pass --local-cloud-port/--local-site-port, and identify every pre-existing listener BEFORE starting.
- Commit or WIP-commit before any mutant check: `git checkout` restores the commit, not uncommitted edits.
- convex dev rewrites convex/_generated/{api.js,dataModel.d.ts,server.d.ts,server.js} with line-ending-only diffs; restore them with git checkout. Only api.d.ts carries a real change (keyLogic).
- `npx gitnexus analyze` rewrites the tracked CLAUDE.md, AGENTS.md and .claude/skills/gitnexus/*; revert those before committing.
- cmd.exe strips JSON quotes from `convex run`: call node node_modules/convex/bin/main.js with an args array.
- tcm's HUB_URL spelling is http://100.124.212.87:4000; key files are keyed by it. Never set AGENT_KEY inline in a seat's command.
- a2a-rivet/.convex/local and .env.local are disposable test state on 3340.

### Open questions

_None._

### Loop state

**Open PRs:** 
- #11 — QA: accepted — loop/3-build-r3 -> master, head fe4eb14

**SHA frozen for QA:** `fe4eb14`

**Questions pending for Aaron:** _None._

**Rulings made mid-loop:** _None._

## qa _(written session 16)_

### Pick up here

Gauge (handoff relayed to Relay at session 16's roll, 2026-09-25). Loop 3 QA is DONE: V-004, PASS on fe4eb14. The criteria, report, instruments and run logs are in docs/loops/loop-3-qa* on qa/loop-3-harness-keys b6f1cef; PR #12 is OPEN, not merged (Aaron's word). NEXT QA work, each on Aaron's word: N.5(b), the live main-stack start (alice/bob get key files and migrate in either order; checked read-only: both rows owned, distinct prefixes, no dev-key row); K7, tcm's read-only checks after each design section 4.2 act, via loop-3-qa/k7-analyzer.mjs (selftest 21/21): --phase deploy (expect 6 rows, 2 owned, 4 legacy, the unused four absent), then --expect-names/--expect-absent/--expect-prefix/--expect-askpolicy, using the askPolicy fingerprints from the pre-deploy read. Tree clean; no process running; every QA port free.

### Watch out

- Two QA worktrees remain, ~/Worktrees/qa3-cand (fe4eb14, detached) and qa3-old (ea9d057), with node_modules installed: reuse them or `git worktree remove` them (QA-owned).
- Stack scripts: loop-3-qa/start-stack.ps1 records PIDs; stop-stack.ps1 (T) proves 16 ports free, including 6790/6791.
- `convex dev --local` binds 3210 unless the ports are pinned, opens a dashboard on 6790/6791, and creates an untracked convex/tsconfig.json (T-054); delete that file before P4's check.
- Inline heredoc edits on this machine mangle backslashes, so write scripts to files. PowerShell: a [string] parameter re-joins arrays; the `kill` alias beats a function named Kill.
- K7 must never send a dev-key request to tcm (N1).

### Open questions

_None._

### Loop state

**Open PRs:** 
- #12 — QA: not_required — qa/loop-3-harness-keys -> master, head b6f1cef

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** _None._

**Rulings made mid-loop:** _None._

## Last session

Session 15 — 2026-09-23 — planner — `9794e748-290e-4f81-a3a5-b406d8e144c7`
