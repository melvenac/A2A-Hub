<!-- generated from .agents/state.json rev 25 by open-brain v1.8.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 15)_

### Pick up here

ROLL HANDOFF (Relay session 15 -> fresh Relay). STATE: Loop 1 (T-049 read receipts, T-051 --peer) is accepted (Gauge report 2 on e886b6b), merged (#3-#8; master b5aa6b3), tagged v1.8.0 (34ac98b), DEPLOYED to tcm (V-001; rollback: image a2a-hub:prev de11bebd8f93, source ~/projects/a2a-hub.old = fd23eac), ~/Projects/A2A-Hub fast-forwarded to 003f57d (it is every SIA seat's hub-talk), and A6's live start verified (V-002). Receipts were confirmed from SIA's side by Atlas. The LOCAL STACK is STOPPED (all 11 processes by PID, ports free), on Aaron's word via Atlas: "yes, stop it" (SIA planner session, 2026-09-23), for SIA's QA runs. Restart is Aaron's and Relay's call, never while SIA QA is running a suite. A HOLD on A2A-Hub builds and tests is IN FORCE for SIA: SIA's developer has one more full suite on A4, then SIA QA (session 89) runs its suite. Keep it until the live SIA planner lifts it. FIRST ACTIONS for the fresh session: (1) ListAgents to find the live SIA planner (it is rolling too; find it by listing, not by name) and tell it you are the live Relay; (2) keep the hold; (3) do nothing on tcm. NEXT WORK, in order: T-056 (alice answers nobody on the local stack; needs the stack running, so after the hold, on Aaron's word to restart); Loop 2 = T-001 (read-only revocation check on tcm's live DB; brief first, then Aaron's word; SSH as melvenac@tcm with Aaron approving commands in manual mode); T-050's live Cursor stop-hook trial, asked for through the SIA planner under D-003 when SIA has no live Cursor session.

### Watch out

- Questions for Aaron on SHARED work (anything SIA depends on: T-050, and hub transport changes) go through the live SIA planner under D-003 (mirror of SIA D-039; D-004 corrects its master status), quoted both ways, with both links of provenance recorded. Find that planner with ListAgents, not by a remembered name or pipe address. Aaron may also answer directly in this session. A2A-Hub-only work goes to Aaron directly.
- D-005: seats push their OWN working branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force, never another seat's branch; read back with ls-remote. Merges, tags, tcm deploys, main-checkout updates, starting or stopping the local stack, and live Convex writes each need Aaron's word for that act.
- SIA holds: the SIA planner calls them before SIA full-suite runs. During a hold: no builds or tests from any A2A-Hub seat, and stay idle. Confirm each hold by message. Document pushes are not covered.
- tcm: `ssh melvenac@tcm` (the bare `tcm` alias logs in as the Windows user and is refused). Auto mode's classifier blocks production reads; Aaron switches to manual mode to approve each command. Deploys belong to the developer seat by role; Relay deployed v1.8.0 only on Aaron's explicit word. The next deploy must rotate a2a-hub.old first, or `mv` nests into it. tcm's source is a tar of selected paths plus node_modules, not a git tree; verify it by checksum, allowing for line endings.
- T-056 diagnosis so far (read-only replay, 2026-09-23): every hub call alice's loop makes returns 200; the queue is empty; the model id is current (claude-haiku-4-5-20251001); no old room has gained a turn. The fault is in reply generation or posting. Next: rerun the replay script (session 15 scratchpad: alice-sim.mjs; it rebuilds from daemon.ts handleSessions plus one Anthropic call) or read the 'A2A alice' window for '[alice] poll error'. Needs the local stack running.
- One writer for the record while the planner holds a loop; other seats send handoff text to Relay. ob_state's `session` parameter stamps EVERY set_handoff in a call. Three seats share one session counter: Rivet and Gauge both used 16.
- start-stack.ps1 reuses anything listening on 3210/4000, so never run it from a seat worktree. Stopping the stack means killing the node and backend PIDs, not only closing the windows.
- A3-type checks need per-seat keys: under the shared dev-key, a GET-marks-caller regression survives (T-003 note).
- Relay's error shape in session 15, twice: asserting a fact about an artifact without reading it. Read first. Near-miss: opening a task id without checking the highest.
- Decisions are append-only in ob_state; a correction is a new decision pointing at the old.
- SIA's seats run load-sensitive test suites on this machine. Aaron's standing ruling: work normally; pause only when a SIA seat asks for a controlled rerun.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both. Dogfooding the hub would exercise T-008 and T-017, but it makes the seats depend on the thing they are changing.

### Loop state

**Open PRs:** _None._

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** _None._

**Rulings made mid-loop:** 
- Loop 1 closed: accepted on e886b6b, merged, tagged v1.8.0, deployed to tcm server-first, checkout updated; A6 verified (V-001, V-002).
- Local stack stopped 2026-09-23 on Aaron's word via Atlas, verbatim "yes, stop it" (SIA planner session, SIA record session 81), relayed under SIA D-039 / A2A D-003; executed by Relay on the SIA planner's STOP NOW after SIA's developer run ended.
- Roll prepared on Aaron's word via Atlas, verbatim "Have relay write it's handoff first and prep for a roll. Ask all agents to make sure a clean roll will get picked up where we left off".

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
