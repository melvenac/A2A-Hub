# A2A Intelligent Hub — Docker CLI Deployment Guide

> **VPS:** ubuntu-DTX-2gb (172.86.123.176)
> **User:** melvenac
> **Approach:** Docker CLI — no Coolify, no orchestrators

## Prerequisites

- Docker + Docker Compose on VPS
- Node.js 20+ on VPS
- Anthropic API key
- Telegram bot token + group ID
- GitHub PAT (for repo-fixer)

## VPS Directory Structure

```
/home/melvenac/
├── projects/
│   └── a2a-hub/              # Source code (rsync from local)
├── docker-compose/
│   ├── a2a-hub/
│   │   ├── docker-compose.yml
│   │   └── .env              # Secrets (not in git)
│   └── convex/
│       └── docker-compose.yml
├── data/
│   ├── convex-data/          # Convex persistent storage
│   ├── backups/
│   └── logs/
└── scripts/                  # Utility scripts
```

---

## Step 1: Push Source to VPS

From your local machine:

```bash
cd ~/Projects/A2A-Hub
npm install
npx convex codegen
npm run build

# Sync to VPS
rsync -azv --exclude node_modules --exclude .env \
  ~/Projects/A2A-Hub/ melvenac@172.86.123.176:~/projects/a2a-hub/
```

---

## Step 2: Set Up Convex

On the VPS:

```bash
# Create data directory
mkdir -p ~/data/convex-data

# Create docker-compose for Convex
cat > ~/docker-compose/convex/docker-compose.yml << 'EOF'
services:
  convex:
    image: ghcr.io/get-convex/convex-backend:latest
    container_name: convex
    networks:
      - a2a
    ports:
      - "3210:3210"
    volumes:
      - ~/data/convex-data:/convex_data
    restart: unless-stopped

networks:
  a2a:
    name: a2a
    driver: bridge
EOF

# Start Convex
cd ~/docker-compose/convex
docker compose up -d

# Generate admin key (save this!)
docker exec convex ./generate_admin_key.sh
```

From your local machine, push the schema:

```bash
cd ~/Projects/A2A-Hub
npx convex deploy --url http://172.86.123.176:3210
```

---

## Step 3: Deploy the Hub

On the VPS:

```bash
# Install dependencies and build
cd ~/projects/a2a-hub
npm ci
npm run build

# Build Docker image
docker build -t a2a-hub:latest .
```

Create the compose file:

```bash
cat > ~/docker-compose/a2a-hub/docker-compose.yml << 'EOF'
services:
  a2a-hub:
    image: a2a-hub:latest
    container_name: a2a-hub
    networks:
      - a2a
    ports:
      - "4000:4000"
    env_file:
      - .env
    depends_on:
      - convex
    restart: unless-stopped

  convex:
    image: ghcr.io/get-convex/convex-backend:latest
    container_name: convex
    networks:
      - a2a
    ports:
      - "3210:3210"
    volumes:
      - ~/data/convex-data:/convex_data
    restart: unless-stopped

networks:
  a2a:
    name: a2a
    driver: bridge
EOF
```

Create the `.env` file (replace with your actual values):

```bash
cat > ~/docker-compose/a2a-hub/.env << 'EOF'
# Required
ANTHROPIC_API_KEY=sk-ant-...
CONVEX_URL=http://convex:3210
HUB_BOOTSTRAP_KEY=<run: openssl rand -hex 32>
HUB_URL=https://hub.tarrantcountymakerspace.com
PORT=4000

# Telegram
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_GROUP_ID=<your-group-id>

# Git operations
GITHUB_PAT=ghp_...
REPO_PATH=/tmp/Self-Improving-Agent

# LLM models (defaults to claude-sonnet-4-20250514)
CLASSIFIER_MODEL=claude-sonnet-4-20250514
REPO_FIXER_MODEL=claude-sonnet-4-20250514

# Tuning
CONFIDENCE_THRESHOLD=0.85
EOF
```

Generate a proper bootstrap key:

```bash
# Generate and copy this into .env as HUB_BOOTSTRAP_KEY
openssl rand -hex 32
```

Start everything:

```bash
cd ~/docker-compose/a2a-hub
docker compose up -d
```

---

## Step 4: Verify

```bash
# Check containers are running
docker ps

# Check logs
docker logs a2a-hub
docker logs convex

# Health check
curl http://localhost:4000/health
# Expected: {"status":"ok","agent":"Intelligent-Hub"}

# Agent card
curl http://localhost:4000/.well-known/agent-card.json
```

Check Telegram — you should see "Hub is online" in your group.

---

## Step 5: Traefik SSL (if not already configured)

Add labels to the a2a-hub service in docker-compose.yml:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.a2a-hub.rule=Host(`hub.tarrantcountymakerspace.com`)"
  - "traefik.http.routers.a2a-hub.entrypoints=websecure"
  - "traefik.http.routers.a2a-hub.tls.certresolver=letsencrypt"
  - "traefik.http.services.a2a-hub.loadbalancer.server.port=4000"
```

---

## Step 6: Run Wrapper Agents

### Your wrapper (Clark)

From your local machine:

```bash
cd ~/Projects/Self-Improving-Agent/wrapper
npm install
npx tsx src/index.ts \
  --hub https://hub.tarrantcountymakerspace.com \
  --key <your-bootstrap-key> \
  --name clark
```

### Brian's wrapper (Alice)

Brian runs from his machine:

```bash
git clone https://github.com/melvenac/Self-Improving-Agent.git
cd Self-Improving-Agent/wrapper
npm install
npx tsx src/index.ts \
  --hub https://hub.tarrantcountymakerspace.com \
  --key <key-you-give-brian> \
  --name alice
```

---

## Updating the Hub

When you make code changes locally:

```bash
# Local: build and sync
cd ~/Projects/A2A-Hub
npm run build
rsync -azv --exclude node_modules --exclude .env \
  ~/Projects/A2A-Hub/ melvenac@172.86.123.176:~/projects/a2a-hub/

# VPS: rebuild image and restart
ssh melvenac@172.86.123.176
cd ~/projects/a2a-hub
npm ci && npm run build
docker build -t a2a-hub:latest .
cd ~/docker-compose/a2a-hub
docker compose down
docker compose up -d
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Hub can't reach Convex | Check `CONVEX_URL` uses Docker network name (`http://convex:3210`), not localhost |
| Telegram bot not posting | Verify bot token + group ID, ensure bot is added to the group |
| Wrapper can't connect | Check Hub URL is publicly accessible, verify API key matches |
| `npx convex deploy` fails | Ensure Convex container is running and port 3210 is accessible from local |
| Docker build fails on `dist/` | Run `npm run build` before `docker build` — Dockerfile copies `dist/` |
| Convex types missing | Run `npx convex codegen` before `npm run build` |
