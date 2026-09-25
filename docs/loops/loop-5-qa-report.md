# Loop 5: acceptance report (Gauge)

**Verdict: PASS** on `loop/5-identity` = `ebe7747d3d471de56a05114aad4438ee94603eb1` (v1.11.0), against
`docs/loops/loop-5-qa-criteria.md` at `69967fd` (accepted; ruling 2 `52179cf`).

**Run:** QA seat, session 17, 2026-09-25, 06:12Z (scratch Convex ready) to about 07:01Z (RG1 and the
final stop), on this machine only (Windows, Node 22.23.2). Nothing ran on tcm, the main checkout, or 3210/3211/4000.
- **Frozen SHA:** `ls-remote` read `ebe7747` at the start and at 06:59Z. `qa3-cand` sat at it and
  `qa3-old` at `c4d2d1c`; both were clean at the end, after the known T-054 `convex/tsconfig.json`
  was removed.
- **P6:** `~/.a2a-hub/keys` was listed by name before and after, and the listings are identical
  (`100.124.212.87-4000\{aaron,atlas,grok,relay}.key`). No real key was read or used.
- **Instruments, scripts, logs:** `docs/loops/loop-5-qa/` and `runs/`.

**Final runs: 168 checks passed and 0 failed; 11 of 11 mutants caught.** Other rows, reported
separately: INV, D1/D2, F1, B3, B4, RL1, RL3 and T1.

## Stack as run

Two scratch Convex backends:
- **N (3710):** candidate functions, for A to E and RG.
- **O (3720):** first `c4d2d1c` functions, then the **candidate functions pushed onto the running
  database** with `convex deploy`. That is the deploy act in miniature, for F and BF.

Hubs ran with `node --import tsx src/index.ts` from each tree:

| Hub | Tree and mode | Database |
|---|---|---|
| nW / nS | candidate, warn / strict | N |
| onW / onS | `c4d2d1c`, warn / strict | N |
| ooW / ooS | `c4d2d1c`, warn / strict | O |
| noW / noS | candidate, warn / strict (after the swap) | O |
| :4740 | mutant hubs | N |

The daemons used their deterministic fallback (`ANTHROPIC_API_KEY` unset), so old and new compare
exactly. T proved all 15 QA ports free at the end, twice, with 0 QA processes left.

## Results

| Row | Observed | Result |
|---|---|---|
| **INV** | The extractor was validated on `c4d2d1c`: exactly 20 verb routes, after a first run that found 0 (bad path) and would have counted a route named in a comment. Both fixed before it counted. The candidate has the **same 20 routes** plus the `/a2a` and `/a2a/jsonrpc` mounts and `/ui`, and the SDK serves **10 JSON-RPC methods**. Every one has a row below, or is exempt (health, agent-card, `/ui`, register, rotate, whoami). | PASS |
| **A1–A18** (strict) | Every mismatch was refused with the specified code and error text and exactly **one parsed `[authz] REJECT`** line naming the right `what`, route template and caller. The same call as itself succeeded with no line. Rows: `from` 403; non-member post, read, reads, rename, extend 404; aaron on `A-agents` post, rename, extend 404 (owner view read-only); `reader` 403; `peerName`, `agentId` (queue and heartbeat) 403, with the heartbeat target's `lastSeen` unmoved; claim 403; respond by a non-assignee 404 (claimed and unclaimed), with `assignedAgent` kept on completion; create without the caller 403; cross-owner participant 403; unknown key 403 from the guard with no `[authz]` line. **Q2 oracle: every forbidden 404 is byte-identical to a nonexistent id's**, and a malformed id gives the same 404. | PASS |
| **A7 / E1–E3** | The lists are filtered in both modes:<br>- `qa-a1`: A-in and A-agents<br>- `qa-a3`: none<br>- `qa-b1`: B-room<br>- `aaron`: A-in and A-agents<br>- `qa-owner2`: B-room<br>Reads: aaron → A-agents 200, B 404; owner2 → B 200, A 404; `qa-a3` → A-agents 404. A self-declared human `qa-h9` owns itself and sees nothing. **E3b, added:** an agent named as another row's owner gets no owner view (404, not listed). | PASS |
| **A14** | `agents/live`: A's key lists only A's agents and B's only B's, in both modes (Q4). | PASS |
| **A15** | (a) `role:"aaron"` from qa-a1 is narrated as "Incoming from qa-a1". (b) A no-`to` ask from qa-b1 lands only on a B-owned agent. (c) B's text never reaches aaron's Hub activity rooms. Both modes. | PASS |
| **A16, A17** (JSON-RPC) | Another caller's `tasks/get`, `tasks/cancel` and `tasks/resubscribe` give the **same error as a nonexistent id** (`-32001 Task not found`) and leak no content. Cancel left the state unchanged. The four `pushNotificationConfig/*` methods answer "not supported" to everyone, and `agent/getAuthenticatedExtendedCard` answers exactly as `c4d2d1c` does. `createdBy` = the caller (`qa-a1`), read back. | PASS |
| **A19, A20** (O3) | Legacy `to` = another owner's agent: strict 403 `cross-owner to=qa-a1`, with no task created. JSON-RPC: a terminal `rejected` carrying `cross-owner to=qa-a1`. Same-owner `to` succeeds; warn logs and proceeds. | PASS |
| **B1** | Each warn mismatch returns `c4d2d1c`'s status and parsed body on the same data. The named volatile fields are timestamps and ids, plus **`turn` and `maxTurns` on routes that write**, since the new and old calls both write the same room. Each produces exactly one `WOULD REJECT` line with the `AUTH_MODE=warn` tail. **Q8 in warn:** the new hub keeps `assignedAgent` on completion, where `c4d2d1c` wipes it. | PASS |
| **B2** (O1) | An unknown key in warn gets `c4d2d1c`'s answer on every probed route, plus `caller=unknown` lines. `/sessions` and `agents/live` are unfiltered for it (O1 as ruled). | PASS |
| **B3** | **0 `[authz]` lines** from as-self use: D1 and D2 on the candidate (warn and strict) and the page as aaron and qa-owner2 (list, open own and owner-view rooms, post, panel). | PASS |
| **B4** | K (43 scratch keys and their sha256; planted positive found first): **0 hits** over 24 hub and daemon logs and the page's request log. 0 of 163 `[authz]` lines contain a 32+ run. Ids are logged as 8-character prefixes, Rivet's declared choice 2. | PASS |
| **B5** | `[authz]` and `[auth]` lines are distinct. The parser read every `[authz]` line with its own grammar, and auth-log counts them apart (RL1). | PASS |
| **C1, C2** (Q9) | With `qa-a2` set to `allow:[qa-a3]`: qa-a1 → qa-a2 via `/message/send` gives 403 `askPolicy denied` with reason "askPolicy does not allow qa-a1 to ask qa-a2". Via JSON-RPC it gives a terminal **`rejected` carrying the identical reason**, **in warn and strict**. qa-a3 is allowed on both routes. **Baseline:** the `c4d2d1c` hub's JSON-RPC does *not* enforce it (T-004 shown). | PASS |
| **D0** | The `hub-talk.mjs`, `hub-key.mjs` and `src/wrapper` diffs are empty. | PASS |
| **D1, D2** | The suite: `--init-key`, `--peer --say`, `--wait` delivery, `--say`, `--inbox`, `--wait` with an unread turn, parsed receipts; plus a daemon per mode (heartbeat seen live, session reply, a queued task claimed and answered). Old hub on old functions against candidate hub on candidate functions: **26 of 26 steps identical** after normalising names, ids and times. The comparator caught a planted single difference first. | PASS |
| **E4, E5** (page) | As aaron, the history lists his and his agents' rooms and not B's. `A-agents` opens **read-only**: "not in this room", no composer, no extend, **no POST**. In A-in the composer posts `from: aaron`. qa-owner2 gets the mirror. | PASS |
| **E6** (O5) | A register body `owner` (top level and in `agentCard`) is ignored, and the owner is `aaron`. | PASS |
| **F1** | The `c4d2d1c` hubs on the **candidate's functions** (after `convex deploy` onto the running old database): the same 26-step suite, **0 differences** from old-on-old; and the `c4d2d1c` page lists, opens and posts. | PASS |
| **F, Relay's deviation** | `getByName` and `listOnline` return new fields. Through the old hub on the candidate's functions:<br>- the **ask gate** still denies by `askPolicy` (403, both modes)<br>- **escalation** assigns a task<br>- **`agents/live`** returns only the old keys (`kind, lastSeen, name, rowCount`), with no `owner` or `human` leaked<br>- **re-register** returns 200<br>**Loop 3 F1 guard:** no public query probed (`getByName`, `listOnline`, `listAll`, `listVisibleTo`, `createCheck`, `access`) returns `apiKeyHash` or a 64-hex value. | PASS |
| **P14, BF1, BF2** | 12 rows seeded by the old hub on old functions, all without an owner, read back before the push. After the push, 18 rows lacked an owner, and backfill gave `{assigned:18, self:0, untouched:0}`. Every row is now `aaron`. The second run gave `{0,0,18}`. | PASS |
| **BF3** (O4) | After the backfill, the **old** hub registered qa-gap1, qa-gap2 and aaron (human), and the candidate hub was started on the same database (the swap). **Before** the second run, those 3 rows lack an owner and aaron's view does **not** see their room, so there is no query-time default. **After** it: `{assigned:2, self:1}`, aaron sees the room, and **0 rows lack an owner**. | PASS |
| **RL1** | The candidate's `auth-log` block was run on a scratch copy, with `docker` replaced by a planted log and 4 edits shown to land. Result: `auth-lines=3 authz-lines=2`, first and last timestamps and `total-lines=10` correct, all 5 lines printed, and planted hex and base64 masked. | PASS |
| **RL3** | Owner count on planted jsonl: all owned gives `PASS ownerAssigned rows-without-owner=0`; one ownerless gives `FAIL … =1`; empty gives `UNDETERMINED`, rc 2. No full hash is printed. | PASS |
| **RL2** | tcm, in the deploy act, on Aaron's word. | not in this verdict |
| **T1** | `tsc` exit 0. **211 tests** (Rivet: 211). On an LF archive copy, 210 pass; the 1 failure is `repo-reply`'s real-git test (needs a repo). In the CRLF worktree, 196 pass and `hub-key.test.ts` cannot load (the Loop 4 host issue, not the candidate). **Rivet's "92/93 e2e" is not reproduced:** the script is not in the repo. | PASS (211 reproduced) |
| **M** | 11 of 11 caught. Each edit was shown to land, `tsc` was clean, and the check **passed on the real candidate first (control)**:<br>- M1: queue bind removed → A9 gives 200<br>- M2: human-only guard removed → E3b gives 200<br>- M3: `listAll` → qa-a3 sees 3 rooms<br>- M4: forbidden 403 vs absent 404 → the oracle breaks<br>- M5: askPolicy skipped on JSON-RPC → completed<br>- M6: key in the `[authz]` line → leak caught<br>- M7: warn refuses → 403<br>- M8: `assignedAgent` wiped → null<br>- M9: body `owner` honoured → `qa-x`<br>- M10: narrate everyone → B's text in aaron's room<br>- M11: cross-owner skipped on JSON-RPC → completed<br>M2 was deployed to N and then **restored and verified**: pristine functions redeployed, E3b passing again, `convex/` identical to the archive. | PASS |
| **RG1** | Loop 3 key flows in both modes: whoami; rotate (new key resolves, old key 403 in strict and `name:null` in warn); register of a taken name gives 409. | PASS |
| **RG2** | Loop 4 page: no key sends nothing under `/a2a`; `whoami` comes first after a key; a new chat's participants are exactly `[qa-a1, qa-a3]` with the seed `from: qa-a1`. The panel offers only the owner's live agents. | PASS |

## Deviation found by Relay: widened `getByName` and `listOnline`

Recorded as Relay's finding. It is **safe for the deploy window as observed**: the `c4d2d1c` hub on
the candidate's functions ignores the new fields on every path that reads them (ask gate,
escalation, `agents/live`, register), and returns none of them to clients. Design §8's line "no
existing function's return shape changes" was not true of the build. The deviation is additive.

## Rivet's declared choices (recorded)

1. A1 is a widened `auth-log`, not a seventh item, so there is no new allow rule.
2. `[authz]` ids are 8-character prefixes.
3. In strict, a missing session or task gets the same 404 as a forbidden one.
4. The create cross-owner check skips names with no agents row (`Unknown peer` still answers).
5. There is no query-time owner default, except that a human owns itself.

All five were observed as stated. (3) is in the A oracle rows; (5) is BF3's "before".

## Findings

None blocks acceptance. Each is an observation, not a diagnosis.

- **O-1: `/read` still distinguishes "exists but not yours" from "does not exist" in strict.** A
  non-member reader gets 404 `"qa-b1 is not a participant of this session"`; a nonexistent id gets
  400 `"not a session id"`. Criterion A6 required `/read` unchanged, and it is. So Q2's no-oracle
  rule stops short of this route by design. Worth a line in Loop 6's error-page work (T-062).
- **O-2: a denied JSON-RPC ask passes through `working` before `rejected`.** The executor publishes
  submitted, then working, then (gate) rejected. A non-blocking client's first reply is `working`;
  the terminal state is `rejected` (A20 checked both).
- **O-3: `agents:registerAgent` is a public Convex mutation and now takes `owner`.** A process that
  can reach Convex directly can set an owner. That is T-057's class (Convex callable without the
  hub), extended by one field. The **hub route** ignores a body `owner` (E6, M9).
- **O-4: the K7 analyzer exits 0 when it prints `FAIL` lines,** and the owner verdict is a separate
  line from `K7=`. So `agents-summary`'s exit status does not carry either verdict; the lines do.
  The exit behaviour predates Loop 5 (accepted in T-065).
- **O-5: each hub process creates its own "Hub activity" room at startup.** Four hubs on one
  database gave several `[aaron, hub]` rooms. This predates Loop 5 (unchanged code). On tcm, each
  restart may add a room to aaron's list.
- **O-6: the QA `.env`'s Anthropic key is invalid.** The hubs log `classify/store failed … (response
  still delivered)`. The memory classifier path was not exercised. The effect is equal on all hubs.

## Criteria gap found in the run

**E3 as written could not catch M2** (an owner view for any caller). E3's agent, qa-a3, owns no row,
so even a broken guard gives it nothing. I added **E3b** (an agent named as another row's owner),
which passes on the candidate and catches M2. The criteria file gets this row in the same commit
as this report.

## Instrument corrections during the run (none touched the candidate)

Each first run's log is kept in `runs/*-try*.log`.
- **INV:** the first run found 0 routes (a path bug). The fix also stopped a commented-out route
  from counting.
- **rows-n1:**
  - B1's comparator had not named `turn` and `maxTurns` as volatile on routes that write;
  - the lists were matched by title, which a warn-mode rename changed (now by id);
  - FAKE was empty (now a real messages id).
- **rows-n2:**
  - A6 used the wrong body field;
  - A15 read one Hub activity room of several (O-5);
  - JSON-RPC used the non-blocking first reply (now the terminal state, blocking and by `tasks/get`);
  - a policy left by the previous run's C rows refused the task setup (now reset at start);
  - C1 compared the reason with `error` instead of `reason`.
- **suite:** the strict half used the harness's key, not the key `hub-talk` created.
- **page:** agents had to be live for the panel; qa-a2's C policy refused a seed post. The
  `c4d2d1c` hub gives the same 403, so that behaviour is unchanged.

## What could not be verified

- **tcm:** PB, PD and **RL2** (T-065's N and L rows against the new `a2a-readonly`, and the owner
  count reading 0 after the second backfill) run in the deploy act, on Aaron's word.
- **The `[authz]` soak (A2):** what SIA's seats actually do, for example pasting a `--session` id.
- **The LLM paths:** the daemons ran the fallback; the classifier key was invalid (O-6).
- **Rivet's e2e 92/93,** and Aaron's Chrome (W was headless Chromium).
- **The rotated keys in RG1** were not added to K's key list. They went only to the scratch hub, in
  request bodies, which the hub does not log.

## Regressions confirmed

- Loop 3's key flows (RG1).
- Loop 4's page (RG2, and E4's composer).
- SIA's `hub-talk` flows and the daemons, identical old vs new in both modes (D1, D2).
- The old hub on the new functions (F1 and Relay's deviation rows).
