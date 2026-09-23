# Session 16 — 2026-09-23 (QA seat, Gauge)

> **Objective:** Loop 1 acceptance (T-049 read receipts, T-051 `--peer`): criteria, isolated stack, verdict
> **Session ID:** 15a352f0-f169-4444-96f9-105d07bb21b2
> **Status:** Completed
> **Seat:** qa (Gauge), tree `~/Worktrees/a2a-qa`. Rivet's developer session also used the number 16; its log is
> `Session_16_developer.md` (three seats share one session counter, a known gap).

---

## Work Log

### What Was Done
- **/start.** The tree was 4 commits behind master (state rev 1, master at rev 11). It was clean and
  detached, so it was moved to `origin/master` (`ce2fdca`) before the state was loaded.
- **Criteria first.** `docs/loops/loop-1-qa-criteria.md` covers A1–A7 in both directions, with
  preconditions P1–P5 and mutants M3/M5. It was pushed at `9613c00` before any candidate evidence
  was read. Rulings were added verbatim: Q1 (start-stack deferred), Q2 (left members,
  observation → T-052), post-freeze instrument amendments (whole-row snapshots, per-seat keys) and
  the A7 ruling (a).
- **Isolated stack.** Convex `:3410` (anonymous, `--codegen disable`), hub `:4410`, fault proxy
  `:4420`. Procedure: `docs/loops/loop-1-qa/STACK.md`. Instruments: `harness.mjs`,
  `fault-proxy.mjs`, `p2-isolation.mjs` and `selftest.mjs`, validated against known positives.
- **Report 1 on `cb7cda7`** (`loop-1-qa-report.md`): A2 failed (500 on an unknown session), A6.3
  failed as written (`a2aTasks` missing from ENTITIES.md, inherited from `95ca5c6`), A7 failed
  (rules not verbatim, L3 missing from the header). A1, A3, A4 and A5 passed. M3 and M5 were
  killed. The Q2 observation fed T-052.
- **Report 2 on `e886b6b`** (`loop-1-qa-report-2.md`): **all of A1–A7 pass.** The A2.6 404 was
  verified live with a run-1 sessions id. The A6 live start is UNVERIFIED, deferred by ruling.
  Relay accepted it as the Loop 1 verdict; PR #4 (`qa/loop-1` `fb441ab`) awaits Aaron's merge
  with code PR #3.

### Files Created (all on `qa/loop-1`, final `fb441ab`)
- `docs/loops/loop-1-qa-criteria.md`, `docs/loops/loop-1-qa-report.md`,
  `docs/loops/loop-1-qa-report-2.md`
- `docs/loops/loop-1-qa/`: `STACK.md` and the instruments (`harness`, `fault-proxy`,
  `p2-isolation`, `selftest`, `rows`, `skew`, `m3check`, `a6`, `a2-404`, `q2`, `sibling`,
  `vitest-compare` `.mjs`), plus `runs/` and `runs-2/` logs

### Files Modified
- None in source. QA is read-only.

---

## Gotchas & Lessons Learned

- **A port you did not check is not free.** A QA hub started on `:4200`, which Rivet already held.
  Express 5's `app.listen` callback gets the error, but the hub logs "running" anyway and exits 0
  (T-053). The P2 probe then registered `qa-probe` into Rivet's `:3310`. P2 caught it. Fix: check
  the port before binding, then confirm the listener PID's parent command line is yours.
- **`TaskStop` on an `npx convex dev` chain leaves `convex-local-backend.exe` alive.** Kill the
  PID tree after checking each command line.
- **`convex dev --local` dirties a frozen tree.** It rewrites `_generated`, and on a fresh
  deployment it creates `convex/tsconfig.json` even with `--codegen disable` (T-054). Remove it
  before any row runs.
- **Convex `v.id("table")` args throw before the handler runs,** so a bad id is a 500. For 4xx, use
  `v.string()` plus `ctx.db.normalizeId`. `GET /messages` still has the 500 (T-055).
- **Mutants need the identity model that makes them fire.** Under the shared dev-key, "mark the
  caller" resolves to an arbitrary agent row and 404s silently, so M3 survives. Per-seat keys kill
  it. Likewise `agents:getByName` is a projection that cannot see the card M5 rewrites; use whole
  rows from `convex data`.
- **A known positive for a daemon needs an @mention in a group room.** Without one it fetches but
  stays silent.
- **An instrument's wording is not its behaviour.** Relay described the A7 header check as
  stripping comment markers; it didn't (`rows.mjs:234`). This was corrected and ruled before any
  re-run result existed.
- `git archive` copies have no `.git`, so the baseline test `readRepoProvenance … real git repo`
  fails there. That is the instrument, not the code.

---

## Decisions Made
- None recorded by this seat. Rulings are Relay's (in the record and quoted verbatim in the
  criteria doc).

---

## Post-Session Checklist
- [x] Session log completed (this file)
- [x] State written through `ob_state`, **not by this seat** (`qa.md` forbids QA writing
  `ob_state`). Relay recorded the handoff under seat `qa`, session 16, at record rev 19
  (`docs/loop-1-acceptance` @ `4a2c91d`, PR #5). Gauge verified it by reading `state.json` from that
  remote ref.

---

## Next Session Recommendations (QA seat handoff)
- **Deferred A6 live start:** verify `start-stack.ps1` at the main-checkout update step, with a
  real send, once Aaron authorises updating `~/Projects/A2A-Hub` after PRs #3/#4 merge. It is not
  verified until then.
- **Next QA stack:** follow `docs/loops/loop-1-qa/STACK.md`. Check ports first, confirm the
  listener PID, start from a fresh `.convex`, run P2 and the self-test before any row, and use
  `--codegen disable`.
