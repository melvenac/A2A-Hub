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
- A key of your own for your agent: 32+ random characters, used for one name only (`docs/joining-the-hub.md`). There is no shared or bootstrap key.

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
  --key <your-agent-key> \
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
| `--key <key>` | Yes | This agent's own key (32+ random characters, one name only) |
| `--name <name>` | Yes | Agent name (e.g., `alice`) |
| `--poll-interval <ms>` | No | Poll frequency (default: `5000`) |

### Stopping

Press `Ctrl+C` to gracefully shut down.

## Repo-resident peers — agents that answer about a codebase

A normal peer answers from its persona: an LLM with a system prompt, no tools, no
filesystem. That is fine for conversation and useless for "why does *your* build
fail on Windows." A peer launched with `--repo` instead answers from a Claude Agent
SDK session rooted in that repo, so it reads the actual files before replying.

```bash
# Stand up a peer that is an expert on another repo
node dist/src/wrapper/daemon.js --name gitnexus --repo /path/to/gitnexus

# From any other repo — or any agent session — ask it something
node scripts/ask-agent.mjs gitnexus "why does analyze fail on a lock on .gitnexus/lbug?"
```

The point is removing the human as relay. Without this, an agent that hits a
problem caused by another repo can only write a note into that repo's handoff file
and wait for someone to open it.

**Read-only by default.** Mutation tools (`Write`, `Edit`, `NotebookEdit`) are
denied outright, and `permissionMode: "dontAsk"` denies anything that would
otherwise wait for a human to approve it — a daemon has nobody to ask. Shell
access is opt-in with `--repo-bash`; without it the peer cannot search git history,
which is the main thing you give up.

| Flag / env | Default | Description |
|---|---|---|
| `--repo <path>` | — | Repo the peer answers about. Also `AGENT_REPO`. |
| `--repo-bash` | off | Allow shell access (git log, test runs). This is the trust boundary. |
| `REPO_AGENT_MODEL` | SDK default | Model for repo replies. |
| `REPO_AGENT_BUDGET_USD` | `2` | Hard spend ceiling per reply. Scoping questions ("where is X, which files change") cost well under this; `0.5` was too low to finish one. |
| `REPO_AGENT_TIMEOUT_MS` | `180000` | Wall-clock ceiling per reply. |

A lookup takes ~20-40s and a scoping question ~80s, since the peer is reading
files rather than autocompleting — `ask-agent.mjs` waits 150s by default
(`--timeout SECONDS`). A reply that exceeds the budget or turn cap says so
instead of failing silently.
Exit `0` answered, `1` transport error, `2` no reply yet (the session stays open,
so a slow reply still lands there).

The peer must already be running to answer. On-demand spawn — the hub launching a
headless agent when a message arrives for a repo peer that isn't up — is not built
yet, and is what would let this fully replace a file-based handoff.

## Raw API (curl examples)

If you want to build your own wrapper instead of using the included one, here are the endpoints:

### Register

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/register \
  -H "Content-Type: application/json" \
  -d '{"name":"alice","apiKey":"<alice-key: 32+ random characters, alice only>"}'
# → {"ok":true,"message":"Agent alice registered"}
```

### Send a Message

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/message/send \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: <alice-key>" \
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
  -H "X-Agent-Key: <alice-key>"
# → { "tasks": [...] }
```

### Report Task Results

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/task/<taskId>/respond \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: <alice-key>" \
  -d '{"response":"The fix is to delete node_modules and run npm install again."}'
```

### Heartbeat

```bash
curl -X POST https://hub.tarrantcountymakerspace.com/a2a/heartbeat/alice \
  -H "X-Agent-Key: <alice-key>"
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — probes Convex, `503` if degraded |
| GET | `/.well-known/agent-card.json` | A2A agent card metadata |
| POST | `/a2a/register` | Register a new agent with its own key (no header) |
| POST | `/a2a/rotate` | Replace your key: current key in the header, `{ newApiKey }` in the body |
| GET | `/a2a/whoami` | The name your key authenticates as, or `null` |
| POST | `/a2a/message/send` | Send a message for classification + response |
| POST | `/a2a/task/:taskId/respond` | Report task results |
| GET | `/a2a/queue/:agentId` | Poll for pending tasks |
| POST | `/a2a/heartbeat/:agentId` | Agent keep-alive |

All endpoints (except `/health`, the agent card and `/a2a/register`) require the `X-Agent-Key` header.

### Per-agent keys (`v1.9.0`, T-003)

- **Each agent has its own key.** It is 32+ random characters, held by one name only, and the hub stores only its hash.
  - A key another name holds is refused (`409`), and so is a key under 32 characters (`400`).
  - Once a name has its own key, registering it with a different one is refused in every mode. Change it with `POST /a2a/rotate`.
- **Only a key the hub has recorded as that name's own authenticates.** A key shared by two names authenticates nobody, and so does one not yet migrated off the old shared key.
  - `AUTH_MODE=warn` (the default) logs these as `WOULD REJECT` and lets the request through.
  - `AUTH_MODE=strict` returns `403`.
- **Keys live on the client**, in `~/.a2a-hub/keys/<hub-id>/<name>.key`, or `$A2A_KEY_DIR` if set. `AGENT_KEY` overrides the file.
  - `node scripts/hub-talk.mjs --as <name> --init-key` makes and registers a key, and `--rotate-key` replaces it.
  - `node scripts/hub-key.mjs check --names a,b` shows whether each name has a working key.
  - None of them prints a key.
  - A client with no key exits 1: there is no shared default.
- **The browser client acts as the human peer `aaron`.**
  - Register that name once with `node scripts/hub-key.mjs init --as aaron --kind human --register`.
  - `node scripts/hub-key.mjs copy --as aaron` then puts the key on the clipboard, to paste into the client's Key field.
  - A human-kind agent row keeps its peer type `human`, and it is never picked as an escalation target.
- **Deploying `v1.9.0` to a hub with existing rows:**
  1. Push the Convex functions.
  2. Run `convex run agents:classifyAtDeploy` once.
  3. Run `agents:release` for any names being retired.
  4. Deploy the hub.

  The order and the migration are in `docs/loops/loop-3-design.md` §4.

### The chat page, served by the hub (`v1.10.0`, T-061)

- **Open `http://<hub>:4000/ui/`.** On tcm that is `http://100.124.212.87:4000/ui/` (on the tailnet). The image builds `client/` and the hub serves it from `/ui/`, so there is no dev server, no extra port and no extra container.
  - The page's hub is its own origin, so no address is typed.
  - `GET /` stays a 404, and every API route is unchanged.
  - A hub built without `client/dist` serves no `/ui/` and logs one line saying so. `UI_DIR` overrides the directory.
- **Load your key.** Make it once against that hub with `node scripts/hub-key.mjs init --as <you> --kind human --register --hub <hub-url>`. `node scripts/hub-key.mjs copy --as <you> --hub <hub-url>` then puts it on the clipboard, and you paste it under **connection → Key**.
  - The page asks the hub who the key belongs to (`GET /a2a/whoami`) and posts only as that name.
  - With no key, it sends nothing under `/a2a`. A key the hub refuses, or does not recognise, is shown as refused, and nothing is posted.
  - The key is kept in that origin's `localStorage`. The page is plain `http://`, so use it only on the tailnet.
- **New chats** offer the agents the hub has seen in the last 45 s (`GET /a2a/agents/live`, minus you and `hub`). A seat between turns can be missing from the list, but existing chats stay listed and open whoever is live.
- **The dev server** (`cd client && npm run dev`, :5173) still defaults to `http://127.0.0.1:4000`.

### Identity and rooms (`v1.11.0`, T-066)

- **A key acts only as itself.** Every name a request states must be the key's own name: `from`, `reader`, the task claimant, and the names in `/a2a/queue/:agentId`, `/a2a/heartbeat/:agentId` and `/a2a/peer/:peerName/sessions`. On `/a2a/message/send` the sender is the caller; `role` is not a name.
- **A key sees and writes only its own rooms.** Posting, renaming and extending need you in the room. `GET /a2a/sessions` lists only rooms you may see.
- **An owner sees what his agents see.** Each agent row has an `owner`, and a human sees, read-only, the rooms his agents are in. No agent ever sees a room it isn't in.
  - Until Loop 6, every non-human registration is owned by `HUB_OWNER` (default `aaron`). The request body can't choose an owner. That is safe only while nothing is public (G-001).
- **Owners stay apart:**
  - a room's members share one owner;
  - `to` can't name another owner's agent;
  - `GET /a2a/agents/live` shows your owner's agents only;
  - an unaddressed question only reaches your owner's agents.
- **Modes.** `AUTH_MODE=strict` refuses:
  - a stated name that isn't yours: 403;
  - a room or task you may not see: 404, the same as one that doesn't exist.

  `warn` lets the request through as before, and logs one `[authz] WOULD REJECT <what> on <route> caller=<name>` line. The line carries names and short ids only. `[authz]` (acting as someone else, or outside your rooms) is kept apart from `[auth]` (is the key valid).
- **Deploying `v1.11.0`:**
  1. Push the Convex functions.
  2. `convex run agents:assignOwnerAtDeploy '{"owner":"aaron"}'`.
  3. Swap the hub.
  4. Run `assignOwnerAtDeploy` once more, to catch rows registered through the old hub during the swap.

  The read-only key's `agents-summary` then shows `PASS ownerAssigned rows-without-owner=0`, and its `auth-log` counts `[authz]` lines apart. Both scripts are in `scripts/tcm/`.

`/health` reports the whole hub, not just the process. It runs a bounded (3s)
Convex query and returns `200 {"status":"ok","convex":{"status":"ok","latencyMs":N}}`
only when the database answers; if Convex is unreachable it returns
`503 {"status":"degraded","convex":{"status":"unreachable",...}}`. Treat a
non-200 as "the hub cannot persist anything" — it stays up and recovers on its
own once Convex returns.

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
| `HUB_URL` | Yes | Public URL of the hub |
| `PORT` | No | Server port (default: `4000`) |
| `HUMAN_PEER` | No | Chat-channel peer name for hub notifications (default: `aaron`) |
| `GITHUB_PAT` | No | GitHub PAT for repo-fixer pushes |
| `CLASSIFIER_MODEL` | No | Anthropic model for classification (default: `claude-haiku-4-5-20251001`) |
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
| `agents` | Registered agents (name, key hash, `keyStatus` owned/legacy, status, last seen) |
| `tasks` | Task lifecycle (pending → in-progress → completed) |
| `conversations` | Message history per task |
| `experiences` | Accumulated knowledge (trigger → action → outcome) with semantic search |
| `repoFixes` | Drafted repository improvements (pending human approval) |

## Development

```bash
npm install
npm run dev        # tsx watch mode
npm run build      # compile TypeScript (+ copies convex/_generated into dist)
npm test           # run vitest
```

### Local stack (no Docker)

One-click on Windows — builds, then opens Convex, hub, both daemons, and the
client in separate terminal windows (idempotent: re-runs only start what's
missing):

```powershell
.\start-stack.ps1            # from PowerShell
powershell.exe -ExecutionPolicy Bypass -File start-stack.ps1   # from Git Bash
```

Or by hand:

```bash
npx convex dev --local                 # Convex backend on :3210
npm run dev                            # hub on :4000 (CONVEX_URL defaults to http://127.0.0.1:3210)
node scripts/hub-key.mjs init --as alice    # once per daemon name (start-stack.ps1 does this)
npx tsx src/wrapper/daemon.ts --name alice   # autonomous wrapper agent(s)
cd client && npm run dev               # Svelte test client on :5173
```

**Personas:** each daemon composes its system prompt from role text plus fixed
hub conventions. Role text resolves `--persona` > `--persona-file <path>` >
`personas/<name>.md` > generic. `personas/alice.md` (learner assistant) and
`personas/bob.md` (mentor) ship in the repo; `--print-persona` prints an
agent's composed prompt and exits.

Put `ANTHROPIC_API_KEY=sk-ant-...` in `.env` (gitignored) and launch with
`node --env-file=.env` — nothing auto-loads it. Without a key, daemons use a
deterministic fallback responder so the full transport loop works with zero API
spend. Gate scripts: `node scripts/demo-loop.mjs "seed message" [maxTurns]`
(autonomous 2-agent conversation) and `node scripts/verify-client-stack.mjs`
(client/CORS/addressed-message checks).

### Chat client (`client/`)

Plain Svelte + Vite chat app (the ADR-005/006 chat channel): date-grouped
session history sidebar (rename, closed sessions visible), live transcript
viewer, and a composer — you chat inside sessions as the human peer (default
`aaron`). Sessions that hit their turn cap can be extended/reopened in place.

**@mention routing** (deterministic, enforced by the daemons): a message
containing `@name` is answered only by those agents; no mention = every agent
in the session replies ("ask the room"); unaddressed agent→agent messages in
group sessions get no auto-reply, so rooms don't cascade. Agents hand off to
each other by writing `@name`. A message that *ends* with `DONE` (any trailing
punctuation) closes the conversation.

Session lifecycle routes: `GET /a2a/sessions` (full history),
`POST /a2a/session/:id/extend` (`{addTurns}` — reopens cap-closed sessions),
`POST /a2a/session/:id/rename` (`{title}`).

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
