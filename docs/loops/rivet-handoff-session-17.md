# Rivet handoff, session 17 roll (2026-09-25)

Sent by Rivet (a2a-rivet-1b) to Relay as the one writer for the record. Recorded verbatim by
Relay. The record's developer handoff points here.

Nothing is mid-flight. No scratch process is running and no tcm act is open. The Rivet worktree is on
`loop/5-identity` at `ebe7747`, and the tree is clean.

## Loop 5 (T-066, v1.11.0)

- **Verdict SHA:** `ebe7747d3d471de56a05114aad4438ee94603eb1` on `origin/loop/5-identity`. Frozen,
  awaiting Gauge (criteria `qa/loop-5` 0cb136a, then 69967fd; rulings 1 `fd4b369` and 2 `52179cf`
  on `docs/session-17-c`).
- **Commits on 56e38a4:**
  - 6687e7c design
  - a6bc292 hub
  - d7ebd2d page, demo-loop, and the tcm scripts at their T-065 hashes
  - f356e7d A1, docs, v1.11.0
  - cd33517 codegen (api.d.ts, +2 lines for accessLogic)
  - ebe7747 test
- **Author numbers:**
  - tsc rc 0; 22 files and 211 tests.
  - LF archive: tsc 0, and 210/211. The one failure is repo-reply's "real git repo" test, which
    needs .git; it also fails on a c4d2d1c archive.
  - Author e2e: 92 PASS, 1 FAIL. The FAIL is BF1 on a rerun, because it was already backfilled.
  - Unit mutants: warn-refuses and sanitize were caught. The human-only guard survived at first;
    it's caught since ebe7747's test.
- **Declared deviations:**
  1. A1: `auth-log` is widened, with no 7th item and no new allow rule. `scripts/tcm/` is now in
     the repo and LF-pinned by `.gitattributes`.
  2. `[authz]` ids are 8-character prefixes (a Convex id is 32 characters, B4's run length).
  3. A missing session or task in strict gets the same 404 as a forbidden one; warn is unchanged.
  4. The create cross-owner check skips names with no agents row, so hub-talk still sees "Unknown
     peer".
  5. A human-kind row owns itself at query time (O5). There's no other default, and BF3 shows the
     gap stays unowned.
  6. The `daemon.ts:286` `/→ 4dd:/` retry bug is noted only.
  7. **Widened returns (undeclared in the report; caught by Relay):** `agents.getByName` gains
     `owner` and `human`, and `listOnline` gains `owner`. The old hub reads name/askPolicy and
     name/lastSeen/agentCard.kind only, and `/agents/live` rebuilds its response field by field.
     Gauge is proving this under F, plus the F1 no-apiKeyHash guard.

## Loop 5 deploy plan (its own act, on Aaron's word; stays warn; strict only after the D-012 soak)

Follow `docs/redeploying-tcm.md:47-51`, NOT `scripts/deploy.sh`.

1. Tar `git archive <merged v1.11.0>` to tcm. Rotate the dirs first so `mv` never nests:
   `a2a-hub.old` (v1.8.0) becomes `a2a-hub.old-v1.8.0`, and `a2a-hub` (v1.10.0) becomes
   `a2a-hub.old`. Extract, then `npm ci`.
2. `npx convex deploy -y`, with the admin key in a variable, never printed. Expect "No indexes are
   deleted" and "Schema validation complete".
3. `convex run agents:assignOwnerAtDeploy '{"owner":"aaron"}'` (counts only).
4. `docker tag a2a-hub:latest a2a-hub:prev`, then `docker build -t a2a-hub:v1.11.0 .`. Don't build
   onto `:latest` before PB.
5. PB (Gauge) on the built image. If it fails, there's no swap.
6. Retag `v1.11.0` as `:latest`, then `compose up -d --force-recreate a2a-hub`. `AUTH_MODE` stays
   warn.
7. `assignOwnerAtDeploy` again, for the O4 gap.
8. Install `scripts/tcm/a2a-readonly` (**c7728ab751cd**) and `a2a-k7.mjs` (**f1de001c3435**) into
   `~/bin`, keeping .bak copies. Then RL2: T-065's N and L re-run, and hashes recorded.
9. The read-only `agents-summary` must show `PASS ownerAssigned rows-without-owner=0`, and
   `auth-log` must show the `authz-lines=` header.
10. PD (Gauge), keyless.
11. The runner pause and resume are Aaron's own sudo.

## tcm state Rivet holds

- **Source trees:**
  - `~/projects/a2a-hub` = v1.10.0 (live source)
  - `a2a-hub.old` = v1.8.0
  - `a2a-hub.old-v1.7.0-0921`
  - `a2a-hub.old-pre-fd23eac` (v1.7.0)
- **Images:** `a2a-hub:latest` 648ac3963dd7 (v1.10.0, live); `a2a-hub:prev` 13aeef206f7b (v1.8.0).
  de11bebd8f93 is dangling.
- **T-065 files:**
  - `~/bin/a2a-readonly` **417a34dde54d** (live), with `.bak-t065-g1` aed7274c83cc
  - `~/bin/a2a-k7.mjs` de3a9c3e0cd0
- **`authorized_keys`:**
  - line 1 is the full melvenac key (sha ea0a6ce6b1bd, the ONLY full key)
  - line 2 is `from="100.64.0.0/10",restrict,command="/home/melvenac/bin/a2a-readonly" … tcm-readonly`
  - backups: `.bak-t065-20260925` (pre-T-065) and `.bak-t065-g4` (pre-G4)
- **Local:** key `~/.ssh/tcm-readonly` (SHA256:SHRHzylx…N5g). There are 6 exact allow rules in
  `~/.claude/settings.json` (Aaron's direct choice). Once `a2a-readonly` moves to c7728ab751cd they
  need no change, because the menu items are the same.
- Runners were active at T-003's close (resumed at 04:16:21Z).

## Open for Rivet

- **T-060:** the `start-stack.ps1:104` Convex start is unpinned and relies on the `:101` busy guard.
- **The `daemon.ts:286` retry-regex bug:** a refused register is retried 10 times, then becomes an
  unhandled rejection.
- **D-008 step 3:** the live local start from the main checkout (alice/bob migrate in the real
  297 MB DB). It needs its own word.

## Watch-outs

- Declare every widened return, even an additive one, as a deviation.
- The Rivet worktree has mixed CRLF/LF files. Scripted replace-by-string misses on CRLF files, so
  use exact-match edits. Always check `git diff --ignore-all-space`.
- `convex dev` rewrites `convex/_generated` with line-ending churn. Commit only real content
  (e.g. api.d.ts) and `git checkout` the rest.
- Git Bash mangles `branch:path` in `git show`; use PowerShell or quote it. PowerShell 5.1 pipes
  corrupt binary tar, so use `git archive -o file`.
- `git archive` under the system autocrlf=true: pass `-c core.autocrlf=false -c core.eol=lf`, and
  count CR bytes with `tr`, not `grep -l -c`.
- A log file's `split("\n")` leaves a trailing empty element, so slices start one line late.
- Each hub process makes its own "Hub activity" room, so read all of them.
- JSON-RPC `message/send` blocks until terminal unless `configuration.blocking:false`.
- `/message/send` blocks up to 120 s during escalation.
- tcm sudo needs a password, so the runner scripts are Aaron's to run.
- Use the read-only menu for tcm reads, and the full key only for writes on Aaron's word. Back up
  `authorized_keys` and prove a fresh full-key login before touching it.
- Scratch stacks: pinned ports only (3310/3311, 41xx); a scratch `A2A_KEY_DIR`; kill by PID
  afterwards (convex-local-backend survives TaskStop).

## Added by Relay at recording

- SIA (Atlas, 2026-09-25): `/sync` only reports GitNexus staleness; SIA's `.gitnexusrc`
  `{"noStats": true}` stops `analyze` rewriting the tracked CLAUDE.md/AGENTS.md stats line.
  A2A-Hub has none (T-069). Two GitNexus indexes are registered under the name "A2A-Hub"; one is
  this worktree's. Drop it, or pass `repo` as the absolute path.
