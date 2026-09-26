#!/usr/bin/env bash
# B5 (loop-6-qa-criteria.md): the candidate's scripts/tcm/a2a-readonly `auth-log` item, run on scratch with
# `docker` replaced by a shim that serves a PLANTED log (Loop 5 RL1's method). The planted log holds
# 3 [auth], 2 [authz] and 4 [enroll] lines among other lines, a 40-hex run and a 43-char base64url run.
# Required: header auth-lines=3 authz-lines=2 enroll-lines=4 total-lines=<planted total>; all 9 lines
# printed; neither planted secret-shaped run appears in the output. Known negative: the same run on the
# v1.11.0 script (f52f6d6) must FAIL (no enroll-lines=, [enroll] lines not printed).
# Usage: QA_TMP=... b5-rl.sh <sha>
set -uo pipefail
SHA="$1"; : "${QA_TMP:?}"
D="$QA_TMP/b5-$SHA"; rm -rf "$D"; mkdir -p "$D/bin"
git show "$SHA:scripts/tcm/a2a-readonly" > "$D/a2a-readonly" || exit 2
HEX=0123456789abcdef0123456789abcdef01234567; B64=QWxhZGRpbjpvcGVuIHNlc2FtZQ_abcdefghijk-XYZ01
T=2026-09-26T05:00:0
cat > "$D/planted.log" <<EOF
${T}0.000000000Z Hub running on port 4000
${T}1.000000000Z [auth] WOULD REJECT unknown X-Agent-Key on GET /a2a/whoami
${T}2.000000000Z [authz] WOULD REJECT peerName=aaron on GET /a2a/peer/:peerName/sessions caller=relay (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
${T}3.000000000Z [enroll] WOULD REJECT no-code on POST /a2a/register caller=qa-x (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
${T}4.000000000Z [enroll] ISSUE issuer=aaron
${T}5.000000000Z unrelated line with $HEX inside
${T}6.000000000Z [auth] WOULD REJECT legacy X-Agent-Key $HEX on POST /a2a/heartbeat/x
${T}7.000000000Z [enroll] WOULD REJECT used on POST /a2a/register caller=qa-y $B64 (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
${T}8.000000000Z [authz] REJECT reader=x on POST /a2a/session/:sessionId/read caller=y
${T}9.000000000Z [enroll] REJECT agent-issue on POST /a2a/enroll caller=grok
EOF
printf '%s\n' "2026-09-26T05:00:11.000000000Z [auth] REJECT unknown X-Agent-Key on GET /a2a/whoami" >> "$D/planted.log"
TOTAL=$(grep -c . "$D/planted.log")
DW="$(cd "$D" && pwd -W 2>/dev/null || pwd)"
cat > "$D/bin/docker" <<EOF
#!/usr/bin/env bash
case "\$*" in
  "logs -t a2a-hub") cat "$D/planted.log" ;;
  *".State.StartedAt"*) echo "2026-09-26T04:59:59.000000000Z" ;;
  *".HostConfig.LogConfig"*) echo "json-file map[max-file:3 max-size:10m]" ;;
  *) echo "docker shim: unexpected: \$*" >&2; exit 97 ;;
esac
EOF
chmod +x "$D/bin/docker"
# The script pins PATH=/usr/bin:/bin. On the scratch COPY only, put the shim first; show the edit landed.
sed -i "s#^PATH=/usr/bin:/bin\$#PATH=$D/bin:/usr/bin:/bin#" "$D/a2a-readonly"
grep -q "^PATH=$D/bin:/usr/bin:/bin\$" "$D/a2a-readonly" || { echo "UNDETERMINED: PATH edit did not land"; exit 2; }
echo "edit landed: $(grep -c "^PATH=$D/bin" "$D/a2a-readonly") PATH line points at the shim"
OUT="$(SSH_ORIGINAL_COMMAND=auth-log PATH="$D/bin:$PATH" bash "$D/a2a-readonly" 2>&1)"; rc=$?
printf '%s\n' "$OUT" > "$D/out.txt"
HDR="$(printf '%s\n' "$OUT" | grep -E '^auth-lines=' | head -1)"
PA=$(printf '%s\n' "$OUT" | grep -c '\[auth\]'); PZ=$(printf '%s\n' "$OUT" | grep -c '\[authz\]'); PE=$(printf '%s\n' "$OUT" | grep -c '\[enroll\]')
LEAKHEX=$(printf '%s\n' "$OUT" | grep -c "$HEX"); LEAKB64=$(printf '%s\n' "$OUT" | grep -c -- "$B64")
echo "sha=$SHA rc=$rc"; echo "header: $HDR"; echo "printed: auth=$PA authz=$PZ enroll=$PE; planted hex in output=$LEAKHEX, base64 in output=$LEAKB64; planted total=$TOTAL"
WANT="auth-lines=3 authz-lines=2 enroll-lines=4 "
if [ $rc -eq 0 ] && [[ "$HDR" == "$WANT"* ]] && [[ "$HDR" == *" total-lines=$TOTAL" ]] && [ "$PA" -eq 3 ] && [ "$PZ" -eq 2 ] && [ "$PE" -eq 4 ] && [ "$LEAKHEX" -eq 0 ] && [ "$LEAKB64" -eq 0 ]; then echo "B5 PASS"; exit 0; else echo "B5 FAIL"; exit 1; fi
