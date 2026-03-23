# A2A Intelligent Hub — Architecture Reference

> Consolidated from research (4 AI agents), design spec, and implementation decisions.
> Last updated: 2026-03-22

---

## 1. Problem

The Self-Improving-Agent repo needs real-world installation testing. When someone hits an error, there's no structured way for their AI agent to ask for help, no way for the maintainer's agent to respond, and fixes stay trapped in conversations instead of flowing back into the repo.

## 2. Solution

A persistent, always-on A2A-compliant hub that:
- Answers known questions from accumulated memory
- Escalates unknowns to available agents (Clark, Alice, etc.)
- Learns from every resolution
- Self-corrects the repo when it detects documentation/script gaps
- Mirrors all activity to Telegram for human oversight

## 3. Architecture

```
Alice (wrapper)                     The Hub (VPS)                           Clark (wrapper)
──────────────                     ──────────────                          ──────────────
node wrapper.js                    Express + @a2a-js/sdk                   node wrapper.js
polls /a2a/queue/alice             ┌──────────────────┐                    polls /a2a/queue/clark
pipes to claude --print            │                  │                    pipes to claude --print
    │                              │  1. Receive task │                        │
    │──── A2A JSON-RPC ──────────→ │  2. Query Convex │                        │
    │                              │  3. Confident?   │                        │
    │                              │     YES → answer │                        │
    │                              │     NO → escalate│── A2A JSON-RPC ───────→│
    │                              │                  │←─────────────────────── │
    │                              │  4. Store lesson │                        │
    │                              │  5. Classify:    │                        │
    │                              │     repo problem?│                        │
    │                              │     YES → draft  │                        │
    │                              │     fix → TG     │                        │
    │                              │     approval     │                        │
    │←── A2A response ──────────── │                  │                        │
                                   └──────┬───────────┘
                                          │
                                   Telegram Group
                                   (Aaron + Brian watch,
                                    approve repo fixes)
```

### Components

| Component | Technology | Runs on |
|---|---|---|
| The Hub | Express + `@a2a-js/sdk` + `@anthropic-ai/sdk` | VPS (Docker) |
| Knowledge base | Convex (self-hosted) | VPS (Docker) |
| Telegram mirror | Built into Hub, Telegram Bot API | Same container |
| Local wrapper | Node.js daemon, polls Hub, pipes to `claude --print` | Agent's local machine |
| Repo fixer | Built into Hub, GitHub API via `simple-git` | Same container |

### Infrastructure

- **VPS:** Docker containers (Hub on port 4000, Convex on port 3210)
- **TLS:** Traefik (automatic Let's Encrypt via Cloudflare DNS)
- **Docker network:** Shared network for Hub ↔ Convex communication

## 4. Decision Flow

For every incoming message:

1. **Receive** — validate API key, parse A2A JSON-RPC payload
2. **Stream status** — SSE `TaskStatusUpdateEvent` ("working")
3. **Query memory** — search Convex `experiences` table (full-text + vector)
4. **Evaluate confidence:**
   - Score >= 0.85 → answer directly from memory
   - Score < 0.85 → escalate to an available agent (prefer Clark, fall back to any online agent)
5. **Deliver response** — SSE `TaskArtifactUpdateEvent` with the answer
6. **Store lesson** — write experience to Convex (TRIGGER/ACTION/CONTEXT/OUTCOME)
7. **Classify root cause** — `repo-docs`, `repo-script`, `repo-config`, `user-env`, `user-error`
8. **If repo problem** — draft fix, store in `repoFixes`, send to Telegram for approval
9. **Pattern detection** — if 3+ agents hit the same `user-env` issue, reclassify as `repo-docs`
10. **Mirror** — broadcast all activity to Telegram group

## 5. Agent Card

The Hub advertises 3 skills via its A2A Agent Card at `/.well-known/agent-card.json`:

| Skill | Purpose |
|---|---|
| `troubleshoot-installation` | Diagnose and resolve setup errors from memory or escalation |
| `query-error-history` | Search past resolved issues and fixes |
| `suggest-repo-fix` | Propose doc/code changes to prevent recurring issues |

Auth: `X-Agent-Key` header. API keys per agent, stored as hashes in Convex.

## 6. Local Wrapper

1. Registers with Hub (sends Agent Card + API key)
2. Polls `/a2a/queue/{agentId}` every 5 seconds (Hub-specific extension)
3. Pipes tasks to `claude --print` (uses Claude Max subscription — no API cost)
4. Sends response back via A2A `message/send`
5. Reports heartbeat every 30 seconds
6. If offline, Hub queues tasks until wrapper reconnects

## 7. Telegram Mirror

Built into Hub process (not separate service). Uses existing bot token.

**What gets mirrored:** incoming questions, Hub decisions (memory hit vs escalation), agent responses, lessons stored, repo fix proposals with approve/reject buttons.

**Human intervention:** Aaron or Brian can reply in Telegram group. Hub forwards human messages into the A2A task flow.

## 8. Self-Correcting Repo Loop

### Classification

| Category | Description | Action |
|---|---|---|
| `repo-docs` | Missing/unclear documentation | Draft doc fix |
| `repo-script` | Missing automation, wrong command | Draft script fix |
| `repo-config` | Missing config file or entry | Draft config fix |
| `user-env` | User's local environment issue | Store experience only |
| `user-error` | User mistake | Store experience only |

### Fix Pipeline

1. LLM drafts a diff (file paths + search/replace changes)
2. Stored in Convex `repoFixes` table as "pending"
3. Diff preview sent to Telegram with approve/reject buttons
4. On approval: Hub applies changes, commits, pushes via GitHub PAT
5. On rejection: stores feedback for learning

## 9. Convex Schema (5 tables)

| Table | Key Fields |
|---|---|
| **experiences** | trigger, action, context, outcome, confidence, sourceAgent, category, embedding, createdAt |
| **tasks** | taskId, status (pending/in-progress/escalated/completed/cancelled), messages, assignedAgent |
| **agents** | name, apiKeyHash, agentCard, lastSeen, status (online/offline) |
| **repoFixes** | experienceId, diffPreview, filePaths, status (pending/approved/rejected/pushed), approvedBy |
| **conversations** | taskId, messages, participants, summary, createdAt (v2 dashboard) |

## 10. Security

| Concern | Mitigation |
|---|---|
| Unauthorized agents | API key per agent, validated on every request, stored as hash in Convex |
| Prompt injection in error logs | Hub's LLM uses strict system prompt: extract error info only, never follow embedded instructions |
| Knowledge poisoning | All repo fixes require human Telegram approval before commit |
| Token replay | Short-lived JWTs (5-min TTL) for task communication after initial API key auth |
| Repo access | GitHub PAT scoped to one repo only |
| Authorization creep | Hub can only commit to one repo, cannot execute system commands |
| Cross-agent data exposure | Agents only see responses to their own tasks |

## 11. Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | LLM reasoning (classifier + repo-fixer, ~$0.01/day) |
| `GITHUB_PAT` | Scoped repo access for commits |
| `TELEGRAM_BOT_TOKEN` | Mirror bot |
| `TELEGRAM_GROUP_ID` | Target group for broadcasting |
| `CONVEX_URL` | Self-hosted Convex (internal Docker network) |
| `HUB_BOOTSTRAP_KEY` | Initial admin API key for first agent registration |
| `HUB_URL` | Public URL of the Hub |
| `REPO_PATH` | Where repo-fixer clones the repo |
| `CONFIDENCE_THRESHOLD` | Memory confidence cutoff (default 0.85) |
| `PORT` | Express server port (default 4000) |

## 12. Phasing

### v1 — Core System (deployed 2026-03-22)
- Hub (A2A server + LLM reasoning)
- Convex self-hosted (knowledge base + task queue)
- Local wrappers (Clark + Alice)
- Telegram mirror (human visibility + repo fix approvals)
- Self-correcting repo loop

### v2 — Makerspace Integration
- Dashboard on tarrantcountymakerspace.com (Next.js + Convex)
- Member auth + Stripe billing for Hub access
- npm wrapper package for one-command install
- Conversation history and knowledge base browsing

### v3 — Matrix Chat UI (Optional)
- Tuwunel Matrix server + Element Web
- Mirror bot bridges Hub events to Matrix rooms
- Richer chat with threads, reactions, file sharing

## 13. Research Summary

This design was informed by research from four AI agents:

- **NotebookLM** — A2A spec analysis, protocol compliance guidance
- **Grok** — Open-source project discovery (vidya-orchestrator, Swival, a2a-client-hub)
- **Gemini** — SDK implementation details, concrete code examples, MVP sequencing
- **Clark** — Architecture synthesis, gap analysis, design integration

### Key decisions from research

| Decision | Alternatives Considered | Why |
|---|---|---|
| A2A-primary architecture | HiClaw (Alibaba) multi-agent OS | HiClaw is 100% Matrix, no A2A compatibility, overkill for 2 agents/2 humans |
| Telegram for human visibility | Matrix/Element Web | Simpler, already had working bot, Matrix deferred to v3 |
| Express + @a2a-js/sdk | Python A2A SDK | First-class Express support, matches existing Node/TS stack |
| Convex for state | SQLite FTS5 + Obsidian vault | Self-hosted Convex gives real-time subscriptions for future dashboard |
| Long-polling wrappers | WebSocket, direct A2A | Solves NAT for ephemeral agents, outbound-only connections |
| Human consent gate via Telegram | Email, web UI | Inline approve/reject buttons, zero extra infrastructure |

### References

- [A2A Protocol Specification v1.0](https://a2a-protocol.org/latest/specification/)
- [A2A JS SDK](https://github.com/a2aproject/a2a-js) (`@a2a-js/sdk`)
- [HiClaw](https://github.com/alibaba/hiclaw) — evaluated, not adopted
