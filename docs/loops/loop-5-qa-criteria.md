# Loop 5: acceptance criteria (Gauge)

**Date:** 2026-09-25 · **Author:** QA seat (Gauge), session 17 · **Status:** criteria, written
before a candidate is named. Nothing has been run.

**Derived from:**
- the brief `docs/loops/loop-5-identity-and-membership-brief.md` (`origin/docs/session-17-c`):
  conditions A to F and preserve 1 to 6;
- ruling 1 `docs/loops/loop-5-ruling-1.md` (`fd4b369`): Q1 to Q9 as recommended, A1, A2;
- Rivet's design `docs/loops/loop-5-design.md` (`6687e7c`), **design text only**;
- Relay's additions by A2A: Q9 on scratch, A1's N and L re-run, E via `setOwner`, F over hub-talk
  and the daemon, and no key or hash in any `[authz]` line.

**Context:** D-010, D-011, D-012 and G-001.

**Baseline ("old"):** `c4d2d1c` (v1.10.0). `src/`, `convex/`, `scripts/` and `client/` are
byte-identical at `56e38a4`. **Candidate:** a verdict SHA on `loop/5-identity`, named by Relay.
Every observation names it. If it moves mid-run, the run is void.

---

## Objections and questions (for the ruling, before the build is final)

- **O1: an unknown key in warn, on the filtered routes.** In warn, an unknown key is let through as
  `caller = null` (G-001). Today `GET /a2a/sessions` and `GET /a2a/agents/live` give it everything.
  If the candidate filters to "visible to null", it gets **nothing**, which is a new refusal in warn,
  against Preserve 4.
  - **Proposed:** in warn, a null caller on #9 and #13 gets today's unfiltered answer, and one
    `[authz] WOULD REJECT unknown-caller …` line.
  - Strict never reaches the route: the guard gives 403.
  - I will observe whichever is ruled.
- **O2: session create naming another owner's agent (Q6), the strict code.** The design gives 403
  for a create without the caller, but no code for a cross-owner participant. **Proposed:** 403,
  with a distinct `<what>` (`cross-owner participant=<name>`).
- **O3: `message/send` with an explicit `to` naming another owner's agent.** Q5 covers only the
  no-`to` case. With an explicit `to`, an outside agent can still have `aaron`'s agent answer it, the
  risk Q5 names. **Proposed:** strict refuses with 403 (`cross-owner to=<name>`), and warn logs it.
  Otherwise, rule it out of scope with a task number.
- **O4: the backfill gap in the deploy order** (design §8: push functions, then
  `assignOwnerAtDeploy`, then hub). An agent that registers between the backfill and the hub swap
  goes through the **old** hub, which passes no `owner`. Its row then has none, and `aaron`'s view
  does not see its rooms.
  - **Proposed:** the deploy re-runs `assignOwnerAtDeploy` once after the swap. It is idempotent,
    and a second run reports 0.
  - **Or** a row with no `owner` is read as `HUB_OWNER` at query time.
  - Row BF checks whichever is chosen.
- **O5: a registrant must not choose its owner.** `registerAgent` takes an optional `owner` (§4).
  - **Required:** an `owner` in the register body (top level or inside `agentCard`) is ignored. The
    row gets `HUB_OWNER`, or itself for a human.
  - A self-declared `kind: "human"` registrant owns only itself. It gains **no** view of any other
    row's rooms.
- **O6: JSON-RPC task by id, and Q2's no-oracle rule.** In strict, `tasks/get` and `tasks/cancel` by
  a different caller must return **the same JSON-RPC error as a task id that does not exist**:
  byte-identical after the `id` field.
- **O7: the owner view is read-only in warn too?** In warn, a post by `aaron` into a room he only
  owner-views is logged and allowed (warn refuses nothing new). The **page** still shows that room
  read-only in both modes. I assume this; tell me if not.

I looked for an objection to the brief's conditions themselves and found none.

## 0. Preconditions

Loop 3's and Loop 4's preconditions carry over:
- **P1 isolation:** pinned QA ports, never 3210/3211/4000, and nothing started from
  `~/Projects/A2A-Hub`.
- **P2** the isolation check proves it looked.
- **P3** `qa-` names, plus the literal `aaron` on the throwaway stack only.
- **P4 frozen tree;** mutants in `git archive` copies.
- **P5** receipts and bodies read with a parser.
- **P6 no real key:** `A2A_KEY_DIR` inside `QA_TMP`, and the real key dir is listed by name before
  and after.
- **P9 log capture:** each process's stdout and stderr to separate files.
- **P10 stop and prove** (T) around any SIA full stop.

Added for Loop 5:

- **P12 three hubs, one database.** A candidate warn hub, a candidate strict hub, and the `c4d2d1c`
  hub (warn and strict) all run against **one** scratch Convex running the **candidate's
  functions**. That database is F's skew surface. A second scratch Convex runs `c4d2d1c`'s functions
  with the `c4d2d1c` hub, as the old-on-old baseline D and F compare against.
- **P13 two owners.** Owner A is the human `aaron`, with agents `qa-a1`, `qa-a2` and `qa-a3`. Owner B
  is a scratch human, `qa-owner2`, with agents `qa-b1` and `qa-b2`, owned through
  `agents:setOwner` (internal; run with `convex run` on the scratch deployment only).
  - Rooms: `A-in` (aaron, qa-a1), `A-agents` (qa-a1, qa-a2; aaron not in it), and `B-room` (qa-b1,
    qa-b2).
  - Every row's `owner` is read back, parsed, before any row counts.
- **P14 legacy seed for BF.** A scratch database is seeded through the `c4d2d1c` hub on `c4d2d1c`
  functions, so it holds rows with no `owner`. Then the candidate functions are pushed. Each seeded
  row is read back before the push.

## Instruments

Each is validated on a known positive before its row counts.

- **INV: route extractor.** Parses `src/**/*.ts` at a SHA for every `app.<verb>(` and
  `app.use(<path>`, and every Router mounted from it, including the JSON-RPC methods the SDK
  handler serves (`message/send`, `message/stream`, `tasks/get`, `tasks/cancel`, `tasks/resubscribe`,
  the push-notification methods, and the agent-card extended route if present).
  - **Known positive:** on `c4d2d1c` it must list exactly the 20 routes, the `/a2a/jsonrpc` mount and
    `/ui`, matching the design's §1 count.
  - On the candidate it must find every one. **Any route or method without an A or B row below is a
    FAIL of INV.**
- **H: harness** (Loop 4's `l4.mjs` pattern): register, heartbeat, seed, and read back parsed.
  Keys are per seat and never printed.
- **LOG: `[authz]` reader.** Parses each hub's stderr and stdout for `[authz]` lines into
  `{mode: WOULD REJECT|REJECT, what, method, route, caller}` with a parser, not a count.
  - **Known positive:** one planted mismatch per `<what>` class must produce exactly one parsed line
    of that class.
- **K: key scanner** (Loop 4's `k.mjs`). Every scratch key and its sha256, over every hub log and
  every `[authz]` line. Selftest first.
- **R: old/new comparator** (Loop 4's C1): status, parsed body and named volatile fields.
- **W: browser.** Playwright headless Chromium, as in Loop 4, validated on a cross-origin positive.
- **T: `stop-stack.ps1`,** with the Loop 5 ports.
- **M: mutants,** shown landed and `tsc` clean, then observed to fire.

---

## Rows

**Both directions everywhere:** each refusal row pairs with the same request made as itself, in its
own room, which must succeed. "Old" means the `c4d2d1c` hub on the same data.

### INV: the inventory

- **INV1.** The extractor's candidate inventory is checked against the rows below. Every route or
  JSON-RPC method has at least one A row (strict) and one B row (warn), or a stated reason it has
  none (public, or acts by the key alone: `/health`, agent-card, `/ui`, `register`, `rotate`,
  `whoami`). **A route added by the candidate that no row covers is a FAIL.**

### A: strict, refused when acting as another name or outside its rooms

Each row: first the mismatch (expected code, body, and one `[authz] REJECT` line), then the same
call as itself (200, with the body equal to old's, per Preserve 5).

| Row | Route | Mismatch | Strict expects |
|---|---|---|---|
| A1 | `POST /a2a/session/:id/message` | `from` ≠ caller, in own room | 403 |
| A2 | same | caller not a participant (`qa-b1` into `A-in`) | 404, **byte-identical to a nonexistent id's 404** (Q2) |
| A3 | `GET /a2a/session/:id/messages` | non-participant agent (`qa-b1` reads `A-in`); also `qa-a3` (same owner, not in the room) | 404, oracle-identical |
| A4 | `GET /a2a/session/:id/reads` | as A3 | 404, oracle-identical |
| A5 | `POST .../rename`, `POST .../extend` | non-participant agent; **and `aaron` on `A-agents` (owner view is read-only, Q1)** | 404 |
| A6 | `POST .../read` | `reader` ≠ caller; and a non-member reader | 403 and 404, as today (**unchanged codes and text**) |
| A7 | `GET /a2a/sessions` | an agent's list | contains **only** its rooms (`qa-a3`: none of A's; `qa-b1`: only `B-room`) |
| A8 | `GET /a2a/peer/:peerName/sessions` | `:peerName` ≠ caller | 403 |
| A9 | `GET /a2a/queue/:agentId` | `:agentId` ≠ caller | 403 |
| A10 | `POST /a2a/heartbeat/:agentId` | `:agentId` ≠ caller, and the target's `lastSeen` **did not move** (read back) | 403 |
| A11 | `POST /a2a/task/:taskId/claim` | `agentName` ≠ caller | 403 |
| A12 | `POST /a2a/task/:taskId/respond` | the caller is not `assignedAgent`, for a claimed and an unclaimed task | 404, oracle-identical to a nonexistent task; **and after the assignee responds, `assignedAgent` is still set** (read back, Q8) |
| A13 | `POST /a2a/session` | caller not in the participants; and (O2) a participant with another owner | 403, 403 |
| A14 | `GET /a2a/agents/live` | owner B's key | lists only owner B's live agents; owner A's key only A's (Q4) |
| A15 | `POST /a2a/message/send` | (a) `role:"aaron"` from `qa-b1`: not refused, and the sender recorded and relayed is `qa-b1`; (b) no `to` from `qa-b1`: the escalation's task is assigned only to a B-owned agent, never an A-owned one (Q5); (c) `qa-b1`'s text does **not** reach `aaron`'s "Hub activity" room (`notifyHuman`, Q5); (d) O3's explicit cross-owner `to`, as ruled | (a) 200 with the sender = caller; (b)(c) read back; (d) as ruled |
| A16 | JSON-RPC `tasks/get`, `tasks/cancel` | another caller's A2A task | the same error as a nonexistent id (O6); cancel leaves the task's state unchanged (read back) |
| A17 | JSON-RPC `message/send` | the `userName` seen by the executor is the caller | observed through the task's `createdBy`, read back; `null`/"" never for a valid key |
| A18 | every route above | an **unknown** key in strict | 403 from the guard (existing), no `[authz]` line |

### B: warn, the same mismatches succeed and log

- **B1.** Every A1 to A16 mismatch is repeated on the **warn** hub. Each returns the **status and
  parsed body the `c4d2d1c` hub returns** for the same request on the same data. That is "succeeds
  as today", compared with R. LOG parses exactly **one** `[authz] WOULD REJECT` line per request,
  with the right `<what>`, `METHOD`, route template and `caller=`.
- **B2 (O1).** An unknown key in warn, on every route, gives today's response and
  `caller=unknown` lines. #9 and #13 follow O1's ruling.
- **B3: no false positives.** Across D's and E's flows, as-self and in-room (hub-talk, the daemons,
  the page as `aaron`), LOG finds **zero** `[authz]` lines. The soak (A2) depends on this: a noisy
  line would mask a real one.
- **B4: no key or hash in any `[authz]` line** (Relay). K runs over every hub log after the whole
  run: 0 keys, 0 hashes. Also, every `[authz]` line's fields are names or ids only; LOG rejects any
  field of 32+ base64 or hex.
- **B5: `[auth]` and `[authz]` stay apart.** No `[authz]` line contains `[auth] `, and no `[auth]`
  line is emitted for an authorisation mismatch.

### C: askPolicy on JSON-RPC (T-004, Q9)

- **C1.** A scratch target `qa-a2` gets an `askPolicy` that denies `qa-a1`, set with
  `registerAgent`'s optional argument through `convex run` on scratch. That is the only way to set
  one (ruling 1).
  - In **both** modes, `qa-a1` asking `qa-a2` through `/a2a/message/send` gives 403 with
    `askDeniedReason`.
  - Through `/a2a/jsonrpc` `message/send` with `metadata.to = qa-a2`, it gives a terminal `rejected`
    status carrying the same reason.
  - **Both directions:** `qa-a3` (allowed) succeeds through both routes, in both modes.
- **C2.** With no `askPolicy`, JSON-RPC asks behave as on the `c4d2d1c` hub (R).

### D: SIA's flows through the unchanged hub-talk (Preserve 1)

- **D0.** `git diff c4d2d1c <cand> -- scripts/hub-talk.mjs scripts/hub-key.mjs` is empty.
- **D1.** For a seat acting as itself in its own rooms, each of these runs on (i) the old hub on old
  functions and (ii) the candidate hub on candidate functions, in **warn and strict**:
  - `--init-key`;
  - `--inbox`;
  - `--say`;
  - `--wait` delivery (rc 0), and `--wait-timeout` with no peer (rc 2);
  - `--peer <name>` (the room found or created);
  - the read receipts.

  Exit codes, printed turns and parsed receipts are identical across (i) and (ii). B3 holds.
- **D2: the daemons (Preserve 2).** On the candidate hub (warn and strict), alice and bob, with their
  own keys: heartbeat (`lastSeen` read back), poll their **own** queue, and answer an escalated task.
  **If the daemon's answer path needs an LLM that is unavailable on scratch, or T-056's non-answer
  reproduces on the old hub too, then heartbeat and poll are observed, answering is reported "not
  observed", and the old hub is run the same way for comparison.**

### E: the owner's view (Preserve 3, Q1, Q3)

- **E1.** `aaron` (human) via API: `GET /a2a/sessions` includes `A-in` **and** `A-agents` (owner
  view), and **excludes** `B-room`. Messages and reads of `A-agents`: 200. Of `B-room`: strict 404.
- **E2.** `qa-owner2` (human): the mirror. It sees `B-room` and not `A-in` or `A-agents`.
- **E3. No agent gains a view** (the core property). `qa-a3` (A-owned, in no room) lists nothing
  and gets 404 on `A-agents` in strict. An agent registered with `agentCard.kind: "human"` and a new
  name owns only itself (O5) and sees only rooms it is in.
- **E4. The page (W), as `aaron`:**
  - the history lists `A-in` and `A-agents`, and not `B-room`;
  - opening `A-agents` shows the transcript read-only: "you are not in this room" in place of the
    composer, with no extend or rename;
  - W shows **no POST** from that view;
  - `A-in` keeps the composer, and a post reads back `from: "aaron"`.
- **E5. The page as `qa-owner2`:** the mirror of E4.
- **E6 (O5).** A register body carrying `owner: "qa-x"` (top level and in `agentCard`) gives a row
  whose `owner` is `HUB_OWNER`, read back.

### F: skew (Preserve 6, Loop 3's B2 method)

- **F1.** The `c4d2d1c` hub on the **candidate's functions** runs D1's hub-talk flows, D2's daemon
  flows, and Loop 4's page flow (B2 and B3: list, open, post). Each is identical to old-on-old.
- **F2.** Each `convex/` change is additive: a static diff shows no existing function's args or
  return shape changed, and the schema adds only optional fields. That is shown by the diff and by
  F1.
- **F3.** Rows written by the old hub on candidate functions (no `owner`) are handled as O4 rules
  (BF).

### BF: backfill (O4)

- **BF1.** On P14's seeded database, `agents:assignOwnerAtDeploy({owner:"aaron"})` returns counts
  equal to the seeded rows lacking `owner`. Every such row reads back `owner: "aaron"`, and rows that
  already had one are unchanged.
- **BF2.** A second run returns 0 changed (idempotent).
- **BF3 (O4).** The gap case, as ruled: a row registered through the old hub after BF1 is seen by
  `aaron`'s view after the ruled step.

### A1 (ruling 1): the read-only log sees `[authz]`

- **RL1 (static and scratch).** The changed `a2a-readonly` source, at the candidate or wherever Rivet
  commits it:
  - `[authz]` is counted separately from `[auth]`, with a count, first and last timestamps, and no
    silent cap;
  - the same mask.

  Its parsing is run against a scratch log file with planted `[auth]` and `[authz]` lines (a copy
  of the script's log section, fed the file in place of `docker logs`). The counts must match the
  planted numbers, and the masks must fire on planted hex runs.
- **RL2 (tcm, at the deploy act, on Aaron's word).** After the new script is installed: T-065's
  N rows (all 19 refusals, rc 2) and L rows (0 secrets, planted positive first) re-run against it,
  plus the new item or header, and the script hash recorded. **This runs in the deploy act, like PB,
  not in the verdict.**

### T1: the author's numbers

- **T1.** Reproduce `tsc` and the test counts, including `tests/authz.test.ts` and the author's
  mutant check. Label anything not reproduced. Run on an LF archive copy as well as the worktree
  (Loop 4's O3).

### M: mutants (each must be caught by the named row)

| Mutant | Must fail |
|---|---|
| M1 `bindName` skipped on `/queue/:agentId` | A9 |
| M2 `sessionAccess` grants `ownerView` to any caller, not only human-kind | E3 |
| M3 `GET /a2a/sessions` uses `listAll` | A7, E1 |
| M4 strict answers **403** for a non-member session | A2 (the oracle) |
| M5 JSON-RPC executor ignores `askPolicy` | C1 |
| M6 the `[authz]` line includes the key's hash prefix | B4 |
| M7 the warn branch refuses (strict logic in both modes) | B1 |
| M8 `respond` passes no `assignedAgent` | A12 |
| M9 the register handler honours a body `owner` | E6 |
| M10 `notifyHuman` relays any caller | A15(c) |

### RG: regressions

- **RG1.** Loop 3's key flows (whoami, rotate, register refusal of a taken name) on the candidate.
- **RG2.** Loop 4's page rows B1 (no key sends nothing), B2 and B3, as `aaron` in his own rooms.
- **RG3.** C1 from Loop 4 (the route comparator), for as-self calls in own rooms, old vs candidate in
  both modes: identical, except the session list and `agents/live`, which change as ruled.

## What these criteria cannot see

- tcm's real rows and seats. The deploy act's PB, PD and RL2 cover the image, the page and the log
  script on tcm. The `[authz]` soak (A2) is Relay's read, after deploy.
- SIA seats' real habits, for example a pasted `--session` id. Only the soak shows those.
- `register` itself, which stays open until Loop 6 (G-001). E6 checks only that it cannot choose an
  owner.
