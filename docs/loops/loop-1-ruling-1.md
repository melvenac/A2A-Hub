# Loop 1 — ruling 1 on Rivet's design

**Date:** 2026-09-23 · **Author:** planner seat (Relay), session 15 · **On:** Rivet's
`docs/loops/loop-1-design.md` (session 16, read at `2eb7928`; uncommitted in a2a-rivet when ruled).

## Ruling: approved to build, with the rulings below

The design meets the brief. What decided it:

- **One writer.** There is exactly one writing route, and `GET .../messages` stays a Convex query
  that cannot write. So a fetch cannot mark a turn read by construction, not by care.
- **Failure points toward "unread".** Marks are posted after printing, and they only move forward.
  Every failure direction named (L4, L5, a crash between print and mark) shows a false "unread",
  never a false "read".
- **Skew is handled.** The design only adds routes; no existing route changes. That is the
  `?after=` fallback's precedent.
- **T-051 fails closed.** Rivet's reasons against "register if absent" are right: claiming the name
  would make the real peer's own registration 409 under strict auth, and a typo would open a room
  nobody reads. The cost is the one Rivet named: a first message cannot be left for a seat that
  has never registered on the hub.

## Question 1 — "no change to the reader's client"

**Rivet's reading is right.** The line means the *sender* needs nothing new and nothing on the
reader's machine to see the state. It does not mean an old reader produces receipts. L4 (an old
reader shows "never read") is accepted, because it fails closed.

**Correction to section 6:** "if it's this repo's main checkout, the merge updates it" is not
true. A merge on GitHub updates no checkout. `~/Projects/A2A-Hub` was on `master` at `f7f102d`
when this was written, behind `2eb7928`, and a merge leaves it there. **Delivery therefore has a
named step:** every checkout whose `hub-talk.mjs` a seat runs must be updated before that seat
produces receipts. That includes the main checkout, which runs the stack, so updating it is an
act on infrastructure and needs Aaron's word. SIA's dispatch
(`loop-15-slice-3-dispatch-a2-grok.md` §6, SIA `origin/master`) says "A2A-Hub's
`scripts/hub-talk.mjs`" and names no path. Which copy the SIA developer seat runs is asked of
SIA, through Atlas.

## Question 2 — L3: (a) accept and document

**(a).** Option (b), `--no-read-mark`, protects only a caller who already knows the output will not
reach the agent. The failure it targets is the caller who does not know. So it adds a contract
surface to a load-bearing script and buys nothing against the case. No deterministic signal
exists: `isTTY` is unreliable, as Rivet says, and the hub cannot see the caller. Deterministic-first
was considered, and there is nothing to be deterministic about.

**The documented rule is sharper than "never run it in the background":**

> `hub-talk` marks a turn read when it prints it. Run `--inbox` or `--wait` only where its output
> reaches the agent. A process whose output the agent never sees must not run them.

Some background runs *do* deliver. A Claude Code seat's backgrounded `--wait` hands its output to
the model when it exits. Banning "background" would ban a delivering use, and it would still miss
a foreground call whose output is discarded.

**Addendum, from SIA's disclosure as customer (Atlas, 2026-09-23):**

- **(a) Background `--wait` whose output goes to a file the agent later reads.** This is within the
  rule. The mark lands when hub-talk prints, and the agent reads the file afterwards. The gap
  between the two is limit L1 (delivery, not reading), not a new limit.
- **(b) A "drain" call.** For example, `--wait --wait-timeout 5` run only to move the cursor past a
  turn, with its output counted but not read. **This makes the receipt lie.** SIA has stopped
  doing it.

The documentation names (b) explicitly:

> Never run `--wait` or `--inbox` just to advance past turns; every run's output must be read.

**Carried forward, not built now:** T-050's Cursor `stop` hook delivers through `followup_message`,
not through `hub-talk`'s stdout. If it ever fetches turns for the agent, it is a second
delivering path and needs its own marking rule. T-050's design settles that; this loop does not.

## Build conditions (unchanged from the brief, restated)

- Rows A1–A7 as the design lays them out, with both mutants. Gauge checks them against
  `GET /reads` directly.
- v1.8.0, a CHANGELOG entry, and `ENTITIES.md` in the same change as `schema.ts`.
- No push without Aaron's word for it. No deploy. No live Convex writes.
- If Atlas calls a quiet window, stop builds and test runs until it is lifted (relayed by Relay).
