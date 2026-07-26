# Task Inbox — Prioritized Backlog

> **Last Updated:** Session 8 (2026-07-26) — Session 7's work verified live and shipped as v1.5.0/v1.5.1 (tagged locally, **not pushed**); `/health` now probes Convex (ADR-009); agent registration verified end-to-end. Two new live bugs found: `@`-parsing over-match and stale client turn counter

---

## How to Use This Document

Tasks are organized by MVP version, then by priority within each version.

**Status:**
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[!]` — Blocked

---

## v1 — Autonomous loop, verified locally

> **Goal:** True A2A — 2+ agents converse through the hub with zero human relay, verified on the local stack (VPS was wiped; redeploy comes later).
> **Effort:** Days.

- [x] Protocol spine: `to:` addressing, chat channel (peers/sessions/messages), atomic `tasks.claim`, turn caps (v1.1.0, ADR-006)
- [x] Delete Telegram entirely — replaced by chat channel, humans are peers (v1.1.0)
- [x] Wrapper daemon (`src/wrapper/daemon.ts`): register → poll → claim → respond; session conversations; LLM or fallback (v1.2.0)
- [x] **Autonomous 2-agent loop gate PASSED** — alice ↔ bob, 6 turns, DONE convergence, zero human (`scripts/demo-loop.mjs`, v1.2.0)
- [x] Svelte test client (`client/`, plain Svelte + Vite on :5173) — textbox → `/a2a/message/send` → response pane, `to` addressing; verified via `scripts/verify-client-stack.mjs` (v1.3.0)
- [x] **Real-LLM gate PASSED** (v1.4.0, Session 6) — alice↔bob on Haiku, DONE convergence, zero human. **v1 milestone complete.**
- [ ] Experience dedup — `triggerHash` + upsert in `experiences.store` (plan in forge-to-atlas.md)
- [ ] docker-compose profiles: local (no Traefik, local Convex) + VPS (Traefik, prod URLs) — one env-gated build

## v2 — Chat channel UX & developer experience

> **Goal:** The chat UI becomes the daily driver (replacing what Telegram was for). Easy for others to connect agents.

- [x] Grow Svelte client into chat UI: date-grouped history, live transcripts, send as `aaron` peer, rename, extend (v1.4.0, Session 6)
- [x] Session extend/reopen + @mention reply routing, deterministic daemon-side (v1.4.0, ADR-007)
- [x] **Per-agent personas with real roles** — role text auto-loads from `personas/<name>.md` (or `--persona`/`--persona-file`), composed with hub conventions; alice=learner-assistant, bob=mentor; `--print-persona` for debug (Session 7)
- [x] **`start-stack.ps1`** — one-click Convex + hub + daemons + client in Aaron-owned terminals, with build step + port-readiness waits (Session 7; ASCII-only, PS 5.1-safe)
- [x] **Live verification of Session 7 work** (Session 8) — stack cold-started, `verify-client-stack` 5/5, persona demo `GATE PASSED`, shipped as v1.5.0
- [x] **`/health` probes Convex** (Session 8, ADR-009) — `503 degraded` when the DB is unreachable; client honors it. Failure path tested by killing Convex
- [x] **`REPO_FIXER_MODEL` 404 fixed** (Session 8, v1.5.1) — `claude-sonnet-4-20250514` retired 2026-06-15; now `claude-haiku-4-5-20251001`, so the whole hub is on Haiku 4.5
- [ ] **Push v1.5.0 + v1.5.1** — `git push origin master --tags`. Both committed and tagged locally only
- [ ] **Fix `@`-parsing over-match** (`daemon.ts:165`) — `/@([a-z0-9_-]+)/gi` runs against raw content, so `@anthropic-ai/sdk`, `@media`, decorators, and email addresses read as mention routing and silently mute every agent. Gate on session participants; `peerNames` is already built at line 187
- [ ] **Fix stale turn counter** (`App.svelte:77`) — the 2s poll refreshes `transcript` but never `activeSession`, so the `N/M` cap indicator freezes at load-time value. Open session can use `transcript.length` free; sidebar needs a throttled `loadSessions()`
- [ ] **`scripts/register-agent.mjs`** — one command for register → heartbeat → session → send → await reply. The registration path has no automated coverage (`verify-client-stack.mjs` never registers an agent)
- [ ] **Validate `X-Agent-Key`** — every guarded route only checks presence; a bogus key returns 200. `apiKeyHash` is stored at registration and never compared. Fine for local dev, must land before any non-local exposure
- [ ] **GitNexus re-index blocked** — `npx gitnexus analyze` fails with a Windows file lock on `.gitnexus\lbug` held by the running `gitnexus mcp` servers; index pinned at `e4fbdef`. Needs the MCP servers stopped, or a Defender exclusion
- [x] Change `CLASSIFIER_MODEL` default in code — now `claude-haiku-4-5-20251001` (Session 7). NOTE: `REPO_FIXER_MODEL` default is still the 404-ing sonnet-4 id (repo-fixer unused in current loop)
- [ ] Structured end-of-conversation flag — replace the DONE sentinel (prose ending in "DONE" terminates conversations)
- [ ] Client: session delete + bookmarks (deferred from Grok-parity pass)
- [ ] PWA setup (service worker, manifest) — restores away-from-desk notifications lost with Telegram
- [ ] npm wrapper package (`a2a-agent` CLI) — `npx a2a-agent --hub URL --name alice`; package `src/wrapper/daemon.ts`
- [ ] `agents.register` should upsert (currently duplicates rows on re-register)
- [ ] Harden auth: X-Agent-Key is presence-checked only — verify against `apiKeyHash`, per-agent keys, rotation
- [ ] Request validation middleware (A2A message format)
- [ ] Convex health check on `/health` (not just `{"status":"ok"}`)
- [ ] Structured logging (pino)
- [ ] A2A spec alignment: task lifecycle states (`submitted/working/input-required/...`), `message/stream` SSE, per-agent cards
- [ ] Repo-fix approval flow through chat channel (`input-required` task to human peer; was Telegram buttons)

## v3 — Platform & multi-orchestration dogfood

> **Goal:** Hub becomes a product; the same bus coordinates dev-time agents on this repo ("both machinery", ADR-006).

- [ ] Register dev agents (Forge, resurrected Atlas) on the hub; migrate file mailbox → hub sessions
- [ ] Orchestrator role: decompose → fan out via `tasks.claim` → fan in; worktree-per-agent for parallel edits
- [ ] Multi-provider LLM abstraction (ADR-004 follow-on)
- [ ] Makerspace website integration — Stripe billing, member-facing chat
- [ ] Advanced escalation — capability-based multi-agent routing
- [ ] Rate limiting and abuse protection
- [ ] SECURITY.md with full auth patterns and audit checklist

---

## Completed (pre-Session 5 history)

- [x] Core modules (classifier, memory, executor, escalation, queue, repo-fixer, agent-card)
- [x] Convex schema + deploy; Docker/Compose config; VPS deploy (later wiped)
- [x] Vitest suite (classifier, executor, queue, integration — 10 tests)
- [x] CHANGELOG.md + tagged releases (v1.1.0, v1.2.0)
- [x] Per-task configurable LLM models (ADR-004)
- [x] README with wrapper quickstart

### Dropped
- ~~Configure Telegram~~ — Telegram removed entirely (ADR-006)
- ~~Test with Brian via Telegram visibility~~ — superseded by local gate + chat channel; Brian testing returns post-VPS-redeploy
- ~~Next.js dashboard~~ — superseded by Svelte client growing into chat UI (v2)
