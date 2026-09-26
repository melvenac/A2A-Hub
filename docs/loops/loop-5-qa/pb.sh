#!/usr/bin/env bash
# PB for the Loop 5 deploy (docs/loops/loop-5-deploy-plan.md step 5), on the built image, before the
# swap. Loop 4's PB (loop-4-qa-criteria.md:240-260, loop-4-qa/pb.sh) plus two rows accepted by Relay
# (2026-09-26): PB2 asserts the whole /app listing and no .env* anywhere in /app outside
# node_modules (step 1 may copy .env into the build dir); PB0 is the id Relay relays from Rivet.
# Read-only on tcm except PB2's throwaway `docker run --rm --network none`, whose absence is read back.
# The save is streamed to local scratch; nothing is written on tcm.
# Usage: QA_TMP=... pb.sh <image-ref> <expected-id-prefix>
#   PB_SSH  overrides the remote runner (default: ssh BatchMode to melvenac@tcm). Used only to point
#           the script at a fake tcm for its own known-positive / known-negative runs.
set -uo pipefail
IMG="$1"; EXPECT="$2"
read -r -a SSH <<<"${PB_SSH:-ssh -o BatchMode=yes -o ConnectTimeout=10 melvenac@tcm}"
K="$(cd "$(dirname "$0")/../loop-4-qa" && pwd -W)/k.mjs"  # Windows form: node cannot resolve /c/... under MSYS_NO_PATHCONV
: "${QA_TMP:?QA_TMP not set}"
OUT="$QA_TMP/pb"; rm -rf "$OUT"; mkdir -p "$OUT"
fail=0; say() { echo "$*"; }
verdict() { if [ "$2" = ok ]; then say "PASS $1: $3"; else say "FAIL $1: $3"; fail=1; fi; }
say "PB start $(date -u +%FT%TZ) image=$IMG expect=$EXPECT runner=${SSH[*]}"

# PB0: which image is this? The ID must contain the prefix Rivet reported.
ID="$("${SSH[@]}" "docker image inspect --format '{{.Id}}' $IMG")" || { say "FAIL PB0: cannot inspect $IMG"; say "PB OVERALL: FAIL"; exit 1; }
ID="$(printf '%s' "$ID" | tr -d '\r')"
say "image $IMG = $ID"
case "$ID" in sha256:*"$EXPECT"*) verdict PB0 ok "id matches Rivet's ($EXPECT)";; *) verdict PB0 no "id $ID does not contain $EXPECT"; say "PB OVERALL: FAIL"; exit 1;; esac

# PB1: CMD, entrypoint, exposed ports, workdir
CFG="$("${SSH[@]}" "docker image inspect --format '{{json .Config.Cmd}}|{{json .Config.Entrypoint}}|{{json .Config.ExposedPorts}}|{{.Config.WorkingDir}}' $ID" | tr -d '\r')"
say "PB1 config: $CFG"
IFS='|' read -r CMD ENTRY PORTS WD <<<"$CFG"
[ "$CMD" = '["node","dist/src/index.js"]' ] && [ "$PORTS" = '{"4000/tcp":{}}' ] && [ "$WD" = /app ] && { [ "$ENTRY" = null ] || [ "$ENTRY" = '["docker-entrypoint.sh"]' ]; } \
  && verdict PB1 ok "Cmd $CMD, ExposedPorts $PORTS, WorkingDir $WD, Entrypoint $ENTRY" \
  || verdict PB1 no "Cmd $CMD, ExposedPorts $PORTS, WorkingDir $WD, Entrypoint $ENTRY"

# PB2: /app/client holds dist/ only; /app holds exactly the final stage's six entries; no .env* in /app
# outside node_modules. One throwaway container, no network, no env, no mounts.
LIST="$("${SSH[@]}" docker run --rm --network none --entrypoint sh "$ID" -c "'ls -A /app/client; echo ---; find /app/client -name node_modules -o -name src -maxdepth 3; echo ---; ls -A /app/client/dist; echo ---; ls -A /app; echo ---; find /app -path /app/node_modules -prune -o -name \".env*\" -print; echo ---; echo END'")"; rc=$?
say "PB2 listing (rc $rc):"; say "$LIST"
sec() { printf '%s\n' "$LIST" | tr -d '\r' | awk -v n="$1" 'BEGIN{RS="---\n"} NR==n' | xargs; }
TOP="$(sec 1)"; BAD="$(sec 2)"; DIST="$(sec 3)"; ENV="$(sec 5)"; END="$(sec 6)"
APP="$(sec 4 | tr ' ' '\n' | LC_ALL=C sort | xargs)"  # ls order is locale-dependent; compare as a set
# The END sentinel proves the listing ran to completion: an empty ENV section is only "none" if END arrived.
[ "$rc" -eq 0 ] && [ "$END" = END ] || verdict PB2.complete no "listing rc $rc, sentinel [$END]; undetermined"
[ "$TOP" = dist ] && [ -z "$BAD" ] && [[ " $DIST " == *" index.html "* ]] && [[ " $DIST " == *" assets "* ]] \
  && verdict PB2 ok "/app/client = [$TOP]; node_modules/src under it: none; dist = [$DIST]" \
  || verdict PB2 no "/app/client = [$TOP]; node_modules/src: [$BAD]; dist = [$DIST]"
[ "$APP" = "client convex dist node_modules package-lock.json package.json" ] \
  && verdict PB2.app ok "/app = [$APP]" || verdict PB2.app no "/app = [$APP], expected the final stage's six entries"
[ "$END" = END ] && [ -z "$ENV" ] && verdict PB2.no-env ok "no .env* under /app outside node_modules" \
  || verdict PB2.no-env no "found [$ENV] (sentinel [$END])"
# Fails closed: an erroring docker ps is not "none left" (Loop 4 run 1 reported 0 from an error).
if "${SSH[@]}" "docker ps -a --filter ancestor=$ID --format '{{.ID}} {{.Status}}'" > "$OUT/ps-after-run.txt"; then
  n=$(grep -c . "$OUT/ps-after-run.txt"); [ "$n" -eq 0 ] && verdict PB2.no-container-left ok "docker ps -a --filter ancestor=<id>: 0 rows" || verdict PB2.no-container-left no "$n container(s) left"
else verdict PB2.no-container-left no "docker ps errored; undetermined"; fi
# Detector positive: the running a2a-hub container's image (after step 4, :prev = the running v1.10.0
# image) must be seen by the same filter shape, or the 0 above means nothing.
POS="$("${SSH[@]}" "docker ps -a --filter ancestor=a2a-hub:prev --format '{{.ID}} {{.Status}}'" | grep -c .)"
say "detector positive: containers from a2a-hub:prev seen by the same filter: $POS (expect >= 1)"
[ "$POS" -ge 1 ] || verdict PB2.no-container-left no "filter did not see a known container; undetermined"

# PB3: K over the streamed save. K's selftest first (planted positive, gzip layer, fail-closed on opaque).
node "$K" --selftest > "$OUT/k-selftest.log" 2>&1; st=$?
say "K selftest: $(tail -1 "$OUT/k-selftest.log") (exit $st)"
if [ $st -ne 0 ]; then verdict PB3 no "K selftest failed; no scan counts"; else
  "${SSH[@]}" "docker save $ID" > "$OUT/save.tar"; sv=$?
  sz=$(stat -c %s "$OUT/save.tar"); say "docker save streamed: exit $sv, $sz bytes"
  node "$K" "PB3.image-save=$OUT/save.tar" > "$OUT/k-scan.log" 2>&1; ks=$?
  say "$(tail -1 "$OUT/k-scan.log")"
  [ $sv -eq 0 ] && [ "$sz" -gt 0 ] && [ $ks -eq 0 ] && verdict PB3 ok "0 hits, no opaque layer" || verdict PB3 no "save exit $sv ($sz bytes), K exit $ks"
fi
# Cleanup (Relay's Loop 4 conditions): delete the local save; read back absence here and on tcm.
rm -f "$OUT/save.tar"
[ ! -e "$OUT/save.tar" ] && [ -z "$(ls "$QA_TMP" | grep -E '^k-positive')" ] && verdict PB3.cleanup-local ok "save.tar and K scratch gone" || verdict PB3.cleanup-local no "local scratch remains"
if REM="$("${SSH[@]}" "ls -A ~ /tmp")"; then
  HIT="$(printf '%s\n' "$REM" | tr -d '\r' | grep -iE '(^|[^a-z])qa[-_]|k-positive|save\.tar|pb' || true)"
  [ -z "$HIT" ] && verdict PB3.cleanup-tcm ok "no QA-named file in ~ or /tmp on tcm ($(printf '%s\n' "$REM" | grep -c .) lines read)" || verdict PB3.cleanup-tcm no "found: $HIT"
else verdict PB3.cleanup-tcm no "ls on tcm errored; undetermined"; fi
say "PB OVERALL: $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
