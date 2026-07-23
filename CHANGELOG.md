# Changelog

All notable changes to the A2A Intelligent Hub.

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
