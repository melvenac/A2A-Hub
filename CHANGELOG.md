# Changelog

All notable changes to the A2A Intelligent Hub.

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
