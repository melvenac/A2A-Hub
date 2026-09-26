# Loop 6 deploy to tcm — Rivet's step list (prep only, no tcm writes yet)

## Relay ruling (session 18)
Aaron, relayed verbatim: "deploy loop6 when ready" (D-021). The merge, the v1.12.0 tag, and the tcm deploy happen only after Gauge PASS and Relay's acceptance of this plan. Relay says GO in the room. This document does not start those acts.

Not covered: AUTH_MODE=strict, Tailscale Funnel, runner pause or resume (D-018).

Frozen build: `loop/6-build` `dadc8efb8ceb403efbf2247da2ea7fd72bc73085`. That commit supersedes `c461c65` (which superseded `7420097`). Archive this SHA. It is frozen again: no further pushes to `loop/6-build`.

Ref: Loop 5 plan `docs/loops/loop-5-deploy-plan.md`. Runbook shape: Convex first, tag `:prev` before the build, PB, swap, PD. NOT `scripts/deploy.sh`.
FULL = `ssh melvenac@100.124.212.87` (full key, writes, on Aaron's word for THIS deploy only).
RO = `ssh -i ~/.ssh/tcm-readonly -o IdentitiesOnly=yes melvenac@100.124.212.87 <item>`.
D-017: the read-only commands listed in each step are allowed during the approved deploy. No others. Never print a key, the admin key, or `.env`.

## Pre-flight (read at deploy time, not re-read for this draft)
Last recorded at the Loop 5 swap, not a fresh tcm read: running image `645a6f248d82` (v1.11.0), `:prev` `648ac3963dd7`, `a2a-hub:v1.8.0` `13aeef206f7b`, AUTH_MODE=warn, hub IP `172.20.0.3`, convex IP `172.20.0.2`. The live compose `env_file` was a relative `.env` beside `~/docker-compose/a2a-hub` (Loop 5 required check). Step 0 re-reads these. If any of them differ, stop and report. Do not improvise.

## 0. Re-read, no runner pause
D-018: do not pause or resume `gh-runner@1` or `gh-runner@2`.

D-017 reads, before any write:
- FULL `grep -n -A2 env_file ~/docker-compose/a2a-hub/docker-compose.yml` (those lines only, never `.env` contents).
- FULL `docker inspect -f '{{.Name}} {{.Image}}' a2a-hub` and `docker image inspect` ids for `:latest`, `:prev`, and `:v1.11.0` if that tag exists.
- FULL `docker inspect -f '{{.Name}} {{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' a2a-hub convex` (name and IP only). Record this pair. It is sent to Atlas again after the swap.
- RO `health`, RO `auth-mode`, RO `image`.

If `env_file` is still the relative `.env` beside the compose dir, step 1 does not copy a project `.env`. Step 6's AUTH_MODE grep stays in `~/docker-compose/a2a-hub`.

## Merge and tag (Relay, after Gauge acceptance PASS, before step 1)
Relay tags `v1.12.0` on `dadc8efb8ceb403efbf2247da2ea7fd72bc73085` and merges `loop/6-build` to master by PR (D-021). This seat does not merge and does not tag. Step 1 archives that frozen SHA. Step 10 fast-forwards the main checkout to `origin/master` only after that merge is on master.

## 1. Ship source (workstation → tcm)
```
git -c core.autocrlf=false -c core.eol=lf archive -o $SCRATCH/a2a-hub-v1.12.0.tar dadc8efb8ceb403efbf2247da2ea7fd72bc73085
```
CR check on the extract of `src` and `convex`: expect 0. `package.json` version in the tar is 1.12.0.
```
scp $SCRATCH/a2a-hub-v1.12.0.tar melvenac@100.124.212.87:~/a2a-hub-v1.12.0.tar
FULL 'cd ~/projects && mv a2a-hub.old a2a-hub.old-v1.10.0 && mv a2a-hub a2a-hub.old \
      && mkdir a2a-hub && tar -xf ~/a2a-hub-v1.12.0.tar -C a2a-hub \
      && cd a2a-hub && npm ci'
```
Before the `mv`, record `a2a-hub/package.json` and `a2a-hub.old/package.json` versions. Expect the live tree to be 1.11.0. Verify after extract: version 1.12.0, no nested `a2a-hub/a2a-hub`. The old app keeps running until step 6.

## 2. Convex functions FIRST
```
FULL 'cd ~/projects/a2a-hub && export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210 \
      && export CONVEX_SELF_HOSTED_ADMIN_KEY=$(docker exec convex ./generate_admin_key.sh | tail -1) \
      && npx convex deploy -y'
```
The admin key stays in the remote env. Never echo it. Expect "No indexes are deleted" and "Schema validation complete". The new `enrollmentCodes` table is additive. The v1.11.0 process keeps serving. Do not run `createHuman`. Do not run `assignOwnerAtDeploy` (Loop 5 already filled owners).

## 3. Tag and build (NOT onto :latest)
Record the three image ids from step 0, then:
```
FULL 'docker tag a2a-hub:prev a2a-hub:v1.10.0 && docker tag a2a-hub:latest a2a-hub:prev \
      && cd ~/projects/a2a-hub && docker build -t a2a-hub:v1.12.0 .'
```
`:latest` is unchanged by the tag (it still points at the running v1.11.0 image). The new id is `a2a-hub:v1.12.0` only. Stop here for Gauge PB. Fail means stop, no swap.

## 4. PB — Gauge on the built image
Gauge runs PB against `a2a-hub:v1.12.0` before any swap. Gauge's session gate may block the full-key PB. If it does, Aaron pastes Gauge's bang line in Gauge's session, not in this one. Fail → stop, no swap. This seat does not run PB.

## 4b. Pre-swap PD
Gauge runs PD while tcm is still on the v1.11.0 image. Expected FAIL only on PD.3, PD.5 and PD.6 (v1.11.0's HTML error pages); PD.1b PASSES, because Loop 6 does not touch client/ and the bundle stays index-DleSmG9D.js (Relay amendment, 2026-09-26, from Gauge's stage replay of c461c65). PD.3/5/6 are the swap detector. Any other failing row: stop, no swap. This seat does not run PD.

## 6. Swap
The swap waits for Relay's release. Relay sends Atlas message 1 just before this step (D-003, D-018). Re-read IPs with the same inspect as step 0 if the PB pause was long enough that a recreate could have happened. Then:
```
FULL 'docker tag a2a-hub:v1.12.0 a2a-hub:latest && cd ~/docker-compose/a2a-hub \
      && grep ^AUTH_MODE .env && docker compose up -d --force-recreate a2a-hub'
```
`grep` must print `AUTH_MODE=warn`. If it does not, stop before `compose`. After recreate, the same IP inspect again. Relay sends Atlas message 2 with both IP pairs (the step 0 pair and this pair). They are expected to stay `a2a-hub` `172.20.0.3` and `convex` `172.20.0.2` only if step 0 still showed those; record whatever step 0 and step 6 actually print.

Verify: RO `health` ok, RO `auth-mode` warn, RO `image` equals the v1.12.0 id, FULL `docker logs a2a-hub --since 5m 2>&1 | grep -ciE 'error|500'` (the count only).

## 7. PD after the swap
Gauge runs PD again on the v1.12.0 image. The three rows that failed in step 4b (PD.3, PD.5, PD.6) are expected to pass, and PD.1b still passes. Any failure → rollback, and do not install the script.

## 8. Install the widened auth-log script
Only `scripts/tcm/a2a-readonly` changes in v1.12.0 (header `enroll-lines=`). Do not replace `a2a-k7.mjs`.
```
sha256sum of the archive copy, 0 CR, scp to ~/bin/a2a-readonly.new
FULL 'cd ~/bin && cp a2a-readonly a2a-readonly.bak-t067 && mv a2a-readonly.new a2a-readonly \
      && chmod 755 a2a-readonly && sha256sum a2a-readonly'
```
The remote sum must match the archive. Then RL: a non-menu item returns `refused` rc 2. `authorized_keys` untouched. No new menu item, no new allow rule.

## 9. RL, then RO checks
RL on the installed `a2a-readonly`: a non-menu item returns `refused` rc 2. Then RO `auth-log` header includes `enroll-lines=`. RO `agents-summary` still reports `ownerAssigned`. RO `health` again.

## 10. Main checkout (local), only after the merge is on origin/master
`cd C:/Users/melve/Projects/A2A-Hub`. Porcelain empty. `git fetch && git merge --ff-only origin/master`. Not the tag. Not `loop/6-build`. This seat does not merge.

## 11. Reindex there
`gitnexus analyze --force --skip-agents-md --skip-skills` with the absolute path of the main checkout. Then `git status`. Restore any tracked CLAUDE.md or AGENTS.md churn the analyzer writes.

## Rollback
App only: `docker tag a2a-hub:prev a2a-hub:latest && cd ~/docker-compose/a2a-hub && docker compose up -d --force-recreate a2a-hub`. That returns the v1.11.0 image that step 3 saved as `:prev`. Convex functions stay at the v1.12.0 push (additive; the v1.11.0 app ran on them from step 2 until the swap). Restore `~/bin/a2a-readonly` from `a2a-readonly.bak-t067` if step 8 already ran. Do not drop `enrollmentCodes`. Do not change AUTH_MODE.
