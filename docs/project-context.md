---
name: A2A Intelligent Hub
description: A2A Hub — agent-agnostic coordination server at ~/Projects/A2A-Hub, v1 deployed on VPS, v2/v3 planned
type: project
---

**What:** A persistent AI agent on VPS that mediates communication between A2A-compliant agents (any LLM backend). Accumulates knowledge from every interaction, answers common questions from memory, and self-corrects the Self-Improving-Agent repo.

**Repo:** `~/Projects/A2A-Hub/` (standalone, extracted from Self-Improving-Agent on 2026-03-22)

**Live at:** https://hub.tarrantcountymakerspace.com

**Architecture:**
- **Hub** — Express 5 + `@a2a-js/sdk` + `@anthropic-ai/sdk`, Docker on VPS
- **Convex (self-hosted)** — knowledge base, task queue, agent registry, repo fixes
- **Local wrappers** (`wrapper/`) — poll Hub, pipe to any LLM (claude --print, etc.)
- **Telegram** — DROPPED (ADR-005: fire-and-forget MCP notifications silently drop messages)
- **Agent agnostic** — any A2A-compliant agent can participate (Claude, Gemini, Grok, OpenAI, local models)
- **Per-task configurable models** — CLASSIFIER_MODEL, REPO_FIXER_MODEL env vars (ADR-004)

## v1 — Testable MVP (Aaron + Brian)
> Goal: Brian runs `alice` wrapper, full loop works with Telegram visibility.
> Effort: Days — mostly configuration + docs.

- [x] Core hub loop deployed and tested
- [x] Convex + Docker on VPS
- [x] Per-task configurable LLM models
- [x] Traefik SSL + Let's Encrypt (v3.6)
- [x] Convex functions deployed to VPS
- [x] End-to-end test: wrapper → hub → Claude → response (2026-03-23)
- [x] ~~Configure Telegram~~ — dropped per ADR-005, replaced by custom messaging app
- [x] Fix Convex connectivity (CONVEX_URL=http://convex:3210, recreate container not just restart)
- [x] Error handling + input validation on all routes
- [x] Multi-stage Dockerfile (builds TypeScript in Docker, no dist/ in git)
- [x] Automated deploy script (scripts/deploy.sh)
- [x] README with Brian/alice wrapper quickstart
- [ ] End-to-end test with Brian
- [ ] Verify experience dedup
- Bootstrap key hardening moved to v2 — don't need it until after Brian tests

## v2 — Visibility & Easy Onboarding
> Goal: See what hub is doing, anyone can interact without CLI.
> Effort: Weeks.

- **Purpose-built messaging app** (Next.js + Convex) — replaces Telegram entirely. Real-time reactive, messages persist in Convex until consumed, no silent drops. Full control over UX and delivery guarantees.
- **Messaging = Memory** — conversations in the app double as the persistent memory layer. Convex background functions extract insights continuously (inspired by Honcho's background reasoning).
- Frontend dashboard (Next.js + Convex) — messaging + hub visibility in one app
- **Honcho-inspired peer model** — agents AND users as first-class entities with evolving memory profiles (Clark, Hub agents, Brian's wrapper all modeled as peers)
- **Observation settings** — configurable visibility per peer in multi-agent sessions
- **Background reasoning** — Convex background functions extract insights from conversations continuously (not just at session end like vault-writer)
- **Multi-participant sessions** — mixed human+AI conversations with per-participant memory
- npm wrapper package (`npx a2a-wrapper` — one command, no clone)
- Docker wrapper (`docker run a2a-wrapper` — zero Node.js needed)
- Web onboarding — dashboard generates key, shows copy-paste command
- Proper agent auth (key generation, rotation)
- Test suite (Vitest), structured logging

## v3 — Platform (depends on v2 decisions)
> Goal: Hub becomes a product.
> Effort: Months.

- Multi-provider LLM abstraction (each task uses best provider)
- Eliminate hub's own API key (route through connected agents)
- Makerspace website integration (Stripe billing, member chat)
- Advanced multi-agent routing by capability

## Framework
- `.agents/` harness scaffolded (Session 1, 2026-03-22)
- PRD, ENTITIES, RULES, SUMMARY, DECISIONS, INBOX all populated
- Roadmap in PRD §9 and INBOX.md

## Deployment Notes
- Containers: `convex` (port 3210) + `a2a-hub` (port 4000)
- Traefik handles SSL (Cloudflare DNS)
- Convex admin key generated via `docker exec convex ./generate_admin_key.sh`
- VPS Node upgraded 12→20 via nodesource
- Convex `_generated` types need `npx convex codegen` before `npm run build`
- **Deploy script:** `scripts/deploy.sh` (in repo) — pulls from GitHub, stops/removes container, rebuilds image (multi-stage), starts fresh, verifies health
- **VPS project path:** `~/projects/a2a-hub/`
- **VPS IP:** 172.86.123.176
- **Docker restart doesn't reload env vars** — must stop/rm/recreate container
- **.dockerignore** updated for multi-stage build (allows src/, *.ts)

## Memory Architecture Decision (Session 3, 2026-03-23)
- v1 keeps simple Convex text search — no vector/semantic search yet
- Memory architecture mirrors Self-Improving Agent: curated knowledge, FTS, semantic search — all three can use Convex tables, differentiated by write/query code paths
- Scope will grow when integrated into Makerspace website for member use — that use case will drive what memory features to build
- Don't over-engineer memory until the Makerspace integration shape is clearer
