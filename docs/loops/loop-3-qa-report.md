# Loop 3 — acceptance report (Gauge)

**Date:** 2026-09-24 · **Author:** QA seat (Gauge), session 16 · **Criteria:**
`docs/loops/loop-3-qa-criteria.md` on this branch (the rulings of Relay's rulings 1-3 are recorded in it).

**Candidate (verdict SHA, named by Relay):** `loop/3-build-r3` =
`fe4eb147aa0d41484bbc1c2983ac4407c54bea58`. **Every row ran on `fe4eb14` itself**, on fresh scratch
deployments, 2026-09-24 ~20:55Z to 21:37Z. `git diff --stat de27ab8 fe4eb14` = `docs/joining-the-hub.md
| 8 ++++++++` (Relay's carry-over evidence, recorded, not used). Baseline: `ea9d057`.

## Verdict

**PASS on every row except one line of H4.2, which fails on wording alone. That line is Relay's to rule.**

- **H4.2** requires `hub-key.mjs copy` to print exactly `copied key for aaron@<hub-id> (prefix
  xxxxxxxx)`, the design's §12 text. The candidate prints `copied key for aaron@127.0.0.1-4510 to the
  clipboard (prefix xxxxxxxx)` (`scripts/hub-key.mjs:330`).
- Every property the line exists to protect held: one line, the prefix matches the stored hash, no
  key-shaped run, the clipboard equalled the key file, and the clipboard was cleared and confirmed empty.
- I did not loosen the criterion after seeing the result. Relay decides whether "to the clipboard" is
  accepted, or whether the code or the design changes.

Three findings came up on the way. All three are fixed in the verdict SHA and re-verified there:
F1, F2, and the B1.2 doc rule (see "Findings").

## Results on `fe4eb14`

| Row(s) | Result | Evidence (`loop-3-qa/runs/`) |
|---|---|---|
| R1 (steps 0-4, stamping, classify control, idempotence) | 17/17 | `rows-a.log` |
| K1 (U1, held keys, legacy onto held hash, floor 31/32 via the hub, both modes) | 9/9 | `rows-a.log` |
| K2.1-3, K2.6 (rotate on strict; 12 negative cases in both modes; body naming another; race; no restore) | 17/17 | `rows-a.log` |
| K2.4, K2.5, K2.7, K2.8 (strict daemon exits 1 with "key rejected"; warn daemon exits 0 "superseded"; new daemon takes the lease; interrupted `--rotate-key` recovered from `.next`) | 4/4 | `rows-c.log` |
| K3 (M3 killed with per-seat keys) | m3check 3/3; A3 **fails** on the mutant as required (A3.1, A3.2), and its known positive (the daemon read the room) passes | `m3check.log`, `rows-A3-mutant.log` |
| K4 (`reader` vs caller: strict 403 on mismatch, 200 on match; warn marks, and logs caller or `unknown`) | 5/5 | `rows-a.log` |
| K5 (static 0/0 over src, scripts, client; no key means no request from hub-talk, daemon or probe; ask-agent uses an ephemeral owned key; wrong hub spelling fails loud; App.svelte) | 5/5, plus 1 report | `rows-c.log` |
| K6 (no key or full hash in 45 artifacts, 114 keys and 5 harness salts; the one exception is at `convex/keyLogic.ts`) | pass | `k6.log` |
| K8 (C7 in both modes; known positive first; floor once no co-holder) | 4/4 | `rows-a.log` |
| B2.1 and U3 as accepted | 3/3 | `rows-a.log` |
| DK (static search found exactly register, registerAgent, rotateKey; direct calls with and without a legacy holder; U2 exemption; skew through `ea9d057`) | 11/11 | `rows-a.log` |
| MIG (poller shown to see the gap first; never 0 or 2 rows; new `_id`; no askPolicy; room intact and working) | 6/6 | `rows-b.log` |
| REL (release removes only the agents row; stamping; admin-only; fresh `--init-key` in the old room) | 6/6, plus REL.7 report | `rows-b.log` |
| H1-H3 (aaron stays human, including after a hub restart; owned, human kind; rotate; never online; escalation on an isolated deployment) | 12/12 | `rows-b.log`, `rows-d-*.json` |
| H4 | H4.1 pass (static, in K5), **H4.2 wording (above)**, H4.3 pass | `rows-h4.log` |
| B1 (loud "not registered on this hub", no rows, no turn; `--peer`; lobby; rule text now in joining-the-hub.md; `--init-key` remedy) | 7/7 | `rows-c.log` |
| B2.2-B2.6 (old app on new functions in both modes; refused registers; return-shape diff inside §11's table; new app on old functions; owned-key scenario equality) | 5/5 | `rows-c.log` |
| N.1-N.3, N.5a (old client on legacy and migrated names equals `ea9d057`; `hub-key check` known negatives; key generation into scratch with no network, real dir untouched) | 5/5 | `rows-c.log` |
| N.4 (Loop 1 on the candidate) | selftest 9/9, rows A1/A2/A3/A5/A7 50/50, a6 4/4 | `selftest.log`, `rows-l1.log`, `a6.log` |
| F1 (class search over all 17 public queries: none returns `apiKeyHash`; takeover chain fails; getByName skew both ways) | 6/6 | `rows-f.log` |
| F2, DEMOTE (every keyStatus writer covered; lone dev-key row stays legacy with the fresh-key control promoted; `demoted` ≥ 1) | 3/3 | `rows-f.log` |
| N.5(b), K7 | **not run here, by design.** Both are live acts on Aaron's word (the main-stack start; tcm's reads). | — |

**Loop 1's A4 was replaced, not skipped** (Relay, 2026-09-24). A4 tested the `2eb7928` to v1.8.0
transition, which is history, and its identity check requires `/reads` to be absent on old apps.
The skew that can bite now (the deployed `ea9d057` hub against these functions) is covered by
B2.2-B2.6 and N.1/N.2.

## Preconditions

| | Observation | |
|---|---|---|
| P1 | Every process on non-default ports (3510/3511, 3520/3521, 3530/3531, 4510-4550), with explicit `CONVEX_URL` and `HUB_URL`. 3210 and 4000 were never listening from this run. Every listener was confirmed to be a launched PID or its Convex backend child. | ok |
| P2 | `p2-isolation.mjs` PASS on both deployments (empty before, the probe present after). | ok |
| P3 | `qa-` names, except the literal `aaron` (the P3 exception for H), on the throwaway stack only. | ok |
| P4 | `qa3-cand` at `fe4eb14` and `qa3-old` at `ea9d057`, clean at the start and the end. `convex dev --local` created an untracked `convex/tsconfig.json` in each tree even with `--codegen disable` (the T-054 shape, convex 1.35). It was deleted before the end check, and no tracked file changed. The remote `loop/3-build-r3` was still `fe4eb14` at 21:37Z. The mutant and the escalation copy ran in `git archive` copies. | ok |
| P6 | Real `~/.a2a-hub/keys`: absent before, absent after. No command set `AGENT_KEY` to a literal. | ok |
| P7 | Warn and strict hubs on one Convex; unknown key: warn 200, strict 403. | ok |
| P8 | Legacy seeds by `convex import --append` (Relay's approved method), each read back before use. B2 and N used the real `ea9d057` hub. | ok |
| P9 | Per-process stdout and stderr logs (scratch). | ok |
| P10 | No SIA full stop fell inside the verdict run. T was run at its end: all 16 ports free, no backend left. | ok |

**Mutant M3:** built from `fe4eb14` in a `git archive` copy. The edit was shown landed (an 11-line
insert), `tsc --noEmit` was clean, and it fired (`M3.fires`) before A3 was judged against it.

**Clipboard (H4):** run on Relay's go, after Aaron's word, verbatim, Relay session 16: "yes". The
clipboard was never read before the copy. It was read once after the copy and compared in-process,
never printed. It was then set to empty and confirmed empty, 21:36:31Z to 21:36:34Z.

## Findings (raised during the run; all fixed in the verdict SHA)

1. **F1 (84694b9): a name could be taken over by a direct Convex caller.** The public `getByName` and
   `listOnline` returned full `apiKeyHash` values, and the public `rotateKey` accepted a hash as
   proof. Ruling 3 made it blocking. Fixed in `de27ab8`, and re-verified by F1 on `fe4eb14`.
2. **F2 (84694b9): `classifyAtDeploy` could make the retired key authenticate.** A lone
   unclassified `dev-key` row became `owned`. Ruling 3 made it blocking. Fixed in `de27ab8`, and
   re-verified by F2 and DEMOTE.
3. **B1.2 (84694b9): the migration-window rule was missing from `joining-the-hub.md`.** It was only
   in the design and the record. Relay accepted it; `fe4eb14` adds it, and B1.2 passes.

## Observations (reported, not judged)

- **Convex echoes a call's arguments into its log when the call fails argument validation.** Any
  client that sends a key hash to the wrong function writes that hash to the Convex log. The hub
  does not do this. My own first F1 scan did (guessed arguments), and the scan now sends only
  declared arguments and a dummy hash. A legitimate `ConvexError` refusal echoes nothing.
- **Not the only reader of `agents`:** `convex/peers.ts:57` (`unknownPeerError`) reads the table,
  only to word the B1 error. It returns no hash. The claim that `agents.ts` is the only reader is
  therefore imprecise.
- **REL.7:** the `ea9d057` client on a released name exited 0, its turn was delivered unattributed,
  it had no agents row, and it was absent from `/agents/live`. This matches design §4.3 rev 3.
- **B1.2 read paths:** `--wait` exited 2 and `--inbox` exited 0, with no receipt-failure line on
  stderr, and no mark for the name. §11's table says the receipt post "fails on stderr". The judged
  part (no mark) passes.
- **K5:** `demo-loop.mjs` (needs live daemons) and `verify-client-stack.mjs` (hardcodes the main
  stack, `127.0.0.1:4000`) were not run, only checked statically.
- **K6 scope:** one throwaway key, used for a single register in H1's restart step, was made in
  PowerShell and is not in the recorded key set. The hub logs names only.

## My instrument, and what it got wrong first

Found on `84694b9` before the verdict run. All were fixed and re-run from setup, and none changed
a criterion:
- T failed open (a `[string]` parameter re-joined the port list, so it reported STOPPED while a
  dummy listened), and T's list lacked the Convex dashboard's 6790/6791.
- DK's static search sliced a mutation into the next query (a false `heartbeat`).
- Two known-positive names collided.
- REL.3 contradicted REL.4 (the co-holder stamping REL.4 requires).
- Four checks counted comments or wording as code: B2.4, N.3, N.5a, K5.5.
- N's baseline side never registered its names.
- F1's first scan guessed arguments, which put hashes into the Convex log.
- K6 first missed the harness salts in a subdirectory.
