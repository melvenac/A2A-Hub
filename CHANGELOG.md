# Changelog

All notable changes to the A2A Intelligent Hub.

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
