# Project Summary

> **Last Updated:** Session 3 (2026-03-23)
> **Status:** v1 MVP — Convex connected, hub fully operational

---

## Current State

Hub is fully operational — Telegram broadcasting, Convex connected, agent registration working end-to-end. Deployed at hub.tarrantcountymakerspace.com with SSL via Traefik.

### What's Working
- Telegram bot (`@a2a_hub_bot`) configured and broadcasting ("Hub is online 🟢")
- Docker deployment at hub.tarrantcountymakerspace.com (Traefik SSL)
- Convex backend connected (`http://convex:3210` on Docker `a2a` network)
- Convex functions deployed (5 tables with indexes)
- Agent registration verified end-to-end (test-agent registered successfully)
- Per-task configurable LLM models (CLASSIFIER_MODEL, REPO_FIXER_MODEL env vars)
- Agent card at `/.well-known/agent-card.json`
- .agents/ framework harness scaffolded

### What's Remaining
- Bootstrap key is `changeme123` — hardening deferred until after Brian testing
- No README — Brian can't set up his wrapper without docs
- No unit tests

### What's Next (v1 remaining)
- [x] Configure Telegram (bot token + group ID)
- [x] **Fix Convex connectivity** — CONVEX_URL=http://convex:3210, functions deployed via npx convex deploy
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
Convex Backend (Docker container, port 3210, functions deployed)
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
| Total Sessions | 3 |
| Features Shipped | 10 (core modules + configurable models + Telegram + Convex deploy) |
| v1 Tasks Remaining | 4 (README, test, dedup, key) |
| Known Bugs | 0 |
