#!/bin/bash
set -euo pipefail

PROJECT_DIR=~/projects/a2a-hub
COMPOSE_FILE=~/docker-compose/a2a-hub/docker-compose.yml

echo "=== Deploying A2A Hub ==="

# Pull latest
cd "$PROJECT_DIR"
git pull origin master

# Rebuild and restart container (dist/ is pre-built and committed)
docker compose -f "$COMPOSE_FILE" up -d --build a2a-hub

echo "=== Deploy complete ==="
docker compose -f "$COMPOSE_FILE" ps
