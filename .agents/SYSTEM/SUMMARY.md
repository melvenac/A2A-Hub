# Project Summary

> **Last Updated:** Session 11 (2026-07-29)
> **Status:** v1.6.0 Released — peers can now answer from a codebase they're resident in (ADR-010); the human is no longer the relay between repos

---

## Current State

**The VPS was wiped (2026-04)** — `hub.tarrantcountymakerspace.com`, the `a2a` Docker network, Convex on `:3210`, and all agent registrations are gone. Direction is local-first iteration; VPS redeploy comes after compose profiles land.

**v1 is done.** Session 6 passed the real-LLM gate (alice↔bob on Haiku, DONE convergence, zero human) and jumped ahead into v2 chat-channel UX: the Svelte client is now a Grok-style chat app and Aaron converses with agents as a peer.

### What's Working (verified on the running local stack)
- **Repo-resident peers** (Session 11, ADR-010) — `daemon.ts --repo <path>` answers from a Claude Agent SDK session rooted in that repo instead of from a persona string. Read-only by default (`disallowedTools` + `permissionMode: "dontAsk"`); `--repo-bash` opts into shell. Verified live: the `gitnexus` peer answered a cross-repo question in 43s with four `file:line` citations, all checked verbatim — and diagnosed the `.gitnexus\lbug` lock that blocked Sessions 8-9
- **`scripts/ask-agent.mjs`** (Session 11) — the entrance for a coding session: register → 2-peer session → send → poll. Previously the only ways into a session were the chat client (human typing) or a daemon (autonomous)
- **`/health` reports the whole hub** (Session 8) — bounded 3s Convex probe; `200` with `convex.latencyMs` when healthy, `503 degraded` when the DB is unreachable. Failure path tested for real (killed Convex → 503 in 15ms → restarted → auto-recovered to 200). Chat client honors it
- **Whole hub on Haiku 4.5** (Session 8) — classifier, repo-fixer, and wrapper daemon all default to `claude-haiku-4-5-20251001`
- **`start-stack.ps1` exercised end-to-end** (Session 8) — all five windows up, readiness waits satisfied, idempotent re-run correctly skips what's already running (incl. the client, after the IPv6 probe fix)
- **Per-agent personas — live demo passed** (Session 7, verified Session 8) — role text from `personas/<name>.md` (or `--persona`/`--persona-file`) composed with hub conventions; alice=learner-assistant, bob=mentor; `--print-persona` debug flag. bob held character verbatim in a real loop; converged with DONE in 2 turns
- **Agent registration verified end-to-end** (Session 8) — a hand-registered `scout` peer completed register → heartbeat → queue → session → send → reply against both agents
- **Launch-env defaults in code** (Session 7) — `CLASSIFIER_MODEL` → haiku-4-5, `CONVEX_URL` → local :3210; no hand-set env vars needed to start the stack
- **Real-LLM autonomous loop** — alice↔bob via hub sessions on `claude-haiku-4-5` (`WRAPPER_MAX_TOKENS=300`), DONE convergence, zero human relay
- **Chat client** (`client/` :5173): date-grouped session history (all sessions, closed included), transcript viewer with live polling, **human composer** (chat as `aaron` peer), rename, extend button, agent↔agent seed row
- **@mention reply routing** (deterministic, daemon-side, `src/wrapper/mentions.ts`): `@name` targets agents; no mention = ask-the-room; group sessions never cascade agent→agent replies; race-safe (gates on newest message addressed to *me*). An `@word` only routes when it names a participant, so package names and email addresses can't mute the room (Session 10, verified live)
- **Session extend/reopen** — `POST /a2a/session/:id/extend` adds turns and revives cap-closed conversations with transcript intact
- Daemon hardening: no LLM spend on capped sessions, failed sends not marked replied, DONE detection tolerant of punctuation/markdown, transcript speaker labels with deterministic label-strip on send
- Persona: agents know they're peers among humans *and* agents + the @mention convention
- Build green, tests green (11/11); mention matrix 4/4; `scripts/demo-loop.mjs` takes seed + turns as CLI args
- Everything from v1.1.0–v1.3.0: chat channel tables/routes, `to:` addressing, atomic claims, turn caps, CORS, executor resilience, postbuild dist copy

### Known Issues / Debt
- **`X-Agent-Key` is never validated** — every guarded route only checks presence; a bogus key returns 200. `apiKeyHash` is stored at registration and never compared
- DONE sentinel leaks: any message *ending* with "DONE" reads as a sign-off (structured end-flag is the v2 fix)
- `agents.register` duplicates rows on re-register (upsert fix pending)
- ~~GitNexus index stale at `e4fbdef`~~ — re-indexed cleanly in Session 10 (443 symbols / 600 relationships / 3 flows); the `.gitnexus\lbug` lock did not recur
- ~~`@`-parsing over-match / stale turn counter~~ — both fixed in v1.5.2
- ~~`REPO_FIXER_MODEL` default 404s~~ — fixed in v1.5.1

### What's Next
- [x] Per-agent personas with real roles — `personas/<name>.md` auto-load, hub conventions composed (Session 7)
- [x] `start-stack.ps1` — build + Convex + hub + daemons + client with readiness waits (Session 7)
- [x] Aaron runs `start-stack.ps1` once end-to-end; then a persona demo (Session 8 — 5/5 + GATE PASSED)
- [x] Fix `@`-parsing over-match and the stale turn counter → v1.5.2 (Session 10)
- [x] Repo-resident peers + `ask-agent.mjs` → v1.6.0 (Session 11, ADR-010)
- [ ] **On-demand spawn** — hub launches a headless agent when a message arrives for a repo peer that isn't running. This is the piece that retires the file mailbox rather than out-competing it
- [ ] **Amend PRD §1** — it lists cross-repo/local multi-agent as *secondary* and argues subagents are usually better for same-machine work. Aaron's actual primary use case is cross-repo, and the subagent argument doesn't apply (subagents share context; the value here is the target repo's agent already holding its own state). Aaron's call — not amended unilaterally
- [ ] Give repo peers git history — currently blocked on Bash being the trust boundary; a scoped `Bash(git log *)` allow rule is the likely answer
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
| **v2** | **Cross-repo agent-to-agent, proven locally** — repo-resident peers (✅ v1.6.0), on-demand spawn, and the three trust-domain prerequisites. No external dependency | Days–weeks |
| **v3** | Remote teaching (Aaron + Brian) — VPS redeploy, key management, real-network failure modes, wrapper npm package, PWA client | Weeks; gated on v2 + Brian's availability |
| **v4** | Platform — multi-provider LLM, full A2A spec compliance, makerspace/billing integration | Months |

> **Priority changed 2026-07-29 (Aaron's call, PRD v1.2):** cross-repo is now the *primary* use case, ahead of the Brian/remote work. It's the same protocol at a shorter distance and the only version verifiable without a second person. The catch is that one machine has one trust domain, so auth, peer identity, and authorization are invisible locally and load-bearing remotely — PRD §8 names all three as v2 prerequisites, not later hardening.

See PRD.md §1 and §9, INBOX.md, and ADR-006/007/010 in DECISIONS.md.

---

## Key Metrics

| Metric | Value |
|---|---|
| Total Sessions | 11 |
| Version | v1.6.0 |
| Tests | 33/33 passing; `verify-client-stack` 5/5; live cross-repo ask PASS (4/4 citations verified) |
| Known Bugs | 0 blocking, 0 live non-blocking |
