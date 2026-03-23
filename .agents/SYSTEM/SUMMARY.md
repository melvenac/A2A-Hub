# Project Summary

> **Last Updated:** Session 2 (2026-03-23)
> **Status:** v1 MVP — Telegram working, **blocked on Convex connectivity** from Docker

---

## Current State

Telegram integration is live — the hub broadcasts to the "AI Chat room" group via `@a2a_hub_bot`. However, the hub cannot process messages because the Convex backend isn't reachable from inside the Docker container. This is the critical blocker for v1.

### What's Working
- Telegram bot (`@a2a_hub_bot`) configured and broadcasting ("Hub is online 🟢")
- Docker deployment at hub.tarrantcountymakerspace.com (Traefik SSL)
- Per-task configurable LLM models (CLASSIFIER_MODEL, REPO_FIXER_MODEL env vars)
- Agent registration with bootstrap key
- Agent card at `/.well-known/agent-card.json`
- .agents/ framework harness scaffolded
- All source references updated from Self-Improving-Agent to A2A-Hub

### What's Broken / Blocked
- **Convex connectivity (CRITICAL):** Hub container can't reach `npx convex dev` on host port 3211. Docker Convex container (port 3210) has no functions deployed — admin key auth for `npx convex deploy` fails. See Session 2 for full details and options.
- Bootstrap key is `changeme123` — hardening deferred until after Brian testing
- No README — Brian can't set up his wrapper without docs
- No unit tests
- Docker Convex volume mount may be wrong (`/convex_data` vs `/convex/data`)

### What's Next (v1 remaining)
- [x] Configure Telegram (bot token + group ID)
- [ ] **Fix Convex connectivity** (see Session 2 Next Session Recommendations for options)
- [ ] Write README with wrapper quickstart
- [ ] Test end-to-end with Brian (alice wrapper)
- [ ] Verify experience dedup
- [ ] Harden bootstrap key (after Brian testing)

---

## Architecture Overview

```
Wrapper Agents (any A2A-compliant agent — Claude, Gemini, Grok, OpenAI, local)
    ↕ HTTP (register, poll, report)
A2A Intelligent Hub (Express 5, Docker, port 4000)
    ↕ Convex Client
Convex Backend (npx convex dev on host, port 3211 — Docker container on 3210 has no functions)
    ↕
Telegram Bot API (@a2a_hub_bot — notifications, approvals)
Anthropic API (classifier + repo-fixer — model configurable per task)
GitHub (push approved fixes)
```

---

## Roadmap

| Version | Goal | Effort |
|---|---|---|
| **v1** | Testable with Brian — Convex fix, README, key hardening | Days |
| **v2** | Frontend dashboard, npm wrapper package, proper auth | Weeks |
| **v3** | Multi-provider LLM, Makerspace integration, platform | Months |

See PRD.md §9 for full roadmap. See INBOX.md for task breakdown.

---

## Key Metrics

| Metric | Value |
|---|---|
| Total Sessions | 2 |
| Features Shipped | 9 (core modules + configurable models + Telegram) |
| v1 Tasks Remaining | 5 (Convex fix, README, test, dedup, key) |
| Known Bugs | 1 (Convex Docker connectivity) |
