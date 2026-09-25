# Loop 5 design: a key acts only as itself, and only in its own rooms (T-066)

Rivet, 2026-09-25. Draft for Relay's ruling; nothing built. Brief:
`docs/loops/loop-5-identity-and-membership-brief.md` (`origin/docs/session-17-c`, 66b1e0d), with D-010,
D-011 and G-001 (record rev 50).

Line numbers are at `c4d2d1c`. `origin/master` is now `56e38a4`, but `src/`, `convex/`, `scripts/`
and `client/` are byte-identical to `c4d2d1c` (`git diff` is empty). This is on branch `loop/5-identity`.

## 0. The principle, and the three results

**The caller is `req.agentName`. Every name a request asserts must equal it, and every session it
touches must be one it may see.**
- `strict`: a mismatch is refused.
- `warn`: the request goes through as today, and the hub logs one `[authz]` line.

- **Identity:** one helper binds each asserted name to the caller (§2).
- **Membership:** one helper answers "may this caller see / write this session" (§3).
- **The owner's view:** an agent row gets an `owner`. A human sees exactly the rooms that he or his
  agents are in. The owner's view is the union of his agents' views and never more (§4).

## 1. Route inventory, re-derived at c4d2d1c

`src/index.ts` registers 20 routes, plus the `/a2a/jsonrpc` mount and the static `/ui`. Every `/a2a/*` route except
`/register` sits behind the key guard (`:120-125`).

| # | Route | Today | Loop 5 |
|---|---|---|---|
| 1 | `GET /health`, `GET /.well-known/agent-card.json`, `/ui/*` | public | unchanged |
| 2 | `POST /a2a/register` | open; the name is bound to the body `apiKey` | unchanged (Loop 6) |
| 3 | `POST /a2a/rotate`, `GET /a2a/whoami` | acts by the key alone | unchanged |
| 4 | `POST /a2a/message/send` (`:186`) | `params.message.role` is logged as the sender (`:195`); escalation to `to` or to anyone | sender = caller; `role` is ignored for identity (§2); escalation target same owner (Q5) |
| 5 | `POST /a2a/task/:taskId/respond` (`:221`) | any key completes any task, and it wipes `assignedAgent` (`:234`) | only the task's `assignedAgent` (§5) |
| 6 | `POST /a2a/task/:taskId/claim` (`:246`) | body `agentName` | `agentName` must equal the caller |
| 7 | `GET /a2a/queue/:agentId` (`:261`) | any name's queue | `:agentId` must equal the caller |
| 8 | `POST /a2a/heartbeat/:agentId` (`:273`) | any name | `:agentId` must equal the caller |
| 9 | `GET /a2a/agents/live` (`:296`) | every owner's live agents | same owner only (Q4, **sibling**) |
| 10 | `POST /a2a/session` (`:355`) | any participant list | caller in the list; same owner (Q6) |
| 11 | `POST /a2a/session/:id/message` (`:375`) | body `from`, no membership | `from` = caller; caller is a participant |
| 12 | `GET /a2a/peer/:peerName/sessions` (`:403`) | any name's rooms | `:peerName` must equal the caller |
| 13 | `GET /a2a/sessions` (`:417`) | `listAll` | filtered to what the caller may see (§4) |
| 14 | `POST /a2a/session/:id/rename` (`:427`), `.../extend` (`:444`) | no membership | participant |
| 15 | `GET /a2a/session/:id/messages` (`:463`) | no membership | may see (participant or owner view) |
| 16 | `POST /a2a/session/:id/read` (`:483`) | `reader` checked by `checkReader`; `markRead` already 404s a non-member | unchanged in behaviour; logs as `[authz]` too |
| 17 | `GET /a2a/session/:id/reads` (`:516`) | no membership | may see |
| 18 | `/a2a/jsonrpc` (`:140`) | `UserBuilder.noAuthentication`; askPolicy not enforced (T-004) | the user carries the caller; askPolicy enforced (§6) |
| 19 | JSON-RPC `tasks/get`, `tasks/cancel` (**sibling**) | any key reads or cancels any A2A task by id | creator only (§6) |

**Siblings the brief did not list:**
- **#9 `agents/live`** discloses every owner's agent names.
- **#19** A2A tasks by id have no owner.
- **#4** Escalation with no `to` goes to `agents[0]` of *any* owner (`src/escalation.ts:14-17`).
  - It is also the only way an outside agent's text reaches `aaron`'s "Hub activity" room, through `notifyHuman` (`:196`, `:201`) (Q5).
- **#10** A create may name another owner's agents. That is D-010's cross-account room, which comes
  by invitation in Loop 6 (Q6).

**Client call sites** were read in full, for every script and the page: hub-talk, hub-key, the daemon,
the page, ask-agent, demo-loop, verify-client-stack and the compliance probe. A client acting as its
own name in its own rooms never trips a check. The exceptions:
- **hub-talk `--session <id>`** is used verbatim (`scripts/hub-talk.mjs:334`). A seat pasting a room
  it isn't in is refused in strict. In warn it is **logged**, so T-064's read will show whether any
  SIA seat does this before strict.
- **`AGENT_KEY` overrides the key file** (`scripts/hub-key.mjs:101`). A seat run as `--as Y` with X's
  key is a mismatch everywhere. This is correct, but worth knowing when reading the log.
- **The chat page** acts in any session from the global list (`client/src/App.svelte:149,244,276,307`).
  It changes with §4.
- **`scripts/demo-loop.mjs`** creates a room without its own caller (`:49`) and posts `from:"alice"`
  with its own ephemeral key (`:60`) (Q7).
- **`scripts/verify-client-stack.mjs:87`** sends `role:"aaron"`. Harmless once `role` is ignored.

## 2. Binding asserted names (routes 4, 6, 7, 8, 11, 12, 16)

A new `src/authz.ts` holds the pure decisions, so they can be unit tested, plus thin Express
helpers:
- `bindName(req, res, asserted, field)`:
  - equal to the caller: continue;
  - `strict`: 403 `{ error: "<field> is not the caller" }`;
  - `warn`: continue, and log.
- `/read`'s `checkReader` becomes a use of `bindName`. Its behaviour and 403 text are unchanged.

**Per field:**

| Field | Decision |
|---|---|
| `from` (#11) | must equal the caller |
| `:agentId` (#7, #8), `:peerName` (#12) | must equal the caller. They stay in the path because hub-talk and the daemon send them. |
| `agentName` (#6) | must equal the caller |
| `reader` (#16) | must equal the caller (as today) |
| `role` (#4) | **ignored for identity.** In A2A it is `user` or `agent`, not a name. The sender shown in `notifyHuman` becomes the caller (or `unknown`). Nothing is refused, so no response changes. |

In warn with an unknown key, the caller is null, so every bound field logs, and passes as it does
today.

## 3. Membership (routes 11, 14, 15, 17, 16)

- `sessionAccess(caller, sessionId)` is one new **additive** Convex query, `sessions.access`. It
  returns `{ exists, participant, ownerView }`.
- Session routes use it as follows:

| Route | Needs |
|---|---|
| message (post), rename, extend | `participant` |
| messages (read), reads | `participant \|\| ownerView` |
| read (mark) | `participant` (`markRead` already enforces it; unchanged) |

- **Strict, not allowed:** **404 `{ error: "session not found" }`**. The same answer as a session
  that doesn't exist, so a key can't probe for rooms (Q2).
- **Warn:** continue as today, and log.

## 4. The owner's view (Preserve 3, and D-010's first piece)

- **Data.** `agents` gets `owner: v.optional(v.string())`, the name of the human who owns the row.
  - A human's own row (`agentCard.kind === "human"`, e.g. `aaron`) owns itself.
  - Only a human-kind caller gets an owner view. An agent never does.
- **Setting it:**
  - `registerAgent` takes an optional `owner`. The hub passes a human's own name for a human
    registration, and `HUB_OWNER` (env, default `HUMAN_PEER`, i.e. `aaron`) otherwise.
  - This is interim until Loop 6's enrollment code decides the owner.
  - It is safe while `register` stays open, because nothing is public before strict and Loop 6
    (G-001, D-011) (Q3).
- **Backfill.** `agents:assignOwnerAtDeploy({ owner })` is an internal mutation, run once at deploy
  like `classifyAtDeploy`. It sets `owner` on rows that have none, and returns counts.
  - `agents:setOwner({ name, owner })` is internal. It makes the scratch second-owner row that
    acceptance E needs.
- **Visibility.** A caller may see session S if:
  - it is a participant; or
  - it is human-kind, and some participant of S is an agent row whose `owner` is the caller.
  - Put simply: **an owner sees what his agents see.**
  - No agent gains any view. A second owner's rooms never include `aaron`'s agents, so they are
    invisible to him, and his to them (E).
- **The list.** `GET /a2a/sessions` uses a new query, `sessions.listVisibleTo({ name })`. Its entries
  have the same shape as `listAll` (`participants: string[]`), and `listAll` itself is left untouched
  for skew. This is the brief's one allowed response change.
- **Owner view is read-only (Q1).**
  - `aaron` sees and reads his agents' rooms.
  - Posting, rename and extend need him to be a participant.
  - The page shows a room he isn't in as read-only: the composer is replaced by "you are not in this
    room", and extend and rename are hidden. That is a change to `client/` only.
- **Loop 6 extends it.**
  - Accounts become rows keyed by the owning human.
  - Enrollment sets `owner` = the inviting account.
  - A room gets an `account`, with cross-account members by invitation.
  - `owner` stays the join key, so nothing written now is thrown away. If Loop 6 prefers ids, it
    migrates `owner` to `accountId` behind the same query.

## 5. Tasks (routes 5, 6, 7)

- **claim:** `agentName` is bound (§2). `tasks.claim` already refuses a task assigned to someone
  else, and every task is assigned (`src/escalation.ts:26-35`).
- **respond (Q8):**
  - The hub loads the task (`tasks.getByTaskId`, already exported). Only `task.assignedAgent === caller` may respond.
  - That covers both a claimed task (claim sets `assignedAgent`) and an unclaimed one (the escalation
    set it).
  - Strict: 404 `{ error: "task not found" }`. Warn: log and continue.
  - It also passes `assignedAgent: caller` to `updateStatus`, so completing a task stops wiping the
    claimant (`:234`). The response is unchanged.
- **queue:** `:agentId` is bound (§2). `getPending` already filters by `assignedAgent`. So the queue
  is owned by the name it's assigned to, and the only thing missing today is the bind.

## 6. JSON-RPC (T-004)

- **The user.** A `UserBuilder` returns a `User` with `isAuthenticated = req.agentName != null` and
  `userName = req.agentName ?? ""`. The SDK passes it to the executor as
  `requestContext.context.user` (`@a2a-js/sdk` 0.3.13, `dist/server/express/index.js:50-54`).
- **askPolicy.**
  - `HubAgentExecutor` reads the caller and, when `metadata.to` is set, applies `evaluateAsk` exactly
    as `denyNamedAsk` does.
  - A deny publishes a terminal `rejected` status with `askDeniedReason(...)`. That is the JSON-RPC
    form of the legacy route's 403 (C).
  - The caller is also passed to `handleMessage`, for §7's escalation filter.
- **A2A tasks by id.**
  - `ConvexTaskStore.save(task, context)` records `createdBy = context.user.userName`, as a new
    optional field in `a2aTasks` (the `save` arg is optional, so it is skew-safe).
  - `load(taskId, context)` returns nothing to a different caller in strict, and logs in warn.

## 7. Logging, modes and refusal codes

- **The warn line is `[authz] WOULD REJECT <what> on <METHOD> <route-template> caller=<name|unknown>
  (AUTH_MODE=warn)`.** `<what>` is one of:
  - `from=<name>`, `agentId=<name>`, `peerName=<name>`, `agentName=<name>`, `reader=<name>`
  - `non-member session=<id>`
  - `not-assigned task=<id>`
  - `a2a-task=<id>`
  - `create-without-caller`
  - `askPolicy`

  The line carries names and ids only, never a key or a hash. Strict logs `[authz] REJECT …` with the
  same body.
- **`[authz]` is kept apart from `[auth]` (key validity),** so a T-064-style read can count them
  separately.
- **Codes in strict:**
  - identity mismatch: 403;
  - session or task you may not see: 404;
  - create without the caller: 403.
- **Preserve 4:** the one exception is askPolicy (Q9). Every other new check refuses only in strict.

## 8. Convex changes and skew (Preserve 6, F)

- **Only additive changes:**
  - two optional fields: `agents.owner`, `a2aTasks.createdBy`;
  - two new queries: `sessions.access`, `sessions.listVisibleTo`;
  - two new internal mutations: `assignOwnerAtDeploy`, `setOwner`;
  - optional args on `registerAgent` (`owner`) and `a2aTasks.save` (`createdBy`).
- **No existing function's args or return shape change.** `listAll`, `listOnline`, `messages.send`,
  `tasks.*` and `sessions.*` stay as they are.
- **The B2 skew check** runs the `c4d2d1c` hub against the candidate's functions over hub-talk's
  flows and the daemon's.
- **Deploy order** (its own act): push functions, then `assignOwnerAtDeploy({owner:"aaron"})`, then the
  hub. The hub stays warn.

## 9. What does not change

- **Unchanged files:** `scripts/hub-talk.mjs` and `scripts/hub-key.mjs`.
- **The daemon's code is unchanged.**
- **Response shapes** are unchanged for a caller acting as itself in its own rooms. The session list is
  filtered, and routes #9 and #13 are filtered by owner.
- **Out of scope:** `register` (Loop 6), the mode (strict is its own act), and the daemon's `/→ 4dd:/`
  retry bug (`src/wrapper/daemon.ts:286`, a note for a later task).

## 10. Verification (author; Gauge writes the criteria)

- **Unit tests** in `tests/authz.test.ts`: every bind, membership and owner decision in both modes,
  with a mutant check.
- **HTTP tests:** per route, as itself in its own room, then as another name or outside, in strict and
  in warn. Warn asserts the `[authz]` line and that it holds no key.
- **A scratch stack on pinned ports:**
  - hub-talk flows (register, `--inbox`, `--say`, `--wait`, `--peer`, receipts) and the local daemons,
    old hub against the candidate, in both modes;
  - the page as `aaron` and as a scratch second owner.

## 11. Questions for a ruling

- **Q1. Owner view is read-only.** Posting, rename and extend need participation. Recommended: yes.
  A post from a non-participant has no read state and breaks the room's turn semantics. `aaron` can
  still open a room with his agents.
- **Q2. Strict answers 404 for a session or task the caller may not see.** It gives no existence
  oracle. Recommended: yes. The alternative is 403.
- **Q3. Interim owner at `register`.** A human owns itself; everyone else gets `HUB_OWNER`, default
  `aaron`. Recommended: yes, until Loop 6 enrollment.
- **Q4. `agents/live` is filtered to the caller's owner.** Recommended: yes. Today it's identical,
  since every row is `aaron`'s, and it stops name disclosure across owners.
- **Q5. Escalation with no `to` only picks the caller's owner's agents**, and `notifyHuman` only
  relays traffic from callers `aaron` owns. Recommended: yes. Otherwise an outside agent's text lands
  in `aaron`'s activity room, and `aaron`'s agents answer strangers.
- **Q6. A create must include the caller, and in strict every participant must share the caller's
  owner.** Cross-account rooms come by invitation in Loop 6. Recommended: yes.
- **Q7. `demo-loop.mjs`:** run it with alice's own key, since it's local only. Recommended: that over
  retiring it.
- **Q8. `/respond` is allowed only for `assignedAgent`, claimed or not**, and completion keeps
  `assignedAgent`. Recommended: yes.
- **Q9. askPolicy on JSON-RPC refuses in warn too, as `/message/send` already does.** This is parity
  with the legacy route, and askPolicy is an opt-in owner decision, not a key check. It conflicts with
  Preserve 4's wording.
  - Recommended: parity. Relay's T-003 step-2 read found no askPolicy on the 8 dev-key rows. The
    current 6 rows aren't read for it here, so a `agents-summary`-style count confirms "nothing live
    changes" before the build.
  - The alternative is log-only in warn.
