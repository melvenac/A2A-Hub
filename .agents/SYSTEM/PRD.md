# Product Requirements — A2A Intelligent Hub

> **Version:** 1.1
> **Owner:** Aaron (Tarrant County Makerspace)

---

## 1. Project Overview

### The problem

Helping someone learn Claude Code (or any AI-first dev environment) remotely doesn't work today. Teaching Brian or Hisham means a Google video call with commands dictated through a chat window — tedious, error-prone, and one problem at a time. Worse, common problems Aaron has already solved on his own machine don't translate: the fix lives in his head or his shell history, not anywhere the learner's agent can reach.

The insight: **both sides already have an AI agent.** Instead of human-relays-to-human, let Aaron's local agent talk directly to Brian's agent (Alice) — solve problems, teach by building, and resolve errors remotely, with the humans watching and steering rather than relaying.

The A2A Intelligent Hub is the rendezvous point that makes this possible: a central coordination server for agent-to-agent (A2A) communication. It receives messages from wrapper agents, classifies root causes, stores lessons learned, drafts repo fixes, and escalates tasks between connected agents. It serves as the "brain" of a self-improving multi-agent system.

### Motivating use cases

1. **Remote teaching / pair-fixing (primary — drives the roadmap).** Aaron's agent ↔ Brian's Alice through the hub. NAT-safe outbound polling means Brian opens no ports; humans sit in the same session as co-equal peers (`aaron`, `brian`) and jump in via @mentions instead of dictating commands. The `experiences` store turns "I solved this locally" into an answer the hub can serve the next time any learner's agent hits the same error. `repoFixes` drafts the fix to the learner's repo, gated by human approval — the right posture for teaching.
2. **Local multi-agent collaboration (secondary).** An orchestration agent delegates tasks to coder agents on the same dev server via the task queue (atomic claims = worker pool). Note: for same-machine orchestration, Claude Code's native subagents/agent teams are often the better tool because they share context. The hub's edge is agents on **different machines, different owners, or different LLM stacks** — which is use case 1.

**For whom:** Developers mentoring other developers remotely through their AI agents; secondarily, a solo developer running multiple AI agents that need to coordinate, share knowledge, and autonomously fix documentation/config issues. Agent-agnostic — any A2A-compliant agent can participate regardless of LLM backend.

---

## 2. Core Features

1. **A2A Protocol Compliance** — Exposes `/.well-known/agent-card.json`, handles A2A `tasks/send` messages
2. **Root Cause Classification** — Uses Anthropic API (50 tokens max) to categorize incoming issues into: `repo-docs`, `repo-script`, `repo-config`, `user-env`, `user-error`
3. **Persistent Memory** — Stores experiences (trigger/action/context/outcome) in Convex with semantic search
4. **Repo Fixer** — Drafts documentation/config fixes as diffs, queues for human approval via the chat channel
5. **Task Queue & Escalation** — Assigns tasks to available wrapper agents, escalates when no agent can handle
6. **Chat Channel Notifications** — Hub notifications flow to the human peer via Convex-backed sessions (peers/sessions/messages, ADR-006); Telegram removed entirely
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
| Notifications | Custom chat channel (Convex peers/sessions/messages, ADR-006) |
| Git Operations | `simple-git` |
| Build | `tsc` → `dist/` |
| Dev | `tsx watch` |
| Testing | Vitest |
| Deployment | Docker + Docker Compose on VPS |

---

## 4. User Roles

| Role | Description |
|---|---|
| **Hub Operator** | Aaron — deploys the hub, approves repo fixes via the chat channel (a peer on the hub), manages agent keys |
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
| ~~Telegram Bot API~~ | ~~Dropped per ADR-005~~ | — |
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

### v1 — Protocol Spine Proven Locally — ✅ COMPLETE (v1.4.0)

> **Goal (as delivered):** Two real-LLM agents converse to convergence through the hub with zero human relay, and a human can join any session as a co-equal peer through a chat client.
> **Note:** The original v1 goal ("Brian runs an alice wrapper remotely") required a reachable hub; the VPS was wiped 2026-04, so v1 was proven locally and the Brian end-to-end test moved to v2 behind redeploy.

| Feature | Status |
|---|---|
| Core hub loop (classify → memory → escalate → respond) | Done |
| Convex persistence + semantic search | Done |
| Wrapper daemon (poll → LLM reply → report, deterministic fallback without key) | Done (v1.2.0) |
| Per-task configurable LLM models (ADR-004) | Done |
| ~~Configure Telegram~~ — dropped per ADR-005 | Dropped |
| Chat channel — Convex peers/sessions/messages, humans as co-equal peers (ADR-006) | Done (v1.1.0) |
| Svelte chat client — history, composer, @mentions, rename, session extend | Done (v1.3.0–v1.4.0) |
| Autonomous 2-agent loop, real LLM (alice↔bob on Haiku, turn caps, DONE convergence) | Done (v1.4.0) |
| Session extend/reopen + deterministic @mention reply routing (ADR-007) | Done (v1.4.0) |
| `--persona` system-prompt plumbing in wrapper daemon | Done |
| ~~Docker deployment on VPS~~ — VPS wiped 2026-04, redeploy is v2 | Regressed |

> **Design pivot:** the originally planned "Custom Convex Channel" (an MCP channel server bridging Convex to Claude Code, with permission relay) was superseded. What shipped instead is a native Convex chat channel (peers/sessions/messages) with a Svelte client — no MCP layer. See ADR-006/007 in `DECISIONS.md` for the reasoning trail.

### v2 — Remote Teaching Ready (Aaron + Brian)

> **Goal:** Use case 1 becomes real — Brian installs a wrapper in minutes, Alice talks to Aaron's agent through a hub on the internet, and both humans watch and steer from the chat client.
> **Effort:** Weeks — deploy + auth + packaging + UX.
> **Architecture reference:** `reference/MESSAGING-APP-ARCHITECTURE.md`

**Path to Brian (in order):**
- Real per-agent personas — role text per agent (mentor/learner), baked into launch config (`--persona` plumbing already done)
- `start-stack.ps1` — one-click Convex + hub + daemons + client locally
- Fix `CLASSIFIER_MODEL` code default (current default 404s on this key; overridden via env at launch)
- Proper agent auth — per-agent key generation, rotation, deprecate shared `dev-key` and bootstrap key
- Redeploy hub + Convex on VPS (Docker Compose, `restart: unless-stopped`)
- npm wrapper package (`a2a-wrapper` CLI) + setup README — Brian's onboarding takes minutes and isn't itself the thing being taught
- End-to-end test with Brian (Alice ↔ Aaron's agent, remote)

**Chat/UX track:**
- Grow Svelte client toward PWA — installable on phone, real-time via Convex subscriptions
- Frontend dashboard — conversation viewer, experience browser, agent status
- Peer model (Honcho-inspired) — evolving profiles, per-session observation settings
- Background reasoning — Convex background functions extract insights from conversations continuously. Messaging = Memory.
- Test suite growth (Vitest), request validation, structured logging

### v3 — Platform (depends on v2 decisions)

> **Goal:** Hub becomes a product, not just a tool for two people.
> **Effort:** Months — significant architecture work.

- Multi-provider LLM abstraction — each hub task uses best provider (ADR-004)
- Eliminate hub's own API key — route through connected agents
- Makerspace website integration — Stripe billing, member-facing chat
- Advanced multi-agent routing based on agent capabilities
