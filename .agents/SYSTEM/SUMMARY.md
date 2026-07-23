# Project Summary

> **Last Updated:** Session 6 (2026-07-23)
> **Status:** v1.4.0 Released — v1 milestone COMPLETE (real-LLM autonomous loop proven); chat client now a usable channel (history, human composer, @mentions, extend)

---

## Current State

**The VPS was wiped (2026-04)** — `hub.tarrantcountymakerspace.com`, the `a2a` Docker network, Convex on `:3210`, and all agent registrations are gone. Direction is local-first iteration; VPS redeploy comes after compose profiles land.

**v1 is done.** Session 6 passed the real-LLM gate (alice↔bob on Haiku, DONE convergence, zero human) and jumped ahead into v2 chat-channel UX: the Svelte client is now a Grok-style chat app and Aaron converses with agents as a peer.

### What's Working (verified on the running local stack)
- **Real-LLM autonomous loop** — alice↔bob via hub sessions on `claude-haiku-4-5` (`WRAPPER_MAX_TOKENS=300`), DONE convergence, zero human relay
- **Chat client** (`client/` :5173): date-grouped session history (all sessions, closed included), transcript viewer with live polling, **human composer** (chat as `aaron` peer), rename, extend button, agent↔agent seed row
- **@mention reply routing** (deterministic, daemon-side): `@name` targets agents; no mention = ask-the-room; group sessions never cascade agent→agent replies; race-safe (gates on newest message addressed to *me*)
- **Session extend/reopen** — `POST /a2a/session/:id/extend` adds turns and revives cap-closed conversations with transcript intact
- Daemon hardening: no LLM spend on capped sessions, failed sends not marked replied, DONE detection tolerant of punctuation/markdown, transcript speaker labels with deterministic label-strip on send
- Persona: agents know they're peers among humans *and* agents + the @mention convention
- Build green, tests green (11/11); mention matrix 4/4; `scripts/demo-loop.mjs` takes seed + turns as CLI args
- Everything from v1.1.0–v1.3.0: chat channel tables/routes, `to:` addressing, atomic claims, turn caps, CORS, executor resilience, postbuild dist copy

### Known Issues / Debt
- `CLASSIFIER_MODEL` default (`claude-sonnet-4-20250514`) 404s on Aaron's key — hub currently started with `CLASSIFIER_MODEL=claude-haiku-4-5-20251001`; change the default in code
- DONE sentinel leaks: any message *ending* with "DONE" reads as a sign-off (structured end-flag is the v2 fix)
- `agents.register` duplicates rows on re-register (upsert fix pending)
- Background processes started from CC sessions die silently on this machine — needs `start-stack.ps1` (Aaron-owned terminals)
- GitNexus index stale (v1.1.0); `npx` broken in resumed CC sessions — reindex from a fresh terminal

### What's Next
- [ ] Per-agent personas with real roles (generic assistant answers add no value)
- [ ] `start-stack.ps1` — one-click Convex + hub + daemons + client in Aaron's own terminals
- [ ] Experience dedup (triggerHash upsert — plan in forge-to-atlas.md)
- [ ] docker-compose local + VPS profiles (one env-gated build)
- [ ] Structured end-of-conversation flag (replace DONE sentinel); session delete/bookmarks in client

---

## Architecture Overview

```
Wrapper Agents (any A2A-compliant agent — poll outbound; NAT-safe)
    ↕ HTTP (register, poll, claim, respond, sessions, extend)
A2A Intelligent Hub (Express 5, port 4000) — rendezvous broker
    ↕ Convex Client
Convex Backend (local dev now; VPS later)
    ├─ Chat channel: peers / sessions / sessionPeers / messages (replaces Telegram)
    ├─ Tasks (atomic claim), agents, experiences, repoFixes
Anthropic API (classifier + repo-fixer — model configurable per task)
GitHub (push approved fixes)
Chat client (Svelte, :5173) — history sidebar, human composer, @mentions
```

Humans are peers on the hub, not relays. Aaron chats inside sessions as the `aaron` peer; `@name` targets one agent, no mention asks the room.

---

## Roadmap

| Version | Goal | Effort |
|---|---|---|
| **v1** | ✅ Autonomous 2-agent loop (real LLM) on local stack, chat client | DONE (Session 6) |
| **v2** | Chat UI → PWA, wrapper npm package, proper auth, personas, VPS redeploy | Weeks |
| **v3** | Full A2A spec compliance (SSE, task states, per-agent cards), multi-provider LLM, dev-time orchestration dogfood | Months |

See PRD.md §9, INBOX.md, and ADR-006/007 in DECISIONS.md.

---

## Key Metrics

| Metric | Value |
|---|---|
| Total Sessions | 6 |
| Version | v1.4.0 (tagged + pushed) |
| Tests | 11/11 passing (+ 4/4 mention matrix, live) |
| Known Bugs | 0 blocking (debt list above) |
