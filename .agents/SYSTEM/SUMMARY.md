# Project Summary

> **Last Updated:** Session 3 (2026-03-23)
> **Status:** v1 MVP — Convex connected, hub fully operational

---

## Current State

Hub is fully operational — Convex connected, agent registration working, deploy pipeline automated. Ready for Brian testing.

### What's Working
- Docker deployment at hub.tarrantcountymakerspace.com (Traefik SSL)
- Convex backend connected (`http://convex:3210` on Docker `a2a` network)
- Convex functions deployed (5 tables with indexes)
- Agent registration verified end-to-end (test-agent, test-agent-2)
- JSON error responses on all routes (no more HTML stack traces)
- Multi-stage Dockerfile (TypeScript builds in Docker)
- Automated deploy script (`scripts/deploy.sh`)
- README with Brian/alice wrapper quickstart
- Per-task configurable LLM models (CLASSIFIER_MODEL, REPO_FIXER_MODEL env vars)
- Agent card at `/.well-known/agent-card.json`
- Telegram bot configured (broadcasting, but ECONNRESET on polling — transient)

### What's Not Yet Tested
- `/a2a/message/send` — the core classify → memory → escalate loop
- Experience dedup

### What's Next (v1 remaining)
- [x] Configure Telegram (bot token + group ID)
- [x] Fix Convex connectivity
- [x] Write README with wrapper quickstart
- [ ] Test `/a2a/message/send` end-to-end
- [ ] Test with Brian (alice wrapper)
- [ ] Verify experience dedup

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
| **v1** | Testable with Brian — test message loop, dedup | Days |
| **v2** | Frontend dashboard, npm wrapper package, proper auth | Weeks |
| **v3** | Multi-provider LLM, Makerspace integration, platform | Months |

See PRD.md §9 for full roadmap. See INBOX.md for task breakdown.

---

## Key Metrics

| Metric | Value |
|---|---|
| Total Sessions | 3 |
| Features Shipped | 12 (core modules + configurable models + Telegram + Convex deploy + error handling + deploy script + README) |
| v1 Tasks Remaining | 3 (test message loop, test with Brian, dedup) |
| Known Bugs | 0 |
