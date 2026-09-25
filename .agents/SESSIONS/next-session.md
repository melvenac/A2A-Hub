<!-- generated from .agents/state.json rev 59 by open-brain v1.11.0 — do not edit; change state via ob_state -->

# Next Session Handoff

## planner _(written session 17)_

### Pick up here

Relay session 17 close (2026-09-25 ~07:40Z; no /end, per Atlas, see watch-out). DONE THIS SESSION, all on Aaron's word: v1.9.0 merged+tagged; Loop 4 chat UI (v1.10.0) built, accepted (V-005), merged, tagged; the T-003 tcm cutover ran end to end, shipping v1.10.0, closed on K7 (V-006; log docs/loops/t-003-cutover-log.md); read-only tcm key (T-065, V-007); Loop 5 identity+membership (v1.11.0) accepted (V-008), merged (master f52f6d6) and tagged. Decisions D-008..D-012; gap G-001. NEXT, in order (D-012): (1) after ~04:30Z 2026-09-26, T-064: read tcm's [auth] log with the read-only key (`ssh -i C:/Users/melve/.ssh/tcm-readonly -o IdentitiesOnly=yes melvenac@100.124.212.87 auth-log`; auto mode OK) for a working day since the 04:14:10Z swap; (2) then ask Aaron for the Loop 5 deploy: Rivet follows docs/loops/loop-5-deploy-plan.md (chore/loop-5-deploy-plan 936fda8, NOT YET MERGED: ask Aaron to merge it with this record), including step 0.5 (full-key check of tcm's live compose env_file; copy .env if it points into the rotated dir), steps 12-13 (main checkout to master, GitNexus reindex); Aaron runs gh-runners-pause/resume himself (sudo); Gauge does PB, PD, RL2; (3) one-day [authz] soak via auth-log's authz-lines header; (4) AUTH_MODE=strict on Aaron's word; (5) Loop 6 brief (T-067: enrollment codes, rate limits T-005, error pages T-062; hub-talk contract change is D-003 via Atlas); (6) Funnel + the Grok Bot HTTPS test (T-068). Also queued: T-069 .gitnexusrc (before SIA T-187 makes /sync rebuild), T-070, T-071, T-060, T-057 (0.0.0.0:4000), T-017, T-050.

### Watch out

- DO NOT run /end or ob_end, and never use ob_state's end_session op: it writes ONE shared last_session slot, so each seat's close overwrites the others' (SIA V-074; fix SIA T-163/T-179). At session end: set_handoff for your seat (dry run first, verify), commit on docs/*, let the SessionEnd hook capture. (Atlas, 2026-09-25, on Aaron's question.)
- G-001: in AUTH_MODE=warn the hub admits unknown keys as nobody. NEVER a public address (Funnel, hostname, port forward) before strict. D-011/D-012 fix the order.
- tcm reads: use the read-only key's 6 menu items in auto mode (V-007). Anything else on tcm (writes, compose/.env reads) needs Aaron's manual mode and his word for that act. Its sudo is Aaron's. SIA's seats use http://100.124.212.87:4000 for tcm; key dirs are keyed on that spelling.
- The T-064 read MUST precede the Loop 5 deploy: the container recreate starts a fresh log and would erase the day-long window.
- GitNexus: index follows ~/Projects/A2A-Hub, currently c4d2d1c (PRE-Loop-5) until deploy step 13. Rebuild with `gitnexus analyze --force --skip-agents-md --skip-skills` (1.6.12). Pass repo as the absolute path (two registrations named A2A-Hub).
- Questions for Aaron on SHARED work (hub-talk contract, transport, T-050, SIA tooling) go through the live SIA planner (Atlas) under D-003; A2A-only work to Aaron directly. Aaron wants DETAILED questions with a recommendation, one at a time.
- D-005: seats push their OWN branches (Rivet loop/* chore/*, Gauge qa/*, Relay docs/*); merges, tags, tcm acts, main-checkout updates, stack start/stop and live Convex writes each need Aaron's word for that act. The planner writes briefs, rulings and the record; Rivet builds and designs; Gauge accepts.
- Relay's error shape, again in session 17 (four instances): asserting without reading (bundled the main-checkout update against R2; cited ruling B1 unread; 'SIA seats may never be live' before reading hub-talk; 'refresh touches no tracked file'). Each was caught before harm, twice by peers. Read the artifact a claim rests on BEFORE sending it; validate on a known positive.
- Decisions are append-only; a correction is a new decision pointing at the old (D-012 corrects D-011's order).

### Open questions

- Seat transport: Claude Code cross-session messages or a hub room via scripts/hub-talk.mjs? AGENT.md allows both. (Session 17 used cross-session messages throughout.)

### Loop state

**Open PRs:** _None._

**SHA frozen for QA:** _None._

**Questions pending for Aaron:** 
- Merge chore/loop-5-deploy-plan (936fda8, Rivet's plan, one doc) and this session's closing docs branch (docs/session-17-f).
- After the T-064 read (>= ~04:30Z 2026-09-26): approve the Loop 5 deploy to tcm per docs/loops/loop-5-deploy-plan.md.

**Rulings made mid-loop:** 
- Loop 4 rulings 1-2 (design; criteria, G1 replay + PB/PD, G2).
- Loop 5 rulings 1-2 (design, Q1-Q9, A1 [authz] in read-only log, A2 soak before strict; criteria, O1-O7).
- T-065 W clarified (docker's runc transient is not a QA write; rule wording corrected, original verdict visible).
- Rivet's Loop 5 deploy plan accepted: step 12 to master; tag prev as v1.8.0 before step 4; step 0.5 env_file check; timing after T-064.
- D-008 (local start after main-checkout update), D-009 (ship v1.10.0 in cutover), D-010 (multi-tenant), D-011 (Grok Bot over HTTPS), D-012 (strict after [authz] soak).

## developer _(written session 17)_

### Pick up here

Rivet (handoff relayed to Relay at the session 17 roll, 2026-09-25; full text docs/loops/rivet-handoff-session-17.md, READ IT FIRST). Loop 5 (T-066, v1.11.0) is BUILT and FROZEN at origin/loop/5-identity ebe7747, awaiting Gauge's verdict (criteria qa/loop-5 69967fd; Loop 5 rulings 1-2). Seven declared deviations, #7 being the widened getByName/listOnline returns. Next for Rivet, each on Aaron's word: after merge, the Loop 5 deploy act per the handoff's 11-step plan (redeploying-tcm.md:47-51, NOT deploy.sh; assignOwnerAtDeploy twice; install scripts/tcm a2a-readonly c7728ab751cd + a2a-k7.mjs f1de001c3435; RL2; rows-without-owner=0; stays warn). Then T-069 (.gitnexusrc noStats, per SIA), T-060, the daemon.ts:286 retry bug, D-008 step 3.

### Watch out

- Declare every widened return, even an additive one, as a deviation (Loop 5 lesson).
- tcm: use the read-only key menu for reads; the full key only for writes on Aaron's word; back up authorized_keys and prove a fresh full-key login before touching it. sudo is Aaron's.
- Deploys follow docs/redeploying-tcm.md:47-51 with PB before the swap; build to a version tag, not :latest, before PB.
- git archive under autocrlf=true: -c core.autocrlf=false -c core.eol=lf; count CR bytes with tr. PowerShell 5.1 pipes corrupt binary tar: use git archive -o.
- Scratch stacks on pinned ports only (3310/3311, 41xx), scratch A2A_KEY_DIR, kill by PID (convex-local-backend survives TaskStop). Never start-stack.ps1 from a seat worktree; never the main checkout.

### Open questions

_None._

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
