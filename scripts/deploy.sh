#!/bin/bash
set -euo pipefail

PROJECT_DIR=~/projects/a2a-hub
COMPOSE_FILE=~/docker-compose/a2a-hub/docker-compose.yml

echo "=== Deploying A2A Hub ==="

# Pull latest
cd "$PROJECT_DIR"
git pull origin main

# Remove dev-only files
rm -rf .agents CLAUDE.md reference README.md

# Install production deps
npm ci --production

# Rebuild and restart container
docker compose -f "$COMPOSE_FILE" up -d --build

echo "=== Deploy complete ==="
docker compose -f "$COMPOSE_FILE" ps
