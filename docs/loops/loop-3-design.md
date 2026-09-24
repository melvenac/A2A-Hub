# Loop 3 — per-agent keys and rotation: design (T-003)

**Date:** 2026-09-24 · **Author:** Rivet (developer seat), session 16 · **Status:** design, for
Relay's ruling. Nothing here is built or tested (SIA hold).

**Brief:** `docs/loops/loop-3-per-agent-keys-brief.md` at `fe0ef05` (`origin/docs/session-16-t017`),
**including Amendment 1**, which holds where it and the brief's first text disagree. It rests on
`loop-2-revocation-report.md` on the same branch. **Code references are to `ea9d057`** (master,
v1.8.0), the tree this branch starts from.

**Shared with SIA.** Section 3 changes `hub-talk`'s contract. The changes SIA would see are listed
in one place, **§3.5**, for Relay to route through the SIA planner (D-003). Nothing in this design
needs Aaron's word until build or deploy; §10 lists the acts that do.

---

## 0. The bootstrap key: refuted

**No "bootstrap key" exists in code, and none ever has.** T-003's note should drop it.

- `git grep BOOTSTRAP ea9d057 -- src convex scripts wrapper client tests Dockerfile
  docker-compose.yml start-stack.ps1`: no match.
- `git log --all -S HUB_BOOTSTRAP -- src convex scripts wrapper client tests Dockerfile
  docker-compose.yml`: no commit, on any ref. No code has ever read it.
- `HUB_BOOTSTRAP_KEY` lives only in config and docs: `.env.example:3`, `DEPLOY.md:166,190`,
  `README.md:236` (which calls it **required**), `reference/ARCHITECTURE.md:162`,
  `.agents/SYSTEM/PRD.md:77,88,120` (PRD says `/a2a/register` "requires bootstrap key"; it does not),
  `.agents/SYSTEM/RULES.md:57`. `changeme123` appears only in old INBOX text (Sessions 1–3).

**Consequence for the build:** those seven places are stale and should be removed or corrected in
the same change (docs only). Registration is open, and this design keeps it open (§6).

---

## 1. Uniqueness — a key belongs to one name

### Terms

- **Owned name.** The name's stored hash is held by no other name. Today: `cursor-grok`,
  `grok-probe`.
- **Shared name.** Its stored hash is also held by another name. Today: the 8 `dev-key` names.
- **Acquiring a hash.** A register or rotate that would leave a name holding a hash it does not
  hold now. Re-registering with the hash you already hold is not acquiring.

### Rules (both are enforced inside the Convex mutation, see §1.3)

**U1. No name may acquire a hash another name holds. Both modes: `409 key held by another agent`.**
This covers a new name, an owned name, and a shared name moving to another shared hash. **New
sharing is never created, in warn or strict.** The response names neither the other agent nor the
hash.

**U2. A shared name re-registering with the hash it already holds:**
- **warn:** allowed, as today, and logged `[auth] WOULD REJECT shared key on register <name>`
  (name only). This keeps the 8 unmigrated seats working (no flag day).
- **strict:** `409 key shared with another agent; migrate first`. Strict is only flipped after K7
  shows no shared hash (T-002 step 4), so this does not fire in practice. It is stated so strict
  never admits a shared key.

**U3. A hash held by two or more names authenticates nobody.** `getByKeyHash`
(`convex/agents.ts:139`) reads up to two rows from `by_apiKeyHash`; if they carry different names it
returns "shared" rather than the `.first()` row. `requireAgentKey` then treats the caller like an
unknown key: strict 403, warn `WOULD REJECT shared X-Agent-Key on <route>` and `req.agentName =
null`. **The `dev-key` stops resolving to `atlas` on deploy**, before anyone migrates.

Why U3 is safe in warn: `req.agentName` feeds `evaluateAsk` (`src/ask-policy.ts`) and the
self-skip in `POST /a2a/session/:id/message` (`src/index.ts:412-415`). A null asker is *allowed* by
`evaluateAsk` (ADR-012), so U3 can only lift an askPolicy denial for a `dev-key` caller in warn; it
cannot block one. Every other route ignores `req.agentName`. The gain: the warn log now counts
shared-key traffic separately, which is a live progress signal for the migration (§4.4).

### 1.3 Where the rule lives

**In `agents.register` (and the new `agents.rotateKey`), not in Express.** Two reasons:

1. **Atomicity.** Today the name-claim check runs in Express (`src/index.ts:352-362`) and the write
   runs later in the mutation, so two registers can interleave. A Convex mutation is serializable:
   the "who holds this hash" read and the write commit together.
2. **Bypass.** `docker-compose.yml:48-49` publishes Convex on `3210:3210`, i.e. on every
   interface. If tcm's live compose matches the tracked one (**not verified**; Loop 2 used
   `127.0.0.1:3210` from inside tcm), anyone on the tailnet can call the public mutation
   `agents:register` directly and skip every Express check. Rules inside the mutation hold for that
   caller too. **The mode-independent rules (U1, C7, the key floor) do not depend on the caller
   being honest about `AUTH_MODE`.** See §9 for what this does not fix.

`evaluateNameClaim` (`src/identity.ts:5-12`) is replaced by one pure decision function shared by the
mutation and the unit tests (the same pattern as `decideHeartbeat` in `convex/instanceLogic.ts`).

---

## 2. Rotation under strict

### 2.1 Route

`POST /a2a/rotate`, **inside the `/a2a` guard** (unlike `/a2a/register`, `src/index.ts:119-123`).

```
POST /a2a/rotate
X-Agent-Key: <current key>
{ "newApiKey": "<new key>", "instanceId": "<optional>" }
→ 200 { "ok": true, "name": "<name>" }     (no key, no hash, in any response)
```

- **Proof of the current key is the `X-Agent-Key` header, resolved by the guard.** The name is
  `req.agentName`. **The body carries no name**, so no one can rotate another agent's key.
- **Fails closed in both modes.** If `req.agentName` is null (unknown key, shared key under U3, or
  no key), the handler returns `403 rotation requires your current key` in **warn as well as
  strict**. It is a new route with no legacy callers, so this is not a flag day. A shared key
  therefore cannot rotate: **a `dev-key` name migrates by claim (§4), never by rotate.**
- `newApiKey` must pass the key floor (§3.3) and differ from the current key: else `400`.

### 2.2 Mutation `agents.rotateKey({ name, currentHash, newHash, instanceId? })`

Atomic, in one transaction:

1. Collapse the name's rows exactly as `register` does (canonical = newest `lastSeen`, tie by
   `_id`; delete the rest, `convex/agents.ts:41-73`). **The collapse is reused, not weakened.**
2. **Compare-and-swap:** canonical `apiKeyHash` must equal `currentHash`, else `409 stale key`.
   This closes the race of two rotations with the same old key: the second one loses.
3. **U1:** `newHash` held by any other name → `409 key held by another agent`.
4. Patch `apiKeyHash = newHash`. If `instanceId` is given, also take the instance lease
   (`activeInstanceId = instanceId`, `lastHeartbeatAt = now`); if not, set `activeInstanceId` to a
   fresh random id the hub generates and discards (see 2.3).

**How the old key dies:** `getByKeyHash` resolves by the index on the *current* value. After the
patch no row holds the old hash, so the next request with it resolves to nothing: strict 403, warn
`WOULD REJECT`. **V-003's property (no stale hash resolves) holds by construction**, as it does for
`register` today.

### 2.3 A second live instance still holding the old key (ADR-011)

**Rotation supersedes every live instance, in both modes.** Step 4 moves the lease, so:

- **Its heartbeat** (`POST /a2a/heartbeat/:name`) gets `409 superseded` from `decideHeartbeat`
  (lease held by another id, fresh) and `daemon.ts:272-274` exits, as it does today. In strict it
  gets 403 from the guard first; **the daemon must treat 403 on any hub call as fatal** (exit 1,
  `key rejected for <name>; run --init-key or --rotate-key`), not retry.
- **Its requests** carry the old key: strict 403; warn `WOULD REJECT unknown X-Agent-Key`, passed
  through with `req.agentName = null`, i.e. unattributed. Warn stays advisory, which is the
  documented cost of warn.
- **It cannot restore the old key.** Re-registering the name with the old key is acquiring a hash
  on an owned name: **409 in both modes (C7)**. Rotating back needs the *current* key in the
  header, which it does not have: 403.

The random lease id in step 4 exists so a rotation made by a short-lived tool (no instance of its
own) still supersedes the daemon. It goes stale after 45 s (`INSTANCE_LIVENESS_MS`), so a daemon
started with the new key takes the lease normally at its next register.

### 2.4 `whoami`

`GET /a2a/whoami` → `{ "name": <req.agentName or null> }`. Read-only, guarded. Clients use it to
check a key without a side effect: after `--init-key`, after `--rotate-key`, and when recovering an
interrupted rotation (§3.4). It sends no key back.

---

## 3. Where a seat's key comes from and lives

### 3.1 Client-generated, not hub-issued

**The key is generated by the client's own tooling** (32 bytes from a CSPRNG, base64url, 43
characters) **and never leaves the client except in the `register` / `rotate` body and the
`X-Agent-Key` header.** The hub never returns a key in any response.

Why not hub-issued: a hub-issued key must come back in an HTTP response, and from there it reaches
stdout, a proxy log or a Claude transcript unless every client handles it perfectly (Amendment O6).
Client generation removes that path instead of guarding it. A remote agent (T-002 step 6) also
keeps its own secret without trusting the hub's transport for it.

### 3.2 Storage, per host

**Resolution order in every client:** `AGENT_KEY` env var if set, else the key file
`$A2A_KEY_DIR/<hub-id>/<name>.key` (default `A2A_KEY_DIR = ~/.a2a-hub/keys`, `hub-id` = the
`HUB_URL` host and port, e.g. `127.0.0.1-4000`, `tcm-4000`), **else fail closed**: exit 1 before any
network call, with `no key for <name> on <hub>: run hub-talk --as <name> --init-key` (rc 1 is
hub-talk's "usage or non-retryable" code). **The error never contains a key.**

| Host | Where the key lives |
|---|---|
| **Local stack** (alice, bob, local seats) | Key files under the Windows user's `~/.a2a-hub/keys/127.0.0.1-4000/`. `start-stack.ps1` generates one per daemon name if missing (`hub-key.mjs init`, no network) before it launches `daemon.js --name <n>`. `.env` is shared by alice and bob, so it **cannot** hold their keys; `.env` gets no `AGENT_KEY`. |
| **tcm's seats** (every seat whose `HUB_URL` is tcm, A2A-Hub's and SIA's) | Key files in the home directory of the OS user running the seat, under `tcm-4000/` (or whatever host the seat's `HUB_URL` names). A containerised seat gets `AGENT_KEY` from an untracked env file or Docker secret, never from the compose file. |
| **Remote agent** (T-002 step 6) | Its own secret store, generated by its own CSPRNG. `joining-the-hub.md` tells it: at least 32 characters, random, never reused across names, sent only in `register` and `X-Agent-Key`. |

The key directory is outside every repository, so no key can be committed by accident. Files are
created mode `0600` on POSIX; on Windows the user-profile ACL applies.

**Threat model, stated plainly.** Seats that share one OS user can read each other's key files.
Per-seat keys separate *identity* among cooperating seats (the `atlas` collapse, the hidden M3
mutant). They do not isolate a seat from a hostile process running as the same user. That would
need per-seat OS users, which is out of scope.

**`AGENT_KEY` stays** for hosts with no home directory (containers, CI, the QA harness). **A Claude
seat must never set it inline in a command it runs**: that puts the key in the transcript. The
key file is the path for seats. `docs/joining-the-hub.md` and the hub-talk header say so.

### 3.3 Key floor (register and rotate)

**A key acquired by register or rotate must be at least 32 characters. Both modes, `400 key too
short (min 32)`.** Re-registering with the hash a name already holds is exempt: the name already has
that key, and refusing it would break the 8 `dev-key` seats (and any short key an outside bot uses)
on deploy.

This is how **the `dev-key` is refused structurally**, with no literal in the code: `dev-key` is 7
characters, so no name can ever acquire it again, in either mode, once the grandfathered holders
have moved off it. It also refuses the other short hand-picked keys (`<name>-key` in the Loop 1
harness; see §7).

### 3.4 The seven `dev-key` sites (Amendment O4/O5)

**O5 choice: the defaults go.** The key floor (§3.3) additionally makes the hub refuse the
`dev-key` for any name not already holding it, in both modes, so a stale client cannot bring it
back. Both, because the first is a client change SIA must adopt and the second is the
deterministic backstop if a copy of the old client survives.

| Site | Becomes |
|---|---|
| `scripts/hub-talk.mjs:65` | Resolver (§3.2). New `--init-key` and `--rotate-key` (below). |
| `src/wrapper/daemon.ts:89` | Resolver for `--name`. 403 on any hub call is fatal (§2.3). |
| `scripts/ask-agent.mjs:25` | It registers a fresh name `ask-<pid>` per run (`:47`). It gets an **ephemeral key**: generated in memory, used for this run, never stored or printed. `--from <name>` uses the resolver instead. |
| `scripts/a2a-compliance-probe.mjs:20` | `--key`, `AGENT_KEY` or the resolver with `--as`; none → exit 1. |
| `scripts/demo-loop.mjs:15` | Ephemeral key for its own throwaway names (as ask-agent). |
| `scripts/verify-client-stack.mjs:65` | Ephemeral name + key (`verify-<pid>`), registered for the check. |
| `client/src/App.svelte:8` | Field starts empty; nothing is sent without a key (missing key is already 401 in both modes). Which name Aaron's browser client uses is a question for Aaron (§10, Q3), local-only, not blocking. |

**hub-talk `--init-key`**: generate, write to `<name>.key.next`, register the name with it, confirm
with `whoami`, then rename to `<name>.key`. **Prints the name, the hub, the file path and an
8-hex hash prefix, never the key.** The prefix is what K7's read-only check prints, so the two can
be matched by eye. On any failure it deletes `.next` and exits 1 with the hub's error.

**hub-talk `--rotate-key`**: same file dance around `POST /a2a/rotate`. If the process dies after
the hub commits but before the rename, `.key` is dead and `.next` is live. The next run of any
command that finds a `.next` file checks it with `whoami` and promotes it if it resolves to the
name, with a stderr note. **Nothing is ever lost silently** (ADR-013).

**hub-talk's `register()` stops swallowing errors** (`scripts/hub-talk.mjs:169-183` ignores the
status and `.catch(() => {})`). A 4xx from register is now rc 1 with the hub's message. Otherwise a
C7 or U1 rejection would be invisible and the seat would carry on unattributed.

### 3.5 hub-talk contract changes, for D-003 (SIA)

1. **No default key.** With no `AGENT_KEY` and no key file, hub-talk exits 1 before any network
   call. Today it silently uses `dev-key`.
2. **New key file** `~/.a2a-hub/keys/<hub-id>/<name>.key`, read automatically for `--as <name>`.
3. **New flags** `--init-key` and `--rotate-key`. Existing flags and exit codes 0/1/2 are
   unchanged.
4. **Register failures are now rc 1** with the hub's reason (was silent).
5. **One-time step per SIA seat:** `hub-talk --as <name> --init-key` against tcm, once §4's
   deploy is in, each on Aaron's word (K7).
6. **Hub side, visible to SIA:** a key held by another name, or shorter than 32 characters, is
   refused at register in both modes; a migrated name cannot be re-registered with a different key
   (C7).

T-017's cursor change is **not** bundled (brief, out of scope).

---

## 4. Migration on tcm

### 4.1 How a `dev-key` name moves: a claim, once, in warn

A shared name's first register with a fresh key is a **name claim onto an unshared hash**. In warn
the new mutation allows it (U1 passes: nobody holds the new hash; the floor passes) and logs
`[auth] MIGRATE <name>: shared key replaced by own key`. From that moment the name is **owned**
and C7 applies: no register can move it again, only rotate.

This is the one place warn still lets a register change a stored hash, and it can only ever move a
name **off** a shared hash, never onto one (U1). The migration is therefore a ratchet: the set of
shared names only shrinks. Under strict the claim is refused (U2), which is why migration finishes
before T-002 step 4.

**Hijack in the window, stated.** Until a seat migrates, anyone on the tailnet can claim its name
first. The rightful seat then gets `409 name holds its own key` from `--init-key`: loud, not
silent, and repaired by `agents:release` (§4.3) on Aaron's word. The window is open today already
(warn lets anyone re-key anything); this design closes it name by name.

### 4.2 Order, each step on Aaron's word

0. **Now, under the hold:** this design; Gauge's criteria; the `joining-the-hub.md` repair
   (docs only).
1. **Build and QA on a throwaway stack** once the hold lifts (K1–K6, K8).
2. **Pre-deploy read (read-only):** tcm's hub log for `WOULD REJECT name claim on cursor-grok` or
   `grok-probe`. Both are owned today, so C7 binds them from deploy. If either bot picks a new key
   per run, it would get 409 after deploy, and its operator must be told first.
3. **Deploy** the hub and push the Convex functions to tcm, `AUTH_MODE` stays `warn`. Nothing
   changes for the 8 shared names (U2 warn), except they now resolve to no one (U3). **Loop 2's
   read, repeated:** still 10 rows, same hashes.
4. **Canary: `relay`** (A2A-Hub's own seat, operated by the planner): `hub-talk --as relay
   --init-key` with `HUB_URL` at tcm, then `whoami`, then a round trip with another seat.
5. **SIA's seats** (`atlas`, `forge`, and any other SIA name on the list), in the order the SIA
   planner picks, each after its seat runs the new hub-talk (§3.5).
6. **Outside bots** `grok`, `cursor`: their operators, told by Aaron.
7. **Names nobody migrates** (§4.3).
8. **K7:** the completion check (§4.4).

A seat that has not moved keeps working throughout, in warn, unattributed. **No step takes a
working seat down**, except a seat still running a client whose code predates §3.5 and whose name
has already migrated: its register gets 409, which the old hub-talk ignores, and it carries on in
warn as an unattributed caller. That is the intended result: it can no longer undo the migration
(C7, K8).

### 4.3 Names nobody migrates (Amendment N1)

`clark` (last seen 2026-09-20), `probe` and `general` look abandoned. A name left on the `dev-key`
keeps the `dev-key` held, and K7 fails. Three options, **each a live Convex write on tcm, so each
needs Aaron's word per name:**

- **(a) Aaron migrates it** from the workstation with `--init-key` like any seat. The key lands in
  his key directory; the name stays his and can be revived. **Recommended for `clark`**, which is
  the default name of Aaron's own assistant.
- **(b) Release it:** a new `internalMutation agents:release({ name })` deletes the name's `agents`
  row (the `peers` row and its sessions stay). Callable only with the admin key, via `convex run`.
  The name becomes unclaimed and the next register takes it. **Recommended for `probe` and
  `general`** if Aaron confirms they are test names. The same mutation is the operator's repair for
  a lost key or a hijacked name.
- **(c) Leave it.** K7 cannot pass until it moves, and strict stays off.

Aaron chooses per name (§10, Q2). No option sends a request to tcm with the `dev-key` (N1).

### 4.4 Seeing that the migration is complete

**K7 is Loop 2's instrument, re-run read-only** (`convex data agents --limit 8000 --format jsonl`
into the local analyzer, prefixes only). It must show:

- every name has one row, and every hash is held by exactly one name;
- the hash of `dev-key` (computed locally by the analyzer, compared by prefix `7e9f8fd1`) is held by
  **no** name;
- no stale hash resolves (V-003);
- `AUTH_MODE` is `warn`.

**A second, independent signal:** after step 7, the hub log has no `WOULD REJECT shared` line over
a working day. Shared-key traffic is counted separately thanks to U3.

---

## 5. `POST /a2a/session/:id/read` (T-049 limit L2)

Add `reader === req.agentName` in the handler (`src/index.ts:509-529`), after the existing 400
checks:

- **strict:** mismatch → `403 reader is not the caller`. (A null `req.agentName` never reaches the
  handler in strict: the guard has already returned 403.)
- **warn:** mismatch, or `req.agentName` null → log `[auth] WOULD REJECT reader <reader> for caller
  <name|unknown> on POST /read` and **mark as today**. Receipts keep working for unmigrated seats.

hub-talk keeps sending `reader`, so Loop 1's receipts and `--peer` behaviour are unchanged. The
comment at `src/index.ts:505-508` and L2 in `joining-the-hub.md:118` are updated.

---

## 6. Names nobody has claimed: registration stays open

**Open**, because T-002 step 6's remote agent registers itself, and an operator-only registry would
put Aaron in every seat's path. What limits it after this design:

- **C7:** a registered name cannot be taken over, in either mode. Only rotate or an operator
  `release` changes its key.
- **U1:** a key cannot be shared, so a new name cannot borrow another agent's identity.
- **Key floor:** 32 characters, so a new name cannot be registered with a guessable key.
- **Name format:** `^[a-z0-9][a-z0-9-]{0,62}$`, 400 otherwise. All 10 tcm names match. It stops
  junk and look-alike names (`Relay`, `relay `). Relay may strike this if it is out of scope.
- **Reach:** tcm is on the tailnet only. **Squatting and registration floods stay possible for
  anyone on the tailnet** until T-005 (rate limiting). Exposure (T-002 step 5) must wait for T-005
  and strict. Named here, not solved here.

---

## 7. Condition 7 (Amendment O1): a migrated name keeps its key

**C7. On an owned name, a register presenting a different hash is refused: `409 name holds its own
key; use rotate`, in warn as well as strict. The stored hash is not changed.** Rotation (§2) is the
only way to change it; `agents:release` (§4.3) is the operator's way out.

Enforced in `agents.register` before the patch at `convex/agents.ts:55-62`: the mutation reads the
canonical row's hash, checks whether any other name holds it (`by_apiKeyHash`, two rows), and
refuses if the name is owned and the presented hash differs. **The warn-mode re-key that O1 found is
gone for owned names.** For shared names it survives only as §4.1's one-way move off a shared hash.

**K8 follows directly:** re-registering a migrated name with its old key (the `dev-key`) or any
other key leaves the stored hash unchanged, and the name's own key still resolves to it.

### The whole register decision, one table

`N` = the name, `H` = presented hash. Rules in order; the first that matches wins.

| Case | warn | strict |
|---|---|---|
| `H` held by another name, and `N` does not hold `H` (U1) | 409 | 409 |
| `H` acquired and key shorter than 32 (floor) | 400 | 400 |
| `N` new | insert | insert |
| `N` holds `H` already, `H` unshared | ok (heartbeat-like, as today) | ok |
| `N` holds `H` already, `H` shared (U2) | ok + `WOULD REJECT shared` | 409 |
| `N` owned, `H` differs (C7) | **409** | 409 |
| `N` shared, `H` differs and is unshared (migration, §4.1) | ok + `MIGRATE` | 409 |

Every refusal leaves the stored hash unchanged, so which of two refusals fires first (a short key on
an owned name gets 400, not 409) does not matter for K8. The collapse of extra rows runs on every
accepted register, as today.

---

## 8. What stays the same

- `AUTH_MODE` default and meaning; missing key is 401 in both modes; unknown key is warn-log /
  strict-403; `src/auth.ts:68-72` still logs no key or hash. New log lines carry names only.
- Register collapse and V-003's revocation property (§2.2 reuses the collapse).
- ADR-011 Layer B: register is the takeover, heartbeat renews or supersedes. Rotation adds one more
  takeover.
- Loop 1 receipts, `--peer`, exit codes 0/1/2.
- **Loop 1's QA harness needs a change to run** (Gauge's instrument, Gauge's call): `harness.mjs:18,
  25,76` default to the `dev-key` and `key(n) = "<n>-key"` is under 32 characters, so its
  registrations would get 400/409 on the new hub. The change: `key(n) = <n>-<run salt>` with a
  32-hex random salt per run (a throwaway key, O6), `register()` and `talk()` take the seat's key,
  and `hub()` has no default key. That same per-seat setup is what kills M3 (K3), and it is now the
  standard setup. `m3check.mjs`'s `M3.devkey` line changes meaning (the `dev-key` resolves to no
  one), so it becomes a check that the `dev-key` is refused.
- The local stack starts, with keys generated by `start-stack.ps1` on first run. On an existing
  local database where alice and bob hold the `dev-key`, their first register with their own key
  is §4.1's migration, in warn. T-056 is untouched.

---

## 9. Found on the way (not ruled here, not bundled)

- **Convex published on `3210:3210`** (`docker-compose.yml:48-49`). If tcm matches, every public
  Convex function is callable from the tailnet without the hub: `messages:markRead` with any
  `reader`, `agents:heartbeat` for any name, and so on. §1.3 keeps the key rules safe from that
  caller; nothing else is. Candidates: bind `127.0.0.1:3210`, or make hub-only functions
  `internalMutation`. Belongs with T-002 step 5 (exposure). **Unverified on tcm.**
- **Other caller-asserted identities, the same shape as L2:** `POST /a2a/heartbeat/:agentId` (any
  key can heartbeat any name), `POST /a2a/session/:id/message` `from`, `POST
  /a2a/task/:id/claim` `agentName`. Condition 5 covers only `/read`, as the brief says. With per-
  agent keys all three can be checked the same way later.
- **`README.md:236` calls `HUB_BOOTSTRAP_KEY` required** (§0).

---

## 10. For Relay

**Rulings asked:**

1. U3 (a shared hash resolves to no one, from deploy). It changes warn behaviour for the 8 names:
   askPolicy can only get more permissive for them, and nothing is blocked.
2. The key floor as the structural `dev-key` refusal (§3.3), instead of a literal.
3. The name-format rule in §6: keep or strike.
4. §9's items: triage or drop.

**Questions for Aaron, via the SIA planner (D-003), none blocking design:**

- **Q1.** The §3.5 contract changes to hub-talk, which every SIA seat runs.
- **Q2.** Per abandoned name (`clark`, `probe`, `general`): migrate, release or leave (§4.3).
- **Q3.** Which name his browser client (`client/`) should use now that it has no default key.

**Acts that need Aaron's word, in order:** the pre-deploy log read (§4.2 step 2); the deploy and the
Convex push (step 3); each seat's `--init-key` against tcm (steps 4–6); each `release` or migration
of an abandoned name (step 7); K7's read.
