# Loop 3 — per-agent keys and rotation (T-003)

**Date:** 2026-09-24 · **Author:** planner seat (Relay), session 16 · **Status:** brief, not started.

**Record:** A2A-Hub `state.json` rev 27. Task T-003 (P0), step 2 of T-002's ordered sequence. Code
references are to `ea9d057` (master, v1.8.0). Live facts come from Loop 2's read of tcm (V-003,
`loop-2-revocation-report.md`).

**Seats:** Rivet designs and builds, Gauge accepts, Relay rules on the design.

**Shared with SIA.** Every SIA seat's `hub-talk` holds a key, and changing how `hub-talk` gets its
key changes a contract SIA depends on. **Questions for Aaron about this loop go through the SIA
planner (D-003), quoted.**

**Blocked by:** the SIA hold (narrowed 2026-09-24 ~03:25Z). No builds, test runs or new A2A-Hub
seats on this machine until the SIA planner lifts it. Design work waits with Rivet.

---

## Why this loop

Loop 2 measured tcm on 2026-09-24. **8 of 10 names hold the one `dev-key` hash, and
`getByKeyHash`'s `.first()` resolves that hash to `atlas` for all 8.** Every request made with the
`dev-key` is attributed to `atlas`. The consequences:

- **`AUTH_MODE=strict` rejects none of these requests,** so strict is meaningless for 8 of 10
  agents.
- **Revoking the `dev-key` locks all 8 out at once.**
- **Identity bugs are invisible to tests** (T-003 note: the Loop 1 GET-marks-caller mutant survived
  under the shared key).
- **`reader` on `POST /read` is whatever the caller says** (T-049 limit L2).

What the code does today, derived:

- **Keys are chosen by the client** (`docs/joining-the-hub.md:19`: "Pick a key"). **Seven** client
  sites fall back to or hardcode `"dev-key"`. Defaults when `AGENT_KEY` is unset:
  `scripts/hub-talk.mjs:65`, `src/wrapper/daemon.ts:89`, `scripts/ask-agent.mjs:25` and
  `scripts/a2a-compliance-probe.mjs:20`. Hardcoded: `scripts/demo-loop.mjs:15`,
  `scripts/verify-client-stack.mjs:65` and `client/src/App.svelte:8`. *(Amendment 1: this list
  first said three.)* **A seat that forgets its key silently becomes the shared identity.** That
  is ADR-013's shape.
- **Registration is open** (no key required) and stores `sha256(apiKey)` (`src/index.ts:340-372`).
- **There is no rotation path under strict.** Re-registering a name with a new key is a name claim.
  `evaluateNameClaim` returns `reject` (409) in strict (`src/identity.ts:5-12`), so an agent cannot
  change its own key once strict is on. In warn it is only logged.
- **Nothing stops two names holding one hash.** `getByKeyHash` then picks one silently.
- **No "bootstrap key" exists** in `src/`, `scripts/` or `convex/` at `ea9d057`, although T-003's
  note names one. Rivet: confirm, and say so in the design, so the note can be corrected.

## Objective

**Repair:** `docs/joining-the-hub.md:137-141` still says the deployed hub checks only that a key is
present, and that validation "is waiting on a redeploy". tcm runs v1.8.0 in `AUTH_MODE=warn`
(V-001, V-003). Make the page describe what is actually deployed.

**Capability:** every agent authenticates with a key that belongs to it alone, can change that key
under `AUTH_MODE=strict` without an operator, and the old key stops authenticating the moment it is
replaced. After this loop, a request made with the `dev-key` resolves to no agent.

## What must be preserved

- **No flag day.** Every seat, A2A-Hub's and SIA's, can register and talk through `hub-talk` at
  every step of the migration. tcm stays in `warn` for this whole loop. Flipping to strict is T-002
  step 4, not this loop.
- The local stack still starts. The alice and bob daemons still answer, or T-056 is no worse than
  before.
- Loop 1's read receipts and `--peer` behaviour are unchanged. Loop 1's QA harness
  (`docs/loops/loop-1-qa/`) still runs.
- Revocation of superseded keys still holds (V-003). The `register` collapse is not weakened.
- **No key in any tracked file, commit, log line or transcript.** `src/auth.ts:68` already refuses
  to log keys and hashes. Keep that.

## Conditions the design must settle, and say how

1. **Uniqueness.** What does `register` do when the presented hash is already held by a *different*
   name? Silent sharing is what produced the `atlas` attribution. State the rule for warn and for
   strict.
2. **Rotation under strict.** How an agent proves it holds the current key while presenting a new
   one, and how the old one dies (V-003's property must hold afterwards). Say what happens to a
   second live instance still holding the old key (ADR-011's supersede).
3. **Where a seat's key comes from and lives.** Client-chosen or hub-issued, and where it is stored
   on each of the three hosts: the local stack, tcm's seats, and a remote agent. **A missing key
   must fail closed:** the three `"dev-key"` defaults either go or become loud. Changing
   `hub-talk`'s behaviour is a contract change shared with SIA, so it goes through the design pass
   and D-003.
4. **The migration order on tcm.** The 8 `dev-key` names each move to their own key in warn. How
   does each move, given that re-registering under a new key is a name claim? How does anyone see
   the migration is complete? That check is a Loop 2-style read, and it must show that the
   `dev-key` resolves to no name.
5. **`POST /read`.** Add `reader === req.agentName` (T-049 limit L2), with its behaviour in warn and
   in strict stated.
6. **Names nobody has claimed.** Open registration lets anyone create a new name. State whether that
   stays open for T-002 step 6 (the remote agent registers itself), and what limits it (T-005 is
   rate limiting).

Rivet proposes. Relay rules on the result, not on the implementation.

## Acceptance (Gauge writes the criteria from these)

- **K1.** Two agents registered with distinct keys: each key resolves only to its own name. A key
  presented under a second name is handled by condition 1's rule, in both modes.
- **K2.** Rotation under strict: after an agent rotates, the new key resolves to it and the old key
  resolves to no name (strict 403, warn logs `WOULD REJECT`). Both directions are asserted.
- **K3.** Loop 1's GET-marks-caller mutant is killed with per-seat keys, using no special QA setup
  beyond what the design makes standard.
- **K4.** `POST /read` with `reader` ≠ the key's name follows condition 5, in both modes.
- **K5.** A client with no key does not silently become a shared identity. It fails, or is visibly
  flagged, as condition 3 rules.
- **K6.** No key or full hash appears in any tracked file, commit or hub log produced by the QA run.
- **K7.** Live, after Aaron's word for each act (deploy, Convex function push, each seat's
  re-registration): a Loop 2-style read-only check of tcm shows every name with its own hash, the
  `dev-key` held by no name, no stale hash, and `AUTH_MODE` still `warn`.

## Out of scope

- Flipping `AUTH_MODE=strict` (T-002 step 4), exposure (step 5), and rate limiting (T-005).
- `askPolicy` on JSON-RPC (T-004).
- Agent `status` never going offline (observation in Loop 2's report; not triaged).
- T-017's two cursors. Also a `hub-talk` contract change, but a separate one. Do not bundle them.

---

## Amendment 1 — Relay's ruling on Gauge's objections (2026-09-24, session 16)

Gauge (a2a-qa-5f) read the brief at `3f46b97` against `ea9d057` and raised six objections and two
notes. Relay checked O1 and O4 in the code before ruling. **All are accepted.** Where this section
and the text above disagree, this section holds.

**Relay's error, recorded.** The brief named three `dev-key` sites. There are seven: Gauge found
six, and Relay's re-check found the seventh (`client/src/App.svelte:8`). The brief reported a line
when it had found a class, which is a known failure shape of the planner seat. It reached this
artifact and both seats.

- **O1 (blocking, accepted). In warn, `register` re-keys any name.** On a name claim,
  `evaluateNameClaim` returns `warn`, and `agents.register` then patches the canonical row to the
  presented hash (`convex/agents.ts:55-62`). A stale client re-registering with the `dev-key` would
  undo a migration, so K7 could pass and regress within the hour. **New condition 7: once a name
  holds a key of its own, a register presenting a different hash must not replace it, in warn as
  well as in strict.** Rotation (condition 2) is the only way to change it. How it is enforced is
  Rivet's call. **New K8:** in warn, re-registering a migrated name with its old key, or with the
  `dev-key`, leaves the stored hash unchanged. Assert both directions: the name's own key still
  resolves to it.
- **O2 (accepted).** K2 also asserts: after a rotation, a second live instance holding the old key
  fails (403 in strict, `WOULD REJECT` in warn), and cannot restore the old key by re-registering.
- **O3 (accepted).** K2 gains two negative cases. A rotation that does not prove the current key
  (a wrong key, or none) does not rotate. A rotation to a hash another name already holds follows
  condition 1.
- **O4 (accepted, widened to seven sites).** Condition 3 and K5 cover all seven. **K5's check is a
  search of `src/`, `scripts/` and `client/` that finds no `dev-key` fallback or literal.** The
  search is validated first against a known positive, for example the current tree.
- **O5 (accepted). "Or visibly flagged" is struck from K5.** Warning and carrying on would re-key
  names in warn (O1). The design picks one: the defaults go, or `register` refuses the `dev-key`
  hash in both modes. Either way the objective holds: the `dev-key` resolves to no name.
- **O6 (accepted).** K6 covers transcripts as well as files, commits and logs. A hub-issued key goes
  straight to storage, never to stdout. **Definition:** in K6, a "key" is any key that
  authenticates on tcm or the main local stack. Keys a QA harness generates at run time for a
  throwaway stack are not keys under K6. Literal keys in tracked test files are allowed only if
  nothing registers them outside a throwaway stack.
- **N1 (accepted).** Condition 4 also says what happens to names nobody migrates (for example
  `clark`, last seen 2026-09-20). Deleting or re-keying a row on tcm is a live Convex write and
  needs Aaron's word for that act. K7 stays data-level: a read-only check, with no request sent to
  tcm using the `dev-key`.
- **N2 (noted).** Under the SIA hold, only K7's preparation can happen. K1-K6 and K8 wait for the
  hold to lift.
