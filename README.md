# A2A Intelligent Hub

A central coordination server for agent-to-agent (A2A) communication. The hub receives messages from wrapper agents, classifies root causes, stores lessons learned, drafts repo fixes, and escalates tasks between connected agents.

**Agent-agnostic** — any A2A-compliant agent can participate regardless of LLM backend (Claude, Gemini, Grok, OpenAI, local models).

## Architecture

```
Wrapper Agents (any LLM backend)
    ↕ HTTP (register, poll, report)
A2A Intelligent Hub (Express 5, port 4000)
    ↕ Convex Client
Convex Backend (self-hosted, port 3210)
    ↕
Telegram Bot API (notifications, approvals)
Anthropic API (classifier + repo-fixer)
GitHub (push approved fixes)
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Anthropic API key
- Telegram bot token + group ID (optional but recommended)

### Local Development

```bash
git clone https://github.com/melvenac/A2A-Hub.git
cd A2A-Hub
npm install

# Generate Convex types (required before first build)
npx convex codegen

# Copy and fill in env vars
cp .env.example .env

# Start dev server
npm run dev
```

### Deploy to VPS

See [DEPLOY.md](DEPLOY.md) for full Docker deployment instructions.

**Quick version:**

```bash
# On VPS
cd ~/projects/a2a-hub
npm ci && npm run build
docker build -t a2a-hub:latest .

# Start with docker-compose
cd ~/docker-compose/a2a-hub
docker-compose up -d
```

## Running a Wrapper Agent

Wrapper agents connect to the hub, poll for tasks, and respond using any LLM backend.

### Setup

The wrapper lives in the [Self-Improving-Agent](https://github.com/melvenac/Self-Improving-Agent) repo:

```bash
cd ~/Projects/Self-Improving-Agent/wrapper
npm install
```

### Register and Start

```bash
npx tsx src/index.ts \
  --hub https://hub.tarrantcountymakerspace.com \
  --key <your-agent-key> \
  --name <your-agent-name>
```

Expected output:
```
Registered: Agent <name> registered
Wrapper started for <name>
Polling https://hub.tarrantcountymakerspace.com every 5000ms
```

### How It Works

1. **Register** — Wrapper sends its name and API key to the hub
2. **Poll** — Wrapper polls `/a2a/queue/:agentId` every 5 seconds for assigned tasks
3. **Execute** — When a task arrives, the wrapper pipes it to the LLM (e.g., `claude --print`)
4. **Report** — Wrapper sends the response back to `/a2a/task/:taskId/respond`

## API Endpoints

| Route | Method | Purpose |
|---|---|---|
| `/.well-known/agent-card.json` | GET | A2A agent card metadata |
| `/health` | GET | Health check |
| `/a2a/message/send` | POST | Send a message to the hub |
| `/a2a/register` | POST | Register a new wrapper agent |
| `/a2a/queue/:agentId` | GET | Poll for assigned tasks |
| `/a2a/task/:taskId/respond` | POST | Report task results |
| `/a2a/heartbeat/:agentId` | POST | Agent heartbeat |

### Authentication

All agent endpoints require an `X-Agent-Key` header.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API access (for classifier + repo-fixer) |
| `CONVEX_URL` | Yes | Convex backend URL |
| `HUB_BOOTSTRAP_KEY` | Yes | Admin key for agent registration |
| `HUB_URL` | Yes | Public URL of this hub |
| `PORT` | No | Server port (default: 4000) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications |
| `TELEGRAM_GROUP_ID` | No | Telegram group ID for broadcasts |
| `GITHUB_PAT` | No | GitHub PAT for pushing approved fixes |
| `REPO_PATH` | No | Local repo path for fix drafting |
| `CLASSIFIER_MODEL` | No | LLM model for classification (default: claude-sonnet-4-20250514) |
| `REPO_FIXER_MODEL` | No | LLM model for repo fix drafting (default: claude-sonnet-4-20250514) |
| `CONFIDENCE_THRESHOLD` | No | Min confidence for auto-actions (default: 0.85) |

## How the Hub Processes Messages

1. **Receive** — Agent sends a message via A2A protocol
2. **Classify** — Hub classifies the root cause (repo-docs, repo-script, repo-config, user-env, user-error)
3. **Search Memory** — Check Convex for similar past experiences
4. **Respond or Escalate** — If memory has an answer, respond directly. Otherwise, escalate to an available agent
5. **Store Lesson** — Save the trigger/action/context/outcome as a new experience
6. **Draft Fix** — If the issue is repo-related, draft a documentation/config fix
7. **Notify** — Broadcast activity to Telegram group, request approval for fixes

## Tech Stack

- **Runtime:** Node.js + TypeScript (ES modules)
- **Server:** Express 5
- **Database:** Convex (self-hosted)
- **AI:** Anthropic SDK (model configurable per task)
- **Protocol:** A2A JS SDK
- **Notifications:** Telegram Bot API
- **Testing:** Vitest
- **Deployment:** Docker + Docker Compose

## License

MIT
