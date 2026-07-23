# Task Inbox — Prioritized Backlog

> **Last Updated:** Session 6 (2026-07-23) — v1 COMPLETE (real-LLM gate passed); chat client is a usable channel (history, composer, @mentions, extend — ADR-007)

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
- [ ] **Per-agent personas with real roles** — generic assistant answers add no value; personas should know their specialty
- [ ] **`start-stack.ps1`** — one-click Convex + hub + daemons + client in Aaron-owned terminals (CC-launched background processes die silently on this machine)
- [ ] Change `CLASSIFIER_MODEL` default in code — `claude-sonnet-4-20250514` 404s on this key (currently overridden via env at launch)
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
