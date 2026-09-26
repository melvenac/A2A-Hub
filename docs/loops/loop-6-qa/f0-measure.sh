#!/usr/bin/env bash
# F0 check (loop-6-qa-criteria.md F0): how many requests does ONE real hub-talk --wait process make per
# 60 s? Measured through proxy.mjs against a scratch hub (baseline v1.11.0 hub-talk). Known positive for
# the proxy first: exactly 5 GET /health through it must log exactly 5 lines.
# Usage: QA_TMP=... f0-measure.sh <hubUrl> <hubTalkTree> [waitSeconds=75]
set -uo pipefail
HUB="$1"; TREE="$2"; SECS="${3:-75}"; : "${QA_TMP:?}"
HERE="$(cd "$(dirname "$0")" && pwd -W)"; PORT=4790; LOG="$QA_TMP/f0-proxy.jsonl"; LOGW="$(cd "$QA_TMP" && pwd -W)/f0-proxy.jsonl"
node "$HERE/proxy.mjs" $PORT "$HUB" "$LOGW" & PX=$!; trap 'kill $PX 2>/dev/null' EXIT
node -e "setTimeout(()=>{},1000)"
P="http://127.0.0.1:$PORT"
# Known positive: 5 requests in, 5 lines out.
for i in 1 2 3 4 5; do node "$HERE/../loop-6-qa/get-status.mjs" "$P/health" >/dev/null; done
n=$(grep -c '"p":"/health"' "$LOG"); echo "proxy positive: 5 sent, $n logged"; [ "$n" -eq 5 ] || { echo "UNDETERMINED: proxy miscounts"; exit 2; }
export HUB_URL="$P" A2A_KEY_DIR="$QA_TMP/keys"; unset AGENT_KEY ANTHROPIC_API_KEY
HT="$TREE/scripts/hub-talk.mjs"
node "$HT" --as qa-f0a --init-key >/dev/null 2>&1; a=$?; node "$HT" --as qa-f0b --init-key >/dev/null 2>&1; b=$?
node "$HT" --as qa-f0a --peer qa-f0b --say "f0 measurement" >/dev/null 2>&1; s=$?
echo "setup rc: init-a $a init-b $b say $s"
: > "$LOG"   # count only the --wait process from here
T0=$(node -e "console.log(Date.now())")
node "$HT" --as qa-f0a --peer qa-f0b --wait --wait-timeout "$SECS" >/dev/null 2>&1; w=$?
T1=$(node -e "console.log(Date.now())")
echo "wait rc $w (a timeout is expected: no peer turn), ran $(( (T1 - T0) / 1000 )) s"
node -e '
const lines = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
const t0 = lines[0].t, by = {};
for (const l of lines) by[l.m + " " + l.p.replace(/\/[a-z0-9]{20,}/g, "/<id>")] = (by[l.m + " " + l.p.replace(/\/[a-z0-9]{20,}/g, "/<id>")] ?? 0) + 1;
const win = (a, b) => lines.filter((l) => l.t - t0 >= a * 1000 && l.t - t0 < b * 1000).length;
console.log("total requests", lines.length, "over", ((lines.at(-1).t - t0) / 1000).toFixed(1), "s; statuses", JSON.stringify([...new Set(lines.map((l) => l.s))]));
console.log("by route", JSON.stringify(by));
console.log("first 60 s window (incl. start):", win(0, 60), "  steady 60 s window [10,70):", win(10, 70));
' "$LOGW"
