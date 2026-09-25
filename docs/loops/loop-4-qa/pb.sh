#!/usr/bin/env bash
# PB1-PB3 (loop-4-qa-criteria.md, ruling 2; PB3 as modified by Relay: the save is streamed to the
# QA scratch dir, nothing is written on tcm). Read-only on tcm: image inspect, a `docker run --rm
# --network none` listing, `docker save` to stdout. Usage: pb.sh <image-id-or-ref> <expected-id-prefix>
set -uo pipefail
IMG="$1"; EXPECT="$2"
TCM="melvenac@tcm"; SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 "$TCM")
QA="$(cd "$(dirname "$0")" && pwd -W)"  # Windows form: node cannot resolve /c/... under MSYS_NO_PATHCONV
: "${QA_TMP:?QA_TMP not set}"
OUT="$QA_TMP/pb"; rm -rf "$OUT"; mkdir -p "$OUT"
fail=0; say() { echo "$*"; }
verdict() { if [ "$2" = ok ]; then say "PASS $1: $3"; else say "FAIL $1: $3"; fail=1; fi; }

# Which image is this? The ID must match what Rivet reported.
ID="$("${SSH[@]}" "docker image inspect --format '{{.Id}}' $IMG")" || { say "FAIL PB0: cannot inspect $IMG"; exit 1; }
say "image $IMG = $ID"
case "$ID" in *"$EXPECT"*) verdict PB0 ok "id matches Rivet's ($EXPECT)";; *) verdict PB0 no "id $ID does not contain $EXPECT"; exit 1;; esac

# PB1: CMD and exposed ports
CFG="$("${SSH[@]}" "docker image inspect --format '{{json .Config.Cmd}}|{{json .Config.Entrypoint}}|{{json .Config.ExposedPorts}}|{{.Config.WorkingDir}}' $ID")"; [ -n "$CFG" ] || { verdict PB1 no "inspect returned nothing"; }
say "PB1 config: $CFG"
IFS='|' read -r CMD ENTRY PORTS WD <<<"$CFG"
[ "$CMD" = '["node","dist/src/index.js"]' ] && [ "$PORTS" = '{"4000/tcp":{}}' ] && [ "$WD" = /app ] && { [ "$ENTRY" = null ] || [ "$ENTRY" = '["docker-entrypoint.sh"]' ]; } \
  && verdict PB1 ok "Cmd $CMD, ExposedPorts $PORTS, WorkingDir $WD, Entrypoint $ENTRY" \
  || verdict PB1 no "Cmd $CMD, ExposedPorts $PORTS, WorkingDir $WD, Entrypoint $ENTRY"

# PB2: /app/client holds dist/ only (no node_modules, no src), in a throwaway container with no network
LIST="$("${SSH[@]}" docker run --rm --network none --entrypoint sh "$ID" -c "'ls -A /app/client; echo ---; find /app/client -name node_modules -o -name src -maxdepth 3; echo ---; ls -A /app/client/dist; echo ---; ls /app'")"
say "PB2 listing:"; say "$LIST"
TOP="$(printf '%s\n' "$LIST" | awk 'BEGIN{RS="---\n"} NR==1' | tr -d '\r' | xargs)"
BAD="$(printf '%s\n' "$LIST" | awk 'BEGIN{RS="---\n"} NR==2' | tr -d '\r' | xargs)"
DIST="$(printf '%s\n' "$LIST" | awk 'BEGIN{RS="---\n"} NR==3' | tr -d '\r' | xargs)"
[ "$TOP" = dist ] && [ -z "$BAD" ] && [[ " $DIST " == *" index.html "* ]] && [[ " $DIST " == *" assets "* ]] \
  && verdict PB2 ok "/app/client = [$TOP]; node_modules/src under it: none; dist = [$DIST]" \
  || verdict PB2 no "/app/client = [$TOP]; node_modules/src: [$BAD]; dist = [$DIST]"
# Fails closed: an erroring docker ps is not "none left" (run 1 reported 0 from an error).
if "${SSH[@]}" "docker ps -a --filter ancestor=$ID --format '{{.ID}} {{.Status}}'" > "$OUT/ps-after-run.txt"; then
  n=$(grep -c . "$OUT/ps-after-run.txt"); [ "$n" -eq 0 ] && verdict PB2.no-container-left ok "docker ps -a --filter ancestor=<id>: 0 rows" || verdict PB2.no-container-left no "$n container(s) left"
else verdict PB2.no-container-left no "docker ps errored; undetermined"; fi
# Detector check: the running a2a-hub container (from prev 13aeef206f7b) must be seen by the same filter shape.
POS="$("${SSH[@]}" "docker ps -a --filter ancestor=a2a-hub:prev --format '{{.ID}} {{.Status}}'" | grep -c .)"; say "detector positive: containers from a2a-hub:prev seen by the same filter: $POS (expect >= 1)"; [ "$POS" -ge 1 ] || verdict PB2.no-container-left no "filter did not see a known container; undetermined"

# PB3: K over the streamed save. K's selftest first (planted positive, gzip layer, fail-closed on opaque).
node "$QA/k.mjs" --selftest > "$OUT/k-selftest.log" 2>&1; st=$?
say "K selftest: $(tail -1 "$OUT/k-selftest.log") (exit $st)"
if [ $st -ne 0 ]; then verdict PB3 no "K selftest failed; no scan counts"; else
  "${SSH[@]}" "docker save $ID" > "$OUT/save.tar"; sv=$?
  say "docker save streamed: exit $sv, $(stat -c %s "$OUT/save.tar") bytes"
  node "$QA/k.mjs" "PB3.image-save=$OUT/save.tar" > "$OUT/k-scan.log" 2>&1; ks=$?
  say "$(tail -1 "$OUT/k-scan.log")"
  [ $sv -eq 0 ] && [ $ks -eq 0 ] && verdict PB3 ok "0 hits, no opaque layer" || verdict PB3 no "save exit $sv, K exit $ks"
fi
# Cleanup (Relay's conditions): delete the local save and anything from it; read back absence.
rm -f "$OUT/save.tar"
[ ! -e "$OUT/save.tar" ] && [ -z "$(ls "$QA_TMP" | grep -E '^k-positive')" ] && verdict PB3.cleanup-local ok "save.tar and K scratch gone" || verdict PB3.cleanup-local no "local scratch remains"
REM="$("${SSH[@]}" "ls -A ~ /tmp 2>/dev/null | grep -iE '(^|[^a-z])qa[-_]|k-positive|save\.tar|pb' || true")"
[ -z "$REM" ] && verdict PB3.cleanup-tcm ok "no QA-named file in ~ or /tmp on tcm" || verdict PB3.cleanup-tcm no "found: $REM"
say "PB OVERALL: $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
