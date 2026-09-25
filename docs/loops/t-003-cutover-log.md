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

**Authority:** Aaron, directly to Relay, 2026-09-25 ~03:56Z, verbatim: "You have my approval".
Relay applied it to step 2 only. Every later act gets its own word (D-006). The commands after
03:57:30Z ran in manual mode ("manual mode on"), with Aaron approving each one.

| UTC | Command (on tcm unless noted) | Result |
|---|---|---|
| 03:57:30 | `docker exec a2a-hub printenv AUTH_MODE` | `warn`, rc 0 |
| 03:57:30 | `docker ps` | `a2a-hub` (a2a-hub:latest, up 31 h, started 2026-09-23T20:35:37Z) and `convex` (up 4 days); the other containers are the printer stack, not touched |
| 03:57:30 | `docker logs a2a-hub \| grep -c "WOULD REJECT"`, and the same on `cursor-grok` / `grok-probe` | 0 and 0 |
| ~03:58 | Detector check: `grep -rn "WOULD REJECT" /app/dist` in the container | the running code can emit it (`auth.js:35`, `index.js:311`); the whole log is 3 lines since start, 0 `[auth]` lines |
| ~04:0x | Log driver and the 3 lines, with hex masked | `json-file`, max-size 10m and max-file 3, so it was **not rotated**. The lines are startup only: port 4000, agent card, `Auth: WARN` |
| ~04:0x | `convex data agents --limit 8000 --format jsonl` (admin key generated inside tcm and never printed), piped to a local analyzer that prints names, counts and 8-char prefixes only; the raw rows were deleted after, and their absence read back | 10 rows, 0 unparsable |

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
