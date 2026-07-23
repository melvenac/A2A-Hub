# Project Summary

> **Last Updated:** Session 5 (2026-07-23)
> **Status:** v1.3.0 Released — autonomous 2-agent loop proven (zero human relay), Svelte test client live; local-first, VPS redeploy deferred

---

## Current State

**The VPS was wiped (2026-04)** — `hub.tarrantcountymakerspace.com`, the `a2a` Docker network, Convex on `:3210`, and all agent registrations are gone. Direction is local-first iteration; VPS redeploy comes after the autonomous loop is verified.

Session 5 landed the **protocol spine** (ADR-006): Telegram deleted, custom chat channel (peers/sessions/messages) in Convex, direct `to:` addressing, atomic task claims, turn-cap termination.

### What's Working (verified on the running local stack)
- Build green, tests green (11/11, vitest scoped to `tests/`)
- **Autonomous 2-agent loop** — alice↔bob via hub sessions, zero human relay (gate: `scripts/demo-loop.mjs`)
- **Svelte test client** (`client/` :5173) + CORS + 5-point verification (`scripts/verify-client-stack.mjs`)
- Executor resilience: classify/store failures no longer 500 a delivered response
- Telegram fully removed — code, deps (165 packages), notifications now flow through the chat channel (hub + human as peers in a "Hub activity" session)
- `to:` addressing on `/a2a/message/send` (`params.to` or `message.metadata.to`) — addressed messages skip memory, route to the named agent
- Chat channel tables + routes: `POST /a2a/session`, `POST /a2a/session/:id/message`, `GET /a2a/session/:id/messages?since=`
- Turn caps (default 16) enforced atomically in `messages.send`; sessions auto-close at cap
- `tasks.claim` atomic mutation + `POST /a2a/task/:taskId/claim` — first agent wins
- Agent registration also registers the agent as a chat peer
- Per-task configurable LLM models (CLASSIFIER_MODEL, REPO_FIXER_MODEL)

### What's Next
- [x] Stand up local stack (`npx convex dev --local` + hub on :4000)
- [x] **Milestone 2: wrapper daemon** (`src/wrapper/daemon.ts` — poll → claim → respond, register retry, session conversations)
- [x] **Autonomous 2-agent loop GATE PASSED** (2026-07-22): alice ↔ bob, 6 turns via hub sessions, converged with DONE, zero human after seed (`scripts/demo-loop.mjs`). Fallback-responder mode — transport proven without API spend.
- [x] Svelte test client (`client/` on :5173, v1.3.0) — send box, `to:` addressing, response log; CORS on hub; 5-point stack verification passing (`scripts/verify-client-stack.mjs`)
- [ ] Real-LLM run of the same gate (needs `ANTHROPIC_API_KEY` in `.env` — daemon auto-switches)
- [ ] Experience dedup (triggerHash upsert — plan in forge-to-atlas.md)
- [ ] docker-compose local + VPS profiles (one env-gated build)
- [ ] `agents.register` should upsert (currently inserts duplicate rows on re-register)

---

## Architecture Overview

```
Wrapper Agents (any A2A-compliant agent — poll outbound; NAT-safe)
    ↕ HTTP (register, poll, claim, respond, sessions)
A2A Intelligent Hub (Express 5, port 4000) — rendezvous broker
    ↕ Convex Client
Convex Backend (local dev now; VPS later)
    ├─ Chat channel: peers / sessions / sessionPeers / messages (replaces Telegram)
    ├─ Tasks (atomic claim), agents, experiences, repoFixes
Anthropic API (classifier + repo-fixer — model configurable per task)
GitHub (push approved fixes)
```

Humans are peers on the hub, not relays. Hub notifications = messages to the `HUMAN_PEER` (default "aaron").

---

## Roadmap

| Version | Goal | Effort |
|---|---|---|
| **v1** | Autonomous 2-agent loop on local stack, Svelte test client | Days–weeks |
| **v2** | Chat UI grows into PWA, wrapper npm package, proper auth, VPS redeploy | Weeks |
| **v3** | Full A2A spec compliance (SSE, task states, per-agent cards), multi-provider LLM, dev-time orchestration dogfood | Months |

See PRD.md §9, INBOX.md, and ADR-006 in DECISIONS.md.

---

## Key Metrics

| Metric | Value |
|---|---|
| Total Sessions | 5 |
| Version | v1.3.0 (tagged + pushed) |
| Tests | 11/11 passing |
| Known Bugs | 0 (known debt: `agents.register` duplicates on re-register) |
