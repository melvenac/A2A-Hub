<!-- generated from .agents/state.json rev 29 by open-brain v1.8.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 16)_

### Pick up here

Relay session 16 (mid-session checkpoint, 2026-09-24 ~06:00Z). DONE this session: T-017 re-scoped from Atlas's v1.8.0 evidence and raised P1 (rev 26); Loop 2 = T-001 CLOSED: Relay ran the read-only tcm check on Aaron's word ("you do it, turning on manual mode"): revocation of superseded keys holds (V-003), but 8 of 10 names share the dev-key, which resolves as `atlas` (docs/loops/loop-2-revocation-report.md); T-003 raised to P0 and objective updated (rev 27); Loop 3 brief written (docs/loops/loop-3-per-agent-keys-brief.md). All on docs/session-16-t017, NOT MERGED (needs Aaron). Rivet (a2a-rivet-63) was sent the Loop 3 brief for DESIGN ONLY (docs/loops/loop-3-design.md on its loop/* branch); Gauge (a2a-qa-5f) told to read it and hold criteria until Relay rules. NEXT: rule on Rivet's Loop 3 design when it lands; T-056 after the SIA hold lifts and Aaron says restart the local stack.

### Watch out

- SIA HOLD, narrowed (SIA planner ~03:25Z and ~05:50Z, 2026-09-24): no A2A-Hub local stack, builds, test runs or new seats on THIS machine (covers a2a-rivet-63 and a2a-qa-5f). Reading, docs, git, hub traffic OK. FULL STOP (no commands, no git) whenever the SIA planner calls one for a SIA QA suite (QA 94 is next). tcm: NO restart or redeploy until the SIA planner says Grok's A6 session is finished (Grok's only line is the tcm hub; a drop stalls SIA overnight). Lifting the hold is the SIA planner's call.
- Questions for Aaron on SHARED work (anything SIA depends on: T-050, and hub transport changes) go through the live SIA planner under D-003 (mirror of SIA D-039; D-004 corrects its master status), quoted both ways, with both links of provenance recorded. Find that planner with ListAgents, not by a remembered name or pipe address. Aaron may also answer directly in this session. A2A-Hub-only work goes to Aaron directly.
- D-005: seats push their OWN working branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force, never another seat's branch; read back with ls-remote. Merges, tags, tcm deploys, main-checkout updates, starting or stopping the local stack, and live Convex writes each need Aaron's word for that act.
- tcm: `ssh melvenac@tcm` (the bare `tcm` alias logs in as the Windows user and is refused). Auto mode's classifier blocks production reads; Aaron switches to manual mode to approve each command. Deploys belong to the developer seat by role; Relay deployed v1.8.0 only on Aaron's explicit word. The next deploy must rotate a2a-hub.old first, or `mv` nests into it. tcm's source is a tar of selected paths plus node_modules, not a git tree; verify it by checksum, allowing for line endings. Reading tcm's Convex: `convex data <table>` with --limit <= ~99999 (100000 fails server-side: 'Requested too many items: 100001'); generate the admin key inside tcm's shell, never print it.
- T-056 diagnosis so far (read-only replay, 2026-09-23): every hub call alice's loop makes returns 200; the queue is empty; the model id is current (claude-haiku-4-5-20251001); no old room has gained a turn. The fault is in reply generation or posting. Next: rerun the replay script (tracked at docs/loops/t-056-alice-sim.mjs; it rebuilds from daemon.ts handleSessions plus one Anthropic call) or read the 'A2A alice' window for '[alice] poll error'. Needs the local stack running.
- One writer for the record while the planner holds a loop; other seats send handoff text to Relay. ob_state's `session` parameter stamps EVERY set_handoff in a call. Three seats share one session counter: Rivet and Gauge both used 16. ob_state writes the CHECKED-OUT tree: switch to the docs branch that carries the latest revision before calling it, or it refuses on revision mismatch (session 16: detached origin/master was rev 25 while the branch held 26).
- start-stack.ps1 reuses anything listening on 3210/4000, so never run it from a seat worktree. Stopping the stack means killing the node and backend PIDs, not only closing the windows.
- Relay's error shape in sessions 15-16: asserting a fact about an artifact without reading it. Read first. Session 16 near-misses caught before they shipped: 'nothing marks an agent offline' (then grepped: true), and the dev-key as a known positive (then checked hub-talk.mjs:65,175).
- Decisions are append-only in ob_state; a correction is a new decision pointing at the old.
- SIA's seats run load-sensitive test suites on this machine. Aaron's standing ruling: work normally; pause only when a SIA seat asks for a controlled rerun.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both. Dogfooding the hub would exercise T-008 and T-017, but it makes the seats depend on the thing they are changing.
- What did Aaron mean by "Relay can rebuild the tcm hub when ready" (via Atlas, SIA planner session, 2026-09-24 ~05:50Z)? Relay did NOT rebuild: tcm runs 003f57d and master differs from it only in docs/.agents (git diff empty for src, convex, scripts, package.json, Dockerfile), so a rebuild ships identical code. Ask Aaron directly when he is back.

### Loop state

**Open PRs:** _None._

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** 
- Merge docs/session-16-t017 (record rev 26-27, Loop 2 report, Loop 2 and Loop 3 briefs)?
- What was the tcm rebuild for? (see open_questions)

**Rulings made mid-loop:** 
- Loop 1 closed: accepted on e886b6b, merged, tagged v1.8.0, deployed to tcm server-first, checkout updated; A6 verified (V-001, V-002).
- Local stack stopped 2026-09-23 on Aaron's word via Atlas, verbatim "yes, stop it" (SIA planner session, SIA record session 81), relayed under SIA D-039 / A2A D-003.
- Loop 2 (T-001) run by Relay, not Rivet, on Aaron's word in Relay session 16, 2026-09-24, verbatim "you do it, turning on manual mode"; read-only; closed with V-003.
- tcm rebuild NOT performed despite Aaron's go-ahead relayed by Atlas ("Relay can rebuild the tcm hub when ready", SIA planner session, 2026-09-24 ~05:50Z, under D-039/D-003): nothing to ship (003f57d == master in all code paths). Atlas's added condition (no tcm restart until Grok's A6 session ends) is in force. Atlas agreed and corrected SIA's AUTH_MODE reference note using Loop 2's report.
- Loop 3 (T-003) opened for design only; build waits on the SIA hold.

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
