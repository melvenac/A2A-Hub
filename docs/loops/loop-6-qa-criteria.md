# Loop 6: acceptance criteria (Gauge)

**Date:** 2026-09-26 · **Author:** QA seat (Gauge), session 19 · **Status:** DRAFT for Relay's ruling.
Written before a candidate is named. Nothing has been run.

**Rows that stay OPEN until Relay rules on Rivet's revision** (Relay, 2026-09-26):
- **F** (rate limiting): design section 10, being revised for ruling 1's required change.
- **G5b** (an existing owner row with no `kind`, which is tcm's `aaron`): design section 5, being
  extended.

Their conditions are written below from the brief and ruling 1. Their numbers and exact texts wait
for the revision.

**Derived from:**
- the brief `docs/loops/loop-6-enrollment-brief.md` (master `2e3de2f`): acceptance A-H and
  preserve 1-7;
- ruling 1 `docs/loops/loop-6-ruling-1.md` (`329c389`):
  - Q1: agent-issue is refused in both modes, and B excludes it;
  - Q2: limits come from code and row count, 9 rows, at least 3 hub-talk processes per name plus a
    daemon, 10x headroom;
  - Q3: `hub-enroll.mjs`;
  - the required change: a `same` register counts in its name's bucket, and no existing-name
    hub-talk pattern gets a 429;
- Rivet's design `docs/loops/loop-6-design.md` (`loop/6-design` `3df6dbd`), **design text only**;
- the Loop 5 deploy's finding (`docs/loops/loop-5-deploy-qa.md`): tcm's `aaron` row has no
  `agentCard.kind`, and acceptance data must have the live data's shape.

**Context:** D-003, D-010, D-011, D-012, D-013, D-014 and G-001.

**Baseline ("old"):** `f52f6d6` (v1.11.0). `src/`, `convex/`, `scripts/`, `client/`, `Dockerfile` and
`package.json` are byte-identical at master `2e3de2f`. **Candidate:** a verdict SHA on Rivet's build
branch, named by Relay. Every observation names it. If it moves mid-run, the run is void.

---

## Objections and questions (for the ruling, before the build is final)

- **O1: a direct Convex call can skip the hub's enrollment check.**
  - `registerAgent` is a **public** mutation (`convex/agents.ts:210`). The design passes
    `enrollmentCodeHash` as an optional argument, with "omitted means today's call" (section 3). The
    warn/strict decision lives in the hub.
  - So anything that can reach Convex can insert a new name without a code, whatever `AUTH_MODE` is.
    The same holds for `kind: "human"` unless the mutation drops it; section 5 says it does.
  - This is T-057's class. T-057 is out of this loop's scope but gates exposure.
  - **Proposed:** QA runs row **X1** (a direct call to scratch Convex) and reports what it sees. It
    gates nothing unless Relay rules the check belongs in Convex. The report says plainly which
    guarantee rests on T-057.
- **O2: codes are not bound to a name.** In the design, any name can spend any valid code.
  - A leaked code therefore creates *any* name under the issuer, and the brief's "reveals nothing
    about a code for another name" becomes trivial.
  - **Proposed:** accept as designed, and confirm it. Row A13 records the behaviour either way.
- **O3: how QA makes an expired code.** The TTL is 24 h, and waiting a day is not a test.
  - **Proposed:** on the scratch database only, QA rewrites one `enrollmentCodes` row's `expiresAt`
    to the past, using `npx convex import --table enrollmentCodes --replace` on an exported copy. That
    is scratch data, not the candidate's code.
  - If the build adds a TTL override instead (an environment variable), QA uses that and says so.
- **O4: which bucket an unknown key uses in warn.** In warn, an unknown key passes the guard as
  `caller = null` (G-001).
  - Section 10 counts authenticated routes "per `req.agentName`". If `null` is its own bucket, it
    must still be finite. It must not exempt that traffic or share a bucket with a real name.
  - **Proposed:** row F6 checks both.
- **O5: error-class rows run with and without `NODE_ENV`.**
  - The image sets `NODE_ENV=production` (section 9). A stage replay sets it by hand, so it cannot
    show that the Dockerfile sets it. PB on the deploy act reads the image's `Env` (PB1b).
  - **Proposed:** D passes with `NODE_ENV=production` (required). D is also run with it unset, and
    that result is reported but does not gate. It shows whether the explicit handlers or only the
    environment variable keep the answers terse.

---

## 0. Preconditions

- **Scratch stacks.** Two scratch Convex backends and hubs, on pinned ports (`--local-cloud-port`),
  never the main checkout and never tcm.
  - One stack carries the candidate's functions.
  - One carries the baseline's, for G and H.
  - The stack scripts record PIDs and prove every QA port free at the end (Loop 5's `start-stack.ps1`).
- **Live-shaped seed (the class note from the Loop 5 deploy).** The seed is copied from tcm's
  read-only `agents-summary` at the Loop 5 deploy, 2026-09-26 ~01:25Z (`loop-5-qa/runs/rl2/`): 9
  rows, each with its own key and `owner=aaron`.
  - Eight rows are `kind=ide-session`.
  - **`aaron` has no `kind`.** Every row that depends on `aaron` being human runs twice:
    - **"aaron-h":** `aaron` is human-kind, the shape after the pending fix;
    - **"aaron-0":** `aaron` has no kind, the shape tcm had after the Loop 5 deploy.
    
    The aaron-0 results for G5b wait for the section 5 ruling. The seed script prints the rows it
    wrote, parsed back, before any row runs.
- **A second human, `qa-owner2`,** is created only through the documented `createHuman` command, on
  scratch. The command is run exactly as the build documents it.
- **Planted positives for C** are made before any scan: a fake code, its hash, a fake key and its
  hash, written into a copy of a log. The scanner must find all four before its real run counts.
- **Both modes:** every A, E and G row that names a mode runs on a hub in that `AUTH_MODE`.

## Instruments

- **The response recorder.** Every HTTP request the harness makes is logged with its status, headers
  and full body to a per-row file. C scans these files.
- **K6, the secret scanner.** It extends Loop 4's K:
  - Needles: every scratch key, every issued code, and the sha256 of each.
  - Haystacks: every hub, daemon and Convex backend log, and every recorded response except the
    issue responses themselves, which are listed by request id and excluded by id, not by pattern.
  - Selftest first: the planted positives, a gzip layer, and the refusal of an opaque file.
- **The row reader.** It reads parsed `agents`, `peers` and `enrollmentCodes` rows through the scratch
  admin key. It is a parser, never a grep.
- **The route comparator.** Loop 4's C1 and Loop 5's RG3: the same request sequence against old and
  candidate, compared after the documented normalisations (ids, timestamps).
- **The hub-talk suite.** Loop 5's `suite.mjs` (D1/D2/F1), run through the candidate's
  `scripts/hub-talk.mjs`.
- **The burst driver** for F. N concurrent real `hub-talk` processes per name, started together, plus
  the daemon's loop. It is not a synthetic HTTP loop, because the point is hub-talk's real pattern.
  Every process's rc and every 429 are counted from the hub's responses (the recorder), not from
  stdout.

Each instrument is validated on a known positive and a known negative before its negative counts.

## Rows

### INV: the inventory (brief scope 4)

- **INV1.** The error-response inventory is re-derived from the candidate, not copied from design
  section 9. The derivation parses `src/` for every place an HTTP status is set or an error body
  written:
  - every `res.status(…)`;
  - every `catch` that answers;
  - Express's defaults: body-parser, static, and an unmatched route;
  - every route with a Convex `v.id` argument (T-055).

  The derivation is checked against a planted extra catch block, which it must list. Each entry gets
  a D row.
- **INV2.** The unauthenticated surface: every route not behind the key guard, derived from the
  candidate's router, compared with section 10's list (register, `/ui/*`, missing-key 401). Any
  difference is reported.

### A: enrollment, strict (brief A, as amended by ruling 1 Q1)

Codes are issued by `aaron` (aaron-h) unless a row says otherwise.

- **A1. A new name with no code:** 403 with exactly the no-code text. **No mutation:** the row count
  and the `peers` count are unchanged (row reader, before and after).
- **A2. A new name with a valid code:** 200.
  - The new row's `owner` is the issuer (`aaron`), whatever `owner` the body sends.
  - The code's row has `usedAt`.
  - The new name's `whoami` answers as itself.
- **A3. The same code again, for another new name:** 403 with the used text. There is no new row, and
  `usedAt` is unchanged.
- **A4. An expired code** (O3): 403 with the expired text. There is no row, and the code is not
  marked used.
- **A5. A code that never existed:** 403 with the not-valid text.
  - **Uniformity:** the body is byte-identical whether the database holds 0 codes, 1 unused code, or
    a used one. The status and body are compared.
- **A6. A code issued by `qa-owner2`** (created through `createHuman`): the new row's `owner` is
  `qa-owner2`. `aaron`'s owner's view does not see that row's rooms, and `qa-owner2`'s does.
- **A7. An agent key cannot issue:** `POST /a2a/enroll` with an `ide-session` key gets 403 with the
  agent-issue text, **in strict and in warn** (ruling 1 Q1). No `enrollmentCodes` row is written.
  - The same holds for an unknown key in warn, whose caller is `null`.
- **A8. A body cannot choose `owner`:** a valid-code register with `owner: "qa-x"` gets
  `owner = issuer`.
- **A9. A body cannot create a human.**
  - A valid-code register of a new name with `agentCard.kind: "human"` gets 403 with the human text
    in strict. No row is written, and the code is not consumed.
  - A codeless one also gets 403. The report records which text wins; that is not a ruling.
- **A10. An existing non-human row cannot become human** (design section 1, `agents.ts:183-192`).
  - That row re-registers with its own key and `kind: "human"`: 403 in strict.
  - Afterwards the stored `agentCard` is unchanged (row reader), and `POST /a2a/enroll` with that
    key is still refused.
- **A11. No second human through `peers`** (`keys.ts:80-81`): after every A and B row, the set of
  `peers` rows of type `human` equals the seed's plus `qa-owner2`.
- **A12. A human can issue:** `aaron` (aaron-h) gets 200 with `{ok, code, expiresAt}`.
  - `expiresAt` is 24 h from issue, ±1 min.
  - Of all responses in the run, **only this one** contains the code (C).
  - The `enrollmentCodes` row holds a hash, and no field equals the code.
- **A13. A code is not bound to a name** (O2): a code issued with no name mentioned is spent by an
  arbitrary new name. This records what is ruled.
- **A14. Concurrent double spend:** two registers race with the same valid code for two different
  new names. Exactly one gets 200 and one gets the used text, with exactly one new row. Run 10
  times; 10 of 10 must hold.
- **A15. A failed insert does not consume.** A valid code sent with:
  - an existing name and its own key (`same`), or
  - an existing owned name with a new key (409, `keyLogic.ts:80-83`),

  leaves the code unused. That code then enrolls a new name (200).
- **A16. Refusals name their condition** (the brief, Atlas): the no-code, expired, used and not-valid
  bodies are four distinct strings.
  - None contains a name other than the caller's, a code, a hash, or a count.
  - Each is quoted in the report.

### B: warn (brief B, excluding agent-issue per ruling 1 Q1)

- **B1.** A1, A3, A4, A5 and A9 in warn: each register **succeeds** (Preserve 6).
  - Each logs exactly one `[enroll] WOULD REJECT <what> on <route> caller=<who> (AUTH_MODE=warn; …)`
    line. `<what>` is `no-code`, `used`, `expired`, `not-valid` or `kind=human`.
  - The line is parsed with the design section 7 grammar, not grepped.
- **B2.** A codeless warn insert's `owner` is `HUB_OWNER` (`aaron`). A bad code in warn is **not**
  consumed; its row is unchanged.
- **B3. Warn does not persist a human.** After A9 and A10 in warn, the stored `agentCard.kind` is not
  `human`, and that key's `POST /a2a/enroll` gets 403 agent-issue.
  - This is the chain that matters: warn must not become a way to mint an issuer.
- **B4.** In strict, the same five cases log `[enroll] REJECT …`.
  - `ISSUE` lines carry `issuer=<name>` and nothing else variable.
- **B5 (RL, scratch). The widened `auth-log`.** This is Loop 5's RL1 method: the candidate's
  `a2a-readonly` `auth-log` block, on a scratch copy fed a planted log. It must give:
  - `auth-lines=`, `authz-lines=` and `enroll-lines=`, matching the planted counts;
  - every planted `[enroll]` line printed;
  - masks firing on planted hex and base64.
- **B6 (RL, tcm, in the Loop 6 deploy act, on Aaron's word).** After the widened script is installed:
  - the header shows `enroll-lines=`;
  - T-065's N and L rows are re-run;
  - the script hash matches the candidate blob.

  This runs in the deploy act, like Loop 5's RL2. It is not in the verdict.

### C: secrecy (brief C)

- **C1.** K6 selftest, then a scan of every log and every recorded response except the listed issue
  responses. There must be **0 hits** for any code, any key, or the sha256 of either.
  - The scan reports what it walked: file count, byte count, and the number of responses.
- **C2.** No `[enroll]` line contains a run of 32 or more base64url characters, or 64 hex. The planted
  positive is found first.
- **C3.** `hub-enroll.mjs` output (stdout and stderr, captured) contains the code once and never the
  key, its hash, or the key file's path contents.

### D: the error class (brief D; stage replay, Loop 4 G1)

On a stage replay of the candidate's Dockerfile (`loop-4-qa/replay.sh` method), with
`NODE_ENV=production` (required) and unset (reported, O5):

- **D1.** For every INV1 entry, the triggered response has:
  - no filesystem path (no `/app`, no `/home`, no drive letter);
  - no stack frame (`at …:line:col`);
  - no `error.message` from Convex or Node.

  Each triggering request is named. The body matches the design section 9 text, or the build's
  documented one.
- **D2.** Malformed ids on every route that takes one answer 4xx, never 500. This includes a
  well-formed-looking id of the wrong table (T-055).
- **D3.**
  - `GET /ui/does-not-exist` gives 404 with a terse body. This is the O1 disclosure observed on tcm
    in Loop 4.
  - Malformed JSON to `POST /a2a/register` and to one authenticated route gives 400 with a terse body.
- **D4.** A forced internal error (scratch Convex stopped under a running hub, and a route called)
  gives a 500 with a terse body. The real message appears in the hub log, not the response.
  - `/health` and the auth backend's 503 keep their current shape.
- **D5 (static).** The candidate's Dockerfile final stage sets `ENV NODE_ENV=production`. On the
  deploy act, **PB1b** reads `Config.Env` of the built image for it.

### E: T-070 (brief E)

- **E1.** In strict, `POST /a2a/session/:id/read`:
  - a non-member on a real session, and
  - any caller on a well-formed nonexistent id

  get **byte-identical** status and body (404 `session not found`). Headers are compared except
  `Date` and `ETag`.
- **E2.** The non-member's call writes no read cursor. The row reader compares cursors before and
  after.
- **E3.** A malformed id gives 400 `not a session id` for both cases, and is the same for both.
- **E4.** In warn, the non-member still gets today's participant reason, and the `[authz]` note is
  still logged.

### F: rate limiting (brief F, ruling 1's required change). OPEN until section 10 is ruled

The conditions below are fixed. The limits, windows and the global bucket size are filled in from
the revised section 10.

- **F1.** A burst over the per-key limit gets `429` with `Retry-After`, in warn and in strict.
  - `Retry-After` is an integer number of seconds, greater than 0 and at most the window.
  - The body is terse (D1's rules).
  - After `Retry-After` has passed, the same key is served again.
- **F2. Every row's hub-talk at once** (ruling 1, required change 3):
  - Setup: all 9 seeded names, each with **at least 3** concurrent hub-talk processes (a `--wait`, a
    `--say` and an `--inbox`), plus a daemon loop, all started within one second.
  - It runs for at least two windows, in both modes.
  - Result required: **0 responses with status 429** (from the recorder) and every hub-talk rc 0.
- **F3. Existing names are never in the global bucket** (required change 1).
  - First saturate the global unauthenticated bucket until it returns 429, using new-name registers,
    unknown-key registers and `/ui/` requests.
  - Then, inside the same window, start F2's pattern. It must get 0 responses with status 429.
  - **Both directions:** the same saturation does 429 a new-name register, which is the detector
    positive.
- **F4.** An existing name's register is counted in that name's bucket. Exhausting name X's bucket
  429s X's register and not name Y's.
- **F5. The Funnel source** (brief F).
  - Rivet's recorded test of what `req.socket.remoteAddress` shows through the proxy path is read.
  - Whether per-source or global limiting ships follows from it.
  - QA cannot produce Funnel traffic, so this is listed under "cannot see" unless the test is
    repeatable on scratch.
- **F6 (O4). Unknown keys in warn.**
  - A flood with an unknown key eventually gets 429; its bucket is finite.
  - It does not consume a real name's bucket: that name's F2 pattern still gets 0 responses with
    status 429.

### G: preserve (brief preserve 1-6; Loop 5's rows re-run)

- **G1. hub-talk for an existing name, both modes, old vs candidate** (Preserve 1).
  - Loop 5's D1 suite is run through the candidate's `hub-talk.mjs`: register, `--inbox`, `--say`,
    `--wait`, `--peer`, and read receipts.
  - The transcripts must be identical after normalisation.
- **G1b.** `--rotate-key` works with no code in both modes, and the old key then resolves to no name.
  - `--init-key` on an existing owned name gives 409 in both modes, and no request carries a code.
- **G1c. `--invite`.**
  - `--invite <code>` without `--init-key` exits 1 with a usage line, and **no request reaches the
    hub** (the recorder and the hub's request count are both 0).
  - `--init-key --invite <code>` enrolls a new name, as in A2.
  - **Static:** the candidate's diff to `scripts/hub-talk.mjs` and `scripts/hub-key.mjs` touches only
    the `--invite` parse and `hub-key.mjs:185-187`'s body (D-014). Any other hunk is a finding.
- **G2. Every existing row keeps its key and owner** (Preserve 2).
  - The live-shaped seed is read before and after the candidate's functions are deployed onto it,
    and after the whole run.
  - Each seeded row's `apiKeyHash`, `owner` and `agentCard` are unchanged, except A10's
    deliberately refused attempt, which must also show no change.
- **G3. Loop 5 holds** (Preserve 3). Loop 5's suite of A, B, C and E rows (`loop-5-qa/suite.mjs`, rows
  A1-A20, B1-B5, C1-C2, E1-E6 with E3b) is re-run on the candidate in both modes. The results must equal
  Loop 5's.
- **G4. Daemons** (Preserve 4) heartbeat, poll and answer one turn on the scratch stack, in both modes
  (Loop 5's D2).
- **G5. Aaron's chat page** (Preserve 5).
  - **G5a (aaron-h):** Loop 4's page rows B1-B3 and Loop 5's E rows. The page lists `aaron`'s agents'
    rooms.
  - **G5b (aaron-0): OPEN.** The same rows with `aaron` as tcm had him. What must hold is set by the
    section 5 revision.
- **G6. Warn refuses nothing new** (Preserve 6). The route comparator runs old vs candidate in warn,
  over every route, as a seat acting as itself.
  - Result required: identical, except `POST /a2a/enroll` (new) and D's body texts.
  - Any 4xx that is new in warn, other than a 429 above F's limits, is a finding.

### H: skew (brief H, Preserve 7; Loop 3 B2 / Loop 5 F1)

- **H1.** The v1.11.0 hub is run against the candidate's Convex functions, deployed onto a database
  that holds the live-shaped seed.
  - Loop 5's 26-step suite gives **0 differences** from old-on-old.
  - A codeless new-name register still works through the old hub (the deploy window's open
    register).
  - The `enrollmentCodes` table's presence breaks nothing.
- **H2.** The candidate's `convex deploy` onto the old database reports no deleted index, and schema
  validation completes.

### X: outside the hub (O1)

- **X1.** A direct call to scratch Convex's public `registerAgent`, bypassing the hub, is made for a
  new name with no `enrollmentCodeHash`. Then another is made with `agentCard.kind: "human"` on an
  existing non-human row.
  - The report records whether each inserts or persists.
  - It gates only if Relay rules O1 that way.

### OP: the operator commands (brief scope 1-2)

- **OP1.** The documented issue command is run **exactly as written** (copied from the build's doc, not
  retyped) on scratch.
  - The code is printed once, and the exit code is 0.
  - With an agent's key file it exits 1 and prints the hub's agent-issue text. No code is printed.
- **OP2.** The documented `createHuman` steps, run exactly as written, including producing the hash
  on the side.
  - They create `qa-owner2`, human-kind, with `owner = qa-owner2` and a human `peers` row.
  - The plaintext key appears in no command argument that the steps record.

### T1: the author's numbers

- **T1.** Reproduce `tsc` and the test counts, and the author's mutant check if one is claimed. Label
  anything not reproduced. Run on an LF archive copy as well as the worktree.

### M: mutants (each must be caught by the named row)

| Mutant | Must fail |
|---|---|
| M1 the code is not marked used on insert | A3 |
| M2 the code is marked used on a refused or `same` register | A15 |
| M3 the body's `owner` is honoured on insert | A8 |
| M4 `kind: "human"` persisted in warn | B3 |
| M5 an agent key may issue | A7 |
| M6 one catch block returns `error.message` again | D1 |
| M7 the Dockerfile's `NODE_ENV` line is removed | D5, and D1 in the unset run shows what it guarded |
| M8 strict `/read` returns the participant reason to a non-member | E1 |
| M9 a `same` register is counted in the global bucket | F3 |
| M10 the `[enroll]` line includes the code's hash prefix | C1 / C2 |
| M11 the expiry check is skipped | A4 |
| M12 `--invite` is accepted without `--init-key` | G1c |
| M13 the not-valid text differs when some code exists | A5 |
| M14 the used check is skipped (a race or a reuse) | A3, A14 |

The F mutants (M9) are run once section 10 is ruled.

### RG: regressions

- **RG1.** Loop 3's key flows: whoami, rotate, and the refusal of a taken name at register.
- **RG2.** Loop 4's page rows B1-B3 as `aaron` (aaron-h).
- **RG3.** Loop 5's route comparator for calls made as self in own rooms, old vs candidate, in both
  modes. The result must be identical, except `/read` in strict (E) and D's texts.

## What these criteria cannot see

- **tcm itself:** its real traffic, its live compose (whose `env_file` differs from the tracked file,
  per ruling 1), Traefik, and the real `aaron` row.
  - The deploy act's PB (with PB1b), a PD extended with D3's two keyless reads (`/ui/<missing>` and
    malformed JSON to register), and B6 cover the image, the error pages and the log script on tcm.
- **Funnel and real internet sources (F5).** Unless Rivet's source test can be repeated on scratch,
  QA reads its record and does not reproduce it.
- **Convex reachability on tcm (O1, T-057).** X1 shows what a direct call can do. Whether anything
  can reach tcm's Convex is T-057's question.
- **SIA seats' real habits.** F2 models 3 processes per name plus a daemon, as ruled. A seat that runs
  more than that is not modelled.
- **Code handling off the hub:** where Aaron pastes a code, and how long it sits in a terminal's
  scrollback.
