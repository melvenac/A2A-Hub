# Loop 6 deploy to tcm: Gauge's checks (prep)

**Status:** prep only. Nothing has been sent to tcm for Loop 6. Aaron's word for the deploy is D-021
("deploy loop6 when ready"). Condition (1) is Gauge's acceptance of the frozen `loop/6-build` SHA.
Rivet's deploy plan will name the steps. A FAIL anywhere stops the deploy.

## Instruments (`docs/loops/loop-6-qa/`), each validated before any tcm read

- **PB (`pb.sh`):** Loop 5's PB0-PB3, PB2.app and PB2.no-env, plus **PB1b**: the image's `Config.Env`
  carries `NODE_ENV=production`. Only that one entry is printed. An END sentinel means an empty answer
  is not read as "absent".
  - Fake tcm, clean (`fake-tcm.sh`): every row passes.
  - Fake tcm, dirty: each planted defect fails, and PB1b fails on a missing `NODE_ENV`.
- **PD (`pd.mjs`):** Loop 5's PD, plus D3's keyless reads:
  - PD.3 `/` must be 404 and terse;
  - PD.5 `GET /ui/<missing>` must be 404 and terse;
  - PD.6 malformed JSON to `POST /a2a/register` must be 400 and terse.

  `PD_EXPECT_ASSET` is required and comes from a local build of the candidate's client stage
  (`loop-5-qa/fixtures/client-hash.sh <sha>`). Validation (`runs/pd6-validation.txt`):
  - terse mock: PASS;
  - leaky mock (v1.11.0 shape): fails PD.3, PD.5 and PD.6 only;
  - **the real v1.11.0 hub on scratch:** fails PD.3, PD.5 and PD.6 on its real leaks.
- **RL (`rl6.mjs`):** T-065's M/AL/AS/N/L rows with the RO key, plus:
  - **RL6.M3:** the new image is running;
  - **RL6.AL:** the header has `auth-lines=`, `authz-lines=`, `enroll-lines=` and `total-lines=`,
    parsed as key=value, and the printed `[auth]`, `[authz]` and `[enroll]` lines match the counts;
  - **RL3:** owners;
  - **RL6.hash:** Rivet's line is compared with the candidate blobs, computed from git. At `f52f6d6`
    the method gives `c7728ab751cd / f1de001c3435`, the known answer.

  Its parsers self-test before any read. The v1.11.0 header, which has no `enroll-lines=`, must fail.
  - **Relay's `[authz]` probe line** (01:39:40Z, `caller=relay`, `peerName=aaron`) is excluded from any
    count of real lines.

## The command Aaron pastes for PB

The auto-mode permission gate blocks full-key reads from this seat (Loop 5 deploy; memory
`fullkey-tcm-classifier-denies`). When Relay relays the step-4 image id, Aaron types this at Gauge's
prompt, with `<IMAGE>` and `<PREFIX>` filled in from Rivet's report. The template is
`a2a-hub:v<version>` and the first 12 hex of the id:

```
! MSYS_NO_PATHCONV=1 QA_TMP=/c/Users/melve/AppData/Local/Temp/claude/C--Users-melve-Worktrees-a2a-qa/cd4d1564-12d3-417a-905f-de3216f282a7/scratchpad/pb6 bash docs/loops/loop-6-qa/pb.sh <IMAGE> <PREFIX>
```

- It runs from `~/Worktrees/a2a-qa` on a branch that contains `loop-6-qa/pb.sh`.
- It sends only the full-key commands listed in `pb.sh`: image inspect (the id, the config, the Env),
  one `docker run --rm --network none` listing, two `docker ps -a --filter`, `docker save` streamed
  here, and `ls -A ~ /tmp`.
- **`MSYS_NO_PATHCONV=1` is required.** Git Bash rewrites values that look like paths, such as
  `/ui/assets/...`, into Windows paths. It did so during PD's validation, where the script failed
  closed.
- PB3's needles: 56 scratch keys from Loops 4 and 5. Loop 6's QA keys are added to `pb6/keys` before
  the deploy.
