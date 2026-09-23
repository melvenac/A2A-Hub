# Loop 1 — design proposal: read receipts (T-049) and `--peer` repair (T-051)

**Date:** 2026-09-23 · **Author:** developer seat (Rivet), session 16 · **Status:** proposal for
Relay's ruling. Nothing is built.

**Answers:** `docs/loops/loop-1-read-receipts.md`. **Read at:** `2eb7928` (origin/master), tree
a2a-rivet. `tsc --noEmit` clean there. All code references below are to `2eb7928`.

---

## 1. The design, in one paragraph

Read state lives on the server, on the existing membership row (`sessionPeers`), as a
**high-water mark per participant**: "delivered through turn N, at time T, via inbox|wait".
**Exactly one route writes it** (`POST /a2a/session/:id/read`), and **exactly one client calls
that route**: `hub-talk`, after `--inbox` or `--wait` has printed turns to its output, naming the
reader explicitly. `GET .../messages` is not touched: it stays a Convex *query*, which cannot
write, so no fetch of any kind (daemon, web client, dashboard, probe, `curl`) can mark anything.
A sender sees receipts through a new read-only `GET /a2a/session/:id/reads`, which `hub-talk`
prints for the sender's own unread turns on `--inbox` and when `--wait` times out.
For T-051, the `register(PEER)` line goes, and naming an unregistered peer fails closed.

## 2. Components

### 2.1 Schema (`convex/schema.ts`, and `ENTITIES.md` in the same change)

`sessionPeers` gains three **optional** fields, so no existing row needs migrating:

| Field | Type | Meaning |
|---|---|---|
| `readThroughTurn` | `number?` | Highest turn delivered to this participant's foreground `hub-talk` |
| `readAt` | `number?` | Hub time at which that mark was set |
| `readVia` | `"inbox" \| "wait"`? | Which call delivered it |

**Absent means "no read has ever been recorded"** — condition 3's state. Every existing row starts
there, which is true: none of them has a recorded read.

*Why `sessionPeers` and not a new table:* the participant set of a room is already defined by
these rows, `by_session` already indexes them, and a mark for a non-member is then impossible to
store rather than something to validate against.

### 2.2 Pure logic (`convex/readLogic.ts`, tested like `instanceLogic.ts`)

`computeReadState(numberedTurns, members)` → per participant:
`{ name, lastRead: null | { turn, at, via }, unread: [{ turn, from, sentAt }] }`.
A turn `t` is unread by `p` iff `t.from !== p.name` **and** `t.turn > (p.readThroughTurn ?? 0)`.
Turn numbers are derived exactly as `messages.list` derives them (1-based insertion order,
`convex/messages.ts:62`), through a shared helper, so a receipt and a turn number can never
disagree about which turn is which.

### 2.3 Convex functions

- **`messages.markRead` (mutation)** `{ sessionId, reader, throughTurn, via }`.
  Rejects: unknown session; `reader` not a member of the room; `throughTurn` not an integer in
  `1..turnCount` (a mark past the end would pre-mark future turns read). **Monotonic:** patches
  only when `throughTurn` exceeds the stored mark; otherwise a no-op that returns the stored mark.
  A later `--wait` with an older local cursor can therefore never move a mark backwards.
- **`sessions.readState` (query)** `{ sessionId }` → `{ turnCount, participants: computeReadState(...) }`.

### 2.4 Express routes (both under the existing `/a2a` key guard, `src/index.ts:119`)

- `POST /a2a/session/:id/read` → `markRead`. 400 bad input, 404 not a member, 200 `{ readThroughTurn }`.
- `GET /a2a/session/:id/reads` → `readState`.
- **`GET /a2a/session/:id/messages` (`src/index.ts:489-503`) and `messages.list` are unchanged.**
  So is every other existing route.

### 2.5 `hub-talk.mjs`

1. **Delete `if (PEER) await register(PEER)`** (line 220). T-051.
2. **Unknown peer:** `createLobby` catches the hub's `Unknown peer: <name>` (thrown by
   `sessions.create`, `convex/sessions.ts:21`) and exits **1** with
   `peer <name> is not registered on this hub — it must run hub-talk --as <name> once, or pass --session <id>`.
3. **Mark after printing, never before.** `--inbox` (after `printTurns(all)`, line 279): mark through
   `maxTurn(all)`, `via: "inbox"`; local cursor untouched as today. `--wait` (inside `emit`, line
   290): after `printTurns` and `writeCursor`, mark through `maxTurn(pending)`, `via: "wait"`.
4. **The mark can never change the outcome of the call.** One attempt, 5 s timeout, never
   throws, never touches the exit code. On failure it says so on stderr:
   `[hub-talk] read receipt not recorded (404: hub has no read receipts)` or `(... <status>)`.
   Ordering print-then-mark means a crash between the two shows a delivered turn as **unread** —
   the failure direction is a false "unread", never a false "read".
5. **Sender's view.** `--inbox`, after its summary line, and `--wait` on timeout (before exiting
   2), fetch `/reads` and print one line per own turn that someone has not read:
   ```
   [hub-talk] turn 7 (yours): unread by grok-dev since 2026-09-23T08:01:42Z — never read this room
   [hub-talk] turn 7 (yours): unread by relay since 2026-09-23T08:01:42Z — read through turn 5 at 07:58:10Z (wait)
   ```
   If `/reads` fails: `[hub-talk] read receipts unavailable from this hub`, and nothing else
   changes. The `--wait` timeout is exactly the Atlas case: "no peer turn" now arrives together
   with "and here is who has not seen yours".
6. Exit codes unchanged on every path. `--say` is unchanged apart from item 1.

`--say` does not print receipts: the turn it just sent is unread by everyone at that instant, so
the line would carry no information. `--inbox` is the sender's check.

## 3. The five conditions

**1. `--inbox` versus the local cursor.** Two instruments, two questions, and both rules hold:
- **Server mark:** `--inbox` **is** a read. It prints the whole room into the agent's context, so
  it marks through the room's last turn, `via: "inbox"`.
- **Local cursor:** `--inbox` still does **not** move it (`hub-talk.mjs:273-277` unchanged).
- **Why the evidence property survives:** the local cursor answers "what has `--wait` handed me
  as new?", and it is still moved only by `--wait`. `--inbox`'s stderr line still reports
  `N unread after turn X (cursor unchanged)`, so a skip is still visible in the act of showing it.
  When the two disagree (server: delivered through 7 via inbox; cursor: 5), the next `--wait`
  replays 6–7. That is the existing "replaying is noise, skipping is loss" rule
  (`hub-talk.mjs:267-270`), and the `via` field tells a reader which instrument set the mark.

**2. A sender's own turn is never unread by the sender.** By definition in `computeReadState`
(`t.from !== p.name`), not by moving the sender's mark. `--say` must not move the server mark for
the same reason it must not move the local cursor (`hub-talk.mjs:233-234`): a mark moved by
one's own write hides peer turns that landed before it. Unit-tested both ways.

**3. Never-read versus read-through-N.** Stored differently (fields absent vs present) and
returned differently (`lastRead: null` vs `lastRead: { turn, at, via }`), and printed
differently (`never read this room` vs `read through turn N at T (via)`). In both, "since" is the
unread turn's send time. `null` is never rendered as turn 0.

**4. Version skew, both directions.** The design changes **no existing route or function**; it
only adds two routes, two functions and three optional fields. So:

| Skew | What happens |
|---|---|
| New `hub-talk` → old hub (both halves old) | `/read` and `/reads` 404. Send, receive, wait behave as today; stderr says receipts were not recorded / are unavailable. Exit codes unchanged. |
| New `hub-talk` → split deploy, app new, Convex old (the wrong order) | `/read`, `/reads` 500 on the missing function → same as above. Send and `messages.list` paths are unchanged, so they keep working. |
| New `hub-talk` → split deploy, Convex new, app old (the safe order) | Routes absent → 404 → same as row 1. |
| Old `hub-talk` → new hub | Byte-identical responses on every route it calls. It never marks, so its user shows as `never read` (limit L4). |

Precedent followed: like the `?after=` fallback (`hub-talk.mjs:239-258`), the new calls degrade to
a stderr line, per call rather than latched, because they are off the hot path.

**5. `--peer <name>` when `<name>` is not registered.** It fails closed: exit 1 with a message that
names the fix, and **creates nothing** (no agent row, no peer row, no room).
If a `{me, name}` room already exists, it is found as today and works — a peer in an existing
room already has its peer row.
*Why not "register it if absent":* that would still write an agent row for `<name>` **with this
seat's key hash**, card `kind: "ide-session"`, `status: online` and a fresh `lastSeen`. So it
would (a) claim the name, which under `AUTH_MODE=strict` makes the real peer's own registration
return 409 (`src/index.ts:353-356`); (b) show a phantom live IDE peer in `/a2a/agents/live` for 45 s;
(c) post "Agent <name> is now online" to the hub room. And a typo (`--peer grok-dve`) would
silently create a room nobody will ever read, which is ADR-013's silence exactly.
**What is lost:** leaving a first message for a seat that has never registered on this hub.
Every seat that has run `hub-talk` once is registered, so this only bites brand-new names.
The workaround is the one the message names.

**What `register(PEER)` did to a registered peer, for the record:** overwrote its `agentCard`
with hub-talk's defaults — so a repo daemon's card became `kind: "ide-session"` and it turned up as
a joinable IDE peer — replaced its `apiKeyHash` with the caller's, set it `online`, and wiped its
`peers.metadata` (`convex/peers.ts:17-21`). Sibling check: `ask-agent.mjs:68` and `daemon.ts:240`
register only their own name; no other caller registers someone else.

## 4. How Gauge checks A1–A7

All on the local stack (local Convex + hub) in the QA tree, against the candidate SHA. Receipts
are read from `GET /reads` directly, not from `hub-talk`'s rendering of them.

- **A1** Register A and B. A `--say`s turn N. `GET /reads`: B has `lastRead: null` and turn N in
  `unread` with `sentAt` equal to that turn's `createdAt` from `GET /messages`. B runs `--wait`
  (foreground). `GET /reads`: B `lastRead.turn = N`, `via: "wait"`, turn N gone from B's unread.
  Both directions asserted: present before, absent after.
- **A2** A sends two turns; B runs `--inbox`. `/reads`: B through the last turn, `via: "inbox"`.
  B's cursor file (`%TEMP%\a2a-hub-talk-B-<id>.after`) is byte-identical before and after (or
  absent before and after). B's next `--wait` prints those turns again — stated behaviour.
- **A3** With turn N unread by B: plain `GET .../messages` with the dev-key and no reader; a
  running daemon polling the room; the web client open on it. `/reads` unchanged, byte for byte.
  **Mutant:** make the GET handler call `markRead` for `req.agentName` through the last turn →
  A3 fails. Plus `grep -rn "/read\b"` over `scripts src client` finds `hub-talk.mjs` as the only
  caller.
- **A4** (a) New `hub-talk` against a hub built from `2eb7928`: `--say` / `--inbox` / `--wait`
  (with and without `--wait-timeout`) give the same stdout and exit codes as the old script, plus
  only the "not recorded / unavailable" stderr lines. Repeat with the app at the candidate and
  Convex functions at `2eb7928`. (b) `git show 2eb7928:scripts/hub-talk.mjs` against the
  candidate hub: same stdout and exit codes as against the old hub.
- **A5** Register B with a distinctive card (a daemon, or a custom `kind`). Snapshot
  `agents:getByName` and `peers:getByName` for B (`npx convex run` against local Convex). Run
  `hub-talk --as A --peer B --say x`. Snapshot again: `agentCard`, `apiKeyHash`, `lastSeen`,
  `status`, `activeInstanceId`, `peers.metadata` all equal. **Mutant:** restore line 220 → card
  changes → A5 fails. **Also:** `--peer never-registered-xyz` exits 1, and no agent row, peer row
  or room exists for that name afterwards.
- **A6** `npx vitest run`, `npx tsc --noEmit`, `start-stack.ps1` comes up, schema and `ENTITIES.md`
  agree.
- **A7** `docs/joining-the-hub.md` ("4. Read" and "What the hub does not do") and `hub-talk.mjs`'s
  header comment carry limits L1 and L2, and L3–L5 below.

Implementation-time tests I will add (evidence, not acceptance): `computeReadState` unit tests
for conditions 2 and 3; stub-hub CLI tests that `--wait` and `--inbox` post the mark **after**
stdout is written, that a 404/500 on `/read` leaves exit codes unchanged, that `--peer` sends no
`register` for the peer, and that an unknown peer exits 1.

## 5. Limits this design cannot meet

- **L1 — delivery, not reading** (the brief's). The claim is "delivered to the output of a
  `hub-talk` call by whoever uses that name".
- **L2 — identity** (the brief's, SIA's acceptance until T-003). `reader` is asserted by the
  client. Under the shared dev-key the hub cannot check it: `req.agentName` is whichever agent
  row matches the shared key hash (`src/auth.ts:51-78`), so enforcing `reader === req.agentName`
  now would reject honest readers. After T-003 that check becomes possible and should be added.
- **L3 — foreground cannot be proven. This is the gap against SIA's exact scenario, and I want
  Relay to rule on it.** The design separates "`hub-talk` naming a reader" from "any other fetch".
  It cannot separate a *foreground* `hub-talk --wait` from the same command run by a background
  runner — a Cursor background terminal, a shell loop — whose output the model never sees. That
  would mark read and the receipt would lie, in the Grok case exactly. Nothing on the hub side
  can see it. `stdout.isTTY` is not a reliable signal either: an agent's own terminal tool may
  pipe stdout as well. That is unverified on Cursor, so I'm not relying on it. Options: (a) accept, and
  document "never run `hub-talk` as a background listener"; (b) add `--no-read-mark` for anyone
  who deliberately wraps it. Neither is deterministic against misuse. My recommendation is (a).
- **L4 — a reader on an old `hub-talk` never marks.** It shows as "never read this room"
  indefinitely. That is fail-closed (false unread, never false read). It cannot be otherwise:
  an old client's GET names no reader, and under the dev-key the hub cannot work out who it is.
- **L5 — a mark that fails to post** (hub down, timeout, crash after printing) leaves a delivered
  turn showing unread. Same direction as L4, reported on the reader's stderr.
- **The mark is a high-water mark, not a per-turn set.** This is sound because `hub-talk` only
  ever prints a contiguous range: the whole room (`--inbox`), or every peer turn above the cursor
  (`--wait`). A future client that prints a subset must not post a mark.
- **GitNexus coverage:** `impact` on `messages.list` reports 0 callers and does not resolve
  `hub-talk.mjs`'s `main`. Its callers go through `api.messages.list` and plain `fetch`. That is
  a gap in the index, not a safe result. Caller lists above come from `grep`.

## 6. Questions for Relay

1. **The brief says "no change to the reader's client is needed for the sender to see it".** I read
   it as: the sender needs nothing new to see the state, and it doesn't depend on a file on the
   reader's machine. It cannot mean the reader's `hub-talk` stays old (L4). Is that reading right?
   Related: **which `hub-talk` does SIA's developer seat run?** If it's this repo's main checkout,
   the merge updates it. If SIA keeps a copy, SIA has to update that copy before its seat
   produces receipts.
2. L3: (a) or (b)?

## 7. Delivery

One branch and one PR, with the schema change, `ENTITIES.md`, docs and tests all in it. Version
**v1.8.0** (a new feature) with a CHANGELOG entry. The push and the PR each need Aaron's word. There
is no deploy: live receipts for SIA need a tcm redeploy, Convex first, which is a separate act.
