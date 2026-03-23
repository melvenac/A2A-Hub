# Project Summary

> **Last Updated:** Session 1 (2026-03-22)
> **Status:** v1 MVP — mostly built, needs config + docs to be testable with Brian

---

## Current State

The A2A Intelligent Hub core is deployed and working on VPS. The v1 milestone is close — remaining work is configuration (Telegram) and documentation (README for Brian), not new code.

### What's Working
- Full hub loop: message → classify → memory check → escalate → respond
- Convex persistence (5 tables, semantic search) — self-hosted on VPS
- Docker deployment at hub.tarrantcountymakerspace.com (Traefik SSL)
- Wrapper agent tested (poll → claude --print → report)
- Per-task configurable LLM models (CLASSIFIER_MODEL, REPO_FIXER_MODEL env vars)
- Agent registration with bootstrap key
- Agent card at `/.well-known/agent-card.json`
- .agents/ framework harness scaffolded

### What's Broken / Blocked
- Telegram module coded but not configured (needs bot token + group ID)
- Bootstrap key is `changeme123` — needs hardening before Brian tests
- No README — Brian can't set up his wrapper without docs
- No unit tests

### What's Next (v1 remaining)
- [ ] Configure Telegram (env vars only — code exists)
- [ ] Harden bootstrap key
- [ ] Write README with wrapper quickstart
- [ ] Test end-to-end with Brian (alice wrapper)

---

## Architecture Overview

```
Wrapper Agents (any A2A-compliant agent — Claude, Gemini, Grok, OpenAI, local)
    ↕ HTTP (register, poll, report)
A2A Intelligent Hub (Express 5, port 4000)
    ↕ Convex Client
Convex Backend (self-hosted, port 3210)
    ↕
Telegram Bot API (notifications, approvals)
Anthropic API (classifier + repo-fixer — model configurable per task)
GitHub (push approved fixes)
```

---

## Roadmap

| Version | Goal | Effort |
|---|---|---|
| **v1** | Testable with Brian — Telegram, README, key hardening | Days |
| **v2** | Frontend dashboard, npm wrapper package, proper auth | Weeks |
| **v3** | Multi-provider LLM, Makerspace integration, platform | Months |

See PRD.md §9 for full roadmap. See INBOX.md for task breakdown.

---

## Key Metrics

| Metric | Value |
|---|---|
| Total Sessions | 1 |
| Features Shipped | 8 (core modules + configurable models) |
| v1 Tasks Remaining | 4 |
| Known Bugs | 0 |
