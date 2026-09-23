# Loop 1 — QA report (Gauge)

**Candidate:** `cb7cda7aeb8148e73b6f0bf37785fd5450c7e879` on `loop/1-read-receipts`, frozen by Relay
2026-09-23. **Criteria:** `docs/loops/loop-1-qa-criteria.md` (pushed `9613c00` before any evidence;
rulings `8ea57ac`; post-freeze instrument amendments `83cdd91`). **Baseline:** `2eb7928`.
**Where:** local isolated stack only, in the QA tree `~/Worktrees/a2a-qa`. No tcm, no remote
host, no main stack, no live data. **When:** 2026-09-23, 08:43Z–08:59Z.

## Verdicts

| Row | Verdict | One line |
|---|---|---|
| A1 | **PASS** | 13/13. Unread since the send time, read after a foreground `--wait`, never-read ≠ read-through-N |
| A2 | **FAIL** (one sub-item) | 19/21. An unknown session answers **500**, not 4xx. Everything else passes, including the inject race |
| A3 | **PASS** | No fetch marks anything. One writer, one route, one client. M3 killed under per-seat keys |
| A4 | **PASS** | 13/13 across all skew directions and every fault on `/read` and `/reads` |
| A5 | **PASS** | 4/4. `--peer` leaves the peer's whole row unchanged. M5 killed |
| A6 | **FAIL as written** (item 3, inherited) | `a2aTasks` has no `ENTITIES.md` section, as at baseline. Everything else passes. Live start **UNVERIFIED** |
| A7 | **FAIL** | R2 is not verbatim in the doc. R1/R2 are not verbatim in the header. **L3 is missing from the header** |

The rows are judged exactly as the criteria were written. Nothing was widened to let a result pass.
Rivet's evidence (31/31, 107/107, six A4 cases) is **not** cited as a pass anywhere below. Every
number here was produced by Gauge's own instruments in this run.

## Preconditions

| | Observation | |
|---|---|---|
| P1 | QA Convex `:3410` (a fresh anonymous deployment: the push created all 11 indexes new) and the QA hub `:4410` with `CONVEX_URL=http://127.0.0.1:3410`. The listener PID's parent command line was checked. Every `hub-talk` got an explicit `HUB_URL` | ok |
| P2 | 08:43:50Z: `:3410` empty before (0 agents, 0 sessions); `qa-probe` present there after a register through `:4410` | ok |
| P3 | All identities `qa-…-<run tag>`, each seat with its own key. `TMP`/`TEMP` scratch dir per run (a known positive in `selftest.mjs`) | ok |
| P4 | `HEAD = cb7cda7…` and no tracked change, at the start and at 08:59:22Z. Remote `loop/1-read-receipts` still `cb7cda7` at the end. Mutants ran in `git archive` copies in scratch | ok |
| P5 | Receipts read only from `GET /reads`, parsed. Turns from `GET /messages`, parsed | ok |

Instruments: `docs/loops/loop-1-qa/`. `selftest.mjs` passed 9/9 again on the candidate stack before
the rows ran. Logs are in `docs/loops/loop-1-qa/runs/`.

**Departures from Rivet's `loop-1-live-setup.md`:**
- `--codegen disable`, so the frozen tree is not rewritten (T-054).
- `git archive` copies instead of `git worktree add` for the baseline and the mutants.
- `node …/convex/bin/main.js data <table>` for whole rows.
- One more hub, `:4450`, with `AUTH_MODE=strict`.
- A throwaway stack (`:3450`/`:4460`) for Q2.

## A1 — PASS (13/13, `runs/rows-A1A2.log`)

Room `{a,b,c}` with per-seat keys.
- After A's `--say` (turn 1):
  - B and C both have `lastRead: null` and turn 1 unread, with `sentAt` **equal to** that turn's
    `createdAt` from `/messages`;
  - A has no own turn unread, and A's mark is still `null`.
- B's foreground `--wait` exits 0 and prints the turn. B then shows `lastRead {turn 1, via "wait",
  at ≥ createdAt}`, turn 1 has left B's unread list, and **C is byte-for-byte unchanged**.
- After A sends turn 2, B shows `turn 1` plus `[2]` unread, and C shows `null` plus `[1,2]`: the two
  states are told apart by value.
- With turns from all three authors, every `{turn, from, sentAt}` in `unread` matches `/messages`,
  no one has their own turn unread, and `turnCount = 4 = messages`.

## A2 — FAIL on one sub-item (19/21, `runs/rows-A1A2.log`)

**Passed:**
- `--inbox` exits 0, prints the whole room, and says `unread after turn 1 (cursor unchanged)`.
- The mark is `{turn 3, via "inbox"}`.
- The cursor file's sha256 is identical before and after. A cursor that was absent stays absent,
  and the mark is still recorded.
- The next `--wait` replays turns 2–3, and the mark stays exactly `{3, inbox, same at}`: it is
  monotonic.
- **Inject race, both modes:** proxy X landed a new turn between print and mark, and the mark
  stayed at the printed turn (1) with the injected turn 2 unread. A mark covers what was printed,
  not what the room holds.
- Direct POST guards, each confirmed in `/reads`:
  - valid forward: 200, and the mark moves;
  - lower: 200, `advanced:false`, and the stored mark is returned;
  - past-end, 0, −1, 2.5, `"3x"`, a bad `via`, no `reader`: 400;
  - a registered non-member and an unregistered name: 404.

  The mark was unchanged by every rejected call.

**FAIL (the criterion was "an unknown session gives 4xx"):**
- `POST /a2a/session/<id>/read` and `GET /a2a/session/<id>/reads` return **500
  `[Request ID: …] Server Error`** for a well-formed id from another table (a `peers` id).
- They also return 500 for a malformed string (`not-a-session-id`).
- The mark is unchanged, so this is not a false read.
- Observation: Convex's `v.id("sessions")` argument validator rejects the id before the handler
  runs. So `markRead`'s own `404 "session not found"` branch, and `/reads`' `!state → 404`, are
  reachable only for a valid `sessions` id that no longer exists.
- **Sibling:** the unchanged baseline route `GET …/messages` also answers 500 for
  `not-a-session-id` (`sibling.mjs`). So this is a class the new routes inherited, not one they
  introduced.

## A3 — PASS (`runs/rows-A3b.log`, `runs/m3check.log`)

- **Dynamic, per-seat keys.** With turn 1 unread by B, the harness made 33 GETs:
  - every GET route (`…/messages` plain and with `?after=0` and `?since=0`; `/a2a/sessions`;
    `/a2a/peer/B/sessions`; `/a2a/agents/live` with and without `kind`; `/health`;
    `/a2a/queue/B`; `/.well-known/agent-card.json`; `…/reads`);
  - each sent with B's own key, with the dev-key, and with no key;
  - plus the Convex query `messages:list`, which is the web client's path.

  `/reads` was **byte-identical** afterwards. No JSON-RPC read addresses a room, so none was run.
- **Daemon.** A room member ran for 12 s at `POLL_MS=1000`. **Known positive:** it read the room
  and replied (turn 2, after an `@mention`; the group room gates on mentions). No participant's
  mark moved. The first attempt had no mention, the daemon stayed silent, and that run was not
  counted.
- **Static.** Across `convex src scripts client/src wrapper` (excluding `node_modules`) there is
  one writer of the read fields (`convex/messages.ts:130`, inside `markRead`), one route
  (`src/index.ts:509`), and one client (`scripts/hub-talk.mjs:257`). The known caller was found.
- **M3** (`GET …/messages` marks `req.agentName` through the last turn; the edit was confirmed,
  and `tsc --noEmit` was clean on the mutant; it ran at `:4440`): with B's own key, a plain GET
  marked B `{turn 1, via "wait"}`, so **A3 fails against the mutant: killed**. Control: the same
  GET on the candidate left B `null`.
- **Finding, no verdict (Relay's instruction):** under the shared **dev-key**, M3 **survives**.
  `req.agentName` resolves to a non-member row, the mark 404s silently, and B stays `null`. So
  under the dev-key a check like A3 cannot tell a hub that marks on fetch from one that doesn't.
  This is L2's shadow on the instrument, and it holds until T-003.

## A4 — PASS (13/13, `runs/skew.log`)

Hub identities were first proven by behaviour:
- the `/reads` route is absent on both old apps (`:4430`, `:4431`);
- it is present on the new apps (`:4410`, `:4432`);
- on the new app with old Convex (`:4432`) it answers 500 (the function is missing).

Scenario: `--session --say`, `--wait` (turn present), `--inbox` for both seats, `--wait-timeout 3`,
`--peer --say`, `--peer --wait`, and a usage error.
- Baseline codes (old client, old hub): `0 0 0 0 2 0 0 1`.
- **(a) both halves old, (b) app new / Convex old, (c) app old / Convex new:**
  - the new client's stdout and exit codes are **identical** to the old client's on the same hub;
  - stderr differs only by the stated lines ("read receipt not recorded (404…)" / "(500 …)",
    "read receipts unavailable…"), which were really present and stripped.
- **(d)** The old client on the candidate hub is byte-identical (stdout, stderr, codes) to the old
  client on the old hub. The old reader who waited and ran inbox shows `lastRead: null` (L4).
- **(e)** With `/read` dropped, 404, 500 or delayed 30 s:
  - stdout and codes are identical to pass-through;
  - "not recorded" is on stderr;
  - no call ran more than 6 s over pass-through (the 5 s bound holds);
  - B stays `null`: a false unread, never a false read.
- **(f)** With `/reads` at 404 or 500: "unavailable" on stderr, and everything else is unchanged.

## A5 — PASS (4/4, `runs/rows-A3A5A7.log`; M5 in `runs/m5-A5.log`)

Instrument: whole rows from `convex data` (the `agents:getByName` projection is blind to cards).
- The distinctive card (`kind "qa-distinct"`) was present before the call.
- `--as A --peer B --say` (room created) left B's `agentCard`, `apiKeyHash`, `lastSeen`, `status`,
  `activeInstanceId`, the peer row, and the count of "Agent B is now online" notices **all
  equal**.
- With the room existing, the same room was reused and B was still unchanged.
- `--peer qa-never-registered-…` exits **1**, and stderr names `--as` and `--session`. The agent,
  peer, session and sessionPeers counts are unchanged, with no row for the name.
- **M5** (`if (PEER) await register(PEER)` restored in a scratch `hub-talk`) makes A5 fail on all
  three checks: **killed.**
  - B's card became `kind "ide-session"`, and an online notice fired.
  - The room was reused, but B had changed.
  - The ghost got an agent row, a peer row and a room, and the call exited 0.

## A6 — FAIL as written on item 3 (inherited); otherwise PASS

1. **vitest:** candidate **107/107**. The baseline, run at `2eb7928` in the same scratch setup,
   had 84 tests. **All 84 baseline test names are present and passing** in the candidate; 23 are
   new; 0 are skipped (`runs/vitest-compare.txt`). The baseline's one failure
   (`readRepoProvenance … real git repo`) comes from my instrument, not a code defect: the
   `git archive` copy has no `.git`. The candidate changed one existing test file
   (`tests/hub-talk.cli.test.ts`: the stub matches `/message` only, and the timeout is 20 s). Both
   changes are explained in comments, and no test was removed.
2. `tsc --noEmit` clean. `npm run build` rc 0. No stray `convex/*.js`, and the tree stays clean.
3. **Schema vs `ENTITIES.md`, every table, by parser** (`runs/schema-check.json`):
   - `sessionPeers` (9 fields, including `readThroughTurn`/`readAt`/`readVia`) agrees. So do
     `experiences`, `tasks`, `agents`, `peers`, `sessions`, `messages` and `repoFixes`.
   - **`a2aTasks` (4 fields) has no section in `ENTITIES.md`.** This is not caused by the
     candidate. It is the same at `2eb7928`, and the table has existed since `95ca5c6`
     (2026-09-20). **FAIL as written**, and put to Relay to rule.
   - (My parser also flagged `readVia`'s optionality. That was the parser splitting at the escaped
     `\|`. The raw row is `` `"inbox" \| "wait"`? ``, which agrees.)
4. The default lobby join (no `--peer`/`--session`) works: say 0, wait 0, and the turn arrived.
   Control: the old client on the old hub, same result. `--session` and registered `--peer` pass
   under A4.
5. `AUTH_MODE=strict` (`:4450`): `/read` and `/reads` return **401** with no key and **403** with
   a wrong key, and **200** with a valid key. Under warn, a wrong key passes through.
6. `start-stack.ps1` is unchanged by the candidate (0 diff lines), and the build is clean. **Live
   start UNVERIFIED, deferred to the main-checkout update step** (Relay, Q1).
7. `package.json` is at 1.8.0, with `CHANGELOG.md` `## [v1.8.0] - 2026-09-23`. The candidate does
   not touch `Dockerfile`, `docker-compose.yml`, `DEPLOY.md`, `docs/redeploying-tcm.md` or any
   `.ps1`.
8. Own conduct: nothing deployed, no tcm, no live Convex, nothing on `:3210`/`:4000`.

## A7 — FAIL (`runs/rows-A3A5A7.log`)

Instrument: exact substring match after collapsing whitespace, as the criteria define it.

| | `docs/joining-the-hub.md` | `hub-talk.mjs` header |
|---|---|---|
| R1 | **exact** | **not verbatim.** The header says "hub-talk marks a turn read when it prints it:" followed by a description, then "RULE: run --inbox or --wait only where …". The wording is changed, not just the formatting: it still fails with comment markers and backticks stripped |
| R2 | **not verbatim.** "…just to advance past turns**:** every run's output…" (a colon for the ruling's semicolon), in bold | **not verbatim** as written (comment markers, no backticks). It **matches** once comment markers and backticks are stripped (reported, not judged) |
| L1, L2, L4, L5 | present | present |
| L3 | present ("foreground cannot be proven") | **absent.** The header lists L1, L2, L4 and L5 only |

The documented claims that were tested are true in observation:
- a fetch does not mark (A3);
- an old `hub-talk` shows as never read (A4 d);
- a failed mark leaves the turn unread (A4 e);
- `--peer <unregistered>` exits 1 and creates nothing (A5).

L2 was shown directly: a `POST /read` naming B, sent by A's process, is accepted (A2.6 and the
strict run).

## Q2 — a member who has left (observation for T-052, no verdict; `runs/q2.log`)

No code path sets `leftAt` (baseline and candidate). The observation used a throwaway copy of the
candidate plus one QA-only mutation (`qaHelpers:setLeftAt`), on its own Convex `:3450` and hub
`:4460`. The QA stack and the candidate tree were not used.
- `/reads` shows the member who left **exactly like a present member who has not read**: the same
  fields, `lastRead: null`, and nothing marking the departure.
- Turns sent after they left are listed as **unread by them**.
- **`markRead` accepts a reader who has left:** 200, `advanced: true`, and their mark moved to
  turn 2.

## What could not be verified

- **L1:** whether a model read what `hub-talk` printed.
- **L3:** foreground versus background. The harness is itself a background runner, and every
  `--wait` it ran marked read.
- **The web client UI** was not opened. Its data path, the Convex query `messages:list`, was
  called directly under A3.
- **The live `start-stack.ps1` start** (deferred by ruling).
- **tcm, and any remote host.** Nothing here says the feature works after a two-part redeploy.
- **Two readers marking at once.** Convex write conflicts on the same `sessionPeers` row were read
  white-box only (`markRead` is a single mutation, so it is transactional).
- **Print-before-mark ordering** is read from the code (`emit`: print → cursor → mark; `--inbox`:
  print → mark). A4 (e) proves the failure direction black-box.

## Defects (observations; the fix is Rivet's)

1. **A2.6:** an unknown or malformed session id returns 500 from `POST /read` and `GET /reads`, so
   the handlers' 404 branches are unreachable for it. The same class is in the baseline
   `GET /messages`.
2. **A7:** R2 in the doc uses a colon for the ruling's semicolon.
3. **A7:** the header's R1 is reworded.
4. **A7:** the header's R2 is not verbatim.
5. **A7:** L3 is missing from the `hub-talk.mjs` header.

## Findings that fail no row

- **T-053:** the hub logs "running" and exits 0 when its port is taken (hit during setup at
  08:32Z).
- **T-054:** `convex dev` rewrites the tracked `_generated` files. Also: **on a fresh deployment
  it created `convex/tsconfig.json` even with `--codegen disable`.** It was removed before any row
  ran, and it did not come back.
- **The shared dev-key hides M3** (A3). So does `agents:getByName`'s projection for M5, which is
  why whole rows were used.
- **`a2aTasks` has no `ENTITIES.md` section**, since `95ca5c6` (A6.3).
- **The baseline `readRepoProvenance` test needs a git checkout,** so it fails in an archive copy.

## Regressions: previously validated behaviour confirmed

- Exit codes 0/1/2 on every path.
- `--say`, `--wait` and `--inbox` via `--session`, registered `--peer`, and the default lobby join.
- The old `hub-talk` is byte-identical against the new hub.
- All 84 baseline tests pass.
- Strict auth still guards every `/a2a` route, including the new ones.
- The skip-evidence property of `--inbox` is preserved: the cursor is untouched and the replay
  happens.
