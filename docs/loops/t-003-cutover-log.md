# T-003 tcm cutover log (ships v1.10.0)

Relay, session 17. Plan: Loop 3 design §4.2 (`docs/loops/loop-3-design.md`), D-006, D-007, D-008,
D-009, and Loop 4 ruling 2 (PB and PD). **Every outward act is on Aaron's word for that act,
recorded here when it is used.** This file is written as the cutover goes. A2A messages are not a
record.

## The window

- **Opened:** Aaron, verbatim, in the SIA planner session (sia-planner-ac), 2026-09-25 about 03:55Z:
  "dispatch relay A2A-Hub switchover". Relayed by Atlas to Relay the same minute. This is shared
  work with SIA (D-003), so the relay is his authority **for opening the window only**. It
  pre-approves no act (D-006).
- **Condition (Atlas):** the cutover must be **finished before any SIA A9 build starts**. Atlas will
  not dispatch A9 while the window is open. Relay tells Atlas when it closes.
- **SIA names on tcm, derived by Atlas** (from `GET .../reads` on SIA's two tracked rooms,
  `k57frxw0ptb8tadmqdwy0khhks8ey006` and `k579hndqdr1mxnahy0px1dy8ks8eyef3`):
  - `atlas` and `grok` run hub-talk from `~/Projects/A2A-Hub`.
  - `forge` was not observed in any SIA room, and SIA does not need it live.
  - `probe` has no observed SIA use.
  - The limit, per Atlas: only rooms recorded in SIA's tracked docs were read.
- **Runners:** a SIA developer seat (SIA record 101, `~/Worktrees/sia-infra`) may send CI to the
  tcm runners. Relay tells Atlas before the pause and after the resume.

## Plan (who runs each step)

| # | Step | Runs it | Authority |
|---|---|---|---|
| 2 | Pre-deploy read, read-only: the hub log for `WOULD REJECT` on `cursor-grok` / `grok-probe`; `askPolicy` count on the 8 dev-key rows (Loop 2's instrument, counts only); `AUTH_MODE` | Relay | Aaron's word |
| 3a | Tell Atlas; `gh-runners-pause` (first check that both scripts exist) | Rivet | Aaron's word (deploy act) |
| 3b | Convex push of v1.10.0's functions, then `agents:classifyAtDeploy` at once | Rivet | same |
| 3c | `agents:release` for `clark`, `cursor`, `general`, `probe`, **and `forge`** (D-007; `forge` has no observed use, per Atlas) | Rivet | same |
| 3d | Hub: tag `a2a-hub:latest` as `prev`, `docker build` v1.10.0 (redeploying-tcm.md:47-51, **not** deploy.sh) | Rivet | same |
| 3e | PB1–PB3 on the built image, before the swap. Any failure means no swap. The scratch tar and the save output are deleted and their absence read back | Gauge's instrument | same |
| 3f | Swap (`compose up -d --force-recreate a2a-hub`); `AUTH_MODE` stays `warn`; Loop 2's read repeated; `gh-runners-resume`; tell Atlas | Rivet | same |
| PD | Keyless reads: `/ui/`, one asset, `/`, `/health` | Gauge | Aaron's word |
| 4 | A new-client worktree at `c4d2d1c`, outside `~/Projects/A2A-Hub` | Relay | local only |
| 5 | Canary `relay`: `--init-key` against tcm, then `whoami`, then a round trip | Relay | Aaron's word |
| 6 | `atlas`, then `grok`: `--init-key` from a new-client worktree, in the order Atlas picks | Atlas; Aaron nudges Grok | Aaron's word, each |
| — | `aaron`'s key: `hub-key.mjs init --as aaron --kind human`, then `copy` (T-061) | Aaron, or Relay on his word | Aaron's word |
| 9 | `hub-key.mjs check` over `relay`, `atlas`, `grok`, then the main-checkout update to `c4d2d1c` | Rivet | Aaron's word |
| 10 | K7 read on tcm; the window closes; tell Atlas | Relay / Gauge | Aaron's word |

## Log

(entries appended as each step runs: UTC time, the command, the result, and whose word it ran on)

### Step 2: pre-deploy read, DONE (Relay, read-only)

**Authority:** Aaron, directly to Relay, 2026-09-25 between 03:57:02Z and 03:57:30Z (bounded by commit ea9c340 and tcm's first `date -u`), verbatim: "You have my approval".
Relay applied it to step 2 only. Every later act gets its own word (D-006). The commands after
03:57:30Z ran in manual mode ("manual mode on"), with Aaron approving each one.

| UTC | Command (on tcm unless noted) | Result |
|---|---|---|
| 03:57:30 | `docker exec a2a-hub printenv AUTH_MODE` | `warn`, rc 0 |
| 03:57:30 | `docker ps` | `a2a-hub` (a2a-hub:latest, up 31 h, started 2026-09-23T20:35:37Z) and `convex` (up 4 days); the other containers are the printer stack, not touched |
| 03:57:30 | `docker logs a2a-hub \| grep -c "WOULD REJECT"`, and the same on `cursor-grok` / `grok-probe` | 0 and 0 |
| 03:57:30-03:59:51 | Detector check: `grep -rn "WOULD REJECT" /app/dist` in the container | the running code can emit it (`auth.js:35`, `index.js:311`); the whole log is 3 lines since start, 0 `[auth]` lines |
| 03:57:30-03:59:51 | Log driver and the 3 lines, with hex masked | `json-file`, max-size 10m and max-file 3, so it was **not rotated**. The lines are startup only: port 4000, agent card, `Auth: WARN` |
| 03:57:30-03:59:51 | `convex data agents --limit 8000 --format jsonl` (admin key generated inside tcm and never printed), piped to a local analyzer that prints names, counts and 8-char prefixes only; the raw rows were deleted after, and their absence read back | 10 rows, 0 unparsable |

**Analyzer:** validated before use on synthetic rows (a shared hash with one askPolicy, one
unshared row, one non-JSON line: all flagged). It fails closed: empty input gives
`UNDETERMINED`, rc 2. `askPolicy` is the field name on `agents` (`convex/schema.ts:60`).

**Findings:**
- **No `WOULD REJECT` on `cursor-grok` or `grok-probe`** across 31 h of complete log. Neither bot
  is seen claiming its name with a different key, so C7 binding them at deploy is not expected to
  409 them. That is an observation over 31 h, not a guarantee.
- **The 8 dev-key rows carry no `askPolicy`** (0 of 8). D-007's release loses no policy, so
  nothing has to be set again.
- The table is unchanged from V-003:
  - `atlas`, `clark`, `cursor`, `forge`, `general`, `grok`, `probe` and `relay` share hash prefix
    `7e9f8fd1`;
  - `cursor-grok` (`a77570d1`) and `grok-probe` (`4eecd5fd`) are unshared;
  - no row has `keyStatus` yet, since the field arrives with v1.9.0+.

### Step 3: deploy act, DISPATCHED

**Authority:** Aaron, directly to Relay, 2026-09-25 between 03:59:51Z and 04:00:51Z (bounded by commits e95227c and 0cb1836), verbatim "yes", to Relay's question
"may Rivet deploy v1.10.0 to tcm?". The question named every part: runner pause (scripts checked
first); Convex push plus classifyAtDeploy; release of `clark`, `cursor`, `general`, `probe` and
`forge`; build with `prev` kept, the old hub serving meanwhile; Gauge's image check before the
swap; swap with `warn` kept; re-read; runner resume. Rivet runs it, and Gauge runs PB and PD.
The pause waits for Atlas's ack that SIA's infra seat has been told.

**Clock correction (Relay, 04:05:43Z by `date -u`):** Rivet flagged that the earlier entries' times
were later than the real clock. They were Relay's estimates, not readings. They are now bounded by
commit times and tcm's `date -u`. Times Atlas reports ("~03:55Z" for the window, "~04:20Z" for the
runner ack) are Atlas's own estimates, quoted as given and not measured here.

### Step 3(d): source staged on tcm, DONE (Rivet)

Reported by Rivet, times from `date -u`:
- 04:04:18-04:04:32: scp of `a2a-hub-v1.10.0.tar.gz` (built with `git archive v1.10.0`, which is
  c4d2d1c).
- 04:04:53: the sha256 prefix `8e5edeec` matches on tcm. Then the rotation:
  - `a2a-hub.old` (1.7.0) became `a2a-hub.old-v1.7.0-0921`;
  - `a2a-hub` (1.8.0) became `a2a-hub.old`, the rollback tree;
  - the tar was extracted into `a2a-hub`, and it reads 1.10.0.
- 04:05:01-04:05:05: `npm ci`, rc 0, with the Convex CLI at 1.34.0 per the lockfile.
- No container touched.
- Rivet's session was in auto mode, not manual as Relay had said it would be. Rivet stopped before
  (e), which cannot be undone, pending Aaron's confirmation of the mode.

### Step 3(a-c): runner pause, Convex push, releases, DONE

- **Pause:** Aaron ran `sudo gh-runners-pause` himself (it needs a sudo password, which no seat
  holds) and reported "runner is paused". Relay read it back at 04:06:18Z: `gh-runner@1` and
  `gh-runner@2` were inactive/dead. Atlas acked before it: SIA's infra seat (sia-infra-5a) treats
  queued tcm runs as neither pass nor fail.
- **Mode:** Aaron told Rivet directly, "manual mode is on", before (e). Rivet later saw its session
  back in auto mode after the swap, with only reads and its own temp files left.
- **04:07:54-04:07:56 (Rivet):** `npx convex deploy -y` rc 0 ("No indexes are deleted by this
  push", schema validation complete). Then `agents:classifyAtDeploy`, rc 0:
  `{"demoted":0,"legacy":8,"owned":2,"untouched":0}`.
- **04:08:12-04:08:15 (Rivet):** `agents:release` for `clark`, `cursor`, `general`, `probe` and
  `forge`. Each returned rc 0 and `{"deleted":1}`.

### Step 3(d-f): build, PB, swap, PD, re-read, resume, DONE

- **04:08:29 (Rivet):** `docker tag a2a-hub:latest a2a-hub:prev`, so `prev` = `13aeef206f7b`
  (v1.8.0).
- **04:08:29-04:10:16:** `docker build -t a2a-hub:latest .` gave image `648ac3963dd7`. Relay's
  correction to build onto a candidate tag arrived after the build; the fallback, had PB failed,
  was to retag `prev` to `latest`.
- **04:11:18-04:13:14 (Gauge), PB PASS:**
  - PB1: Cmd, Entrypoint, ExposedPorts `4000/tcp` and WorkingDir are identical to `prev`.
  - PB2: `/app/client` holds `dist` only, and no container is left over.
  - PB3: K selftest first, then `docker save` streamed locally: 261 MB, 125 gzip layers, 0 opaque,
    0 hits. The local copy was deleted, and no QA file is on tcm.
  - Run 1 (04:10:39Z) was VOID because of Gauge's script bugs, one of them a fail-open; both are
    fixed, and a detector positive was added. The void log is kept.
  - Evidence: qa/t003-pb 921428d.
- **04:14:00-04:14:10 (Rivet), swap:** `docker compose up -d --force-recreate a2a-hub` from
  `~/docker-compose/a2a-hub`; the compose label confirms the file. Rivet ran it on Gauge's PASS,
  which reached it before Relay's go; the swap is inside the approved act, and Aaron approved the
  command.
- **Read back 04:14:16:**
  - image `648ac396`; `AUTH_MODE=warn`; `/health` 200 with convex ok;
  - `/ui/` 200 and `/` 404;
  - log "UI: serving /app/client/dist at /ui/", 0 error lines.
  - Published `0.0.0.0:4000->4000`: all interfaces. v1.8.0's binding was not recorded before the
    recreate. Relay noted it on T-057.
- **04:15:05 (Gauge), PD PASS:** keyless. `/ui/` 200 no-cache; asset
  `index-BDybZYJ0.js` 200, immutable, with the same hash as the QA replay build; `/` 404;
  `/health` ok.
- **04:15:15 (Rivet), Loop 2's read repeated:** 5 rows. `atlas`, `grok` and `relay` are legacy
  (`7e9f8fd1`); `cursor-grok` (`a77570d1`) and `grok-probe` (`4eecd5fd`) are owned. Since the
  swap: 0 `WOULD REJECT`, 0 errors.
- **Resume:** Aaron ran `sudo gh-runners-resume` ("done"). Relay read it back at 04:16:21Z: both
  units active/running. After-resume notice sent to Atlas.
- **Pending:** Rivet removes `/tmp/a2a-build-v1.10.0.log`, `/tmp/a2a-npm-ci.log` and
  `~/a2a-hub-v1.10.0.tar.gz` from tcm.

### Step 4: new-client worktree, DONE (Relay, local)

`~/Worktrees/a2a-client-v1.10.0`, detached at tag v1.10.0 (`c4d2d1c`). It needs no npm install:
`scripts/hub-talk.mjs` and `hub-key.mjs` import only `node:` builtins and local modules.

### Step 5: canary `relay`, PASS (Relay)

**Authority:** Aaron, directly to Relay, verbatim "yes", to "may I run the `relay` canary on
tcm?". The question named init-key, check, and a round trip with atlas.

| UTC | Command (from the new-client worktree) | Result |
|---|---|---|
| 04:20:06 | `HUB_URL=http://100.124.212.87:4000 node scripts/hub-talk.mjs --as relay --init-key` | rc 0: "key created and registered", stored at `~/.a2a-hub/keys/100.124.212.87-4000/relay.key`, prefix `71b67c96` |
| ~04:20 | `hub-key.mjs check --hub http://100.124.212.87:4000 --names relay` | `ok relay: key file yes, whoami relay`, rc 0 |
| ~04:20 | Same check, `--names atlas` (negative control) | `FAIL atlas: key file no, whoami null`, rc 1: the check can fail |
| ~04:20 | relay `--peer atlas --say` (new client) | room `k571j07exa0rdpjxjjdfc3d7v98ey1wh`, sent turn 2, rc 0 |
| ~04:20 | Atlas, from `~/Projects/A2A-Hub` at 003f57d (v1.8.0 client) as atlas: `--inbox`, then `--say "atlas ack"` | rc 0 and rc 0, sent turn 3 (Atlas's report, verbatim outputs) |
| 04:21:05 | relay `--session k571j07… --inbox` (new client) | turn 3 `--- atlas --- atlas ack` read, rc 0 |

A migrated seat on the new client and a legacy seat on the old client talk both ways through
v1.10.0. Turn 1 in that room is an older Relay message from before the deploy (v1.8.0 era); Atlas
did not act on it.

### Step 6: `atlas` and `grok` migrated, DONE (Atlas)

**Authority:** Aaron, directly to Relay, verbatim "yes", to "may Atlas give `atlas` and `grok`
their own keys on tcm?" (both acts named; Atlas runs grok's, with no Cursor nudge). Relayed by
Relay to Atlas.

Atlas ran each command from `~/Worktrees/a2a-client-v1.10.0` (c4d2d1c, clean), atlas first.
`~/Projects/A2A-Hub` was untouched. Outputs per Atlas, verbatim:
- `atlas --init-key`: rc 0, "key created and registered", prefix `556f9dba`. `check --names
  atlas`: `ok atlas: key file yes, whoami atlas`.
- `grok --init-key` (after atlas passed): rc 0, prefix `016ebdcd`. `check --names grok`:
  `ok grok: key file yes, whoami grok`.

**Relay's own read-back, 04:23:18Z:** `hub-key.mjs check --hub http://100.124.212.87:4000 --names
relay,atlas,grok` gave ok for all three, rc 0. `~/.a2a-hub/keys/100.124.212.87-4000/` holds
`atlas.key`, `grok.key` and `relay.key`. **Step 9's precondition (§3.6) holds** for every name
observed running from the main checkout against tcm.

### Step 9: main-checkout update, DONE (Rivet)

**Authority:** Aaron, directly to Relay, verbatim "yes", to "may Rivet update the main checkout
(`~/Projects/A2A-Hub`) to v1.10.0?". Rivet's report:
- 04:24:4x: no process used the checkout, and nothing listened on 3210, 3211 or 4000.
- 04:24:49: `convex/_generated/api.d.ts` differed only in whitespace (`--ignore-all-space` diff
  empty), so it was restored.
- 04:24:50: `fetch --tags`, then `merge --ff-only v1.10.0`.
- 04:24:57: HEAD `c4d2d1c`, clean, even with origin, package.json 1.10.0.
- From the main checkout, `hub-key check --names relay,atlas,grok`: ok x3.
- Relay read HEAD, status and version back independently.
- No npm install and no stack started (D-008).
- Rollback: `git checkout 003f57d`, on Aaron's word.

### `aaron` on tcm (T-061), DONE (Relay)

**Authority:** Aaron, directly to Relay, verbatim "yes to both" (the `aaron` key, then K7).
- 04:25:55: `hub-key.mjs init --as aaron --kind human --register --hub
  http://100.124.212.87:4000`, rc 0, prefix `0fdda12d`, file under
  `~/.a2a-hub/keys/100.124.212.87-4000/`. `check --names aaron`: ok, whoami aaron.
- `hub-key.mjs copy`: on the clipboard, never displayed.
- Printed prefixes are sha256 prefixes (`hub-key.mjs:72`, the same hash as `src/auth.ts:38`), not
  key characters.

### Step 10: K7, PASS (Relay)

**Analyzer `k7.mjs`, validated both ways before use.** It FAILs a synthetic set with a duplicate
name, a shared hash, a legacy row, a row with no status, a dev-key-prefix row and a junk line
(each check fails). It PASSes a clean set. Empty input is `UNDETERMINED`, rc 2.

| UTC | Read (tcm, read-only) | Result |
|---|---|---|
| 04:26:41 | `AUTH_MODE`; container image | `warn`; `648ac3963dd7` |
| 04:26:41 | `[auth]` log lines since the swap, timestamped, hex masked | 04:20:07 `MIGRATE relay`. 04:20:44-51: atlas on the OLD client logged `WOULD REJECT legacy/shared` on register, heartbeat, messages, read and message (**the positive control: unattributed**). 04:22:59 `MIGRATE atlas`, 04:23:05 `MIGRATE grok`. **Nothing after**: atlas's turn 4 from the updated main checkout (~04:25-04:26, rc 0) was served as `atlas` |
| 04:26:54 | `convex data agents` through `k7.mjs`; raw rows deleted, and the deletion read back | 6 rows: `aaron` (human), `atlas`, `cursor-grok`, `grok`, `grok-probe`, `relay`, all `owned`. PASS on oneRowPerName, oneNamePerHash, allOwned, devKeyHeldByNone (no `7e9f8fd1`) and unparsableZero. **K7 = PASS** |

**Not yet observed:**
- The design's second signal (§4.4): a working day of hub log with no `WOULD REJECT legacy`.
- O1, pending Gauge's one keyless GET.
