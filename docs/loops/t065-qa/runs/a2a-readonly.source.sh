#!/bin/bash
# a2a-readonly - the only thing the tcm-readonly ssh key can run (T-065).
#
# Installed as a forced command: authorized_keys has
#   restrict,command="/home/melvenac/bin/a2a-readonly" ssh-ed25519 ... tcm-readonly
# so whatever the client asks for, sshd runs this script, with the request in
# $SSH_ORIGINAL_COMMAND. It is matched EXACTLY against a fixed menu. Nothing
# from the request is passed on, and anything else is refused with exit 2.
#
# Read-only: it writes no file. No key, admin key or full hash is printed; every
# output line also goes through mask() as a backstop.
set -u -o pipefail
PATH=/usr/bin:/bin
umask 077

# Fail closed: a source that errors prints UNDETERMINED and exits 2, never an
# empty "clean" answer. Each source is captured before it is masked, so its own
# exit status is the one checked.
undetermined() { echo "UNDETERMINED: $1 rc=$2"; exit 2; }

# 32+ base64/hex-ish runs (keys, admin keys, full hashes) become <masked>.
mask() { sed -E 's/[A-Za-z0-9+\/_=-]{32,}/<masked>/g'; }
# auth-log is stricter: any 16+ hex run is masked too.
maskhex() { sed -E 's/[0-9a-fA-F]{16,}/<hex>/g'; }

case "${SSH_ORIGINAL_COMMAND-}" in
  health)
    out=$(curl -s -m 5 http://127.0.0.1:4000/health) || undetermined curl $?
    printf '%s\n' "$out" | mask
    ;;

  auth-mode)
    out=$(docker exec a2a-hub printenv AUTH_MODE) || undetermined "docker exec" $?
    printf '%s\n' "$out" | mask
    ;;

  image)
    c=$(docker inspect -f 'container={{.Name}} image={{.Config.Image}} status={{.State.Status}} started={{.State.StartedAt}}' a2a-hub) || undetermined "docker inspect" $?
    id=$(docker inspect -f '{{.Image}}' a2a-hub) || undetermined "docker inspect" $?
    imgs=$(docker images a2a-hub --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedAt}}') || undetermined "docker images" $?
    printf '%s\n' "$c" | mask
    echo "container-image-id=$(printf '%s' "$id" | cut -c8-19)"
    printf '%s\n' "$imgs" | mask
    ;;

  runners)
    for u in gh-runner@1.service gh-runner@2.service; do
      echo "$u: $(systemctl is-active "$u")"
    done
    ;;

  auth-log)
    # The whole [auth] set, never a silent tail: a truncated log would read as clean.
    logs=$(docker logs -t a2a-hub 2>&1) || undetermined "docker logs" $?
    total=$(printf '%s\n' "$logs" | grep -c .)
    first=$(printf '%s\n' "$logs" | head -n 1 | cut -d' ' -f1)
    last=$(printf '%s\n' "$logs" | tail -n 1 | cut -d' ' -f1)
    n=$(printf '%s\n' "$logs" | grep -c '\[auth\]')
    started=$(docker inspect -f '{{.State.StartedAt}}' a2a-hub) || undetermined "docker inspect" $?
    driver=$(docker inspect -f '{{.HostConfig.LogConfig.Type}} {{.HostConfig.LogConfig.Config}}' a2a-hub) || undetermined "docker inspect" $?
    # A .1 file can only be listed as root. What matters is whether lines were
    # lost, so report whether the first line reaches back to the container start.
    complete=no
    if [ -n "$first" ] && [ "$(( $(date -d "$first" +%s) - $(date -d "$started" +%s) ))" -le 60 ]; then complete=yes; fi
    echo "auth-lines=$n first=$first last=$last total-lines=$total"
    echo "log-driver=$driver started=$started first-line-within-60s-of-start=$complete rotated=unknown(listing .1 needs root)"
    # grep exits 1 on no match; under pipefail that would fail a clean log.
    if [ "$n" -gt 0 ]; then printf '%s\n' "$logs" | grep '\[auth\]' | maskhex | mask; fi
    ;;

  agents-summary)
    cd /home/melvenac/projects/a2a-hub || { echo "UNDETERMINED: no hub tree"; exit 2; }
    export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
    # The admin key only ever lives in the environment, never in argv.
    CONVEX_SELF_HOSTED_ADMIN_KEY=$(timeout 20 docker exec convex ./generate_admin_key.sh 2>/dev/null | tail -n 1)
    [ -n "$CONVEX_SELF_HOSTED_ADMIN_KEY" ] || { echo "UNDETERMINED: no admin key"; exit 2; }
    export CONVEX_SELF_HOSTED_ADMIN_KEY
    # The CLI retries an unreachable backend indefinitely; bound it so a dead
    # Convex is reported (rc=124) rather than hanging the caller.
    data=$(timeout 60 node node_modules/convex/bin/main.js data agents --limit 8000 --format jsonl 2>/dev/null); rc=$?
    unset CONVEX_SELF_HOSTED_ADMIN_KEY
    [ "$rc" -eq 0 ] || { echo "UNDETERMINED: convex rc=$rc"; exit 2; }
    printf '%s\n' "$data" | node /home/melvenac/bin/a2a-k7.mjs | mask
    exit "${PIPESTATUS[1]}"
    ;;

  *)
    echo "refused"
    exit 2
    ;;
esac
