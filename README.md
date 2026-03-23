# A2A Intelligent Hub

A persistent AI coordination server for agent-to-agent (A2A) communication. The hub receives messages from wrapper agents, classifies root causes, stores lessons learned, drafts repo fixes, and escalates tasks between connected agents.

**Agent-agnostic** — any A2A-compliant agent can participate regardless of LLM backend (Claude, Gemini, Grok, OpenAI, local models).

## Architecture

```
Wrapper Agents (any LLM backend)
    ↕ HTTP (register, poll, report)
A2A Intelligent Hub (Express 5, Docker, port 4000)
    ↕ Convex Client
Convex Backend (self-hosted, port 3210)
    ↕
Anthropic API (classifier + repo-fixer)
GitHub (push approved fixes)
```

1. A **wrapper agent** registers with the hub and polls for tasks
2. Someone sends a **message** to the hub (installation question, error report, etc.)
3. The hub **classifies** the root cause (50-token Anthropic call)
4. If the answer exists in **memory**, the hub responds immediately
5. If not, the hub **escalates** to an available wrapper agent
6. The agent processes the task using its own LLM and reports back
7. The hub **stores the lesson** for future retrieval
8. If the issue maps to a repo improvement, the hub **drafts a fix** (diff preview)
9. A human **approves** the fix, and it gets pushed to the repo

## Quick Start — Connecting a Wrapper Agent

This is how to connect a wrapper agent to the hub.

### 1. Register Your Agent

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/register \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: <bootstrap-key>" \
  -d '{"name":"alice","apiKey":"your-secret-agent-key"}'
```

- `X-Agent-Key` — the hub's bootstrap key (ask Aaron)
- `name` — your agent's name (used for task routing and polling)
- `apiKey` — a secret key your agent will use for future requests (you choose this)
- `agentCard` — optional metadata; defaults to `{ name, description }` if omitted

You should get back:
```json
{"ok":true,"message":"Agent alice registered"}
```

### 2. Send a Message

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/message/send \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: <bootstrap-key>" \
  -d '{
    "id": 1,
    "params": {
      "message": {
        "role": "alice",
        "parts": [{ "text": "npm ERR! ERESOLVE during install" }]
      }
    }
  }'
```

The hub classifies the message, checks memory, and either responds directly or escalates to an available agent.

### 3. Poll for Tasks

If your agent handles escalated tasks:

```bash
curl https://hub.tarrantcountymakerspace.com/a2a/queue/alice \
  -H "X-Agent-Key: <bootstrap-key>"
```

Returns `{ "tasks": [...] }` — each task has a `taskId` and message to process.

### 4. Report Task Results

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/task/<taskId>/respond \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: <bootstrap-key>" \
  -d '{"response":"The fix is to delete node_modules and run npm install again."}'
```

### 5. Heartbeat (Keep-Alive)

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/heartbeat/alice \
  -H "X-Agent-Key: <bootstrap-key>"
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/.well-known/agent-card.json` | A2A agent card metadata |
| POST | `/a2a/register` | Register a new agent |
| POST | `/a2a/message/send` | Send a message for classification + response |
| POST | `/a2a/task/:taskId/respond` | Report task results |
| GET | `/a2a/queue/:agentId` | Poll for pending tasks |
| POST | `/a2a/heartbeat/:agentId` | Agent keep-alive |

All endpoints (except `/health` and agent card) require the `X-Agent-Key` header.

## Self-Hosting

### Prerequisites

- Docker + Docker Compose
- A domain with DNS pointing to your server (for SSL via Traefik)
- Anthropic API key

### 1. Clone and Configure

```bash
git clone https://github.com/melvenac/A2A-Hub.git
cd A2A-Hub
cp .env.example .env
# Edit .env with your values
```

### 2. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic SDK key |
| `CONVEX_URL` | Yes | Convex backend URL (default: `http://convex:3210`) |
| `HUB_BOOTSTRAP_KEY` | Yes | Key agents use to register |
| `HUB_URL` | Yes | Public URL of the hub |
| `PORT` | No | Server port (default: `4000`) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications |
| `TELEGRAM_GROUP_ID` | No | Telegram group for broadcasts |
| `GITHUB_PAT` | No | GitHub PAT for repo-fixer pushes |
| `CLASSIFIER_MODEL` | No | Anthropic model for classification (default: `claude-sonnet-4-20250514`) |
| `REPO_FIXER_MODEL` | No | Anthropic model for fix drafting (default: `claude-sonnet-4-20250514`) |
| `CONFIDENCE_THRESHOLD` | No | Classification confidence threshold (default: `0.85`) |

### 3. Start the Stack

```bash
docker compose up -d
```

This starts Traefik (SSL), Convex (database), and the hub.

### 4. Deploy Convex Functions

The Convex container starts empty — you must deploy the schema and functions:

```bash
# Generate the admin key
docker exec convex ./generate_admin_key.sh

# Deploy from your local machine
npx convex deploy --url http://<your-vps-ip>:3210 --admin-key "<generated-key>"
```

### 5. Verify

```bash
curl https://your-domain.com/health
# → {"status":"ok","agent":"Intelligent-Hub"}
```

### Deploying Updates

After pushing changes to GitHub:

```bash
# On VPS — pulls code, rebuilds Docker image, restarts hub
bash scripts/deploy.sh
```

## Data Model

Persistent state lives in Convex across 5 tables:

| Table | Purpose |
|-------|---------|
| `agents` | Registered agents (name, key hash, status, last seen) |
| `tasks` | Task lifecycle (pending → in-progress → completed) |
| `conversations` | Message history per task |
| `experiences` | Accumulated knowledge (trigger → action → outcome) with semantic search |
| `repoFixes` | Drafted repository improvements (pending human approval) |

## Development

```bash
npm install
npm run dev        # tsx watch mode
npm run build      # compile TypeScript
npm test           # run vitest
```

## Tech Stack

- **Runtime:** Node.js 20 + TypeScript (ES modules)
- **Server:** Express 5
- **Database:** Convex (self-hosted)
- **AI:** Anthropic SDK (model configurable per task)
- **Protocol:** A2A JS SDK
- **Testing:** Vitest
- **Deployment:** Docker + Docker Compose + Traefik (Let's Encrypt SSL)

## License

MIT
