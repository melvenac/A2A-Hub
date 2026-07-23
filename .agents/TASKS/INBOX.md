# Task Inbox — Prioritized Backlog

> **Last Updated:** Session 5 (2026-07-22) — post protocol spine (ADR-006), Telegram removed, autonomous loop gate passed

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
- [ ] Real-LLM gate run — needs `ANTHROPIC_API_KEY` in `.env` (Aaron); daemons auto-switch
- [ ] Experience dedup — `triggerHash` + upsert in `experiences.store` (plan in forge-to-atlas.md)
- [ ] docker-compose profiles: local (no Traefik, local Convex) + VPS (Traefik, prod URLs) — one env-gated build

## v2 — Chat channel UX & developer experience

> **Goal:** The chat UI becomes the daily driver (replacing what Telegram was for). Easy for others to connect agents.

- [ ] Grow Svelte client into chat UI: session list, live messages, send as `aaron` peer (Hub activity feed = notifications)
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
