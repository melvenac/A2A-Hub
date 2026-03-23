# A2A Intelligent Hub — Standalone Docker Deployment Guide

## Prerequisites

- Docker + Docker Compose on your VPS
- A2A Hub repo cloned locally
- Anthropic API key
- Telegram bot token + group ID
- GitHub PAT (for repo-fixer git push)

---

## Step 1: Local Setup

Clone and build locally to test before deploying:

```bash
cd ~/Projects/A2A-Hub
npm install
npm run build
```

Verify the build succeeded and `dist/` exists:
```bash
ls dist/index.js
```

---

## Step 2: Deploy Self-Hosted Convex

The Hub needs Convex for persistent state. On your VPS:

```bash
# Create directories
mkdir -p ~/docker-compose/convex ~/data/convex-data

# Start Convex container
docker run -d \
  --name convex \
  --network a2a-hub \
  -p 3210:3210 \
  -v ~/data/convex-data:/convex_data \
  ghcr.io/get-convex/convex-backend:latest
```

### Initialize Convex schema

From your local machine, push the schema:

```bash
cd ~/Projects/A2A-Hub
npx convex deploy --url http://<your-vps-ip>:3210
```

This creates all 5 tables (experiences, tasks, agents, conversations, repoFixes).

---

## Step 3: Deploy the Hub on VPS

Copy your project to the VPS:

```bash
rsync -azv ~/Projects/A2A-Hub melvenac@<vps-ip>:~/projects/
```

On the VPS, build and run:

```bash
cd ~/projects/A2A-Hub
npm ci
npm run build

docker build -t a2a-hub:latest .
docker run -d \
  --name a2a-hub \
  --network a2a-hub \
  -p 4000:4000 \
  -e CONVEX_URL=http://convex:3210 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e GITHUB_PAT=ghp_... \
  -e TELEGRAM_BOT_TOKEN=123456:ABC... \
  -e TELEGRAM_GROUP_ID=-100... \
  -e HUB_BOOTSTRAP_KEY=your-bootstrap-key \
  -e HUB_URL=https://your-domain.com \
  -e REPO_PATH=/tmp/Self-Improving-Agent \
  -e CONFIDENCE_THRESHOLD=0.85 \
  -e PORT=4000 \
  a2a-hub:latest
```

### Or use docker-compose (recommended)

Create `~/docker-compose/a2a-hub/docker-compose.yml`:

```yaml
version: "3.8"
services:
  a2a-hub:
    build:
      context: ~/projects/a2a-hub
      dockerfile: Dockerfile
    container_name: a2a-hub
    networks:
      - a2a
    ports:
      - "4000:4000"
    environment:

      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      GITHUB_PAT: ${GITHUB_PAT}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_GROUP_ID: ${TELEGRAM_GROUP_ID}
      CONVEX_URL: http://convex:3210
      HUB_BOOTSTRAP_KEY: ${HUB_BOOTSTRAP_KEY}
      HUB_URL: ${HUB_URL}
      REPO_PATH: /tmp/Self-Improving-Agent
      CONFIDENCE_THRESHOLD: "0.85"
      PORT: "4000"
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
    driver: bridge
```

Create `.env` in the same directory:

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_PAT=ghp_...
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_GROUP_ID=-100...
HUB_BOOTSTRAP_KEY=your-generated-key
HUB_URL=https://hub.tarrantcountymakerspace.com
```

Then deploy:

```bash
cd ~/docker-compose/a2a-hub
docker-compose up -d
```

---

## Step 4: Verify Deployment

Check container logs:

```bash
docker logs a2a-hub
docker logs convex
```

Health check from local machine:

```bash
# Replace with your VPS IP or domain
curl http://<vps-ip>:4000/health
# Expected: {"status":"ok","agent":"Intelligent-Hub"}

# Agent Card
curl http://<vps-ip>:4000/.well-known/agent-card.json
# Expected: Full agent card JSON with 3 skills
```

Check Telegram — bot should post "Hub is online" in your group.

---

## Step 5: Set Up Reverse Proxy (Optional)

Use Traefik or Nginx to expose the hub via HTTPS. With Traefik labels in docker-compose:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.a2a-hub.rule=Host(`hub.tarrantcountymakerspace.com`)"
  - "traefik.http.routers.a2a-hub.entrypoints=websecure"
  - "traefik.http.routers.a2a-hub.tls.certresolver=letsencrypt"
  - "traefik.http.services.a2a-hub.loadbalancer.server.port=4000"
```

---

## Step 6: Run Your Local Wrapper (Clark)

Wrapper code lives in Self-Improving-Agent repo. From local machine:

```bash
cd ~/Projects/Self-Improving-Agent/wrapper
npm install
npx tsx src/index.ts \
  --hub https://hub.tarrantcountymakerspace.com \
  --key <your-bootstrap-key> \
  --name clark
```

Expected output:
```
Registered: Agent clark registered
Wrapper started for clark
Polling https://hub.tarrantcountymakerspace.com every 5000ms
```

---

## Step 7: Test with Others

1. **Generate agent keys:**
   ```bash
   # Call Hub's key generation endpoint
   curl -X POST http://<vps-ip>:4000/api/agents/register \
     -H "X-Bootstrap-Key: <your-bootstrap-key>" \
     -H "Content-Type: application/json" \
     -d '{"name": "alice"}'
   ```

2. **Run another wrapper:**
   ```bash
   npx tsx src/index.ts \
     --hub https://hub.tarrantcountymakerspace.com \
     --key <alices-key> \
     --name alice
   ```

---

## Step 8: Release

After testing:

```bash
git tag -a v1.0.0 -m "A2A Intelligent Hub v1 — Standalone"
git push origin master --tags
```

---

## Future: Eliminate API Key Dependency

Currently the Hub makes two small API calls via `ANTHROPIC_API_KEY`:
- **Classifier** (`classifier.ts`) — 50 tokens max per call, categorizes root causes
- **Repo Fixer** (`repo-fixer.ts`) — 2000 tokens max, drafts doc fixes (occasional)

All heavy LLM work already runs through Claude Max subscription via wrapper `claude --print`.

**Options to evaluate later:**
1. **Route through wrappers** — Hub sends classification/fix-drafting tasks to a connected wrapper agent instead of calling the API directly. Zero API cost, all LLM calls use subscription.
2. **Install Claude Code on VPS** — Hub uses `claude --print` on the server. Requires authenticating Claude Code there.
3. **Keep hybrid** — Current approach. API costs are ~$0.01/day at moderate usage.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Hub can't reach Convex | Check `CONVEX_URL` — use Docker internal network name, not localhost |
| Telegram bot not posting | Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_GROUP_ID`, ensure bot is in the group |
| Wrapper can't connect | Check Hub URL is publicly accessible, verify API key |
| `npx convex deploy` fails | Ensure Convex service is running and port 3210 is accessible |
| Docker build fails on `dist/` | Use the multi-stage Dockerfile above |
