# Loop 1 — acceptance criteria (Gauge)

**Date:** 2026-09-23 · **Author:** QA seat (Gauge), session 16 · **Status:** criteria, written before
any candidate evidence or tests were read. No candidate has been run.

**Derived from:** the brief `docs/loops/loop-1-read-receipts.md` (rows A1–A7), the ruling
`docs/loops/loop-1-ruling-1.md` with its addendum, the notes of T-049 and T-051 in
`.agents/state.json` (rev 11), and Rivet's design (`docs/loops/loop-1-design.md` read at
`origin/loop/1-read-receipts` = `cba4fa2`, **design text only**). All read at `origin/master` = `ce2fdca`.

**Baseline** (the "old" side of every comparison): `2eb7928`, the candidate's merge-base with
master. `git diff 2eb7928 ce2fdca -- src convex scripts client wrapper start-stack.ps1 package.json`
is empty, so the baseline is also master's code.

**Candidate:** none yet. Relay names a frozen SHA. Every observation in the report names that SHA.
If the SHA moves mid-evaluation the run is void and starts again.

---

## 0. Preconditions: before any row counts

The report records each of these as an observation. If any one fails, **nothing below is valid**.

- **P1 Isolation.** QA Convex runs on a non-default port, and the QA hub runs on a non-default
  port with `CONVEX_URL` **set explicitly** to QA Convex. `src/index.ts:35` defaults to
  `127.0.0.1:3210`, so if the variable is missing the hub silently uses the main stack. Every
  `hub-talk` call carries an explicit `HUB_URL` to the QA hub. The script defaults to `:4000`,
  which is the main hub.
- **P2 The isolation check proves it looked.** Before the first register, the QA hub's
  `GET /a2a/sessions` and `agents:listOnline` return **empty**. After one QA register, they return
  exactly that agent. An empty result together with the known positive is the proof: a hub on
  the main stack's Convex would show its history.
- **P3 Names.** Every test identity is prefixed `qa-`. `TMP`/`TEMP` for every `hub-talk` process
  is a scratch directory, so cursor files (`hub-cursor.mjs:18`) never touch a real seat's.
- **P4 Frozen tree.** `git rev-parse HEAD` equals the named SHA and `git status --porcelain` is
  empty at the start and at the end of the run. Mutants are built in a scratch copy
  (`git archive <sha>`), never in the QA tree.
- **P5 Receipts are read with a parser.** Every receipt observation is `GET /a2a/session/:id/reads`
  parsed as JSON by the QA harness. Nothing comes from `hub-talk`'s rendering. Turns are compared
  with `GET .../messages` parsed the same way.

## Instruments

- **H — harness** (QA-owned, on `qa/loop-1`, outside the candidate): drives `hub-talk` as child
  processes and captures stdout, stderr, exit code and wall time separately. Calls hub routes
  directly and snapshots Convex rows through the public queries `agents:getByName`,
  `peers:getByName` and `sessions:listAll` against QA Convex.
- **X — fault proxy** (QA-owned): an HTTP proxy between `hub-talk` and the QA hub that can
  (a) drop, (b) return 404/500 for, (c) delay, and (d) inject a new turn just before forwarding,
  on `POST .../read` and `GET .../reads` separately. Every other route passes through untouched.
  **The proxy is validated against a known positive** before its results count: under pass-through
  it must give output identical to the direct hub.
- **M — mutants**, built from the candidate SHA in scratch. A mutant counts only if
  (1) the edit is shown landed (`git diff` of the scratch copy), (2) `tsc --noEmit` is clean on it,
  and (3) it is observed to fire (the behaviour it adds is seen once) before its row is judged.

---

## Rows

Each row gives the observation, the instrument, and what fails it. **"Both directions"** means
the state is asserted present before the act and absent after it (or the reverse). One
observation that could not tell a working feature from a missing one does not pass a row.

### A1 — unread since the send time, then read after a foreground `--wait`

Setup: a room of `qa-a`, `qa-b`, `qa-c`, created by `POST /a2a/session`.

1. `qa-a --say` turn N. `/reads`:
   - `qa-b.lastRead` is `null`, **not** an object with turn 0 (condition 3).
   - `qa-b.unread` contains turn N, and its `sentAt` equals turn N's `createdAt` from
     `GET /messages` exactly. The same holds for `qa-c`.
   - `qa-a.unread` does **not** contain turn N (condition 2). `qa-a.lastRead` is still `null`,
     so the send did not move the sender's own mark.
2. `qa-b --wait` in the foreground. Exit 0, and turn N is on stdout.
3. `/reads`: `qa-b.lastRead = { turn: N, via: "wait", at }` with `at` ≥ turn N's `createdAt`.
   Turn N is gone from `qa-b.unread`. **`qa-c` is unchanged** (still `null`, still turn N).
4. Read-through-N versus never-read (condition 3): `qa-a` sends N+1. `/reads` now shows `qa-b`
   as `lastRead.turn = N` with N+1 unread, and `qa-c` as `null` with N and N+1 unread. The two
   states must be distinguishable **by value**, not by rendering.
5. Turn identity: for a room with turns from all three authors, every `unread[].turn` and
   `sentAt` pair matches the `GET /messages` entry with the same `turn`.

**Fails if:** any assertion above is false. Also fails if `qa-b`'s read shows before step 2
(false read), or does not show after step 3 (the receipt is missing), or a mark for `qa-b` moves
`qa-c`.

### A2 — `--inbox` is a read; the local cursor is untouched

Setup: `qa-b` has an existing cursor file at turn K, with peer turns K+1..M unread.

1. `qa-b --inbox`. Exit 0. Stdout shows the whole room. Stderr reports
   `unread after turn K (cursor unchanged)`.
2. `/reads`: `qa-b.lastRead = { turn: M, via: "inbox" }`.
3. The cursor file is **byte-identical** before and after (sha256), and absent before and after
   when it started absent.
4. `qa-b --wait` then replays K+1..M on stdout (the stated behaviour). `/reads` is
   **unchanged**: the mark stays at M, `via: "inbox"`, same `at`. This is monotonic.
5. **The mark covers what was printed, not what the room holds.** With proxy X injecting turn M+1
   before forwarding `--inbox`'s mark: `qa-b.lastRead.turn = M`, and M+1 is unread. The same test
   is repeated for `--wait`.
6. Direct `POST .../read`, both directions. Every result is checked in `/reads`:
   - a lower `throughTurn` is a no-op that returns the stored mark;
   - `throughTurn` greater than the turn count gives 400, mark unchanged;
   - `throughTurn` 0, negative or non-integer gives 400;
   - a `reader` who is not a member gives 404;
   - an unknown session gives 4xx;
   - a valid forward mark gives 200, and the mark moves.

**Fails if:** the inbox mark is absent or wrong, the cursor file changes, a later lower mark moves
it backwards, a mark lands beyond what was printed, or any invalid POST changes `/reads`.

### A3 — no fetch except a named foreground read marks anything

Setup: turn N unread by `qa-b`. Snapshot `/reads` as raw bytes.

1. Hit **every GET route of the candidate hub** once as `qa-b`, with the dev-key and no reader:
   `GET .../messages` with no query, `?after=0` and `?since=0`; `/a2a/sessions`;
   `/a2a/peer/qa-b/sessions`; `/a2a/agents/live`; `/health`; `/a2a/queue/qa-b`. Also a JSON-RPC
   read if one exists on the room.
2. Run a daemon (`dist/src/wrapper/daemon.js`) as a room member for ≥ 3 poll intervals, and open
   the web client on the room.
3. `/reads` is byte-identical to the snapshot.
4. Static: every writer of `readThroughTurn`/`readAt`/`readVia` and every caller of `markRead` or
   `POST .../read`, across `convex src scripts client wrapper`. The expected answer is one
   mutation, one route and one client (`hub-talk.mjs`). **The search is validated against a
   known positive:** it must find that known caller.
5. **Mutant M3** (on the running mutant hub): the `GET .../messages` handler marks through the
   last turn for `req.agentName`. Step 1 must now change `/reads`, so A3 fails. The unmutated
   candidate passes again after it.

**Fails if:** `/reads` changes in step 3, a second writer or caller exists, or M3 does not make A3
fail. If M3 cannot be made to fire, the row is **unverified**, not passed.

If the daemon never reads rooms, the report says so. Its run is then not evidence for this row.

### A4 — version skew, both directions

The **old** side is `2eb7928` built whole: `scripts/` as a unit (`hub-talk.mjs`, `hub-cursor.mjs`,
`hub-rooms.mjs`), `dist/`, and the Convex functions. Each case runs `--say`, `--inbox`,
`--wait` (turn present), `--wait --wait-timeout 5` (no turn: exit 2), and a usage error (exit 1).

| Case | Required |
|---|---|
| (a) new `hub-talk` → old hub, both halves old | stdout and exit code identical to old `hub-talk` against the same hub. Stderr differs **only** by the stated "receipt not recorded" / "receipts unavailable" lines. |
| (b) new `hub-talk` → app new, Convex old (the wrong order) | as (a) |
| (c) new `hub-talk` → app old, Convex new (the safe order) | as (a) |
| (d) old `hub-talk` → candidate hub | stdout, stderr and exit codes identical to old `hub-talk` against the old hub. The old reader's `/reads` entry stays `null` (L4). |
| (e) mark failure (proxy X drops `/read`, returns 404/500, or delays it 30 s) | stdout and exit code identical to the pass-through run. Stderr carries the "not recorded" line. Wall time ≤ pass-through + 6 s. `/reads` shows the turn **unread** (L5, false unread, never false read). |
| (f) `/reads` fails (proxy X returns 404/500) | "receipts unavailable" on stderr. Stdout and exit code unchanged. |

"Identical stdout" compares turn content and order. Session ids and timestamps in stderr are
normalised, and the normalisation is stated in the report.

`--peer <unregistered>` differs by design (T-051) and is judged under A5, not here.

**Fails if:** any send, receive or wait breaks, or any exit code differs, in any case. Also fails
if the old `hub-talk`'s bytes change against the new hub, or case (e) shows a false read or hangs.

### A5 — `--peer` no longer rewrites the peer (T-051)

1. Register `qa-b` with a distinctive card (`kind: "repo-daemon"`, custom description) and
   metadata. Snapshot `agents:getByName(qa-b)` and `peers:getByName(qa-b)`: `agentCard`,
   `apiKeyHash`, `lastSeen`, `status`, `activeInstanceId`, `peers.metadata`. Count the messages
   that contain `Agent qa-b is now online`.
2. `hub-talk --as qa-a --peer qa-b --say x` (no room yet, so a room is created). Snapshot again.
   Every field listed is equal, and the "now online" count is unchanged.
3. Repeat with the `{qa-a, qa-b}` room already present. It is found, not duplicated. Equality
   holds as in step 2.
4. `--peer qa-never-registered-<rand>` exits **1**. Stderr names the fix (`--as <name>` once, or
   `--session <id>`). Afterwards there is no agent row, no peer row and no room for that name
   (all three are checked).
5. **Mutant M5** (running hub, mutant `hub-talk`): restore `if (PEER) await register(PEER)`.
   Step 2's equality must now fail on `agentCard` (and `apiKeyHash`/`status`), so A5 fails.
6. Sibling sweep: every `register` call across `scripts src client wrapper` registers only the
   caller's own name. This is validated against the known positive `hub-talk.mjs` `register(ME)`.

**Fails if:** any snapshot field changes, the online notice fires, the unknown-peer case creates
anything or exits other than 1, M5 does not make A5 fail, or a sibling registers someone else.

### A6 — must still work

1. `npx vitest run` passes. The count is reported with the baseline's count at `2eb7928` run in
   the same tree. **Every baseline test name is still present and not skipped.** A removed or
   `.skip`ped test fails the row unless the candidate's own record declares it.
2. `npx tsc --noEmit` is clean, and `npm run build` succeeds.
3. Schema and `ENTITIES.md` agree **for every table**, not just `sessionPeers`. The instrument is
   a parser: `convex/schema.ts` loaded with `tsx`, each table's validator enumerated, and compared
   with the field tables in `ENTITIES.md`.
4. Seats still talk, with the exit codes of A4 (d): the default lobby join (two `qa-` seats, no
   `--peer`/`--session`), `--session <id>`, and `--peer` for a registered peer.
5. `AUTH_MODE=strict` on the QA hub: `POST .../read` and `GET .../reads` with no key or a wrong
   key are rejected (403), and succeed with a valid key. Under `warn` they pass through and are
   logged.
6. `start-stack.ps1` comes up. **See the open question below: this cannot be run as written in
   the QA tree.** Until it is ruled, the report checks that `start-stack.ps1` is unchanged by the
   candidate (or ASCII-only if changed) and marks the live start **unverified**.
7. The version is 1.8.0 in `package.json`, with a matching `CHANGELOG.md` entry. No deploy
   script, compose file or tcm config changes unless the change is declared.
8. Nothing is deployed: this loop's run touches no tcm and no live Convex. This is the QA seat's
   own conduct, recorded; it is not an observation of the candidate.

**Fails if:** any item above is false. The count comparison is part of item 1.

### A7 — the documentation carries the limits and the rules

In `docs/joining-the-hub.md` ("4. Read" and "What the hub does not do") and `hub-talk.mjs`'s
header comment:

- **R1, verbatim:** "`hub-talk` marks a turn read when it prints it. Run `--inbox` or `--wait` only
  where its output reaches the agent. A process whose output the agent never sees must not run
  them."
- **R2, verbatim:** "Never run `--wait` or `--inbox` just to advance past turns; every run's
  output must be read."
- "Verbatim" means an exact substring match after collapsing whitespace, which markdown line
  wrapping changes. Nothing else is normalised.
- **L1–L5 each present in substance**, and the passage for each is quoted in the report:
  - L1: delivery, not reading.
  - L2: identity is asserted by the client under the shared dev-key, until T-003.
  - L3: foreground cannot be proven.
  - L4: an old `hub-talk` shows as never read.
  - L5: a failed mark leaves a delivered turn unread.
- **Every documented claim that a row can test is true in the observation.** For example, "a
  fetch does not mark" is proved by A3, and L2 by a direct `POST .../read` as `qa-c` issued from
  `qa-a`'s process: it succeeds, so the documented limit is real.

**Fails if:** R1 or R2 is not an exact match in both places, any of L1–L5 is missing, or a
documented claim contradicts an observation.

---

## What these criteria cannot see

- **Whether a model read its output (L1).** No instrument on the hub or the harness can observe it.
- **Foreground versus background (L3).** The harness is itself a background runner, so every
  `--wait` it runs marks read, and that is the gap L3 names. The rows prove "named `hub-talk`
  reads mark, and nothing else does". They cannot prove "only foreground reads mark".
- **Print-before-mark ordering, black-box.** A4 (e) proves the failure direction (a lost mark
  gives a false unread). The ordering itself is read white-box from the diff and labelled static.
- **tcm and a remote host.** Every observation is on the isolated local stack. Nothing here says
  the feature works on tcm after a two-part redeploy. That needs its own verified send.
- **Concurrency beyond the injected race** in A2.5: two readers marking the same row at once, and
  Convex write conflicts. These are read white-box only.

## Open questions for Relay (planner)

1. **A6 `start-stack.ps1` cannot be run as written in the QA tree.** It hardcodes `:3210` and
   `:4000` and **reuses** whatever is listening there (`start-stack.ps1:101-113`). While the main
   stack is up, a run from `a2a-qa` would attach to the main stack's Convex, which the hard rules
   forbid. The options are yours to rule on: (a) run it only while the main stack is down, which
   is an act on infrastructure and needs Aaron's word; or (b) accept "unchanged by the candidate"
   plus a build, and mark the live start unverified. Until you rule, the report uses (b).
2. **A room member who has left** (`sessionPeers.leftAt` set) is not addressed by the design.
   The report will record what `/reads` shows for one, without a pass or fail verdict, unless you
   rule a requirement.
