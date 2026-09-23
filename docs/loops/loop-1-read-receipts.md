# Loop 1 — read receipts, and `--peer` stops re-registering

**Date:** 2026-09-23 · **Author:** planner seat (Relay), session 15 · **Status:** brief, not started.
Building waits for Atlas's all-clear on the SIA QA pause (D-003 coordination (a)).

**Record:** A2A-Hub `state.json` rev 6. Tasks T-049 (capability) and T-051 (repair). The customer is
SIA (its task T-160; the arrangement is D-003, corrected by D-004). Code references are to `f7f102d`.

**Seats:** Rivet builds, Gauge accepts, Relay rules on the design. Questions for Aaron about this
loop go through Atlas (D-003), quoted.

---

## Why this loop

On 2026-09-23 Atlas sent turns 6 and 7 into SIA's hub room. The SIA developer seat (Grok 4.7 in
Cursor) was idle and never read them. The hub returned true "sent turn N" receipts, which say
nothing about reading, so neither side could tell. Aaron found it by looking at the window. That is
ADR-013's class: silence that cannot tell "no messages" from "no listener".

Today the hub holds **no read state**. The only read cursor is a local file on the reader's machine
(`scripts/hub-cursor.mjs`), which only `--wait` advances (`scripts/hub-talk.mjs:271-292`). A sender
has no way to see it.

**Order ruled by Relay:** T-049 and T-051 now; T-001 (live-DB revocation) moves to Loop 2. T-001
gates public exposure, which is several steps away. T-049's cost is being paid now. T-050 (wake)
stays in investigation. Its documented mechanism only works at the moment an agent stops, so
T-049 is the half of SIA's acceptance that always holds (see T-050's note).

## Objective

**Repair:** `hub-talk --peer <name>` must stop registering `<name>` (T-051;
`scripts/hub-talk.mjs:220`). Naming a peer must not rewrite that peer's agent card.

**Capability:** for any turn in a room, a sender can see which participants have not read it, and
since when (T-049). No change to the reader's client is needed for the sender to see it.

## What "read" means (SIA's requirement, recorded in T-049)

- **Read means delivered into the agent's context, not fetched by a process.** The honest reader is
  the seat's own foreground `hub-talk` (`--inbox` or `--wait`), whose output the agent reads.
- **A fetch by anything else must not mark a turn read:** a daemon, a background listener, the web
  client, a dashboard, a health probe, or a plain `GET .../messages` with no reader named.
- **Named limit 1 — delivery, not reading.** Even a foreground call cannot prove the model read its
  output (the agent may pipe it away). The honest claim is "delivered to the output of a foreground
  call by the seat".
- **Named limit 2 — identity.** Under the shared dev-key, any seat can mark turns read as any
  participant. "Unread by X" means unread by whoever uses the name X. SIA accepts this for local
  trusted seats until T-003. It is SIA's acceptance, not a property of the feature, and it goes in
  the documentation as a limit.

How the design meets these is Rivet's call. Rivet proposes, and Relay rules on the result.

## Conditions the design must settle, and say how

1. **`--inbox` versus the local cursor.** `--inbox` puts the room into the agent's context, so under
   the definition above it is a read. Today it deliberately leaves the local cursor alone, to
   preserve evidence of a skip (`hub-talk.mjs:273-276`). The server's read mark and the local
   cursor may therefore disagree about `--inbox`. State which rule holds for each, and why the
   evidence property survives.
2. **A sender's own turn** is never "unread by the sender".
3. **A participant who has never read anything** in the room shows as unread from the turn's send
   time. That must show differently from "read up to turn N". Both are information, and neither
   may look like the other.
4. **Version skew, in both directions.** A redeploy is two deploys (`docs/redeploying-tcm.md`), and
   clients run on other hosts. A new `hub-talk` against an old hub must still send, receive and
   wait. It may report that receipts are unavailable, but it must not fail. An old `hub-talk`
   against a new hub must keep working unchanged. Follow the `?after=` fallback's precedent
   (`hub-talk.mjs:237-258`).
5. **For T-051, a peer that is not registered yet.** State what `--peer <name>` does when `<name>`
   is not registered, once it no longer registers it.

## Must still work afterwards

- Every seat still registers and talks through `hub-talk` (`--say`, `--inbox`, `--wait`,
  `--session`, `--peer`), with the exit codes unchanged. T-008's contract question is out of scope.
- The local stack still starts (`start-stack.ps1`).
- The live hub on tcm keeps serving SIA's room until a redeploy is authorised. **This loop does not
  deploy.**
- The existing suite still passes (vitest, 84/84 at `5bb0777` in a2a-rivet), and `tsc` is clean.
- `convex/schema.ts` and `.agents/SYSTEM/ENTITIES.md` agree after any schema change.

## Acceptance (Gauge)

Each row is checked against the running thing, not against a report. Assert both directions.

- **A1** The repro: seat A sends a turn and seat B does nothing. A can see "unread by B since T",
  with T the send time. B then runs a foreground `--wait`. A sees the turn read by B.
- **A2** `--inbox` by B marks read according to the rule condition 1 settled, and the local
  cursor behaves as stated there.
- **A3** A fetch that is not a named foreground read (e.g. a plain `GET .../messages`) leaves the
  turn unread. **Mutate:** make that fetch mark read, and A3 must fail.
- **A4** Skew: new `hub-talk` against a hub without this change still sends, receives and waits.
  Old `hub-talk` against a hub with it is unchanged.
- **A5** T-051: `hub-talk --as A --peer B` leaves B's agent row unchanged (compare before and
  after). **Mutate:** restore the `register(PEER)` line, and A5 must fail.
- **A6** Everything under "Must still work", run in the QA tree, not the main checkout.
- **A7** Both named limits appear in the user-facing documentation for the feature.

## Out of scope

T-050 (wake), T-003 (per-agent keys), T-008 (exit codes), T-001 (Loop 2), and any tcm redeploy. A
redeploy needs Aaron's word for that act, relayed quoted, plus Atlas's all-clear on live SIA traffic.
It is image plus `npx convex deploy`, verified with a real send.

## Outward-facing acts this loop needs

A branch push and a PR, on Aaron's word for each. Merge is Aaron's. Nothing touches live data.
