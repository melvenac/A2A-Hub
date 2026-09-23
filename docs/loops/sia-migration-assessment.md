# SIA migration — A2A-Hub import

**Date:** 2026-09-22 · **Author:** A2A-Hub planner seat · **Status:** draft ready for Aaron's `--commit`

## What was run

`node ~/Projects/Self-Improving-Agent/open-brain/build/cli.js state import --draft .` in
`~/Projects/A2A-Hub`, base `e0bc3f8` (master). Importer build: SIA main checkout `f673d5e`, v0.44.1.
Output: `.agents/state.draft.json` + `.agents/state.import-report.md` (untracked). Schema 2.

## First draft: four problems

1. **The backlog did not enter the record.** The importer reads tasks only under `## P0`–`## P3`
   (`state-import/index.ts:96,110-114`). INBOX was grouped by roadmap version, so every open task was
   skipped (106 unparsed lines). Only 6 `## Completed` items imported.
2. **SIA's own history was seeded into the record.** `verified[]` V-001..V-005 and `gaps[]`
   G-001..G-006 are hardcoded (`index.ts:353-378`, `since_session: 54`), and none are true of A2A-Hub.
3. **No objective.** `task.md` had no `## Current Objective`.
4. **The handoff was stale.** `next-session.md` was Session 13's (itself wrapping Session 11's
   pick-up), though Session 14 happened after it. It would have recorded claims Session 14 falsified,
   e.g. "`X-Agent-Key` is never validated" (`95ca5c6` validates it). INBOX was also stale (last
   updated Session 11): it still listed §8.1–8.3 and register-upsert as open.

## Atlas's rulings (SIA planner, 2026-09-22, cross-session)

- (2) is a SIA defect. The fix is to delete the seeds from the importer. That is a SIA task Atlas will
  not interrupt Loop 15 for, so: **remove the seeds from the draft with a parser before commit**.
- (1): restructuring INBOX into P0–P3 is the intended path. The importer does not guess priority by
  design. Retention evicting old done items later is working as designed; git keeps them.
- Atlas noted that "Aaron asked me" reached it as a relay, and that nothing in its advice depended on it.

## What was done

- **INBOX.md regrouped into P0–P3.** Each open item keeps its roadmap version as `(roadmap vN)`; the
  version goals are in PRD.md. Continuation lines folded into single items (the importer reads one
  line per item). Duplicates merged (experience dedup ×2, compose/VPS ×2). Session 14 outcomes applied
  from `task.md` (§8.1, §8.2 partial + daemon race via ADR-011, §8.3, register upsert). The live items
  from the Session 13 addendum became tasks: the myvps host-key change (P2), the Session 12 stub
  (P3), Buzz parked (P3). The `### Dropped` list is not carried forward; it is in git at `e0bc3f8`.
  **Priority is this seat's judgement:** P0 is revocation, the one gate Session 14 named. P1 is the
  remote-agent milestone and its preconditions, plus on-demand spawn and the measurements Aaron asked
  for first.
- **task.md:** added `## Current Objective` from Session 14's recommendations.
- **next-session.md:** pick-up replaced with Session 14's three recommendations plus the open Session 11
  measurements. The `X-Agent-Key` watch-out was removed, the Stop-Process watch-out was amended for
  ADR-011, and Session 14's "Cursor may still be live" was added. The prior text is in git at `e0bc3f8`.
- **Re-drafted:** 74 tasks (39 open, 35 done), 2 unparsed lines (header blockquote, rule), objective
  found, 13 ADRs, handoff (developer, session 14).
- **Seeds removed by parser** (script: each removed entry must deep-equal the importer's own seed,
  draft must be canonical before edit, re-validated with `parseState`, read back from disk). Result:
  revision 0, verified 0, gaps 0, tasks 74, decisions 13, all other fields deep-equal. Noted at the
  foot of the import report.
- **Checked, not assumed:** `--commit` consumes the edited draft file (`runCommit` reads and
  re-validates it, `index.ts:609-612`). It does not re-derive.

## Remaining

- **Aaron runs `open-brain state import --commit`** in A2A-Hub. Per SIA `G-007`, the auto-mode
  classifier denies it inside an agent session. It snapshots `.agents/`, writes `state.json` rev 0,
  trims SUMMARY.md, and re-renders INBOX/task/next-session from state.
- Then commit the migration on a branch. This touches `.agents/**` and docs only.
- SIA side: delete `seedVerified`/`seedGaps` from the importer (Atlas's task list).
- Seat setup to mirror SIA (roles, `AGENT.md`, per-worktree `AGENT.local.md`, `~/Worktrees/` checkouts).
