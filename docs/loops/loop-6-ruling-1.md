# Loop 6 ruling 1: on Rivet's design

Relay, session 18, 2026-09-26. Ruling on `docs/loops/loop-6-design.md` at `loop/6-design`
`3df6dbd`, written by Rivet (a2a-grok, D-016). Every line the design cites that this ruling relies on
was read by Relay at `4af8b4c`.

## Verdict: ACCEPTED, with the rulings and one required change below

The design follows the brief and finds real siblings the brief missed. Relay checked three of them:

- `convex/accessLogic.ts:15-17`: `isHumanRow` reads only `agentCard.kind`, so stripping the `owner`
  argument alone does not close the human path.
- `convex/agents.ts:183-186`: a `same` re-register patches `agentCard`, so an existing agent could
  become human later without an insert.
- `src/keys.ts:85,124` return `error.message`.

The whoami correction also holds: a missing key is a 401 in both modes (`src/auth.ts:73-75`), and
whoami sits behind the guard. The brief was wrong to list it as unauthenticated.

## Rulings on section 14

**Q1. Agent issue: refused in both modes. Accepted.** Preserve 4 ("warn refuses nothing new") and
acceptance B protect behaviour that exists today. Issuing a code is a new route with no current
caller, so there is nothing to preserve. Failing closed matches rotate. **Brief acceptance B is read
as excluding `agent-issue`.** Gauge's criteria test it as refused in both modes.

**Q2. Rate limits: no tcm log read is needed, and none is authorised by this ruling.** Section 10
itself shows that the hub does not log requests, so a log read could not measure the rate. The
numbers come from the code and the row count instead:

- **Per key:** one key is one name. The peak is that name's hub-talk pattern: `--wait` polls every
  2000 ms (`scripts/hub-talk.mjs:73`). The same name can have **several processes at once**, for
  example a background `--wait` alongside `--say` and `--inbox`, as this session did with relay. Size
  for at least 3 concurrent hub-talk processes per name, plus a daemon's loop (`src/wrapper/daemon.ts`),
  then apply the 10x headroom.
- **Row count** for anything shared across callers: tcm's read-only `agents-summary` showed 8 rows at
  2026-09-26 ~00:50Z (V-009). a2a-grok is a 9th since. Design for 9 now, and state the formula so it
  scales.

**Q3. `scripts/hub-enroll.mjs` outside hub-talk: accepted.** It is an A2A-Hub operator tool, not the
hub-talk contract, so it is not a D-003 question. `~/.a2a-hub/keys/100.124.212.87-4000/aaron.key`
exists on Aaron's desktop; Relay listed file names only. The script resolves it the way hub-talk
does. It prints the code once and never prints the key.

## REQUIRED CHANGE: a 429 must never reach hub-talk's every-run register

`register()` treats **any 4xx as fatal**: `scripts/hub-talk.mjs:232-234` throws, so the seat exits
with rc 1. hub-talk re-registers on every run (`:346`, `:368`). If `POST /a2a/register` for an
existing name counts in a **global** unauthenticated bucket (section 10's fallback), then several
seats starting at once could 429 each other's register and **break Preserve 1 for every seat**. The
same holds for a 429 on any hub-talk poll: its usage line calls a 4xx non-retryable.

**Required:**

1. A register whose `apiKey` matches an existing row's hash (the `same` case) is counted in **that
   name's per-key bucket**, never the global one. The register handler already hashes the key before
   the mutation (`src/keys.ts:50-53`), so this needs no new trust.
2. The global unauthenticated bucket counts only what is left: new-name registers (codes), a register
   with a key that matches no row, `/ui/*`, and missing-key 401s. Size it for the whole row count
   starting at once, with the headroom.
3. The design states the rule outright: **no hub-talk pattern of an existing name, at any concurrency
   the design sized for, may receive a 429.** Acceptance F's replay includes a burst of every row's
   hub-talk start at once, not only one seat's `--wait`.
4. Teaching hub-talk to back off on 429 instead would change its contract. That is a D-003 question
   through Atlas, and it is not proposed here.

## Other points, no change needed

- **Code time-to-live of 24 h: accepted.**
- **Section 8 (T-070):** a non-member gets `404 session not found`, matching the other session routes
  in strict. A malformed id stays 400 for both. Accepted.
- **Section 5 `createHuman`, admin key only, no HTTP route:** accepted. The operator produces the
  hash to the side. The build documents the exact command so Aaron can run it without programming.
- **Section 7:** `auth-log` widened with `enroll-lines=` and no new menu item. Accepted. Installing it
  on tcm is the Loop 6 deploy act, on Aaron's word.
- **Section 10, Funnel source:** the test is ordered as written. G-001 is unchanged.
- **Live compose differs from the tracked one** (Rivet's Loop 5 required check, reported in the room on 2026-09-26: the live
  `env_file` is `./.env` beside the compose file). The build reads the **live** compose, through
  Aaron's word or the deploy act, before relying on any compose fact for rate limiting (replicas, the
  Traefik path). The tracked file is not evidence of tcm.

## Sequencing

Rivet revises section 10 for the required change on `loop/6-design`, and Relay re-reads that section
only. **Build does not start until the Loop 5 deploy is done and the `[authz]` soak has run (D-012).**
Gauge writes the Loop 6 criteria from the brief's A-H, as amended by Q1 and the required change.
