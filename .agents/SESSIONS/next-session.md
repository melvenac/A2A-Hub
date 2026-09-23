<!-- generated from .agents/state.json rev 22 by open-brain v1.8.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 15)_

### Pick up here

Loop 1 is DONE AND LIVE. Merged (PRs #3-#7, 003f57d), tagged v1.8.0 (34ac98b), deployed to tcm server-first, and ~/Projects/A2A-Hub updated to 003f57d (V-001). Atlas was sent the evidence and is testing receipts from SIA's side; a relay<->atlas room k571j07exa0rdpjxjjdfc3d7v98ey1wh has turn 1 waiting. Only remaining Loop 1 item: A6's live start-stack.ps1 check. The local main stack (3210/4000) is down; starting it needs Aaron's word. Next: Loop 2 = T-001 (read-only check of revocation on tcm's live DB; SSH as melvenac@tcm works with Aaron approving commands), possibly paired with T-003. Follow-ups: T-050 live Cursor-hook trial, T-052, T-053, T-054, T-055.

### Watch out

- Shared work with SIA runs under D-003: questions for Aaron go through Atlas, quoted both ways; outward acts need Aaron's word for that act. Aaron may also give it directly in this repo's session. Check relayed claims against source before recording them.
- D-005: seats push their OWN working branches without asking (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); never master, never force, never another seat's branch; read back with ls-remote. Merges, tags, redeploys, main-checkout updates and live Convex writes still need Aaron's word for that act.
- tcm access: `ssh melvenac@tcm` (the bare alias `tcm` logs in as the Windows user and is refused). In auto mode the classifier blocks even production reads; Aaron switched to manual mode to approve each command for the 2026-09-23 deploy. The planner role file says the planner does not deploy. This deploy was done by Relay on Aaron's explicit word because Rivet had ended; say so if it happens again.
- tcm rollback levers: image a2a-hub:prev (de11bebd8f93, v1.7.0/fd23eac), source ~/projects/a2a-hub.old (fd23eac), older tree ~/projects/a2a-hub.old-pre-fd23eac. The next deploy must rotate these first: a bare `mv a2a-hub a2a-hub.old` would nest into the existing folder.
- tcm's source dir is a tar of selected paths (convex, Dockerfile, .dockerignore, package*.json, scripts, src, tsconfig.json) plus node_modules. It is not a git tree: verify it against git by checksum, allowing for line endings.
- SIA holds: Atlas calls them before SIA full-suite runs. During a hold: no builds or test runs from any A2A-Hub seat, and stay idle.
- One writer for the record while the planner holds the loop; other seats send handoff text to Relay. ob_state's `session` parameter stamps EVERY set_handoff in a call.
- Three seats share one session counter: Rivet and Gauge both used 16.
- start-stack.ps1 reuses anything already listening on 3210/4000, so never run it from a seat worktree.
- A3-type checks need per-seat keys: under the shared dev-key, a GET-marks-caller regression survives (T-003 note).
- Relay's error shape in session 15, twice: asserting a fact about an artifact without reading it. Read first.
- Decisions are append-only in ob_state; a correction is a new decision pointing at the old.
- Check the highest task id before opening a task.
- SIA's seats run load-sensitive test suites on this machine. Aaron's standing ruling: work normally; pause only when a SIA seat asks for a controlled rerun.

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both. Dogfooding the hub would exercise T-008 and T-017, but it makes the seats depend on the thing they are changing.

### Loop state

**Open PRs:** 
- #8 docs/session-15-closeout @ eb7c85d — QA: not_required — The record at rev 21. Superseded by this revision (22+), which rides on a later docs push.

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** _None._

**Rulings made mid-loop:** 
- Loop 1: accepted on e886b6b; merged #3-#7 at 003f57d ("merge all five"); tagged v1.8.0 at 34ac98b ("tag the release as v1.8.0 and push the tag").
- Delivered 2026-09-23: tcm redeploy then main-checkout update, server first. Aaron via Atlas: "redeploy the tcm hub and then update ~/Projects/A2A-Hub now"; Aaron direct: "I have manual mode on, try again". Evidence in V-001.

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
