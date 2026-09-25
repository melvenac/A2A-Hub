# Loop 4 ruling 2: Gauge's criteria accepted; G1–G3

Relay, session 17, 2026-09-24. On `docs/loops/loop-4-qa-criteria.md` (`origin/qa/loop-4-ui`,
`6c1f521`, 249 lines, read in full).

**Accepted.** Every brief condition (A–E), preserve 1–6, and ruling 1's Q1–Q4 and R-L has a row.
Every mutant names the row that must catch it. The instruments are each validated on a known
positive. Relay looked for a missing row and found one class not covered as a row: the image
itself. That is G1, below.

## G1: no Docker on the QA host. Accept (a) + (b) + PD, and add PB

- **(a) stage replay and (b) static read are accepted.** Rows observed that way are labelled
  "replay, not image", and **the verdict says so on its own line.** A pass on the replay is not a
  claim about the image.
- **PB (added, binding on the cutover plan):** the image is first built on tcm, by the deploy act's
  own `docker build`. **Between that build and the container swap**, and read-only against the
  built image, run:
  - `docker inspect` for CMD and ExposedPorts;
  - a listing showing that `/app/client` holds only `dist/` and no `node_modules`;
  - K over `docker save` of the image, with scratch-key counts only, and no real key on tcm.

  PB fits the documented procedure, `docs/redeploying-tcm.md:47-51`: tag the old image `prev`,
  `docker build`, then `compose up -d --force-recreate`. The old container keeps serving through
  the build. **It does not fit `scripts/deploy.sh`,** which stops and removes `a2a-hub` before it
  builds (`deploy.sh:15-20`). So the deploy act follows the documented procedure, not `deploy.sh`.

  **If PB fails, the swap does not happen.** The old container keeps running, and tcm stays on
  what it runs.

  This happens on Aaron's word, as part of the deploy act, and it is a step in that act's plan,
  not in the verdict.
- **PD is accepted as written:** keyless, read-only, after the swap, on Aaron's word.
- **A Docker host for QA is not named.** None is known on this machine, and asking for one would
  hold the loop for a check that PB makes on the real build host.

## G2: E runs only with 4000 shown free

**No request to the main stack is allowed, including a read-only `/health`.** P1 stands as
written. E runs only after the isolation check shows nothing listening on 3210, 3211 or 4000.
Today that is the case (Rivet, read-only, this session), and D-008 keeps the main stack down until
T-003's step 3. If 4000 is taken when E is due, E waits and the report says so. A skipped E is not a
pass.

## G3: recorded, not a failure

The key held in `localStorage` on an `http://` origin is outside preserve 6 as written, and outside
this loop. The report records it. HTTPS is T-002's. Relay opens nothing for it now.

## Verdict SHA

Relay names it when Rivet reports the build complete on `loop/4-ui`. Until then nothing is
evaluated.
