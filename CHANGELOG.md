# Changelog

All notable changes to the A2A Intelligent Hub.

## [v1.12.0] - 2026-09-26

Loop 6 (T-067): a new name needs a one-time enrollment code from a human owner. Design `docs/loops/loop-6-design.md`, rulings 1 and 2 (per-key limit 3150).

### Added
- `enrollmentCodes` stores only the hash, the issuer, and the expiry. A code is consumed in the same mutation as the insert. Re-register of an existing name with its own key needs no code.
- `POST /a2a/enroll` issues a code when the caller is human-kind. An agent is refused in both modes. `scripts/hub-enroll.mjs` prints the code once to stderr and never prints the key.
- `hub-talk --invite <code>` is valid only with `--init-key`. Every other register body is unchanged.
- In-process rate limit: 3150 per name per 60 seconds, 90 on the global bucket (missing key, unknown key, new-name register, `/ui`).
- Strict `POST /a2a/session/:id/read` for a non-participant returns `404 {"error":"session not found"}` and does not write a cursor (T-070).
- Error responses stay terse when `NODE_ENV` is unset. The image also sets `NODE_ENV=production`.
- `scripts/tcm/a2a-readonly` `auth-log` counts `enroll-lines`. Installing that file on tcm is a later deploy act.

### Unchanged
- `--rotate-key`. Warn still allows a codeless new name and strips `kind: "human"`. Strict is not turned on by this build.

## [v1.11.0] - 2026-09-25

Loop 5 (T-066, P0): a key acts only as itself, and only in its own rooms. Brief `docs/loops/loop-5-identity-and-membership-brief.md`, design `docs/loops/loop-5-design.md`, rulings 1 and 2, D-010, D-011, D-012 and G-001.

Every new check refuses only when `AUTH_MODE=strict`. In `warn` (tcm's mode) the request goes through exactly as before and the hub logs one `[authz] WOULD REJECT …` line, so the soak (D-012) can see every mismatch before strict is turned on. The one exception is `askPolicy` on JSON-RPC, which refuses in every mode, like `/a2a/message/send` always has.

### Added
- **Identity is the key's.** A name a request asserts must be the caller's own name: `from` on a session message, `:agentId` on `/a2a/queue` and `/a2a/heartbeat`, `agentName` on a task claim, `:peerName` on `/a2a/peer/:peerName/sessions`, and `reader` on `/read`. Strict gives 403 `"<field> is not the caller"`. `role` on `/a2a/message/send` is no longer read as the sender: the sender is the caller.
- **Room membership.** Posting, renaming and extending need the caller to be a participant. Reading messages and receipts also admits a human owner's view. Strict answers a room the caller may not see, and a room that does not exist, with the same `404 {"error":"session not found"}`.
- **The owner's view.** Agent rows get an `owner`: a human owns himself, and everything else is owned by `HUB_OWNER` (default `aaron`) until Loop 6's enrollment decides. That interim is safe only because nothing is public before strict and Loop 6 (G-001). A human sees the rooms his agents are in, read-only. `GET /a2a/sessions` lists only the rooms a caller may see.
  - `agents:assignOwnerAtDeploy` (internal) fills rows with no owner. Run it before and after the hub swap.
  - A register body cannot choose an owner.
- **Owners stay apart.**
  - `GET /a2a/agents/live` lists only the caller's owner's agents.
  - A room can only be created with the caller in it and with members of the caller's owner (strict 403 `cross-owner participant=<name>`).
  - An explicit `to` naming another owner's agent is refused (strict 403 `cross-owner to=<name>`), on `/a2a/message/send` and JSON-RPC.
  - An unaddressed escalation only reaches the caller's owner's agents.
  - Only the hub owner's own traffic is narrated into his "Hub activity" room.
- **Tasks.** Only the agent a task is assigned to may respond to it; strict answers anyone else as a missing task (404). Completing a task now keeps its `assignedAgent` instead of clearing it.
- **JSON-RPC carries the caller (T-004).** The executor sees the authenticated name. `askPolicy` and the cross-owner rule are enforced as on `/a2a/message/send`, and a refusal is a terminal `rejected` task. An A2A task belongs to its creator (`a2aTasks.createdBy`): another caller's `tasks/get` or `tasks/cancel` gets the same error as a nonexistent id in strict.
- **The chat page** shows a room you see only through your agents read-only, with no composer, extend or rename.
- **`scripts/tcm/`** holds the read-only key's forced command and analyzer (T-065), now versioned. `auth-log` counts `[auth]` and `[authz]` apart and prints both. `agents-summary` shows each row's owner and an `ownerAssigned` verdict.

### Changed
- `/read`'s reader mismatch now logs as `[authz]`, not `[auth]`. Its codes and texts are unchanged.
- `scripts/demo-loop.mjs` runs with alice's own key rather than a throwaway identity that posted as alice.

### Unchanged
- `scripts/hub-talk.mjs`, `scripts/hub-key.mjs` and the daemon.
- Every Convex change is additive: optional fields, new functions and optional arguments only. A v1.10.0 hub runs against these functions.

## [v1.10.0] - 2026-09-24

Loop 4 (T-061): the chat page served by the hub. Brief `docs/loops/loop-4-ui-on-tcm-brief.md`, design `docs/loops/loop-4-ui-on-tcm-design.md`, rulings 1 and 2.

### Added
- **The hub serves the chat page at `/ui/`** (`src/ui.ts`). On tcm that is `http://100.124.212.87:4000/ui/`.
  - The Dockerfile builds `client/` in its own stage, and the final stage copies only `client/dist`. The CMD, the single port 4000 and the compose file are unchanged.
  - The mount comes after every API route and claims only `/ui`, and a missing file there is a 404, never `index.html`. `GET /` stays a 404.
  - `index.html` is `no-cache`, and the hashed assets are cached as immutable.
  - With no build present, nothing is mounted, so the hub behaves as v1.9.0 did.
- **The page's hub is its own origin** when the hub serves it. The dev server still defaults to `http://127.0.0.1:4000`.

### Changed
- **The page posts only as its key's owner.** The name comes from `GET /a2a/whoami`, not from a constant.
  - With no key, the page sends nothing under `/a2a`.
  - A refused key (401/403) or an unrecognised one (`name: null` in warn mode) is shown as refused, and nothing is posted.
- **New chats offer the hub's live agents** (`GET /a2a/agents/live`, minus the page's own name and `hub`). The panel says the list covers only agents seen in the last 45 s. You pick agents and can add an optional first message, sent as you.
- **No hard-coded `alice` or `bob` remains in `client/`.** Transcript colours go by each sender's place in the session.

### Removed
- **The hands-off agent↔agent demo**, which seeded its first post as `alice` (ruling 1, Q1).

### Fixed
- **`.dockerignore` now excludes `**/node_modules` and `client/dist`.** Its patterns only matched the root folder, so a host's `client/node_modules` would have been copied into the image.

## [v1.9.0] - 2026-09-24

Loop 3 (T-003, P0): per-agent keys and rotation. Brief `docs/loops/loop-3-per-agent-keys-brief.md`, design `docs/loops/loop-3-design.md` (final at `a2e1562`), rulings 1 and 2, D-006 and D-007.

### Added
- **Every agent has a key of its own.** Measured on tcm (Loop 2, V-003): 8 of 10 names shared the old `dev-key`, which resolved to `atlas` for all 8. So `AUTH_MODE=strict` could not tell those agents apart, and revoking the key would lock all 8 out.
  - **Uniqueness (U1).** `register` refuses a key another name holds, in both modes (`409`).
  - **Only an owned row authenticates (U3).** A hash two names share, or one not yet migrated, resolves to nobody. From deploy on, the `dev-key` resolves to no one.
  - **Ownership is stored.** New optional field `agents.keyStatus` (`owned` | `legacy`). It is never derived from a holder count, so the last holder of a shared key cannot become owned by attrition (ruling 1, R1).
  - **A migrated name keeps its key (C7).** In warn as well as strict, a register with a different key is refused (`409`), and the stored hash is unchanged.
  - **Key floor.** A key acquired by register or rotate must be at least 32 characters (`400`). This refuses the `dev-key` structurally, with no literal in the code. The floor rides on a flag from the hub, so as a backstop every public mutation that can set a key refuses to acquire the retired shared key's hash, in both modes and whatever the flag says. A legacy holder may keep it until its release. The general direct-Convex-caller gap belongs to T-057.
  - The rules live in the Convex mutation, so the check and the write commit together (`convex/keyLogic.ts`, `agents.registerAgent`). Refusals throw a `ConvexError`, so the v1.8.0 hub never reads one as success.
- **Rotation: `POST /a2a/rotate`.** The current key goes in the header and `{ newApiKey }` in the body.
  - It is a compare-and-swap, and the old key stops authenticating at once.
  - It takes the instance lease, so a second instance still on the old key is superseded (a 409 on heartbeat in warn, a 403 in strict) and cannot bring the key back.
  - It fails closed in warn too.
- **`GET /a2a/whoami`** returns the name a key authenticates as, or `null`.
- **No public Convex function returns `apiKeyHash`** (ruling 3, F1). `getByName` and `listOnline` project it out, so the stored hash that `rotateKey` takes as proof is readable only with the admin key.
- **No path ever marks a row holding the retired shared key owned** (ruling 3, F2). `ownedStatusFor` is the one chokepoint, `classifyAtDeploy` repairs rows an earlier build promoted, and the lookup never authenticates that hash.
- **Migration (§4.1, D-007).** A legacy name's first register with a fresh key deletes its legacy row and inserts a fresh owned one, in one transaction.
  - `agents:classifyAtDeploy` (internal) classifies the rows present at deploy, once.
  - `agents:release` (internal) deletes a name's agents row. Peers, sessions and messages stay.
- **Client keys: `scripts/hub-key.mjs`.** One implementation for every client. Keys live in `~/.a2a-hub/keys/<hub-id>/<name>.key` (`$A2A_KEY_DIR` if set), and `AGENT_KEY` overrides the file.
  - `init` (with `--register`), `rotate`, `check --names` (the gate for the checkout update), `copy` (to the clipboard only) and `path`. Keys are generated from 32 CSPRNG bytes and never printed; output shows the path and an 8-hex hash prefix only.
  - An interrupted key change leaves `<name>.key.next`, which the next run promotes after checking it with `whoami`.
- **`hub-talk --init-key` and `--rotate-key`.**
- **The browser client acts as the human peer `aaron`** with its own key (§12).
  - `peers.ensure`: registration never changes an existing peer's type.
  - `listOnline` leaves out human-kind rows, so escalation never picks a person.
  - The Key field starts empty and is a password field.

### Changed
- **No client defaults to the `dev-key` any more.** That covers all 7 sites: `hub-talk`, `daemon.ts`, `ask-agent`, the compliance probe, `demo-loop`, `verify-client-stack` and `client/`. With no key they exit 1 before any network call. `ask-agent`'s `ask-<pid>`, `demo-loop` and `verify-client-stack` use an ephemeral in-memory key.
- **hub-talk contract (D-006).**
  - A register the hub refuses is now rc 1 with the hub's reason. It used to be ignored.
  - Exit codes 0/1/2 are otherwise unchanged.
- **`POST /a2a/session/:id/read` checks `reader === caller`** (T-049 limit L2). strict `403`; warn logs `WOULD REJECT reader` and marks as before.
- **Auth log lines say why a key failed:** `unknown`, `legacy` or `shared`. They still never carry a key or a hash.
- **`Unknown peer` names its likely cause** when the name has no agents row: `not registered on this hub`. That makes a refused register loud on an old client (ruling 2, B1).
- `daemon.ts` exits on a refused register or a 403 instead of retrying. `start-stack.ps1` generates each daemon's key through `hub-key.mjs`, honours `A2A_KEY_DIR`, and pins the daemons' `HUB_URL` to the local hub.
- `evaluateNameClaim` is replaced by `decideRegister` (`convex/keyLogic.ts`).

### Fixed
- **Docs:** `joining-the-hub.md` now describes what tcm runs (v1.8.0, warn) and the per-agent key rules, with one `HUB_URL` spelling per hub.
- **Removed `HUB_BOOTSTRAP_KEY`**, which no code ever read (design §0). It was cut from `.env.example`, `DEPLOY.md`, `README.md`, `reference/ARCHITECTURE.md`, `PRD.md` and `RULES.md`.

### Deploying
1. Push the Convex functions.
2. Run `convex run agents:classifyAtDeploy` once, then `agents:release` for each retired name.
3. Deploy the hub, still in `AUTH_MODE=warn`.

Order, cutover and the main-checkout gate: design §4.2 and §3.6. Every tcm act needs Aaron's word.

## [v1.8.0] - 2026-09-23

Loop 1 (`docs/loops/loop-1-read-receipts.md`, design `loop-1-design.md`, ruled by the planner).

### Added
- **Read receipts (T-049).** A sender can see which participants have not been shown a turn, and since when: `GET /a2a/session/:id/reads`. Found in use on 2026-09-23. A seat sat idle through two turns, and the true "sent turn N" receipts could not tell a quiet room from an absent reader (ADR-013's class).
  - **Read means delivered to the agent, not fetched by a process.** The only writer is `POST /a2a/session/:id/read` (`messages.markRead`), and the only client that calls it is `hub-talk`, **after** `--inbox` or `--wait` has printed. `GET .../messages` is unchanged and is a Convex query, which cannot write, so a daemon, the web client, a dashboard or a plain `curl` never marks anything.
  - Stored as a high-water mark on `sessionPeers` (`readThroughTurn`, `readAt`, `readVia`), all optional, so no migration is needed. Marks only move forward. "Never read" (`lastRead: null`) and "read through turn N" are reported differently. A sender's own turn is never unread by the sender.
  - `hub-talk --inbox` marks the whole room and still leaves the local cursor alone. `--wait` marks what it prints. `--inbox`, and `--wait` on timeout, list your own turns someone has not been shown. Receipt calls are one bounded attempt and never change an exit code. Against a hub without receipts, `hub-talk` says so on stderr and works as before.
  - **Rule:** `hub-talk` marks a turn read when it prints it. Run `--inbox`/`--wait` only where the output reaches the agent, and never just to advance past turns. **Named limits** L1–L5 (delivery not reading; identity under the shared dev-key; foreground unprovable; old `hub-talk` never marks; a failed mark shows unread) are in `docs/joining-the-hub.md`.

### Fixed
- **`hub-talk --peer <name>` no longer registers `<name>` (T-051).** It overwrote the peer's agent card with hub-talk's defaults (a repo daemon became a joinable `ide-session`). It also replaced the peer's key hash with the caller's, set it online, and wiped its peer metadata. A `--peer` that has never registered on the hub, with no existing room, now exits 1 and creates nothing. Registering it on its behalf would claim the name under the caller's key (409 for the real peer under `AUTH_MODE=strict`), and a typo would open a room nobody reads.

- **The read-receipt routes answer 4xx for a bad session id, not 500** (QA, Loop 1 A2.6). `POST /a2a/session/:id/read` and `GET /a2a/session/:id/reads` return 400 `not a session id` for a malformed id or an id from another table, and 404 for a session that does not exist. `markRead` and `readState` take the id as a string and check it with `normalizeId`. Before, Convex's `v.id("sessions")` validator threw before the handler ran, so the 404 branches were unreachable. The same class in the older routes (`GET .../messages` and others) is left for T-055.

### Delivery (not done by this change)
- **Every checkout a seat runs `hub-talk.mjs` from must be updated before that seat produces receipts.** A merge updates no checkout. Today every SIA seat runs `~/Projects/A2A-Hub/scripts/hub-talk.mjs`, the main checkout, at `f7f102d`. Updating it is an act on infrastructure and needs Aaron's word. Until then those seats show as "never read" (L4).
- **Live receipts need a tcm redeploy, Convex functions first** (`docs/redeploying-tcm.md`). That also needs Aaron's word.

## [v1.7.0] - 2026-09-20

### Added
- **The hub speaks A2A.** `jsonRpcHandler` is mounted at `/a2a/jsonrpc` and the agent card points there. A stock `@a2a-js/sdk` client now sends a message and gets back a spec `Task` — verified end to end, having previously been unable to exchange a single message. Probe: **PASS 6 / FAIL 0 / WARN 1**, from PASS 2 / FAIL 4 / WARN 2.
  - Additive, not a cutover. The legacy `/a2a/*` REST routes are untouched and all three daemons kept heartbeating across the switch; they retire when the daemons and chat client speak JSON-RPC, not before.
  - Mounted with `app.use`, not `app.post`. `jsonRpcHandler` returns a Router registering `POST "/"`, so it must own its mount point — `app.post("/a2a", handler)` left the inner route unmatched and 404'd every call.
- **`HubAgentExecutor`** (`src/a2a-executor.ts`) — expresses the existing HubExecutor in the spec's vocabulary. Behaviour is unchanged (answer from memory, delegate to a peer when memory can't); only the protocol surface is new. Delegating to a better-informed peer is what A2A calls task delegation, so the mapping is nearly literal.
  - Publishes a full `submitted → working → completed` lifecycle rather than the SDK README's single-message shortcut. That shortcut suits an agent that answers instantly; escalation here reaches a repo peer that has taken 43s on a real question, which is precisely what a task lifecycle exists to avoid holding an HTTP request open for.
  - **This retires the DONE sentinel on the A2A path.** Terminal state is a structured `TaskState`, so a reply that merely *ends* with the word "DONE" no longer reads as a sign-off. An empty prompt returns `rejected`, not `failed` — the caller's mistake shouldn't send them hunting a broken hub.
- **`ConvexTaskStore`** (`src/task-store.ts`) — `TaskStore` over Convex, two methods. The SDK's `InMemoryTaskStore` loses every task on restart, and the hub restarts often enough in development that task IDs would not survive a rebuild. Round-trip verified: `message/send` → `tasks/get` → the row in Convex all agree. `a2aTasks.save` upserts, deliberately unlike `agents.register`.
- **Streaming, earned this time.** `message/stream` returns `text/event-stream` with the real lifecycle. The previous `capabilities.streaming: true` had no implementation behind it; this was verified against a live call before the flag was set back. Note the SDK *enforced* the honest `false` in between — it refused `message/stream` with `-32004` because our own card disclaimed the capability, which is a good argument for keeping cards truthful.
- **`scripts/a2a-compliance-probe.mjs`** — measures how far the running hub is from the A2A spec instead of arguing about it. Read-only; sends one `message/send`. Checks card discovery, required fields, card-claim honesty, JSON-RPC transport, the streaming claim, security-scheme enforcement, and whether a stock `@a2a-js/sdk` client can talk to us. Baseline on first run was PASS 2 / FAIL 4 / WARN 2 — no stock A2A client could exchange a single message with the hub.
- **`X-Agent-Key` is validated.** `apiKeyHash` has been written at registration since v1.0 and never read, so every guarded route only checked the header's *presence* and a bogus key returned 200. Keys now resolve against the stored hash via a new `agents.getByKeyHash` query and `by_apiKeyHash` index.
- **`AUTH_MODE` (`warn` | `strict`, default `warn`)** — validate-and-log versus validate-and-reject. This ships into a live stack with three daemons running, and a flag day would have taken them all down at once; warn mode turns "will this break something" into a log you can read. Deterministic config check, not a prompt-level hope. Measured on the live stack: 20s of alice/bob/gitnexus polling produced **zero** rejections (confirmed positively — all three had `lastSeen` under 1s, so they were hitting guarded routes and passing, not merely idle). Strict looks safe for the current daemons.

### Fixed
- **The agent card no longer lies.** It advertised `capabilities.streaming: true` with no SSE anywhere in `src/` — no `text/event-stream`, no `message/stream` — so a client that believed it waited on a 404. Now `false` until the SDK's `ExecutionEventBus` is actually wired up.
- **The card described a machine that no longer exists.** `url` defaulted to `https://sandbox.tarrantcountymakerspace.com/a2a` — the wiped VPS — so a peer resolving the card locally got a dead host. Defaults to `http://localhost:${PORT}/a2a`; `HUB_URL` still overrides.
- **`protocolVersion` claimed `"1.0"` while the SDK speaks 0.3.** `"1.0"` is legal per the proto (`Examples: "0.3", "1.0"`), but `@a2a-js/sdk@0.3.13` implements 0.3.x — so the claim would have become false the moment a real handler was mounted. Now `"0.3"`.
- The 401-on-missing-key check was copy-pasted into eleven handlers; a new `/a2a` route was unguarded until someone remembered to paste it. Replaced with one prefix-mounted middleware, so the default is now fail-safe rather than fail-open. `/a2a/register` is exempt — it is how an agent *obtains* a key.

#### `hub-talk` — the seat transport was dropping turns

The client every agent uses to talk through the hub lost messages silently. Found in use, not in review: two turns went missing in two different seat rooms on the same afternoon, and the QA seat hit the same defect independently.

- **A `--say` advanced the reader's cursor past unread peer turns.** A peer turn that arrived *before* your send was never delivered. The failure is silent and fails **open** — the room looks healthy while turns go missing, so absence of a reply was not evidence there wasn't one. The cursor is now a **turn number, not a timestamp**, and only a print moves it: `--say` never touches it. `convex/messages.ts:list` numbers turns by position (1-based, matching what `send` reports) and accepts `after` beside the legacy `since`; turns are derived rather than stored, so rooms written before this change number correctly.
  - A reader with no cursor starts at **0** and replays the room once. Starting from its own last turn — the obvious way to avoid a backlog — reintroduces the identical skip through the fallback instead of the write. Replaying is noise; skipping is data loss.
  - The cursor file is deliberately renamed `.after`. The old `.since` files hold millisecond timestamps, and reading one as a turn number would suppress every turn in the room.
- **`--inbox` consumed what it reported.** The "did I miss anything" check advanced the cursor, destroying the evidence of a skip in the act of showing it — the same class of defect as the bug above. It now reads the whole room, leaves the cursor alone, and prints how many turns are unread. Only `--wait` advances.
- **`--peer` was ignored whenever any room was already open.** `resolveSession()` consulted "newest room containing me" first, so a message aimed at one peer went to whichever conversation happened to be open — a QA kickoff landed in the developer's room. `--peer` now matches only a room whose participants are exactly `{ME, PEER}`; `--session` still wins over both.
- **New rooms were capped at 64 turns.** Seat rooms reached 21 in a single afternoon, so a supervised conversation could hit the cap mid-flight — and a room that fills mid-loop is a dropped conversation, the same loss. New rooms are created at 500, overridable with `--max-turns`. Existing rooms keep the cap they were made with.
- **The Docker image crashed at import.** `npx tsc` alone left `dist` without `convex/_generated`.

Client-side turn derivation means the fix is correct against a hub that has not been redeployed: such a hub ignores `after` and returns the whole room, so position is the absolute turn. Verified live against the un-redeployed hub before landing.

**Operational note, not a code change:** two concurrent `--wait` processes under the same name on the same room both receive the same turn — the cursor is per `(name, session)`. One listener per seat per room, re-armed only after the previous exits. Different rooms are safe.

### Security
- Auth failing **open** on a Convex outage was rejected: an unreachable database is not evidence a key is good. A lookup failure returns 503 rather than authenticating, so a database blip degrades the hub instead of silently disabling its auth.
- **Every peer shares one key.** `.env` sets no `AGENT_KEY`, so alice, bob, and gitnexus all run with `daemon.ts`'s literal default `"dev-key"`. Validation therefore distinguishes "knows the string dev-key" from "doesn't" — real, but it establishes no *peer identity*, which is what PRD §8.2 namespacing needs. Per-peer keys are a prerequisite for that, not a follow-up to it.
- **Revocation — the blocking bug is fixed, the guarantee is not yet proven.** This was written up as a known gap: `agents.register` inserted unconditionally, so the live DB held 39 rows for ~5 distinct agents, every historical row kept its own `apiKeyHash`, and `getByKeyHash` matched any of them — a *superseded* key still authenticated. `register` now patches a single canonical row (newest `lastSeen`, `_id` tie-break) and deletes the extras, so superseded hashes stop existing rather than lingering. Two caveats before anyone relies on it: the collapse is capped at 4000 deletes per call and self-heals across subsequent registers, so a large backlog clears over several calls rather than at once; and it has not been verified against the live 39-row database, only in tests. Still do not treat `AUTH_MODE=strict` as a revocation mechanism until that check is run.

## [v1.6.2] - 2026-07-29

### Fixed
- **Repo-peer budget was too small to finish its main job.** `maxBudgetUsd` defaulted to `0.5` by analogy to the hub's other caps — but the classifier is a 50-token call and a repo peer reads a codebase before answering. A real scoping question ("where does this logic live, which config should I reuse, which files change") died on `error_max_budget_usd` after 103s, and completed in 83s for well under `3.00`. Default is now `2`, and the per-reply timeout `180000` to match. Sizing a cap by analogy to an unrelated task was the mistake; scoping is this peer's primary use case, so a cap that can't complete one is mis-set.

## [v1.6.1] - 2026-07-29

### Added
- **Repo replies carry provenance** — branch, short SHA, and a dirty-tree flag are appended to every repo-peer reply. A peer is only as current as its checkout, and a stale checkout is *silent*: the `gitnexus` peer was answering from a side branch 867 commits behind `origin/main` at v1.6.3 while the installed CLI ran v1.6.9, and nothing in its replies hinted at it. Computed by the daemon (`execFileSync`), not asked of the agent, since Bash is denied to it. Non-git paths add no footer rather than failing.

### Fixed
- The provenance footer is inserted **before** a trailing `DONE`, not after it. The daemon detects convergence by testing whether the newest message *ends* with the sentinel, so a naive append would have silently stopped every repo-peer session from converging. Guarded by tests on that exact interaction, mutation-verified (the naive version fails them).

### Security
- **Repo peers have no network access, now deliberately.** Only mutation tools and Bash were denied explicitly, but `WebFetch`/`WebSearch` require approval and `permissionMode: "dontAsk"` denies rather than prompts — so the isolation was accidental. Keeping it: a repo expert should answer from the repo, and an isolated peer can't be turned into an exfiltration path by a question from another agent, which matters more once peers serve requests from other machines. Cost: a peer can't answer "is this dependency current." Re-enabling the network tools is a security change, not a capability tweak. Recorded as an amendment to ADR-010.

## [v1.6.0] - 2026-07-29

### Added
- **Repo-resident peers (ADR-010).** `daemon.ts --repo <path>` makes a peer a standing expert on one codebase: replies come from a Claude Agent SDK session rooted at that path, with tool access to its files, instead of from a persona string. Until now a peer was a persona plus a Messages API call — no tools, no filesystem — so "why does `gitnexus analyze` fail on a lock on `.gitnexus\lbug`" was unanswerable in principle. The swap happens at the daemon's single reply seam, so mention gating, turn caps, DONE detection, and the no-cascade rule are unchanged. Env: `REPO_AGENT_MODEL`, `REPO_AGENT_BUDGET_USD` (default `0.5`), `REPO_AGENT_TIMEOUT_MS` (default `120000`).
- **`scripts/ask-agent.mjs`** — ask another repo's agent a question and wait: register → open a 2-peer session → send → poll. This is the entrance for a coding session, which was previously locked out; the only ways into a hub session were the chat client (a human typing) and a daemon (autonomous). `node scripts/ask-agent.mjs gitnexus "why does analyze hold a lock?"`. `--json` for programmatic use; exit `2` distinguishes "no reply yet" from a transport error.

### Security
- **Repo peers are read-only by default.** Enforced with `disallowedTools`, never `allowedTools` — in the Agent SDK `allowedTools` only auto-approves and does **not** restrict the agent to that set, so an allowlist would leave `Write` reachable through the permission flow. `permissionMode: "dontAsk"` denies anything that would otherwise wait for a human, because a daemon has nobody to approve a prompt and the alternative to denying is hanging. Shell access is opt-in via `--repo-bash`.
- `settingSources: ["project"]` loads the target repo's own `CLAUDE.md` and `.claude/settings.json` but not the operator's global settings, which describe how the operator works rather than how the repo behaves.

### Verified
- Live cross-repo ask against `C:\Users\melve\Projects\gitnexus`: the `gitnexus` peer returned the lock mechanism plus four `file:line` citations in 43s, every citation checked verbatim against the repo. It diagnosed the GitNexus re-index failure that blocked Sessions 8 and 9 in this repo — `run-analyze.ts:262-272` swallows the Windows sharing violation on `fs.rm`, and `initLbug` at line 272 (unlike the query paths) has no busy-retry, so an analyze racing a live MCP server fails on the first lock hit.

## [v1.5.2] - 2026-07-28

### Fixed
- **`@`-mention routing matched any `@word`, muting whole rooms.** The daemon ran `/@([a-z0-9_-]+)/gi` against raw message content, so a message mentioning `@anthropic-ai/sdk`, a CSS at-rule, a decorator or an email address was read as addressed to a participant who does not exist — every agent in the session went silent with no error to explain it. An `@word` is now routing only when it names a session participant; anything else falls through to the normal rule (1:1 always replies, group sessions answer humans), so a typo'd handle reads as a question to the room rather than silence. Verified live in a 3-participant session: `did the @anthropic-ai/sdk bump land?` drew replies from both alice and bob, while `@bob only you: ...` still routed to bob alone.
- **Chat client's turn counter froze at its load-time value.** `openSession`'s 2s poll refreshed the transcript but never `activeSession`, which is derived from the session list — so the `N/M` cap indicator sat still (a 3-turn conversation displayed `1/6`) and hid the warning that a session was about to hit its cap and auto-close. The header now reads the live count off the transcript (`turnCount` is incremented once per message), and the poll re-lists sessions every 5th tick (~10s) so the sidebar counts and the live/closed flag catch up.

### Changed
- Mention gating moved out of `daemon.ts` into `src/wrapper/mentions.ts` (`routingMentions`, `qualifiesAsTrigger`, `isParticipant`). The daemon registers and starts polling at import time, so the gate could not be tested in place; `tests/mentions.test.ts` covers it with 11 cases.

## [v1.5.1] - 2026-07-26

### Fixed
- **`REPO_FIXER_MODEL` defaulted to a retired model.** `claude-sonnet-4-20250514` reached its retirement date on 2026-06-15; `GET /v1/models/claude-sonnet-4-20250514` returns `404 not_found_error`, so every `RepoFixer.draftFix` call would have thrown rather than drafting a fix. Default is now `claude-haiku-4-5-20251001`, matching the classifier and the wrapper daemon — the whole hub is on Haiku 4.5. Verified live: the new ID returns `200` (200K context, 64K max output, comfortably above repo-fixer's 2000-token cap).

## [v1.5.0] - 2026-07-26

### Added
- **Per-agent personas**: each daemon composes its system prompt from role text plus fixed hub conventions. Role text resolves `--persona` > `--persona-file <path>` > `personas/<name>.md` > generic default. `personas/alice.md` (learner assistant) and `personas/bob.md` (mentor) ship in the repo. `--print-persona` prints the composed prompt and exits.
- **`start-stack.ps1`**: one-command local stack — builds, then opens Convex, hub, both daemons, and the client in separate terminal windows. Idempotent: each piece skips itself if already running, so a re-run only starts what's missing. Windows are user-owned, so the stack survives an agent session ending.
- **`/health` now probes Convex** (bounded to 3s) and reports `convex.latencyMs`. Returns `503 {"status":"degraded"}` when the database is unreachable instead of a blanket `ok`.

### Changed
- `CONVEX_URL` defaults to `http://127.0.0.1:3210`; local dev no longer needs it set.
- `CLASSIFIER_MODEL` default → `claude-haiku-4-5-20251001`.
- `.env.example` trimmed to match the post-Telegram deployment shape.

### Fixed
- **`/health` reported `ok` on a hub that could not persist anything.** A Convex backend that died under a live hub left the endpoint green for days while every write failed. Verified by killing Convex (`503` in 15ms), then restoring it (auto-recovery to `200`).
- **`verify-client-stack.mjs` hung forever** when a daemon could not answer — the round-trip `fetch` was unbounded. All requests now have timeouts (10s; 60s for the model leg) and report an actionable failure.
- **`verify-client-stack.mjs` asserted `reply.includes("[bob")`**, a prefix only the `[<name> fallback]` path emits — `HUB_CONVENTIONS` tells the model to reply plain. The check therefore passed *only* while the API key was broken. It now asserts a reply returned and labels whether the model or the fallback served it, so a silent regression to fallback is visible.
- **`start-stack.ps1` had no readiness wait for the client** (:5173), the only window without one.
- **`start-stack.ps1` port probes were IPv4-only** while vite binds `::1` only, so the client's skip-if-running check could never match and a re-run would spawn a second vite. `Test-PortBusy`/`Wait-ForPort` now probe both address families.
- **Chat client ignored `res.ok`** on `/health`, so it would render "online" from a `503` body.

### Removed
- `.agents/workflows/{start,task,test,end}.md` — duplicates of the tracked `.claude/commands/*` equivalents.

## [v1.4.0] - 2026-07-23

### Added
- **Real-LLM autonomous loop verified** — v1 milestone complete: alice↔bob converse through hub sessions on `claude-haiku-4-5` and converge with DONE, zero human relay.
- **Session extend/reopen**: `sessions.extend` mutation + `POST /a2a/session/:id/extend` (`{addTurns}`) raises `maxTurns` and reopens cap-closed sessions — conversations resume with transcript intact instead of being reseeded.
- **Chat client** (Grok-style rebuild of `client/`): date-grouped session history sidebar (all sessions incl. closed), transcript viewer with live polling, **human composer** (chat inside sessions as the `HUMAN_PEER`), session rename, extend button, agent↔agent seed row, @mention chips.
- **@mention reply routing** (deterministic, daemon-side; ADR-007): `@name` messages are answered only by the mentioned agents; no mention = every agent replies ("ask the room"); unaddressed agent→agent messages in group sessions get no auto-reply (no cascades). Gating keys on the newest message addressed to *me* — race-safe when multiple agents answer the same room question.
- New hub routes: `GET /a2a/sessions` (full history with participants), `POST /a2a/session/:id/rename`; `GET /a2a/peer/:name/sessions?includeClosed=1`. `messages.list` now returns `fromType`; `listForPeer` returns `participants`.
- Persona: agents know they are hub peers among humans *and* other AI agents, plus the @mention convention. Transcript lines carry speaker labels (`name: …`).
- `scripts/demo-loop.mjs` takes the seed message and max turns as CLI args; watch window scales with turn count.

### Fixed
- **Daemon reply bookkeeping**: failed sends are no longer marked as replied (a session extend can now revive the pending question); capped/closed sessions are skipped *before* generating a reply (no wasted LLM spend at the turn cap).
- **DONE convergence**: sign-off detection tolerates trailing punctuation/markdown (`DONE.`, `**DONE**`) in daemons, demo loop, and client. Note: any message ending with "DONE" now reads as a sign-off.
- Models mimicking transcript speaker labels ("alice: …") — labels are stripped deterministically on send; intentional `@name` handoffs preserved.

## [v1.3.0] - 2026-07-22

### Added
- **Svelte test client** (`client/`, plain Svelte 5 + Vite on :5173): hub/key/addressee config, message box, response log. Posts to `/a2a/message/send`; `to` routes to a specific agent daemon. Seed of the chat UI (ADR-005/006).
- CORS middleware on the hub (hand-rolled, no dependency) for browser clients.
- `scripts/verify-client-stack.mjs`: 5-point stack verification (health, CORS, preflight, client serving, addressed round trip) — all passing.

### Fixed
- **Executor resilience**: classifier/storeLesson failures no longer turn a delivered agent response into a 500 — classify+store are best-effort after escalation succeeds (`category` omitted on failure).
- **Compiled-hub runtime**: `dist/src/index.js` couldn't resolve `convex/_generated/api.js` (tsc doesn't copy plain-JS assets). `npm run build` now runs `scripts/postbuild.mjs` to copy `convex/_generated` into `dist/` — also fixes the Docker image CMD.

## [v1.2.0] - 2026-07-22

### Added
- **Wrapper daemon** (`src/wrapper/daemon.ts`): registers with the hub, heartbeats, polls the task queue (atomic claim → respond) and session conversations (reply to other peers, honor DONE). Real LLM when `ANTHROPIC_API_KEY` is set (`WRAPPER_MODEL`, `WRAPPER_MAX_TOKENS` budget cap); deterministic fallback responder otherwise. Register retry for hub boot races.
- **Session discovery route**: `GET /a2a/peer/:peerName/sessions`.
- **Autonomous-loop gate** (`scripts/demo-loop.mjs`): creates an alice↔bob session, seeds one goal message, then passively watches. **Gate passed**: 6 daemon-to-daemon turns, DONE convergence, zero human relay.

### Fixed
- `tsc` emitted compiled `convex/*.js`/`.d.ts` in place (rootDir excluded imported convex sources), which then collided with Convex's bundler ("two output files share the same path"). Dropped `rootDir`; build now emits `dist/src` + `dist/convex`. Entry points updated (`package.json` main/start, Dockerfile CMD → `dist/src/index.js`).

## [v1.1.0] - 2026-07-22

### Added
- **Custom chat channel** (ADR-005/006): `peers`, `sessions`, `sessionPeers`, `messages` Convex tables with routes `POST /a2a/session`, `POST /a2a/session/:id/message`, `GET /a2a/session/:id/messages?since=`. Humans are peers on the hub — hub notifications flow to the `HUMAN_PEER` (default `aaron`) through a "Hub activity" session.
- **Direct addressing**: `to` field on `/a2a/message/send` (`params.to` or `message.metadata.to`) routes to a named agent instead of "first online agent"; addressed messages skip memory search.
- **Atomic task claims**: `tasks.claim` mutation + `POST /a2a/task/:taskId/claim` — transactional first-agent-wins, shared by runtime wrappers and dev-time orchestration.
- **Turn-cap termination**: sessions carry `turnCount`/`maxTurns` (default 16), enforced atomically in `messages.send`; sessions auto-close at the cap so autonomous agent pairs converge.
- `by_taskId` index on `tasks`; `vitest.config.ts` scoping tests to `tests/`.

### Removed
- **Telegram integration** (ADR-006): `src/telegram.ts`, `node-telegram-bot-api` + types, all call sites. Replaced by the chat channel — no env-gating, fully deleted.
- Dead `conversations` table (replaced by sessions/messages).
- Stray compiled `convex/*.js` / `convex/*.d.ts` artifacts (now gitignored); `node_modules/` untracked from git.

## [v1.0.0] - 2026-03-23

Initial MVP: Express 5 hub, Convex persistence (experiences/tasks/agents/repoFixes), classify → memory → escalate loop, repo-fixer, Telegram mirror, Docker + Traefik deploy.
