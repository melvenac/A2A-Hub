# Loop 5 deploy to tcm — Rivet's step list (prep only, no tcm writes yet)

## Relay ruling (session 17): list ACCEPTED, with these changes
- TIMING: NOT before the T-064 day-long [auth] read (D-012). The swap was at 04:14:10Z on 2026-09-25, and a recreate would erase that window.
  Earliest is after ~04:30Z on 2026-09-26, once Relay has done that read, and then only on Aaron's word.
- (a) Step 12 fast-forwards to MASTER, not the tag.
- (b) Before step 4, run `docker tag a2a-hub:prev a2a-hub:v1.8.0`.
- REQUIRED CHECK (a full-key read, so it's batched with dispatch; none of the 6 RO menu items can show it):
  the tracked docker-compose.yml:31-32 has `env_file: /home/melvenac/projects/a2a-hub/.env`, which is INSIDE the dir step 1 rotates away.
  Read: `FULL "grep -n -A2 env_file ~/docker-compose/a2a-hub/docker-compose.yml"` (the env_file lines only, never the .env contents).
  If it points into ~/projects/a2a-hub, step 1 adds `cp -p ~/projects/a2a-hub.old/.env ~/projects/a2a-hub/.env` (never printed),
  and step 6's AUTH_MODE grep targets that file.

Ref: tag v1.11.0 = f52f6d6 (in master c0dc3ea; zero diff in src/convex/scripts/Dockerfile/package*.json between them).
Runbook: docs/redeploying-tcm.md:32-51 (Convex first, tag :prev, build, recreate). NOT scripts/deploy.sh.
FULL = `ssh melvenac@100.124.212.87` (full key, writes, on Aaron's word). RO = `ssh -i ~/.ssh/tcm-readonly -o IdentitiesOnly=yes melvenac@100.124.212.87 <item>`.

## Pre-flight (read-only, done 2026-09-25)
image: live 648ac3963dd7 (:latest, v1.10.0, started 04:14:10Z); :prev 13aeef206f7b (v1.8.0) · runners @1 @2 active
auth-mode warn · health ok · agents-summary rows=6 K7=PASS (no ownerAssigned line yet: a2a-k7 is still de3a9c3e0cd0)
Local: v1.11.0:scripts/tcm/a2a-readonly sha c7728ab751cd, a2a-k7.mjs f1de001c3435, 0 CR bytes each.

## 0. Runner pause — Aaron's own sudo (step 11 in the handoff; happens first)

## 1. Ship source (workstation → tcm)
```
git -c core.autocrlf=false -c core.eol=lf archive -o $SCRATCH/a2a-hub-v1.11.0.tar v1.11.0
tr -cd '\r' < (extract of src/convex) | wc -c   # expect 0 for LF files
scp $SCRATCH/a2a-hub-v1.11.0.tar melvenac@100.124.212.87:~/a2a-hub-v1.11.0.tar
FULL 'cd ~/projects && mv a2a-hub.old a2a-hub.old-v1.8.0 && mv a2a-hub a2a-hub.old \
      && mkdir a2a-hub && tar -xf ~/a2a-hub-v1.11.0.tar -C a2a-hub \
      && cd a2a-hub && npm ci'
```
Verify: `grep '"version"' package.json` → 1.11.0; `ls ~/projects` shows .old (v1.10.0) and .old-v1.8.0, no nesting.

## 2. Convex functions FIRST
```
FULL 'cd ~/projects/a2a-hub && export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 \
      && export CONVEX_SELF_HOSTED_ADMIN_KEY=$(docker exec convex ./generate_admin_key.sh | tail -1) \
      && npx convex deploy -y'
```
Expect "No indexes are deleted" + "Schema validation complete". Key never echoed. Old v1.10.0 app keeps running (additive).

## 3. Owner backfill, pass 1
`... && npx convex run agents:assignOwnerAtDeploy '{"owner":"aaron"}'` (same env) → counts only; record them.

## 4. Tag and build (NOT onto :latest)
```
FULL 'docker tag a2a-hub:latest a2a-hub:prev && cd ~/projects/a2a-hub && docker build -t a2a-hub:v1.11.0 .'
```
Verify: RO image → :prev = 648ac3963dd7; new :v1.11.0 id recorded. (Overwrites :prev 13aeef206f7b; v1.8.0 source stays in a2a-hub.old-v1.8.0.)

## 5. PB — Gauge on the built image. Fail → stop, no swap.

## 6. Swap
```
FULL 'docker tag a2a-hub:v1.11.0 a2a-hub:latest && cd ~/docker-compose/a2a-hub \
      && grep ^AUTH_MODE .env && docker compose up -d --force-recreate a2a-hub'
```
Verify: RO image (container id = v1.11.0 id), RO auth-mode = warn, RO health ok,
`docker logs a2a-hub --since 5m 2>&1 | grep -ciE 'error|500'`.

## 7. Owner backfill, pass 2 (O4 gap) — same command as 3; expect 0 or small count.

## 8. Install T-065 scripts + RL2
```
scp scripts/tcm/a2a-readonly scripts/tcm/a2a-k7.mjs (from the v1.11.0 archive) → ~/bin/*.new
FULL 'cd ~/bin && cp a2a-readonly a2a-readonly.bak-t066 && cp a2a-k7.mjs a2a-k7.mjs.bak-t066 \
      && mv a2a-readonly.new a2a-readonly && mv a2a-k7.mjs.new a2a-k7.mjs && chmod 755 a2a-readonly \
      && sha256sum a2a-readonly a2a-k7.mjs'
```
Expect c7728ab751cd / f1de001c3435. Then RL2: T-065's N (non-menu item → `refused` rc 2) and L re-run; record hashes.
authorized_keys untouched (menu items unchanged, local allow rules unchanged).

## 9. RO agents-summary → `PASS ownerAssigned rows-without-owner=0`; RO auth-log → `authz-lines=` header present.

## 10. PD — Gauge, keyless.

## 11. Runner resume — Aaron's own sudo.

## 12. Main checkout (local)
`cd ~/Projects/A2A-Hub && git fetch && git merge --ff-only v1.11.0` (HEAD c4d2d1c, clean, behind 43; ff verified possible).
Question for Relay: ff to the tag f52f6d6 or to master c0dc3ea? Code is identical; master also carries the docs.

## 13. Reindex there
`cd ~/Projects/A2A-Hub && gitnexus analyze --force --skip-agents-md --skip-skills` (absolute repo path; then `git status` — restore any tracked CLAUDE.md/AGENTS.md churn).

## Rollback
App: `docker tag a2a-hub:prev a2a-hub:latest && compose up -d --force-recreate a2a-hub` (v1.10.0). Convex functions stay v1.11.0 (additive; v1.10.0 app ran on them through steps 2-5).
