#!/usr/bin/env bash
# Loop 4 stage replay (criteria G1(a)): the Dockerfile's stages run by hand into an /app-shaped
# directory, from `git archive <sha>` (so untracked node_modules/dist never enter the context, as
# .dockerignore intends). This is NOT the image: alpine, docker's .dockerignore and `docker inspect`
# are not observed. Usage: replay.sh <sha> <outdir> [client]
set -euo pipefail
SHA="$1"; OUT="$2"; WITH_CLIENT="${3:-}"
REPO="$(git rev-parse --show-toplevel)"
rm -rf "$OUT"; mkdir -p "$OUT/ctx" "$OUT/builder" "$OUT/app"
git -C "$REPO" archive "$SHA" | tar -x -C "$OUT/ctx"
step() { echo "[replay $SHA] $*"; }

# Stage: builder (Dockerfile lines 1-12)
step builder
cp "$OUT"/ctx/package*.json "$OUT/builder/"
( cd "$OUT/builder" && npm ci --no-audit --no-fund --loglevel=error )
cp "$OUT/ctx/tsconfig.json" "$OUT/builder/"
cp -r "$OUT/ctx/src" "$OUT/ctx/convex" "$OUT/builder/"
( cd "$OUT/builder" && npx tsc && cp -r convex/_generated dist/convex/_generated )

# Stage: client (candidate only)
if [ "$WITH_CLIENT" = "client" ]; then
  step client
  mkdir -p "$OUT/client"
  cp "$OUT"/ctx/client/package*.json "$OUT/client/"
  ( cd "$OUT/client" && npm ci --no-audit --no-fund --loglevel=error )
  ( cd "$OUT/ctx/client" && tar -cf - . ) | ( cd "$OUT/client" && tar -xf - )
  ( cd "$OUT/client" && npm run build )
fi

# Final stage
step final
cp "$OUT"/ctx/package*.json "$OUT/app/"
( cd "$OUT/app" && npm ci --production --no-audit --no-fund --loglevel=error )
cp -r "$OUT/builder/dist" "$OUT/app/dist"
cp -r "$OUT/ctx/convex" "$OUT/app/convex"
if [ "$WITH_CLIENT" = "client" ]; then
  mkdir -p "$OUT/app/client"
  cp -r "$OUT/client/dist" "$OUT/app/client/dist"
fi
step "done: $(ls "$OUT/app" | tr '\n' ' ')"
