# Product Requirements — A2A Intelligent Hub

> **Version:** 1.0
> **Owner:** Aaron (Tarrant County Makerspace)

---

## 1. Project Overview

The A2A Intelligent Hub is a central coordination server for agent-to-agent (A2A) communication. It receives messages from wrapper agents, classifies root causes, stores lessons learned, drafts repo fixes, and escalates tasks between connected agents. It serves as the "brain" of a self-improving multi-agent system.

**For whom:** Solo developer running multiple AI agents that need to coordinate, share knowledge, and autonomously fix documentation/config issues. Agent-agnostic — any A2A-compliant agent can participate regardless of LLM backend.

---

## 2. Core Features

1. **A2A Protocol Compliance** — Exposes `/.well-known/agent-card.json`, handles A2A `tasks/send` messages
2. **Root Cause Classification** — Uses Anthropic API (50 tokens max) to categorize incoming issues into: `repo-docs`, `repo-script`, `repo-config`, `user-env`, `user-error`
3. **Persistent Memory** — Stores experiences (trigger/action/context/outcome) in Convex with semantic search
4. **Repo Fixer** — Drafts documentation/config fixes as diffs, queues for human approval via Telegram
5. **Task Queue & Escalation** — Assigns tasks to available wrapper agents, escalates when no agent can handle
6. **Telegram Notifications** — Async notifications to user's Telegram group for approvals, escalations, and status
7. **Wrapper Agent Coordination** — Agents register, poll for tasks, and report results via HTTP API

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript (ES modules) |
| Server | Express 5 |
| Database | Convex (self-hosted or cloud) |
| AI (Hub internal) | Anthropic SDK (model configurable — used only for classifier + repo-fixer) |
| Protocol | A2A JS SDK (`@a2a-js/sdk`) |
| Notifications | Telegram Bot API (`node-telegram-bot-api`) |
| Git Operations | `simple-git` |
| Build | `tsc` → `dist/` |
| Dev | `tsx watch` |
| Testing | Vitest |
| Deployment | Docker + Docker Compose on VPS |

---

## 4. User Roles

| Role | Description |
|---|---|
| **Hub Operator** | Aaron — deploys the hub, approves repo fixes via Telegram, manages agent keys |
| **Wrapper Agent** | Any A2A-compliant agent (Claude Code, Gemini, Grok, OpenAI, local models) that registers with the hub and polls for tasks |
| **Bootstrap Admin** | Uses `HUB_BOOTSTRAP_KEY` to register new agents |

---

## 5. API Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/.well-known/agent-card.json` | GET | A2A agent card metadata |
| `/health` | GET | Health check |
| `/api/tasks/send` | POST | A2A protocol — receive task messages |
| `/api/agents/register` | POST | Register a new wrapper agent (requires bootstrap key) |
| `/api/agents/:name/poll` | GET | Agent polls for assigned tasks |
| `/api/agents/:name/report` | POST | Agent reports task results |

---

## 6. Data Model

See `ENTITIES.md` for full schema documentation. Key tables:
- **experiences** — Lessons learned with semantic search on trigger field
- **tasks** — A2A task lifecycle (pending → in-progress → completed/escalated)
- **agents** — Registered wrapper agents with status tracking
- **conversations** — Multi-turn task conversations with participant tracking
- **repoFixes** — Drafted code fixes awaiting human approval

---

## 7. Third-Party Integrations

| Service | Purpose | Token Budget |
|---|---|---|
| Anthropic API | Classification (50 tokens/call) + repo fix drafting (2000 tokens/call) | Minimal — ~$0.01/day |
| Telegram Bot API | Async notifications, fix approval workflow | Free |
| GitHub | Push approved repo fixes via PAT | Free |
| Convex | Persistent state, semantic search | Self-hosted (free) or cloud |

---

## 8. Non-Functional Requirements

- **Availability:** Hub should run 24/7 on VPS with `restart: unless-stopped`
- **Token Efficiency:** Hub makes minimal API calls (classifier + repo-fixer only); heavy LLM work runs on the wrapper agents themselves, powered by whatever LLM backend they use (Claude, Gemini, Grok, OpenAI, local models, etc.)
- **Security:** Bootstrap key for agent registration, API key hashing for agents, no secrets in logs
- **Latency:** Classification should complete in <2s, task polling is 5s interval
- **Agent Agnostic:** Hub coordinates any A2A-compliant agent regardless of LLM backend — the protocol is the contract, not the model

---

## 9. Roadmap

### v1 — Testable MVP (Aaron + Brian)

> **Goal:** Brian runs an `alice` wrapper, sends real questions, full loop works with Telegram visibility.
> **Effort:** Days — code is built, mostly configuration + docs.

| Feature | Status |
|---|---|
| Core hub loop (classify → memory → escalate → respond) | Done |
| Convex persistence (5 tables, semantic search) | Done |
| Docker deployment on VPS | Done |
| Wrapper agent (poll → claude --print → report) | Done |
| Per-task configurable LLM models (ADR-004) | Done |
| Configure Telegram (bot token + group — code exists) | Not started |
| Harden bootstrap key | Not started |
| README for Brian's wrapper setup | Not started |
| End-to-end test with Brian (alice wrapper) | Not started |

### v2 — Visibility & Developer Experience

> **Goal:** See what the hub is doing without Docker logs. Make it easy for others to connect.
> **Effort:** Weeks — new features, new frontend.

- Frontend dashboard (Next.js + Convex) — conversation viewer, experience browser, agent status
- npm wrapper package (`a2a-wrapper` CLI) — easy onboarding for new agents
- Proper agent auth — per-agent key generation, rotation, deprecate bootstrap key
- Test suite (Vitest), request validation, structured logging

### v3 — Platform (depends on v2 decisions)

> **Goal:** Hub becomes a product, not just a tool for two people.
> **Effort:** Months — significant architecture work.

- Multi-provider LLM abstraction — each hub task uses best provider (ADR-004)
- Eliminate hub's own API key — route through connected agents
- Makerspace website integration — Stripe billing, member-facing chat
- Advanced multi-agent routing based on agent capabilities
