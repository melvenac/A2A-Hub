# Project Summary

> **Last Updated:** Session 8 (2026-07-26)
> **Status:** v1.5.1 Released (local — not pushed) — Session 7's work verified live and shipped; `/health` now probes Convex; whole hub on Haiku 4.5

---

## Current State

**The VPS was wiped (2026-04)** — `hub.tarrantcountymakerspace.com`, the `a2a` Docker network, Convex on `:3210`, and all agent registrations are gone. Direction is local-first iteration; VPS redeploy comes after compose profiles land.

**v1 is done.** Session 6 passed the real-LLM gate (alice↔bob on Haiku, DONE convergence, zero human) and jumped ahead into v2 chat-channel UX: the Svelte client is now a Grok-style chat app and Aaron converses with agents as a peer.

### What's Working (verified on the running local stack)
- **`/health` reports the whole hub** (Session 8) — bounded 3s Convex probe; `200` with `convex.latencyMs` when healthy, `503 degraded` when the DB is unreachable. Failure path tested for real (killed Convex → 503 in 15ms → restarted → auto-recovered to 200). Chat client honors it
- **Whole hub on Haiku 4.5** (Session 8) — classifier, repo-fixer, and wrapper daemon all default to `claude-haiku-4-5-20251001`
- **`start-stack.ps1` exercised end-to-end** (Session 8) — all five windows up, readiness waits satisfied, idempotent re-run correctly skips what's already running (incl. the client, after the IPv6 probe fix)
- **Per-agent personas — live demo passed** (Session 7, verified Session 8) — role text from `personas/<name>.md` (or `--persona`/`--persona-file`) composed with hub conventions; alice=learner-assistant, bob=mentor; `--print-persona` debug flag. bob held character verbatim in a real loop; converged with DONE in 2 turns
- **Agent registration verified end-to-end** (Session 8) — a hand-registered `scout` peer completed register → heartbeat → queue → session → send → reply against both agents
- **Launch-env defaults in code** (Session 7) — `CLASSIFIER_MODEL` → haiku-4-5, `CONVEX_URL` → local :3210; no hand-set env vars needed to start the stack
- **Real-LLM autonomous loop** — alice↔bob via hub sessions on `claude-haiku-4-5` (`WRAPPER_MAX_TOKENS=300`), DONE convergence, zero human relay
- **Chat client** (`client/` :5173): date-grouped session history (all sessions, closed included), transcript viewer with live polling, **human composer** (chat as `aaron` peer), rename, extend button, agent↔agent seed row
- **@mention reply routing** (deterministic, daemon-side): `@name` targets agents; no mention = ask-the-room; group sessions never cascade agent→agent replies; race-safe (gates on newest message addressed to *me*)
- **Session extend/reopen** — `POST /a2a/session/:id/extend` adds turns and revives cap-closed conversations with transcript intact
- Daemon hardening: no LLM spend on capped sessions, failed sends not marked replied, DONE detection tolerant of punctuation/markdown, transcript speaker labels with deterministic label-strip on send
- Persona: agents know they're peers among humans *and* agents + the @mention convention
- Build green, tests green (11/11); mention matrix 4/4; `scripts/demo-loop.mjs` takes seed + turns as CLI args
- Everything from v1.1.0–v1.3.0: chat channel tables/routes, `to:` addressing, atomic claims, turn caps, CORS, executor resilience, postbuild dist copy

### Known Issues / Debt
- **`@`-parsing over-matches** (`daemon.ts:165`): `/@([a-z0-9_-]+)/gi` runs against raw content, so `@anthropic-ai/sdk`, `@media`, decorators, and email addresses are read as mention routing and silently mute every agent. Gate on session participants (`peerNames` is already built at line 187)
- **Stale turn counter in client** (`App.svelte:77`): the 2s poll refreshes `transcript` but never `activeSession`, so the `N/M` cap indicator freezes at load-time value. Sessions auto-close at the cap, so this hides the warning
- **`X-Agent-Key` is never validated** — every guarded route only checks presence; a bogus key returns 200. `apiKeyHash` is stored at registration and never compared
- DONE sentinel leaks: any message *ending* with "DONE" reads as a sign-off (structured end-flag is the v2 fix)
- `agents.register` duplicates rows on re-register (upsert fix pending)
- **GitNexus index stale at `e4fbdef`** — `npx gitnexus analyze` fails with a Windows file lock on `.gitnexus\lbug` held by the running `gitnexus mcp` servers
- ~~`REPO_FIXER_MODEL` default 404s~~ — fixed in v1.5.1

### What's Next
- [x] Per-agent personas with real roles — `personas/<name>.md` auto-load, hub conventions composed (Session 7)
- [x] `start-stack.ps1` — build + Convex + hub + daemons + client with readiness waits (Session 7)
- [x] Aaron runs `start-stack.ps1` once end-to-end; then a persona demo (Session 8 — 5/5 + GATE PASSED)
- [ ] **Push** — v1.5.0 and v1.5.1 are committed and tagged locally but not pushed
- [ ] Fix `@`-parsing over-match (`daemon.ts:165`) and the stale turn counter (`App.svelte:77`) → v1.5.2
- [ ] `scripts/register-agent.mjs` — one-command agent registration; the registration path has no automated coverage
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
| Total Sessions | 8 |
| Version | v1.5.1 (tagged locally — **not pushed**) |
| Tests | 11/11 passing; `verify-client-stack` 5/5; `demo-loop` GATE PASSED |
| Known Bugs | 0 blocking; 2 live non-blocking (`@`-parsing, stale turn counter) |
