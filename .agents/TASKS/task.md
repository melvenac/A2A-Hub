# Current Sprint

> **Focus:** v1 — Autonomous loop verified locally; finish v1 hardening (real-LLM gate, dedup, compose profiles)

---

## Active Tasks

1. **Real-LLM gate run** — Aaron adds `ANTHROPIC_API_KEY` to `.env`, restart daemons (auto-switch from fallback), rerun `node scripts/demo-loop.mjs`
2. **Experience dedup** — `triggerHash` (sha256 of normalized trigger) + `by_triggerHash` index; patch-on-conflict in `experiences.store`
3. **docker-compose profiles** — local (no Traefik, local Convex, :5173 client) + VPS (Traefik, prod URLs); one env-gated build

## Done This Sprint (Session 5)

- [x] Protocol spine: addressing, chat channel, atomic claims, turn caps (v1.1.0, ADR-006)
- [x] Wrapper daemon + autonomous 2-agent loop gate PASSED (v1.2.0)
- [x] Svelte test client + CORS + executor resilience (v1.3.0)

## Context

Telegram is gone; the chat channel (peers/sessions/messages) is the notification path and Aaron is a peer. The VPS is wiped — everything runs locally (`npx convex dev --local`, hub :4000, daemons, client :5173). Gate scripts: `demo-loop.mjs`, `verify-client-stack.mjs`.

## Success Criteria

- Same 2-agent gate passes with real LLM replies (not fallback)
- Sending the same trigger twice creates one `experiences` row
- `docker compose --profile local up` reproduces the hand-started stack
