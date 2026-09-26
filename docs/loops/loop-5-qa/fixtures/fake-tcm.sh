#!/usr/bin/env bash
# A fake tcm for pb.sh's own validation. Receives what ssh would send as the remote command.
# FAKE_MODE=clean: every PB row must PASS. FAKE_MODE=dirty: planted defects, each row must FAIL.
# FAKE_APP: a local directory standing in for the image's /app (the listing runs for real against it).
set -u
CMD="$*"; M="${FAKE_MODE:?}"; APP="${FAKE_APP:?}"
ID=sha256:1234abcd5678ef90aaaabbbbccccddddeeeeffff0000111122223333444455
case "$CMD" in
  "docker image inspect --format '{{.Id}}' "*) echo "$ID" ;;
  "docker image inspect --format '{{json .Config.Cmd}}"*)
    if [ "$M" = clean ]; then echo '["node","dist/src/index.js"]|["docker-entrypoint.sh"]|{"4000/tcp":{}}|/app'
    else echo '["node","dist/src/index.js"]|["docker-entrypoint.sh"]|{"4000/tcp":{},"3210/tcp":{}}|/app'; fi ;;
  "docker run --rm --network none --entrypoint sh $ID -c "*)
    s="${@: -1}"; s="${s#\'}"; s="${s%\'}"; s="${s//\/app/$APP}"
    sh -c "$s" | sed "s#$APP#/app#g" ;;
  "docker ps -a --filter ancestor=$ID "*) [ "$M" = dirty ] && echo "deadbeef0001 Exited (0) 1 second ago"; true ;;
  "docker ps -a --filter ancestor=a2a-hub:prev "*) echo "c0ffee000001 Up 21 hours" ;;
  "docker save $ID") tar -cf - -C "$APP" . ;;
  "ls -A ~ /tmp") printf '/home/melvenac:\n.bashrc\nbin\nprojects\na2a-hub-v1.11.0.tar\n\n/tmp:\nsnap-private-tmp\n'; [ "$M" = dirty ] && echo save.tar; true ;;
  *) echo "fake-tcm: unmatched command: $CMD" >&2; exit 97 ;;
esac
