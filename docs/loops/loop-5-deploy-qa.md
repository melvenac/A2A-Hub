# Loop 5 deploy to tcm: Gauge's checks (PB, pre-swap PD, PD, RL2)

Plan: `docs/loops/loop-5-deploy-plan.md`. Criteria: PB and PD from `loop-4-qa-criteria.md:240-270`,
RL2 and RL3 from `loop-5-qa-criteria.md:275-285`. The additions below were accepted by Relay on
2026-09-26. Instruments are in `loop-5-qa/` (`pb.sh`, `pd.mjs`, `rl2.mjs`), and the logs are in
`loop-5-qa/runs/deploy-*`. These checks are part of the deploy act. They are not part of V-008's
verdict.

## Instruments, validated before any tcm read (2b5ff6e)

- **PB** was run against a fake tcm (`fixtures/fake-tcm.sh`). It ran the real listing commands
  against a stand-in `/app`:
  - Clean: every row passes.
  - Dirty: each planted defect fails its row. The defects were an extra exposed port, `client/src`,
    `/app/.env`, a leftover container, a scratch key in the save, and `save.tar` left on tcm.
  - Wrong id: it stops at PB0.
  - Logs: `runs/deploy-prep-pb-fake-{clean,dirty}.log`.
- **New PB rows:**
  - PB2.app: `/app` is exactly the final stage's six entries.
  - PB2.no-env: there is no `.env*` under `/app` outside `node_modules`, and an END sentinel must
    arrive. Reason: deploy step 1 may copy tcm's `.env` into the build directory.
- **PD.1b** (new): tcm must serve `/ui/assets/index-DleSmG9D.js`.
  - Expected name: the local build of the client stage at v1.11.0 (`45c168e`).
  - Known positive for the method: the same build at v1.10.0 gives `index-BDybZYJ0.js`, the name
    tcm served in Loop 4.
  - Logs: `runs/deploy-prep-client-hash.log`, and `runs/deploy-prep-pd-mock.log` (a mock hub:
    v1.11.0 passes, v1.10.0 fails PD.1b only, and no key header on 8 requests).
- **RL2's parsers** (M3 new image, AL `authz-lines=`, RL3 `ownerAssigned`) self-test on planted
  output: the new format passes and the v1.10.0 format fails. Log: `runs/deploy-prep-rl2-selftest.log`.

## PB: PASS (step 5, before the swap)

**Authority:**
- Aaron's words, relayed by Relay (Relay session 18, 2026-09-26), were: "as for guage, use it". They
  answered whether Gauge may use tcm's full key for PB1-PB3 against the step-4 image: read-only
  except PB2's throwaway container, and no other command.
- This session's auto-mode permission gate still denied the command ("Production Reads"). No command
  reached tcm.
- **Aaron then ran it himself at this seat's prompt**
  (`! QA_TMP=… bash docs/loops/loop-5-qa/pb.sh a2a-hub:v1.11.0 645a6f248d82`). PB therefore ran as
  his own act in this session.

**Run:** 2026-09-26, from 01:18:36Z, `ssh melvenac@tcm` (full key). The five full-key commands:
- `docker image inspect` (the id)
- `docker image inspect` (the config)
- `docker run --rm --network none --entrypoint sh <id> -c 'ls/find …'`
- `docker ps -a --filter ancestor=…` (twice: the new id, and `a2a-hub:prev` as the detector positive)
- `docker save <id>`, streamed to local scratch
- `ls -A ~ /tmp`

**Image:** `a2a-hub:v1.11.0` = `sha256:645a6f248d82e677725905a0f445bea0df769f738527c1c8ec0c63cb8c4a79fc`,
as Rivet reported through Relay. Results:

- **PB0:** the id matches.
- **PB1:** Cmd `["node","dist/src/index.js"]`, Entrypoint `["docker-entrypoint.sh"]`, ExposedPorts
  `{"4000/tcp":{}}`, WorkingDir `/app`. These are identical to Loop 4's `648ac3963dd7`.
- **PB2:**
  - `/app/client` = `[dist]`, with no `node_modules` and no `src`; `dist` = `[assets index.html]`.
  - **PB2.app:** `/app` = `[client convex dist node_modules package-lock.json package.json]`.
  - **PB2.no-env:** no `.env*` is present, and the sentinel was received.
  - No container is left (0 rows). The detector positive (a container from `a2a-hub:prev`) was seen: 1.
- **PB3:**
  - K's selftest passed.
  - The save was 261,095,424 bytes: 22,775 tar members and 125 gzip layers opened. 0 were opaque.
  - **0 hits** for 56 scratch keys (Loop 4 and Loop 5) and their sha256.
- **Cleanup:** the local save is gone. Tcm's `~` and `/tmp` hold no QA-named file (59 lines read).
- Log: `runs/deploy-pb-tcm.log`.

## Pre-swap PD: the expected known negative (Relay's ruling, 2026-09-26)

**Run:** 01:21:05Z, 4 keyless GETs to `http://100.124.212.87:4000`, with tcm still on `648ac3963dd7`.
Results:
- PD.1 `/ui/`: 200, `no-cache`. PASS.
- **PD.1b: FAIL, as expected.** Tcm serves `index-BDybZYJ0.js` (v1.10.0), not `index-DleSmG9D.js`.
- PD.2: that asset returns 200, `immutable`, 55,537 bytes (Loop 4's size).
- PD.3: `/` returns 404.
- PD.4: `/health` returns 200 with `{agent,convex,status}`, and both statuses are ok.

So the detector sees the old bundle on the real tcm. Log: `runs/deploy-pd-preswap.log`.

## PD: PASS (step 10, after the swap)

**Background:** Rivet reported the swap at ~01:22:11Z (COMPOSE_EXIT 0). Relay confirmed it with the
RO key at 01:22:45Z: container-image-id `645a6f248d82`, auth-mode warn, health ok.

**Run:** 01:23:05Z, the same 4 keyless GETs. Results:
- PD.1 `/ui/`: 200, `no-cache`.
- **PD.1b: PASS.** Tcm serves `index-DleSmG9D.js`. The pre-swap run two minutes earlier showed
  `index-BDybZYJ0.js`, so the change is the swap.
- PD.2: the asset returns 200, `immutable`, **56,201 bytes, the same size as the local v1.11.0 build**.
- PD.3: `/` returns 404.
- PD.4: `/health` returns 200 with `{agent,convex,status}`, and both statuses are ok.

Log: `runs/deploy-pd-postswap.log`.

## RL2 (after step 8)

Pending.
