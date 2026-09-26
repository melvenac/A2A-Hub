#!/usr/bin/env bash
# Build only the Dockerfile's client stage from `git archive <ref>` and print the hashed asset names.
# Usage: client-hash.sh <ref> <outdir>
set -euo pipefail
REF="$1"; OUT="$2"
REPO=/c/Users/melve/Worktrees/a2a-qa
rm -rf "$OUT"; mkdir -p "$OUT/ctx" "$OUT/client"
git -C "$REPO" archive "$REF" client | tar -x -C "$OUT/ctx"
cp "$OUT"/ctx/client/package*.json "$OUT/client/"
( cd "$OUT/client" && npm ci --no-audit --no-fund --loglevel=error )
( cd "$OUT/ctx/client" && tar -cf - . ) | ( cd "$OUT/client" && tar -xf - )
( cd "$OUT/client" && npm run build >/dev/null )
echo "REF=$REF $(git -C "$REPO" rev-parse "$REF")"
ls "$OUT/client/dist/assets"
grep -o 'src="/ui/assets/[^"]*\.js"' "$OUT/client/dist/index.html"
