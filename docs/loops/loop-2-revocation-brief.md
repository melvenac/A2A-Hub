# Loop 2 — does a superseded key still authenticate on tcm? (T-001)

**Date:** 2026-09-24 · **Author:** planner seat (Relay), session 16 · **Status:** brief, not started.

**Record:** A2A-Hub `state.json` rev 26. Task T-001 (P0), the one unmet gate on the objective. Code
references are to `ea9d057` (master, v1.8.0). tcm runs v1.8.0 (V-001).

**Seats:** Rivet runs the read. Relay rules on the report. There is no QA acceptance: this loop
changes nothing. Aaron gives the word to start, and approves each tcm command in manual mode.
This is A2A-Hub-only work, so questions go to Aaron directly, not through Atlas.

**Blocked by:** the SIA hold, narrowed on 2026-09-24 ~03:25Z. Work on tcm is allowed, but **no new
A2A-Hub seat may be launched on this machine** until Atlas lifts the hold. Rivet is not running, so
this brief waits for the lift, or for Aaron to rule that Relay runs the read itself. The planner
role does not touch live data.

---

## Why this loop

Revocation means that once an agent re-registers with a new key, its old key stops working. That
has only ever been exercised in tests. It gates step 5 of T-002 (public exposure), and it must
hold before `AUTH_MODE=strict` means anything.

What the code does today, derived rather than assumed:

- **Authentication** is `getByKeyHash` (`convex/agents.ts:139-148`). It takes the `.first()` row
  whose `apiKeyHash` matches, **across all names**. Any row carrying a hash authenticates, as that
  row's name (`src/auth.ts:51-78`).
- **Collapse runs only on register** (`convex/agents.ts:26-72`). It patches the newest row with the
  new hash and deletes the other rows **for that name**, at most 4000 per call. An agent that has not
  re-registered since that code reached tcm still has every historical row, and every historical
  hash in them.
- **Name claims** at `POST /a2a/register` (`src/index.ts:352`) compare against `getByName`'s
  `.first()` row. With duplicates that is an arbitrary row's hash, so the verdict can depend on
  which row the index returns.
- **The shared `dev-key`** (`src/wrapper/daemon.ts:89`, `scripts/ask-agent.mjs:25`) gives many
  names the same hash. That hash then resolves to whichever name `.first()` returns. This is
  T-003's identity bug, seen from the database.
- **Under `AUTH_MODE=warn` nothing is rejected.** A stale key still passes; it only resolves to a
  name or does not. So the question is not "can an attacker get in today" (anyone can, in warn).
  It is "will strict actually revoke".

Session 14 counted about 39 rows for about 5 agents. That number is from before the collapse code
shipped, and it is not a current measurement.

## Objective

**Answer from tcm's live database, read-only: does any agent name hold more than one row, and does
any hash that is not an agent's current one still resolve to a name?** Report it. Change nothing.

## What must be preserved

- **No write of any kind to the live Convex database.** No `run` of a mutation, no import, no
  register call to "trigger the collapse". The collapse would destroy the evidence this loop is
  for. If a fix is warranted, it comes after the report, on Aaron's word (shared rule: live data is
  read-only until a report says otherwise).
- The hub keeps serving every seat throughout. No container restart and no redeploy.
- **No secret reaches a transcript, a file or a commit.** That covers the Convex admin key, `.env`
  values, and full key hashes. Report hashes by a short prefix (8 hex chars) at most, and prefer
  counts.

## Questions the report must answer

1. **Rows per name:** every agent name, with its row count. Report the total row count, and say how
   it was obtained: the instrument must show that it walked the whole table, not one page.
2. **Hashes per name:** for each name with more than one row, how many distinct hashes, and which
   row is canonical (the newest `lastSeen`, as `register` would pick it).
3. **Names per hash:** every hash held by more than one name, with the names and row counts. The
   `dev-key` hash is expected here. Say whether it is, without printing the key.
4. **Stale hashes that still resolve:** hashes on rows that are not their name's canonical row. For
   each, what `getByKeyHash` would return, derived from the rows and not by calling it with a key.
5. **`AUTH_MODE` on tcm:** its value, read without printing the rest of `.env`.
6. **The two sibling consumers:** does any name's `getByName` `.first()` row differ from its
   canonical row? That is where name claims and heartbeats would read a stale row
   (`convex/agents.ts:81-84`, `122-125`).
7. **The verdict,** in one line: "revocation holds on tcm", "revocation fails for names X, Y", or
   "could not be determined, because …". **Undetermined is a valid finding. Unanswered is not.**

## Validation conditions

- Each count carries what it came from: the command, the time (UTC) and the instrument. The report
  says how the instrument would have shown a duplicate had there been one. Validate against a known
  positive: the `dev-key` hash should appear under several names, because hub-talk registers with
  `dev-key` unless `AGENT_KEY` is set (`scripts/hub-talk.mjs:65,175`). If it does not appear, explain
  why before trusting any other negative.
- The read is shown to be read-only. List every command run on tcm. None of them may invoke a
  mutation, `deploy`, `import` or `register`.
- `/health` on tcm returns ok before and after, with the times recorded.

## Out of scope

- Fixing duplicates, rotating keys or deleting rows (T-003 and a later loop).
- Flipping `AUTH_MODE`.
- `askPolicy` on JSON-RPC (T-004) and rate limiting (T-005). They are also pre-exposure gates, but
  they are code changes, not a live read.

## Deliverable

`docs/loops/loop-2-revocation-report.md` on Rivet's own branch, pushed (D-005). Relay rules on it and
records T-001's outcome through `ob_state`. Aaron then decides whether a cleanup loop follows.
