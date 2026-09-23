# Loop 1 — QA report 2 (Gauge): re-run on the fix

**Candidate:** `e886b6bd4bd233da36a7cb6f5ce150b266d52f9c` on `loop/1-read-receipts`, frozen by
Relay 2026-09-23. It is `cb7cda7` plus one fix commit (8 files). **Criteria and instruments:** as
recorded at `aeea40e`:
- criteria `9613c00`;
- rulings `8ea57ac`;
- post-freeze amendments `83cdd91`;
- the A7 ruling (a).

Every instrument file used is byte-identical to `aeea40e` (checked with `cmp`, ignoring line
endings). **One instrument was added, `a2-404.mjs`, for a sub-case report 1 could not reach.**
**Baseline:** `2eb7928`. **Where:** local isolated stack only, in the QA tree. No tcm, no remote
host, no main stack, no live data. **When:** 2026-09-23, 09:09Z–09:18Z. Report 1
(`loop-1-qa-report.md`) is unchanged.

## Verdicts

| Row | Verdict | Report 1 → report 2 |
|---|---|---|
| A1 | **PASS** | 13/13 → 13/13 |
| A2 | **PASS** | 19/21 → 21/21, plus the live 404 (2/2 in `a2-404.mjs`) |
| A3 | **PASS** | Dynamic 3/3, one writer / one route / one client; M3 killed under per-seat keys |
| A4 | **PASS** | 13/13 → 13/13 |
| A5 | **PASS** | 4/4; M5 killed |
| A6 | **PASS** (the live start is **UNVERIFIED**, deferred by ruling) | Item 3 FAIL → PASS: `a2aTasks` is now documented |
| A7 | **PASS** | FAIL → 9/9 checks, under the unchanged instrument (no comment-marker stripping) |

Rivet's evidence for the fix commit is not cited as a pass. Every number here comes from Gauge's
instruments in this run.

## Preconditions

| | Observation | |
|---|---|---|
| P1 | Fresh QA Convex `:3410` (run 1's `.convex` moved to scratch first; all 11 indexes new on push). Hub `:4410` with `CONVEX_URL=http://127.0.0.1:3410`, proxy `:4420`. The listener PIDs' parent command lines were checked | ok |
| P2 | 09:10:06Z: `:3410` empty before; `qa-probe` present after a register through `:4410` (`runs-2/p2.log`) | ok |
| P3 | `qa-` names with a run tag, per-seat keys, scratch `TMP` | ok |
| P4 | `HEAD = e886b6b…` and no tracked change at the start and at 09:18:00Z. Remote `loop/1-read-receipts` still `e886b6b` at the end. The T-054 `convex/tsconfig.json` appeared again on the fresh deployment and was removed before any row ran | ok |
| P5 | Receipts read only from `GET /reads`, parsed | ok |

`selftest.mjs`: 9/9 on this stack before the rows ran (`runs-2/selftest.log`).

## What the fix changed (white-box, `git diff cb7cda7 e886b6b`)

- `messages.markRead` and `sessions.readState` take `sessionId: v.string()` and call
  `ctx.db.normalizeId("sessions", …)`. A `null` gives 400 "not a session id"; a missing row gives
  404 "session not found". `/reads` now returns the query's `{ok,…}` status and strips `ok` from
  the body.
- The `hub-talk.mjs` header carries R1 and R2 each on a single comment line, plus L3. The doc's R2
  uses the ruling's semicolon.
- `ENTITIES.md` gains an `a2aTasks` section, and there is a new handler test file
  (`tests/read-session-id.test.ts`).
- `messages.list` and `GET …/messages` keep `v.id`: T-055, out of scope.

## A2 — PASS (`runs-2/rows-A1A2.log`, `runs-2/a2-404.log`)

Everything from report 1 passes again: inbox mark, cursor sha256 unchanged, monotonic replay,
the inject race in both modes, and every POST guard with the mark unchanged. The sub-item that
failed:

| Unknown session, shape | Report 1 | Report 2 |
|---|---|---|
| Well-formed id from another table (a `peers` id) | 500 / 500 | **400 / 400** "not a session id" |
| Malformed string (`not-a-session-id`) | 500 / 500 | **400 / 400** "not a session id" |
| Well-formed `sessions` id that does not exist here | not reachable | **404 / 404** "session not found" |

(Each cell: `POST /read` / `GET /reads`.)

- **The 404 was produced live.** The id `k575dzyft4m1y8ana3ra5x6tv58eyree` is a real `sessions`
  id from run 1's database (the A3 room, `runs/rows-A3b.log`), and it does not exist in the fresh
  deployment.
- Control on a live session: `/reads` returns 200 with exactly `{participants, turnCount}`, the
  same shape as in report 1, with no `ok` leaking.
- So the 404 sub-item is **verified live**, not only by Rivet's handler test.

## A3 — PASS (`runs-2/rows-A3A5A7.log`, `runs-2/m3check.log`)

- **Dynamic.** 33 GETs (B's key, the dev-key, no key) plus `messages:list` left `/reads`
  byte-identical. A daemon member read and replied (the known positive), and no mark moved.
- **Static, on `e886b6b`.** One writer (`markRead`, `convex/messages.ts`), one route
  (`src/index.ts:509`), one client (`scripts/hub-talk.mjs:262`).
- **M3** was rebuilt from `e886b6b`: the edit was confirmed, and `tsc` was clean on it. It ran at
  `:4440`. With B's own key, a plain GET marked B through turn 1: **killed.** Control: the
  candidate left the reader `null`.
- **Finding, unchanged:** under the shared dev-key, M3 **survives** (L2's shadow, until T-003).

## A4 — PASS (13/13, `runs-2/skew.log`)

- Identities by behaviour: the `/reads` route is absent on the old apps and present on the new
  apps. The candidate answers a bad id with **400**; in run 1 that was 500.
- (a), (b) and (c): new versus old `hub-talk` give identical stdout and codes, and stderr differs
  only by the stated receipt lines.
- (d): the old client on the new hub is byte-identical to the old client on the old hub, and it
  stays `null` (L4).
- (e) and (f), every fault: stdout and codes are unchanged, the receipt line appears, no call ran
  more than 6 s over pass-through, and a lost mark is a false unread.

## A5 — PASS (4/4, whole rows); M5 killed (`runs-2/m5-A5.log`)

Same as report 1. M5 was rebuilt from `e886b6b` and fails A5.2, A5.3 and A5.4.

## A6 — PASS; live start UNVERIFIED

1. **vitest:** 114/114. All 84 baseline names are present and passing, 30 are new, 0 skipped
   (`runs-2/vitest-compare.txt`). The baseline JSON is reused from run 1: `2eb7928` is fixed code,
   and its one failure is the archive-without-`.git` instrument artifact.
2. `tsc --noEmit` clean. `npm run build` rc 0, and the tree stays clean.
3. **Schema vs `ENTITIES.md`, every table, by the same parser** (`runs-2/schema-check.json`):
   9 tables in each, with matching field counts, and **`a2aTasks` present with its 4 fields**. The
   parser's only flag is the known `readVia` escaped-pipe false positive from report 1; the raw
   row `` `"inbox" \| "wait"`? `` agrees. This row, `FAIL as written` in report 1, **now passes as
   written**. It stays noted that the gap was inherited from `95ca5c6`.
4. The lobby join works for the candidate and for the old-on-old control (`runs-2/a6.log`).
5. Strict `:4450`: `/read` and `/reads` return 401 with no key, 403 with a wrong key, 200 with a
   valid key. Warn passes through.
6. `start-stack.ps1` has 0 diff lines, and the build is clean. **Live start UNVERIFIED, deferred to
   the main-checkout update step.**
7. 1.8.0; `CHANGELOG.md` `## [v1.8.0] - 2026-09-23`; no deploy file or `.ps1` touched.
8. Nothing deployed, no tcm, no live Convex, nothing on `:3210`/`:4000`.

## A7 — PASS (`runs-2/rows-A3A5A7.log`)

The instrument is unchanged: exact substring after collapsing whitespace, with no comment-marker
stripping (ruling (a)). R1 and R2 are exact in the doc **and** in the `hub-talk.mjs` header. L1–L5
are present in both. The same checks failed in report 1, so the instrument has been seen in both
directions.

## What could not be verified

This is unchanged from report 1:
- L1: model reading;
- L3: foreground versus background;
- the web client UI (its query path was exercised);
- the live `start-stack.ps1` start;
- tcm and remote hosts;
- concurrent readers (white-box only);
- print-before-mark ordering (read from the code; its failure direction is proven in A4 (e)).

Q2 was not re-run. It is recorded in T-052, and nothing in the fix touches `leftAt`.

## Defects

**None found against the criteria in this run.**

## Findings that fail no row

- **T-053:** the hub logs "running" and exits 0 on a taken port.
- **T-054:** on a fresh deployment, `convex dev` creates `convex/tsconfig.json` even with
  `--codegen disable`. Seen again in this run.
- **T-055:** `GET …/messages` still answers a bad session id with 500.
- The shared dev-key hides M3.

## Regressions: previously validated behaviour confirmed

- Exit codes 0/1/2.
- `--say`, `--wait` and `--inbox` via `--session`, `--peer` and the default lobby join.
- The old `hub-talk` is byte-identical against the new hub.
- All 84 baseline tests pass.
- Strict auth covers the new routes.
- `--inbox` leaves the cursor untouched, and the replay happens.
