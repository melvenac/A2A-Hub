# Product Requirements — A2A Intelligent Hub

> **Version:** 1.2
> **Owner:** Aaron (Tarrant County Makerspace)
> **Changed in 1.2 (2026-07-29, Aaron's call):** cross-repo agent-to-agent promoted from secondary to **primary** use case and given its own roadmap phase (v2) ahead of the Brian/remote work (now v3). Rationale: same protocol at a shorter distance, and the only version verifiable without a second person. §8 Security gains three named prerequisites that single-machine work cannot surface.

---

## 1. Project Overview

### The problem

**A human is the transport layer between agents that should be talking to each other.**

It shows up in two places, and they are the same problem at two distances.

*Across repos, today.* Aaron is working in one repo when an issue surfaces whose cause lives in another — a GitNexus MCP server failing mid-session is the running example. The agent in the current repo can describe the problem but cannot ask the agent that knows the answer. So the context gets written into the other repo's `next-session.md` and waits until Aaron happens to open that repo. He is the scheduler and the courier. The file-based mailbox protocol has the same shape and the same bottleneck: it moves bytes, but only a human moves them at the right time.

*Across machines, next.* Helping someone learn Claude Code remotely doesn't work either. Teaching Brian or Hisham means a video call with commands dictated through a chat window — tedious, error-prone, one problem at a time. And problems Aaron has already solved don't translate: the fix lives in his head or his shell history, not anywhere the learner's agent can reach.

The insight is the same in both: **both sides already have an AI agent.** Instead of human-relays-to-agent, let the agents talk directly — with the humans watching and steering rather than relaying.

The A2A Intelligent Hub is the rendezvous point that makes this possible: a central coordination server for agent-to-agent (A2A) communication. It receives messages from wrapper agents, classifies root causes, stores lessons learned, drafts repo fixes, and escalates tasks between connected agents. It serves as the "brain" of a self-improving multi-agent system.

### Motivating use cases

1. **Cross-repo agent-to-agent, one machine (primary — drives the roadmap).** An agent working in repo A asks the agent resident in repo B a question and gets a grounded answer, with no human in the loop. Delivered in v1.6.0 (ADR-010): a peer launched with `--repo <path>` answers from a Claude Agent SDK session rooted there, reading that repo's actual files; `scripts/ask-agent.mjs` is the entrance from a live coding session.

   **Why this is first, and not just easier:** it is the same protocol as use case 2 at a shorter distance, and it is the only version Aaron can build, test, and verify alone. Cross-machine work blocks on a second person's availability for every iteration; cross-repo closes the loop in under a minute. Get the protocol right where the feedback is immediate, then extend the distance.

   **What this use case cannot surface** — and therefore must be decided deliberately rather than discovered (see §8 Security): there is exactly one trust domain on one machine, so authentication, peer identity collisions, and "who may ask this peer what" are all non-questions locally and load-bearing remotely. Building as if there were two trust domains is a prerequisite, not later hardening.

2. **Remote teaching / pair-fixing, across machines (next).** Aaron's agent ↔ Brian's Alice through the hub. NAT-safe outbound polling means Brian opens no ports; humans sit in the same session as co-equal peers (`aaron`, `brian`) and jump in via @mentions instead of dictating commands. The `experiences` store turns "I solved this locally" into an answer the hub can serve the next time any learner's agent hits the same error. `repoFixes` drafts the fix to the learner's repo, gated by human approval — the right posture for teaching. Mostly the same protocol as use case 1; the deltas are auth, identity namespacing, authorization, and real-network failure modes.

3. **Local multi-agent orchestration (tertiary).** An orchestration agent delegates tasks to coder agents on the same dev server via the task queue (atomic claims = worker pool). For *fan-out on a shared task*, Claude Code's native subagents are usually the better tool, because they share context. That argument does **not** apply to use case 1: a subagent spawned from repo A loads repo B from zero, whereas the point of a repo-resident peer is that it already holds its own `.agents/` state and accumulated gotchas. Use case 1 is cross-**context**; the hub's edge covers different contexts, different machines, different owners, and different LLM stacks alike.

**For whom:** First, a solo developer whose work spans many repos, each with its own resident agent that should be reachable from the others. Then developers mentoring other developers remotely through their AI agents. Agent-agnostic — any A2A-compliant agent can participate regardless of LLM backend.

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
- **Security:** Bootstrap key for agent registration, API key hashing for agents, no secrets in logs.

  **Single-machine work must not assume a single trust domain.** On one machine every peer, repo, and request belongs to Aaron, so the three requirements below are invisible — nothing local fails without them, and no cross-repo test can surface them. They are prerequisites for use case 2, not hardening after it, because each one is cheap to build in now and expensive to retrofit into a working system:

  1. **`X-Agent-Key` must actually be validated.** Every guarded route currently checks only for *presence* — a deliberately bogus key returns `200`. `apiKeyHash` is stored at registration and never compared. Until this is closed, the local system runs a *different* security model than the remote one, which defeats the point of proving the protocol locally first.
  2. **Peer identity must be namespaced by owner.** Peer names are bare strings unique by convention. Two machines that each run a `gitnexus` peer collide, and there is no owner field to disambiguate. Local default should make this invisible day-to-day.
  3. **"Who may ask this peer what" must exist as a concept**, with a permissive local default. A repo-resident peer reads files on request. Locally that is Aaron's request against Aaron's disk and authorization is a non-question; across machines it means a remote party's request causes reads on someone else's disk. Read-only by default (ADR-010) narrows the blast radius but does not answer who is allowed to ask. Adding a policy later should be filling in a value, not introducing a layer.
- **Latency:** Classification should complete in <2s, task polling is 5s interval
- **Agent Agnostic:** Hub coordinates any A2A-compliant agent regardless of LLM backend — the protocol is the contract, not the model

---

## 9. Roadmap

### v1 — Protocol Spine Proven Locally — ✅ COMPLETE (v1.4.0)

> **Goal (as delivered):** Two real-LLM agents converse to convergence through the hub with zero human relay, and a human can join any session as a co-equal peer through a chat client.
> **Note:** The original v1 goal ("Brian runs an alice wrapper remotely") required a reachable hub; the VPS was wiped 2026-04, so v1 was proven locally and the Brian end-to-end test moved behind redeploy — now v3, since cross-repo (v2) was promoted ahead of it.

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

### v2 — Cross-Repo Agent-to-Agent, Proven Locally (Aaron alone)

> **Goal:** Use case 1 is complete and trustworthy — any repo's agent can ask any other repo's agent a question and get a grounded answer, with no human relaying and no peer needing to be started by hand first.
> **Effort:** Days–weeks. No external dependency: every item is buildable, testable, and verifiable on one machine.
> **Why this phase exists:** it is use case 2's protocol at a shorter distance, with a feedback loop measured in seconds instead of in someone else's availability.

**Delivered (v1.6.0, ADR-010):**
- Repo-resident peers — `--repo <path>` answers from an Agent SDK session rooted in that repo, read-only by default
- `scripts/ask-agent.mjs` — the entrance from a live coding session (register → 2-peer session → send → poll)
- Verified live cross-repo: the `gitnexus` peer answered a real question in 43s with four `file:line` citations, all verified verbatim

**Remaining (in order):**
- **On-demand spawn** — hub launches a headless agent for a repo peer that isn't running, then lets it exit. Removes the last "wait for a human to start something," and is what retires the file mailbox rather than out-competing it
- **Validate `X-Agent-Key`** (§8.1) — prerequisite, not hardening; nothing local fails without it, which is exactly the risk
- **Namespace peer identity by owner** (§8.2) — before two machines exist, not after they collide
- **"Who may ask this peer" as a concept** with a permissive local default (§8.3)
- Scoped `Bash(git log *)` for repo peers — a repo expert should be able to answer "when did this change and why"; full shell stays denied
- Repo → peer discovery, so `ask-agent.mjs` can take a path instead of a hand-passed name
- Decide the entrance shape: keep the script, or expose the hub as an MCP server (`a2a_ask(peer, question)`). Re-read ADR-006/007 first — an MCP channel layer was superseded once, though for a different purpose

### v3 — Remote Teaching Ready (Aaron + Brian)

> **Goal:** Use case 2 becomes real — Brian installs a wrapper in minutes, Alice talks to Aaron's agent through a hub on the internet, and both humans watch and steer from the chat client.
> **Effort:** Weeks — deploy + auth + packaging + UX. Gated on v2, and on Brian's availability for the end-to-end test.
> **Architecture reference:** `reference/MESSAGING-APP-ARCHITECTURE.md`

**Path to Brian (in order):**
- Real per-agent personas — role text per agent (mentor/learner), baked into launch config (`--persona` plumbing already done)
- `start-stack.ps1` — one-click Convex + hub + daemons + client locally
- Fix `CLASSIFIER_MODEL` code default (current default 404s on this key; overridden via env at launch)
- Proper agent auth — per-agent key generation and rotation, deprecate shared `dev-key` and bootstrap key. Builds on v2's key *validation*; v2 closes the hole, v3 makes key management usable
- Redeploy hub + Convex on VPS (Docker Compose, `restart: unless-stopped`)
- Real-network failure modes — TLS/DNS, connection dropped mid-answer, retry/idempotency, version skew between two machines, CORS from a non-localhost origin. The genuinely new surface that no local test can reach
- npm wrapper package (`a2a-wrapper` CLI) + setup README — Brian's onboarding takes minutes and isn't itself the thing being taught
- End-to-end test with Brian (Alice ↔ Aaron's agent, remote)

**Chat/UX track:**
- Grow Svelte client toward PWA — installable on phone, real-time via Convex subscriptions
- Frontend dashboard — conversation viewer, experience browser, agent status
- Peer model (Honcho-inspired) — evolving profiles, per-session observation settings
- Background reasoning — Convex background functions extract insights from conversations continuously. Messaging = Memory.
- Test suite growth (Vitest), request validation, structured logging

### v4 — Platform (depends on v3 decisions)

> **Goal:** Hub becomes a product, not just a tool for two people.
> **Effort:** Months — significant architecture work.

- Multi-provider LLM abstraction — each hub task uses best provider (ADR-004)
- Eliminate hub's own API key — route through connected agents
- Makerspace website integration — Stripe billing, member-facing chat
- Advanced multi-agent routing based on agent capabilities
