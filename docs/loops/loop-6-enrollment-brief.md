# Loop 6 brief: only an owner's invitation creates a name, and the hub is fit for a public address

Relay, session 18, 2026-09-25. Serves D-011 step 4 (order corrected by D-012). Task: T-067, bundling
T-005 (rate limiting) and T-062 (error pages), plus T-070 and T-055 as the same "before exposure"
class. Line numbers are at `9a38b8d` (master, v1.11.0), read by Relay.

**Status: ready for design.** The one open question was answered through Atlas under D-003:
`--invite` is approved (D-014; see § hub-talk: `--invite`). **Build does not start before
Loop 5 is deployed to tcm:** Loop 6 builds on Loop 5's `owner` field and `[authz]` behaviour, and the
soak may still change them.

## What this loop is for

**The goal it serves (D-011):** Aaron's Grok Bot, on a cloud VM and never on his tailnet, registers
with tcm's hub over HTTPS and talks to relay in its own room. After Loop 5, the hub checks who a key
is and which rooms it may touch. It still lets **anyone make a key**, and it answers errors the way a
development server does. This loop closes those before Funnel (D-011 step 5).

**What is there today (read, not asserted):**

- **Registration is open.** `POST /a2a/register` (`src/index.ts:496`) is exempt from the key guard
  (`:205`). Any caller who can reach it picks a free name and a key and becomes a valid agent,
  owned by `HUB_OWNER` (`:63`), which is `aaron`. The code says this is safe "only because nothing
  is public before strict and Loop 6" (`:60-62`).
- **Anyone can declare themselves human.** `src/keys.ts:61` sets `owner` to the registrant's own
  name when the body's `agentCard.kind` is `"human"`. An open register therefore creates owners,
  that is accounts, on the caller's word. This is new in this brief; no task records it.
- **hub-talk registers on every run**, not only at `--init-key`: `register(ME)` is called on every
  invocation (`scripts/hub-talk.mjs:368`) and in the lobby loop (`:346`). A refused register exits
  with rc 1 (`:233-234`). Anything that makes registration need a code for an *existing* name breaks
  every SIA seat.
- **Error bodies leak.** Neither the Dockerfile nor compose sets `NODE_ENV` (T-062), so Express's
  default handler serves development pages: path on a missing `/ui/` file, stack on malformed JSON.
  Separately, 15 route catch blocks in `src/index.ts` answer `500 { error: error.message }`, which
  passes Convex's internal messages through to the caller. That is the same class.
- **No rate limiting anywhere** (T-005).
- **Two oracle and status leftovers:** `/read` tells a non-member from a nonexistent room in strict
  (T-070), and a malformed session id gives 500, not 4xx (T-055).

## Objective

**A new name exists on the hub only because a human owner invited it, and every answer the hub gives
to a stranger is terse, bounded and uniform.**

**Capability:** one-time enrollment codes. A human owner issues a code; an agent presents it once to
create its name; the name's `owner` is the issuing human. Grok Bot joins Aaron's account this way.

**Repair:** the exposure class: clean error responses (T-062, T-055, and the `error.message`
passthrough), T-070's oracle, and basic rate limiting (T-005).

## Scope

1. **Enrollment codes.**
   - A code is issued by an authenticated human-kind key for its own account. No agent key can issue
     one. Codes are single-use, expire, are stored only as a hash, and never appear in a log line or
     in any response except the one that issues them.
   - **A register for a name that does not exist needs a valid code.** The new row's `owner` is the
     code's issuer. The body cannot choose it (this keeps Loop 5's O5).
   - **Re-register of an existing name with its own key is unchanged** and needs no code. This is what
     keeps every hub-talk run working.
   - **A refusal names its condition** (Atlas, for SIA, 2026-09-25): a new name with no code, an
     expired code and a used code each get a distinct error saying so. For example, "this name is
     new and needs an enrollment code from its owner". A seat that hits one then reports the right
     thing through its planner instead of retrying. The message still reveals nothing else, such as
     whether a code ever existed for another name.
   - **Aaron must be able to issue a code without programming:** one command he can paste, or a
     control on the chat page. The design picks one and shows the exact steps.
2. **Human rows come from the operator, not from a register body.** Closes the `keys.ts:61` path: a
   register that declares `kind: "human"` does not create an owner. How the operator creates a
   second human account is the design's to say. The minimum is that it cannot happen over the API
   without the operator.
3. **Warn and strict.** A codeless register of a new name, and a human-kind self-declaration, are
   **logged in warn with a distinct `[enroll]` line and refused in strict**, the same as Loop 5's
   `[authz]`. The line must be readable through the read-only key: widen `auth-log` or add an item.
   That is a tcm script change in the deploy act, on Aaron's word, like D-012's A1.
4. **Error responses, the whole class.** Inventory every error response the hub can send: Express
   defaults, body-parser failures, static-file misses under `/ui/`, every route catch block, and
   Convex validator throws (T-055). Each one answers a terse body with no path, no stack and no
   internal message. Details go to the hub log, not the response. Malformed ids are 4xx. The
   inventory is derived from the code at the candidate, not copied from this list.
5. **T-070.** In strict, `POST /a2a/session/:id/read` answers a non-member exactly as it answers a
   nonexistent id, byte for byte, like every other session route (Loop 5 ruling 1, Q2).
6. **Rate limiting (T-005).** Per key for authenticated routes, and per source for unauthenticated
   ones (register, `/ui/`, whoami). Over the limit answers `429` with `Retry-After`. Limits are set
   from **measured** seat traffic, not guessed: the design reads tcm's log for the busiest real
   pattern, `hub-talk --wait` polling and the daemons, and sets limits with headroom above it. **How
   a Funnel request's source address reaches the hub is to be established by a test, not assumed.**
   If it arrives as loopback, per-source limiting is one bucket for the whole internet, and the
   design says what it does instead.

## Must still hold (preserve)

1. **hub-talk for an existing name is unchanged, in both modes** (D-003). Every SIA flow works:
   register, `--inbox`, `--say`, `--wait`, `--peer`, read receipts, `--rotate-key`. Only creating a
   *new* name changes, through `--invite` (D-014, § hub-talk: `--invite`). `--rotate-key` is not
   enrollment: it calls only `POST /a2a/rotate` (`scripts/hub-key.mjs:217-227`), which is proven by
   the current key and stays unchanged and codeless. An `--init-key` on an existing owned name stays
   refused with a 409 in both modes (`convex/keyLogic.ts:80-83`). Ruled in the room, turn 5.
2. **Every existing row keeps its key and its owner.** No name on tcm is re-enrolled.
3. **Loop 5 holds:** identity binding, membership, the owner's view and askPolicy on JSON-RPC,
   warn logging `[authz]` and strict refusing. Loop 5's acceptance rows are re-run.
4. **The daemons** still heartbeat, poll and answer on the local stack.
5. **Aaron's chat page** still works, and still lists his agents' rooms.
6. **Warn refuses nothing new** (the same rule as Loop 5). Rate limiting is the one exception, and it
   is set so real seat traffic never meets it. The design shows the measurement.
7. **Skew:** the old hub (v1.11.0) against the candidate's Convex functions works for the deploy
   window (Loop 3 B2's method).

## Out of scope

Cross-account rooms and room invitations (D-010's next step; see Ruling below). Self-service human
sign-up. A web page for account management beyond issuing a code. Tailscale Funnel itself (D-011
step 5, its own act), and T-057's port review that precedes it. `AUTH_MODE=strict` (its own act).
T-059 (name format), T-017, T-050, T-072 to T-074. End-to-end encryption.

## Ruling: cross-account rooms are not in this loop

The record disagrees with itself here. The Loop 5 design (`loop-5-design.md:54-55`) and Loop 5
ruling 1 (`:35`) say cross-owner rooms come "by invitation in Loop 6". D-011 step 4 and T-067 say
Grok Bot joins **Aaron's** account and cross-account rooms "come after".

**Ruled: after.** The test D-011 names does not need them, because Grok Bot and relay share an owner.
They are a second capability, and bundling them would make a failure in this loop harder to place.
Loop 5's `createCheck` keeps refusing cross-owner rooms in strict, which is the safe default until
then. This is a planner scoping ruling, not a change to D-010. Aaron's "yes, cross-account rooms by
invitation" had no timing, and it still stands. It will be recorded as a decision pointing at the
Loop 5 texts.

## hub-talk: `--invite` (D-003, answered; D-014)

**The question was how a new SIA seat creates its name once codes exist.** Today a new seat runs
`hub-talk --as <name> --init-key` and exists. After this loop, in strict, a new name needs a code.

**Approved:** hub-talk gains `--invite <code>`, used only with `--init-key`, and passes the code on
that one register. Every other invocation is byte-identical to today. Aaron issues a code before a
new seat is created.

Aaron answered "yes" in the SIA planner session (Atlas, record 109, session
`9a149231-b394-4290-9cfe-7118be1d6ba0`) at about 22:17Z on 2026-09-25. He was answering "Do you
approve `--invite <code>`?", put to him verbatim with this recommendation. Atlas relayed it to Relay
the same evening. **It does not choose how codes are issued** (one command or a chat-page button);
that stays with the design (scope 1).

This is the one hub-talk contract change in the loop. Anything else the design wants from hub-talk
is a new D-003 question.

## Acceptance (Gauge writes the criteria; these are the conditions)

- **A. Enrollment, both directions, in strict.** A new name without a code is refused; with a valid
  code it succeeds and its `owner` is the issuer. The same code a second time is refused. An expired
  code is refused. A code from a scratch second owner yields that owner. An agent key cannot issue.
  A register body cannot choose `owner` or become human. Each refusal's error names its condition
  (no code, expired, used).
- **B. Warn.** Each refusal in A succeeds in warn and logs its `[enroll]` line. The line is visible
  through the read-only tcm menu in the deploy's own check.
- **C. Secrecy.** No code, key or hash appears in any log line or in any response other than issue.
  Grep the full run logs, and validate the grep on a planted positive first.
- **D. Error class.** For every entry in the re-derived inventory, the response has no path, stack
  or internal message. Malformed ids are 4xx. Check on a stage replay of the Dockerfile, as in Loop 4
  G1, because `NODE_ENV` lives in the image.
- **E. T-070.** Non-member and nonexistent `/read` answers are byte-identical in strict.
- **F. Rate limiting.** A burst over the limit gets 429 with `Retry-After`. A replay of the measured
  seat pattern gets none. Per-source limiting is shown to see distinct sources as they will arrive
  through Funnel, or the design's alternative is tested instead.
- **G. Preserve 1-5.** A seat acting as itself behaves identically, v1.11.0 versus candidate, in both
  modes, through the unchanged hub-talk (except the new `--invite`, D-014). Loop 5's rows re-run.
- **H. Skew** as Preserve 7.

## Sequencing and authority

- **Design first:** Rivet sends Relay a design for a ruling. It starts from this brief's inventory
  and checks it for siblings, the way `keys.ts:61` was one.
- **Build** only after the Loop 5 deploy and soak, in worktrees, on scratch stacks, on pinned ports.
  Never the main checkout. Never tcm.
- **Deploy** is its own act on Aaron's word, in warn if tcm is still in warn. The `[enroll]` log item
  on tcm is part of that act.
- **Merging, tagging, deploying, strict and Funnel** each need Aaron's word for that act. **G-001
  still holds:** no public address before strict.
