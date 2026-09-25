# Loop 5 brief: a key acts only as itself, and only in its own rooms

Relay, session 17, 2026-09-25. Asked for by Aaron, same session: "yes, and record the important
detail of this conversation so future planner agents see it". Decisions: D-010 (a multi-tenant hub
with cross-account rooms by invitation) and D-011 (the first outside-agent test). Line numbers are
at `c4d2d1c` (v1.10.0), read by Relay.

## What this loop is for

**The goal it serves (D-011):** Aaron's Grok Bot, on a cloud VM and never on his tailnet, registers
with tcm's hub **over HTTPS** as the first outside agent, then talks to relay in its own room. The
route there: Loop 5 (this); T-064's day-long log read; `AUTH_MODE=strict`; Loop 6 (enrollment
codes, rate limiting, error pages); then Tailscale Funnel on tcm; then the test.

**Why this loop comes first.** The hub was built for one owner on a private tailnet, and it
trusts callers:

- **In `warn` mode an unknown key is let through as nobody** (`src/auth.ts:95-116`). Strict mode is
  a precondition of any public address, and this loop does not change the mode.
- **Membership is not checked anywhere.** `GET /a2a/sessions` returns `sessions.listAll` unfiltered
  (`:417`). `GET /a2a/session/:id/messages` (`:463`), `POST .../message` (`:375`), `.../rename`
  (`:427`), `.../extend` (`:444`) and `GET .../reads` (`:516`) never ask whether the caller is a
  participant.
- **Identity comes from the caller's words, not its key** (T-058's class):
  - `from` on a session message (`:375`);
  - `role` as the sender on `POST /a2a/message/send` (`:195`);
  - `:agentId` on `GET /a2a/queue/:agentId` (`:261`) and `POST /a2a/heartbeat/:agentId`
    (`:273`);
  - `agentName` on `POST /a2a/task/:taskId/claim` (`:250`);
  - `:peerName` on `GET /a2a/peer/:peerName/sessions` (`:403`);
  - `reader` on `POST .../read` (`:483`), which is checked but in warn mode only
    (`checkReader`).
- **Tasks:** `POST /a2a/task/:taskId/respond` (`:221`) lets any key respond to any task.
- **JSON-RPC** (`/a2a/jsonrpc`, `:140-148`) runs with `UserBuilder.noAuthentication`. The executor
  never sees the caller, so `askPolicy` is not enforced there (T-004).
- **Session create** (`:355`) takes any participant list. The caller need not be in it.

Grok Bot, or anyone holding any valid key, could today read SIA's rooms, post as `atlas` or `aaron`,
and drain another agent's queue.

## Objective

**Every request acts as the name its key belongs to, and touches only rooms that name is a
participant in.** In `strict` mode a mismatch is refused. In `warn` mode it is allowed and logged
with a distinct, greppable line, so T-064-style reads can see it before strict is turned on.

**Repair:** T-004. JSON-RPC carries the authenticated name, and `askPolicy` is enforced on it as on
the legacy route.

**Capability:** room membership. A name sees and writes only its own rooms.

## Scope

1. **Bind every asserted identity to the key**, across the whole list above. Where a route takes a
   name (in the path or the body) that is not the caller's, `strict` refuses and `warn` logs. The
   design says, per route, whether the field goes away, is ignored, or must equal the caller.
2. **Membership on every session route** (list, read, post, rename, extend, reads). A session
   create must include the caller as a participant. The peer-sessions route answers only for the
   caller's own name.
3. **Tasks:** only the claimant responds to a claimed task. The design settles unclaimed tasks and
   the queue's ownership.
4. **JSON-RPC** (T-004): a user builder that carries `req.agentName`, and `askPolicy` enforced.
5. **The owner's view (see Preserve 3).**

## Must still hold (preserve)

1. **`scripts/hub-talk.mjs` and its contract are unchanged for SIA** (D-003). Every flow SIA uses
   (register, `--inbox`, `--say`, `--wait`, `--peer`, read receipts) works in both modes for a seat
   acting as itself in its own rooms. If the design needs a hub-talk change, stop: that is a D-003
   question for Aaron through the SIA planner.
2. **The daemons** (alice and bob) still heartbeat, poll their own queue, and answer, on the local
   stack.
3. **Aaron's chat page still shows every room among his own agents** (relay, atlas, grok and
   their rooms today). Participant-only visibility would hide them from `aaron`. Until D-010's
   accounts exist, the design must give the human owner a view of his own agents' rooms **without
   giving any agent a view of rooms it is not in**. One way is an owner on each agent row, set to
   `aaron` for every current row, and a human sees the rooms whose participants he owns. The
   mechanism is Rivet's; the requirement is not. This is the first piece of D-010's data model, so
   the design names how Loop 6's accounts extend it.
4. **Warn mode refuses nothing new.** Every new check logs in `warn` and refuses only in
   `strict`. tcm stays `warn` until T-064 and Aaron's word.
5. **API responses are unchanged for a caller acting as itself in its own rooms.** The one
   exception is the session list, which is filtered by design.
6. **`convex/` changes are allowed** (unlike Loop 4). Any change to a function the old hub calls
   gets the same skew check as Loop 3's B2, because tcm's deploy pushes functions before the hub.

## Out of scope

Accounts, invitations and enrollment codes (Loop 6, D-010); rate limiting (T-005, Loop 6); error
pages (T-062, Loop 6); `AUTH_MODE=strict` on tcm (its own act, after T-064); any public address;
T-017; T-050; end-to-end encryption.

## Acceptance (Gauge writes the criteria; these are the conditions)

- **A.** In strict mode, for every route in the inventory above, a valid key acting as another name,
  or outside its rooms, is refused. The same request as itself, in its own room, succeeds. Both
  directions, per route. The inventory is re-derived from `src/index.ts` at the candidate, not
  copied from this brief.
- **B.** In warn mode, the same mismatches succeed and each logs its distinct line, with no key or
  hash in it.
- **C.** JSON-RPC: an ask a target's `askPolicy` denies is refused through `/a2a/jsonrpc` as through
  `/a2a/message/send` (T-004).
- **D.** Preserve 1: a seat acting as itself (SIA's flows through the unchanged `hub-talk`) behaves
  identically, old hub versus candidate, in both modes.
- **E.** Preserve 3: `aaron`'s page lists his agents' rooms. An agent's key lists only its own. A
  second owner's agent (a scratch row) is invisible to `aaron`, and `aaron`'s rooms are invisible to
  it.
- **F.** Skew: the old hub (`c4d2d1c`) against the candidate's functions keeps working for the
  deploy window (Loop 3 B2's method).

## Sequencing and authority

- **Design first:** Rivet sends Relay a design for a ruling before building. The design starts from
  this brief's inventory and checks it for siblings.
- **Build and QA** run in worktrees, on scratch stacks, on pinned ports. Never the main checkout.
  Never tcm.
- **Deploy** is its own act on Aaron's word, following the documented procedure with PB and PD, and
  stays in `warn`. **Strict is a separate act.**
- **Merging, tagging, deploying and turning strict on** each need Aaron's word for that act.
