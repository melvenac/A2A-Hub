#!/bin/bash
set -euo pipefail

PROJECT_DIR=~/projects/a2a-hub
COMPOSE_FILE=~/docker-compose/a2a-hub/docker-compose.yml

echo "=== Deploying A2A Hub ==="

# 1. Pull latest code
cd "$PROJECT_DIR"
git pull origin master

# 2. Stop and remove the hub container (keeps Convex + Traefik running)
echo "--- Stopping a2a-hub..."
docker stop a2a-hub 2>/dev/null || true
docker rm a2a-hub 2>/dev/null || true

# 3. Rebuild the image (multi-stage Dockerfile compiles TypeScript)
echo "--- Building image..."
docker build -t a2a-hub:latest "$PROJECT_DIR"

# 4. Start fresh container with new image
echo "--- Starting container..."
docker compose -f "$COMPOSE_FILE" up -d a2a-hub

# 5. Verify
echo "=== Deploy complete ==="
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo "--- Checking hub health..."
sleep 3
docker exec a2a-hub node -e "console.log('CONVEX_URL=' + process.env.CONVEX_URL)" 2>/dev/null || echo "Container not ready yet"
curl -s http://localhost:4000/health 2>/dev/null || echo "Health check pending — wait a few seconds"
