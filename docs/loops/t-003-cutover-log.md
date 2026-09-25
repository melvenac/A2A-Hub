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
