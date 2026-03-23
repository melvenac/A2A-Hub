# Task Inbox — Prioritized Backlog

> **Last Updated:** Session 2 (2026-03-23)

---

## How to Use This Document

Tasks are organized by MVP version, then by priority within each version.

**Status:**
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[!]` — Blocked

---

## v1 — Testable MVP (Aaron + Brian)

> **Goal:** Brian runs an `alice` wrapper, sends real questions, full loop works with Telegram visibility.
> **Effort:** Days, not weeks — code is built, this is mostly configuration + docs.

- [x] Configure Telegram integration (bot token + group ID env vars — code already exists in `telegram.ts`)
- [x] Fix Convex connectivity — CONVEX_URL set to http://convex:3210, functions deployed via `npx convex deploy` (Session 3)
- [x] Write README.md — project overview, setup instructions, wrapper quickstart for Brian (Session 3)
- [ ] Test with Brian: alice wrapper → real installation question → hub classifies → memory stores → repo fix drafted
- [ ] Verify experience dedup — same trigger shouldn't create duplicate experiences

## v2 — Visibility & Developer Experience

> **Goal:** See what the hub is doing without Docker logs. Make it easy for others to connect agents.
> **Effort:** Weeks — new features, new frontend.

- [ ] Frontend dashboard (Next.js + Convex) — conversation viewer, experience browser, agent status, real-time updates
- [ ] npm wrapper package (`a2a-wrapper` CLI) — `npx a2a-wrapper --hub URL --name alice`
- [ ] Harden bootstrap key (replace `changeme123` with proper generated key) — moved from v1
- [ ] Proper agent auth — per-agent key generation, key rotation, deprecate bootstrap key for production
- [ ] Write Vitest test suite for classifier, memory, and executor modules
- [ ] Add request validation middleware (validate A2A message format)
- [ ] Add health check for Convex connectivity (not just `{"status":"ok"}`)
- [ ] Create CHANGELOG.md and tag releases
- [ ] Add structured logging (pino or winston)

## v3 — Platform (depends on v2 decisions)

> **Goal:** Hub becomes a product, not just a tool for Aaron and Brian. Architectural decisions that shouldn't be made yet.
> **Effort:** Months — significant architecture work.

- [ ] Multi-provider LLM abstraction — each hub task uses best provider (Anthropic, OpenAI, Gemini, Grok, local). See ADR-004
- [ ] Eliminate hub's own API key dependency — route classifier/repo-fixer through connected agents
- [ ] Makerspace website integration — Stripe billing, member-facing chat
- [ ] Advanced escalation — multi-agent routing based on agent capabilities and specializations
- [ ] Rate limiting and abuse protection
- [ ] SECURITY.md with full auth patterns and audit checklist

---

## Completed

- [x] Implement core modules (classifier, memory, executor, escalation, queue, repo-fixer, telegram, agent-card)
- [x] Create Convex schema with 5 tables
- [x] Create Docker + Docker Compose deployment config
- [x] Deploy hub + Convex to VPS (hub.tarrantcountymakerspace.com)
- [x] Test wrapper flow end-to-end (message → memory → escalate → respond)
- [x] Scaffold .agents/ framework harness
- [x] Make LLM models per-task configurable (CLASSIFIER_MODEL, REPO_FIXER_MODEL env vars) — ADR-004
