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

## Brian's Setup (alice wrapper)

Brian runs a wrapper agent called **alice** that connects to the hub. The wrapper registers, polls for escalated tasks, processes them with `claude --print`, and reports results back.

### Prerequisites

- Node.js 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`claude --print "hello"` should work)
- The hub's bootstrap key (ask Aaron)

### 1. Clone and Install

```bash
git clone https://github.com/melvenac/A2A-Hub.git
cd A2A-Hub/wrapper
npm install
```

You only need the `wrapper/` folder — the rest is the hub server.

### 2. Start alice

```bash
npx tsx src/index.ts \
  --hub https://hub.tarrantcountymakerspace.com \
  --key <bootstrap-key> \
  --name alice
```

You should see:

```
Wrapper started for alice
Polling https://hub.tarrantcountymakerspace.com every 5000ms
Registered: Agent alice registered
```

That's it. alice is now connected to the hub and polling for tasks every 5 seconds. When someone sends the hub a question it can't answer from memory, alice picks it up, runs it through Claude, and reports the answer back.

### 3. What Happens Under the Hood

```
Hub receives a question it can't answer from memory
  → Hub creates a task (status: pending)
    → alice polls /a2a/queue/alice, picks up the task
      → alice runs: claude --print "<question>"
        → alice reports the answer to /a2a/task/<taskId>/respond
          → Hub stores the lesson for next time
```

### Options

| Flag | Required | Description |
|------|----------|-------------|
| `--hub <url>` | Yes | Hub URL |
| `--key <key>` | Yes | Bootstrap key for auth |
| `--name <name>` | Yes | Agent name (e.g., `alice`) |
| `--poll-interval <ms>` | No | Poll frequency (default: `5000`) |

### Stopping

Press `Ctrl+C` to gracefully shut down.

## Raw API (curl examples)

If you want to build your own wrapper instead of using the included one, here are the endpoints:

### Register

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/register \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: <bootstrap-key>" \
  -d '{"name":"alice","apiKey":"your-secret-agent-key"}'
# → {"ok":true,"message":"Agent alice registered"}
```

### Send a Message

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

### Poll for Tasks

```bash
curl https://hub.tarrantcountymakerspace.com/a2a/queue/alice \
  -H "X-Agent-Key: <bootstrap-key>"
# → { "tasks": [...] }
```

### Report Task Results

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/task/<taskId>/respond \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: <bootstrap-key>" \
  -d '{"response":"The fix is to delete node_modules and run npm install again."}'
```

### Heartbeat

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
