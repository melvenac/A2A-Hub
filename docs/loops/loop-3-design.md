# Loop 3 — per-agent keys and rotation: design (T-003)

**Date:** 2026-09-24 · **Author:** Rivet (developer seat), session 16 · **Status:** revision 1,
answering Relay's ruling 1 (`docs/loops/loop-3-ruling-1.md`, `c34a792`). Nothing here is built or
tested (SIA hold).

**Revision 3 (D-007 and the browser client, for Relay, from `e166057`):**
- The 8 `dev-key` rows are released, not migrated (§4.1, §4.2, §4.3).
- The unused four are released in the deploy act. Each live name is released and re-registered
  in one transaction at its own step, so no gap exists.
- The case of an old client on a released name is stated (§4.3).
- New **§12**: a key for the human peer `aaron` that never changes its peer type (local stack).

**Ruling 2 (`e709329`): approved to build** once the SIA hold lifts, subject to B1 and B2. Both are
written into **§11** as binding conditions, and §1.2 and §3.6 now point to it. **Folded in with them
are SIA record 90's corrections (via Relay, T-003 note rev 30):**
- `grok` is SIA's seat, so it moves to steps 6 and 9;
- tcm's spelling is `http://100.124.212.87:4000`;
- the unmigrated names are split by owner (§4.3; superseded by D-007 in revision 3);
- SIA's candidate window is a precondition of step 3.

Gauge's unit-test finding is in §8.

**Revision 1, what changed:** **R1**, ownership is a stored field (`keyStatus`), and only an owned
row authenticates (§1, §7). **R2**, the main-checkout cutover is placed in §4.2, and every seat gets
its key file before its hub-talk changes (§3.6). Also: the name-format rule is struck (now T-059,
§6). §9's items are now T-057 and T-058. The `HUB_BOOTSTRAP_KEY` doc repair is in scope (§0).
There is one `HUB_URL` spelling per hub (§3.2). U1, the key floor, C7's refusal, rotation and
condition 5 are unchanged.

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

**Consequence for the build (in scope, ruling 1 §10.4):** those seven places are removed or
corrected in the same change, alongside `joining-the-hub.md:137-141`. Docs only. Registration is
open, and this design keeps it open (§6).

---

## 1. Uniqueness — a key belongs to one name

### 1.1 Ownership is stored: `keyStatus` (R1)

**New optional field on `agents`: `keyStatus: "owned" | "legacy"`.** A row with no `keyStatus` is
treated as `legacy`. The status is **written, never recomputed from how many names share a hash**:

- **`owned` is set only when a name acquires a key under the new rules:** the insert of a new name,
  a migration claim (§4.1), or a rotate (§2). Each of these has already passed U1 and the key floor,
  so an owned hash is held by exactly one name.
- **Rows present at deploy are classified once** by `internalMutation agents:classifyAtDeploy`
  (admin key, `convex run`), which runs in the same act as the Convex push (§4.2). It touches only
  rows that have no `keyStatus`. **A row whose hash no other name holds becomes `owned`, and a row
  whose hash is shared becomes `legacy`.** Run a second time, it changes nothing.
- **Attrition cannot promote a row, even if the classification runs late.** Three paths can take
  a holder away from a hash: a legacy row's migration, `agents:release` (§4.3), and the register
  collapse deleting a duplicate row that carries an older hash (`convex/agents.ts:64-73`; tcm has
  no duplicates today, per Loop 2). Before any of them writes, it stamps `keyStatus: "legacy"` on
  every row with no status that holds the hash being given up. Rotate is not a fourth path,
  because an owned hash has no other holder. So if bob is the last `dev-key` holder when `classifyAtDeploy` runs, bob is already
  stamped `legacy` and is skipped. **A hash that was shared at deploy never becomes owned by
  attrition**, whatever order the acts happen in.
- **`legacy` never turns into `owned` in place.** A legacy row becomes owned only by acquiring a
  fresh hash (migration). Its old hash stays unowned until no row holds it.

**Classification at deploy (ruling 1: "say which"):** `cursor-grok` and `grok-probe` were unshared
at Loop 2's read, so `classifyAtDeploy` makes them **owned**. They keep authenticating, and C7 binds
them from that moment (hence the pre-deploy churn check, §4.2 step 2). The 8 `dev-key` names become
**legacy**. `classifyAtDeploy` prints only counts (`owned N, legacy M`), never a name next to a hash.

### 1.2 Rules (enforced inside the Convex mutation, see §1.3)

**U1. No name may acquire a hash another name holds. Both modes: `409 key held by another agent`.**
This covers a new name, an owned name, and a legacy name moving to another shared hash. **New
sharing is never created, in warn or strict.** The response names neither the other agent nor the
hash.

**U2. A legacy name re-registering with the hash it already holds:**
- **warn:** allowed, as today, and logged `[auth] WOULD REJECT legacy key on register <name>` (name
  only). This keeps the 8 unmigrated seats working (no flag day).
- **strict:** `409 legacy key; migrate first`. Strict is only flipped after K7 shows no legacy row
  (T-002 step 4), so this does not fire in practice. It is stated so strict never admits a legacy
  key. **This no longer depends on the hash being shared**, so the last `dev-key` holder is refused
  like the first (R1's point 2).

**U3. Only an owned row authenticates.** `getByKeyHash` (`convex/agents.ts:139`) reads up to two
rows from `by_apiKeyHash`. It returns `{ name }` **only if exactly one row holds the hash and that
row is `owned`**. Otherwise it returns **`null`, exactly as for an unknown key today**. Its return
type does not change. The reason (`legacy`, `shared` or `unknown`) comes from a separate query that
only the new hub calls, and only to word the log line (§11, B2). `requireAgentKey` then treats the
caller like an unknown key: strict 403, warn `WOULD REJECT legacy X-Agent-Key on
<route>` and `req.agentName = null`. **The `dev-key` stops resolving to `atlas` on deploy, and it
resolves to no name for as long as any row holds it, even a single row**, because every row
holding it is legacy.

The "exactly one row" check is defence in depth: U1 already keeps an owned hash to one name.

Why U3 is safe in warn (Relay checked this, ruling 1): `req.agentName` feeds `evaluateAsk` (`src/ask-policy.ts`) and the
self-skip in `POST /a2a/session/:id/message` (`src/index.ts:412-415`). A null asker is *allowed* by
`evaluateAsk` (ADR-012), so U3 can only lift an askPolicy denial for a `dev-key` caller in warn; it
cannot block one. Every other route ignores `req.agentName`. The gain: the warn log now counts
legacy-key traffic separately, which is a live progress signal for the migration (§4.4).

**Schema:** `keyStatus` is optional in `convex/schema.ts`, so rows present at deploy stay valid
before `classifyAtDeploy` runs. `ENTITIES.md` is updated with it in the same change (RULES).

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
   being honest about `AUTH_MODE`.** `keyStatus` is written only by these mutations and by the
   internal ones, never taken from a request argument. §9 (now T-057) covers what this does not
   fix.

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
- **Fails closed in both modes.** If `req.agentName` is null (an unknown key, a legacy key under
  U3, or no key), the handler returns `403 rotation requires your current key` in **warn as well
  as strict**. It is a new route with no legacy callers, so this is not a flag day. Only owned rows
  can rotate: **a legacy name migrates by claim (§4.1), never by rotate.**
- `newApiKey` must pass the key floor (§3.3) and differ from the current key: else `400`.

### 2.2 Mutation `agents.rotateKey({ name, currentHash, newHash, instanceId? })`

Atomic, in one transaction:

1. Collapse the name's rows exactly as `register` does (canonical = newest `lastSeen`, tie by
   `_id`; delete the rest, `convex/agents.ts:41-73`). **The collapse is reused, not weakened.**
2. **Compare-and-swap:** canonical `apiKeyHash` must equal `currentHash` and the row must be
   `owned`, else `409 stale key`.
   This closes the race of two rotations with the same old key: the second one loses.
3. **U1:** `newHash` held by any other name → `409 key held by another agent`.
4. Patch `apiKeyHash = newHash` (`keyStatus` stays `owned`). If `instanceId` is given, also take the instance lease
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
  `key rejected for <name>; run --init-key or --rotate-key`), not retry. **In warn there is no
  403**, so a superseded daemon leaves by the 409 heartbeat path, exit 0, as today. K2's
  second-instance case asserts both paths (Amendment O2; ruling 1 note).
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
`HUB_URL` host and port, e.g. `127.0.0.1-4000`, `100.124.212.87-4000`), **else fail closed**: exit 1 before any
network call, with `no key for <name> on <hub>: run hub-talk --as <name> --init-key` (rc 1 is
hub-talk's "usage or non-retryable" code). **The error never contains a key.**

**One `HUB_URL` spelling per hub (ruling 1 note).** `hub-id` comes from the URL's host and port, so
`tcm`, the tailnet IP and the MagicDNS name would be three directories. `joining-the-hub.md` gets
a table with the one spelling to use for each hub:
- `http://127.0.0.1:4000` for the local stack;
- **`http://100.124.212.87:4000` for tcm**, the tailnet IP. That is SIA's spelling, 2 of 2 in SIA's
  tracked tree (SIA record 90, via Relay). `joining-the-hub.md:10` uses it too.

A2A-Hub's seats (`relay`'s canary included) use the same spelling, not Loop 2's `http://tcm:4000`.
Otherwise their key files would land under `tcm-4000/`, the wrong hub-id. A miss still fails loud,
and the error names any other `hub-id` directory that holds a `<name>.key` ("found a key for relay
under tcm-4000; your HUB_URL spells this hub differently"). It gives paths only, never the
contents.

| Host | Where the key lives |
|---|---|
| **Local stack** (alice, bob, local seats) | Key files under the Windows user's `~/.a2a-hub/keys/127.0.0.1-4000/`. `start-stack.ps1` generates one per daemon name if missing (`hub-key.mjs init`, no network) before it launches `daemon.js --name <n>`. It goes through that same code path, so it honours `A2A_KEY_DIR` and QA can aim it at a scratch directory (Gauge's criteria `a522deb`, N.5). The `.ps1` stays ASCII-only. `.env` is shared by alice and bob, so it **cannot** hold their keys; `.env` gets no `AGENT_KEY`. |
| **tcm's seats** (every seat whose `HUB_URL` is tcm, A2A-Hub's and SIA's) | Key files in the home directory of the OS user running the seat, under `100.124.212.87-4000/` (the one tcm spelling above). A containerised seat gets `AGENT_KEY` from an untracked env file or Docker secret, never from the compose file. |
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
5. **One-time step per SIA seat:** `hub-talk --as <name> --init-key` against tcm, **run from the
   new client in a worktree, before `~/Projects/A2A-Hub` is updated** (§3.6), each on Aaron's word
   (K7). After that the main checkout's update changes nothing a seat can see, except that its
   calls are attributed.
6. **Hub side, visible to SIA:** a key held by another name, or shorter than 32 characters, is
   refused at register in both modes; a migrated name cannot be re-registered with a different key
   (C7).

T-017's cursor change is **not** bundled (brief, out of scope).

### 3.6 The client cutover: key files first, main checkout last (R2)

`~/Projects/A2A-Hub` is every SIA seat's hub-talk (V-001). **The new hub-talk reaches it only after
every seat that runs from it has a key file for every hub it talks to.** Until then the checkout
keeps the old client, which still works against the new hub:

- **Old hub-talk on a legacy name** (not migrated yet): it registers with the `dev-key` and
  re-registers the hash it holds, so U2 warn applies: allowed and logged. Its requests are
  unattributed (U3). **It keeps talking.**
- **Old hub-talk on a name already migrated** from a worktree: its register is refused (U1 while
  other legacy names hold the `dev-key`, or the key floor once none do). The old client ignores
  the status (`hub-talk.mjs:169-183`). Its requests pass in warn, unattributed, and `from` and
  `reader` still come from the body. **It keeps talking, and it cannot undo the migration** (C7,
  K8).

So between the deploy and the checkout update, every existing seat talks, migrated or not. **A new
name on the old client in that window is the exception. §11 B1 covers it:** such a name is created
only by `--init-key` from the worktree. The update is
safe once a read-only check passes:

**`node scripts/hub-key.mjs check --hub <url> --names <n1,n2,…>`** (new client, run from the
worktree). For each name it reports `key file: yes/no` and `whoami: <name>/null`, and exits 0 only
if every name has a file whose key resolves to itself. It prints no key and no hash. **The names
are the list of seats that run from the main checkout.** The SIA planner supplies SIA's part of it
(the D-003 question carries this). A2A-Hub's part is `relay` and any other A2A-Hub seat name that talks
to that hub.

**A seat that appears after the update without a key file exits 1 with the `--init-key`
instruction.** That is K5 for a new seat, not a flag day for an existing one.

The local stack is the same case in miniature. It runs from whichever checkout launches it. Its
seats get key files under `127.0.0.1-4000/` from the worktree first. `start-stack.ps1` generates
alice's and bob's files itself (§3.2).

---

## 4. Migration on tcm

### 4.1 How a `dev-key` name moves: a claim, once, in warn

A legacy name's first register with a fresh key is a **name claim onto an unshared hash**. In warn
the new mutation allows it: U1 passes because nobody holds the new hash, and the floor passes. In
one transaction it:
1. stamps the old hash's other unclassified holders `legacy` (§1.1);
2. **deletes the name's legacy row(s) and inserts a fresh row** with the new hash and
   `keyStatus: "owned"`, taking the instance lease as rotate does (§2.2 step 4);
3. logs `[auth] MIGRATE <name>: legacy row replaced by a fresh owned row`.

From then on C7 applies: no register can move the name again, only rotate.

**Revision 3 (D-007): the migration replaces the row rather than patching it.** So a migration
*is* "release the row, then register the name fresh", done in one transaction. **D-007 holds
literally, and no gap opens between the release and the fresh register** (§4.3). A fresh row keeps
nothing from the legacy one: no `askPolicy` (absent means allow all, ADR-012), no instance lease,
and a new `_id`. Nothing depends on those: only `convex/agents.ts` reads or writes `agents` (D-007's
note), and the lease is taken fresh. Any `askPolicy` a legacy row carries is counted in step 2's read
(§4.2) and set again if needed. The `peers` row, sessions and messages are untouched.

**This works the same for the last holder as for the first.** Whether a row is legacy is stored, so
bob, the last `dev-key` holder on the local stack after alice migrates, is still legacy and still
migrates (R1's point 1). This is the one place warn still lets a register change a stored hash. It
can only move a legacy row onto a fresh unshared hash, never onto a shared one (U1), and never
applies to an owned row (C7). So the migration is a ratchet: legacy rows only ever get fewer. Under
strict the claim is refused (U2), which is why migration finishes before T-002 step 4.

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
   per run, it would get 409 after deploy, and its operator must be told first. **Also, with Loop
   2's instrument, count which of the 8 `dev-key` rows carry an `askPolicy`** (names and counts
   only). D-007 replaces those rows, so any policy there must be set again (§4.1).
3. **Precondition (SIA's timing constraint, SIA record 90):** nothing a live `grok` exchange
   depends on may change while SIA has a candidate in flight (A6 now, then QA 94). **The SIA
   planner names the window, and step 3 happens only inside it.** Steps 5–9 touch `grok`'s row or
   its client, so they respect the same constraint: the SIA planner clears each one that touches
   `grok` or its checkout. **As of D-006 (rev 33), `atlas` is under the same rule:** no step that
   touches `grok` or `atlas` runs while SIA's A7 is being built or scored.
   **Deploy, one act:** push the Convex functions to tcm, then run `agents:classifyAtDeploy` at
   once. Then **release the four unused names, `clark`, `cursor`, `general` and `probe`, with
   `agents:release`** (D-007; §4.3). Then deploy the hub. `AUTH_MODE` stays `warn`.
   **`~/Projects/A2A-Hub` is not touched.** The four live `dev-key` names (`relay`, `atlas`,
   `forge`, `grok`) become legacy. They keep working (U2 warn) and now resolve to no one (U3).
   `cursor-grok` and `grok-probe` become owned and keep resolving. **Loop 2's read, repeated:**
   6 rows, the same hashes for those 6, `keyStatus` 2 owned and 4 legacy. (If the classification
   were delayed, §1.1's stamping would still keep every shared-at-deploy row legacy. It runs first
   anyway, so the window in which an unshared legacy key is unattributed is minutes.)
4. **A worktree of the new client** (merged master, checked out outside `~/Projects/A2A-Hub`). All
   of steps 5–7 run from it. The main checkout still serves every seat with the old client (§3.6).
5. **Canary: `relay`**, A2A-Hub's own seat, run by the planner: `--init-key` with `HUB_URL` at tcm.
   That is the release and the fresh register in one transaction (§4.1). Then `whoami`, then a
   round trip with another seat.
6. **SIA's live names, `atlas`, `forge` and `grok`** (D-007: each released and re-registered at
   its own step), in the order and window the SIA planner picks, never while A7 is being built or
   scored: `--init-key` for each name, run from the worktree. The seat's own sessions keep using
   the old hub-talk from the main checkout throughout, so **nothing about how a seat talks changes
   at this step.**
7. **Any released name that is needed again** (`clark`, `cursor`, `general`, `probe`): its
   `--init-key` from the worktree inserts it fresh, as owned. It is optional, one per name, each on
   Aaron's word.
8. *(Removed in revision 3: D-007 leaves no name that nobody migrates.)*
9. **Main-checkout update**, on Aaron's word and inside the SIA planner's window, only after
   `hub-key.mjs check` (§3.6) passes for every name that runs from `~/Projects/A2A-Hub`, for each
   hub it talks to. **`grok` is on that list either way.** Its hub-talk very likely runs from the
   main checkout, which is unverified, and a check that passes for a name that does not need it
   costs nothing. From here on the seats' calls are attributed.
10. **K7:** the completion check (§4.4).

**No step takes a working seat off the hub.** Before step 9, every seat runs the old client, which
works against the new hub whether or not its name has migrated (§3.6). At step 9, every seat
switches to the new client with a key file already in place. The only seat that can fail is one
missing from step 9's name list. It fails loud (exit 1, `--init-key` instruction), not silent, and
that is why the SIA planner supplies SIA's part of the list.

### 4.3 Releasing the `dev-key` rows (D-007; replaces Amendment N1's options)

**D-007 (Aaron, 2026-09-24): every `agents` row that used the `dev-key` is released, not migrated.**
A name that is needed again registers fresh with `--init-key`, which inserts it as owned. This
supersedes the SIA planner's keep-and-migrate ruling for `forge` and `probe`. `cursor-grok` and
`grok-probe` are not covered; they stay, classified owned. Releasing a row touches only `agents`
(D-007's note), so `peers`, `sessions`, `sessionPeers` and `messages` stay. SIA's rooms are
history and remain intact.

**`agents:release({ name })`** is an `internalMutation`, run with the admin key via `convex run`.
It deletes the name's `agents` row(s). Before deleting, it stamps the hash's other unclassified
holders `legacy` (§1.1). The name is then unclaimed, and the next register inserts it. It also
remains the operator's repair for a lost key or a hijacked name.

Two ways to release, by whether the name has a live seat:

| Names | How | When |
|---|---|---|
| `clark`, `cursor`, `general`, `probe` (no live user) | `agents:release`, one call per name | In the deploy act (§4.2 step 3), after `classifyAtDeploy`. Each call is a live write on Aaron's word. |
| `relay`, `atlas`, `forge`, `grok` (live seats) | **`--init-key` from the worktree.** §4.1's migration deletes the legacy row and inserts the fresh owned row **in one transaction** | At the name's own step: `relay` at 5, the others at 6 in SIA's window. |

**Why the live names are not released by `agents:release`.** A separate release followed later by
`--init-key` would leave a live seat with no `agents` row in between. §4.1's transaction is the
release and the register together, so **for a live name no gap exists.** There is nothing for an
old client to see except the step itself: before it, the name is legacy and talks unattributed;
after it, the name is owned and the old client's `dev-key` register is refused while it goes on
talking unattributed (§3.6).

**An old client on a released unused name** (`clark`, `cursor`, `general` or `probe`, between the
deploy and any `--init-key` for it). This differs from B1's new-name case, because **the `peers`
row survives the release:**

- Its register (`dev-key`) is refused: U1's 409 while any legacy row holds the `dev-key`, the floor's
  400 after that. The old client swallows the refusal. No `agents` row is made, and
  `peers.register` is not reached (the refusal throws, §11 B2).
- **But `sessions.create` and `messages.send` succeed**, because they look up `peers`, which still
  has the name. So the old client **talks, unattributed** (`req.agentName` null in warn), exactly
  like an unmigrated legacy seat. No `Unknown peer` error fires, so B1's hint does not reach it.
- It is missing from `GET /a2a/agents/live` (no `agents` row), so no-arg lobby pairing *to* it
  fails, and its heartbeats are no-ops.
- **The name is unclaimed.** Anyone's `--init-key` can take it and own it. After that the old
  client still talks unattributed, and it cannot take the name back (U1, floor, C7).

**This is not silent loss.** Every turn it sends is delivered, with the `from` the old client
asserts (T-058's class). But the hub does not know who sent it. The hub cannot flag it without
changing how `peers` without `agents` rows behave, and humans (`aaron`, `hub`) are exactly such
peers. So the prevention is a rule: **B1's rule extends to released names: until step 9, a
released name comes back only through `--init-key` from the worktree.** These four names have no
live user (D-007), so the case is expected only from a stray old script. At step 9 the old client is
gone. In strict (T-002 step 4, after K7) its requests would be 403.

No option sends a request to tcm with the `dev-key` (N1).

### 4.4 Seeing that the migration is complete

**K7 is Loop 2's instrument, re-run read-only** (`convex data agents --limit 8000 --format jsonl`
into the local analyzer, prefixes only). It must show:

- every name has one row, and every hash is held by exactly one name;
- **every row is `keyStatus: "owned"`**, with no legacy row and no row without a status;
- the hash of `dev-key` (computed locally by the analyzer, compared by prefix `7e9f8fd1`) is held by
  **no** name;
- no stale hash resolves (V-003);
- `AUTH_MODE` is `warn`.

**A second, independent signal:** after step 9, the hub log shows no `WOULD REJECT legacy` line
for a working day. U3 counts legacy-key traffic separately.

**The R1 acceptance case (for Gauge)** follows from §1.1 and §4.1. On a throwaway stack, three
names share one short key, and two of them migrate. The new code refuses to create that state
(U1, floor), so the three rows are seeded the way tcm's were: registered through the old hub build
(`ea9d057`) against the same throwaway Convex, before the new functions are pushed. The third still migrates by `--init-key`, and
the shared key resolves to no name at every step. The migrated names' own keys resolve to them. Add
a fourth step: run `classifyAtDeploy` *after* the two migrations. The third name must stay legacy,
which is the stamping layer.

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
- *(The name-format rule proposed here was struck by ruling 1 and is now T-059. Registration
  accepts the same names as today.)*
- **Reach:** tcm is on the tailnet only. **Squatting and registration floods stay possible for
  anyone on the tailnet** until T-005 (rate limiting). Exposure (T-002 step 5) must wait for T-005
  and strict. Named here, not solved here.

---

## 7. Condition 7 (Amendment O1): a migrated name keeps its key

**C7. On an owned name, a register presenting a different hash is refused: `409 name holds its own
key; use rotate`, in warn as well as strict. The stored hash is not changed.** Rotation (§2) is the
only way to change it; `agents:release` (§4.3) is the operator's way out.

Enforced in `agents.register` before the patch at `convex/agents.ts:55-62`: the mutation reads the
canonical row's **stored** `keyStatus` and refuses if it is `owned` and the presented hash differs.
Nothing is counted. **The warn-mode re-key that O1 found is gone for owned names.** For legacy
names it survives only as §4.1's one-way move onto a fresh hash.

**K8 follows directly:** re-registering a migrated name with its old key (the `dev-key`) or any
other key leaves the stored hash unchanged, and the name's own key still resolves to it.

### The whole register decision, one table

`N` = the name, `H` = presented hash. Rules in order; the first that matches wins.

| Case | warn | strict |
|---|---|---|
| `H` held by another name, and `N` does not hold `H` (U1) | 409 | 409 |
| `H` acquired and key shorter than 32 (floor) | 400 | 400 |
| `N` new | insert, `owned` | insert, `owned` |
| `N` owned, holds `H` already | ok (heartbeat-like, as today) | ok |
| `N` owned, `H` differs (C7) | **409** | 409 |
| `N` legacy, holds `H` already (U2) | ok + `WOULD REJECT legacy` | 409 |
| `N` legacy, `H` differs and is unshared (migration, §4.1) | stamp, replace row (fresh, `owned`) + `MIGRATE` | 409 |

"Owned" and "legacy" are the stored `keyStatus` (no status reads as legacy). No row of this table
counts holders except U1, which asks only whether *another* name holds `H`.

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
- **Unit tests under the floor (Gauge's scan):** `tests/identity.test.ts:139,160,181` register
  with `"k1"` and `"other"`. They mock Convex (`hash:owner`), so the floor fires in Express first.
  In the build they get 32+ character literals. Those are test-only keys registered on no stack
  (O6). The name-claim cases they test are rewritten against the new decision function (§1.3).
  No other `tests/` register call uses a literal key under 32 characters (`git grep` at
  `ea9d057`).
- The local stack starts, with keys generated by `start-stack.ps1` on first run. On an existing
  local database where alice and bob hold the `dev-key`, their rows have no `keyStatus` and so are
  legacy. **Each one's first register with its own key is §4.1's migration, in warn, in either
  order.** The one that registers second is still legacy, not owned by attrition (R1's certain
  case). Other local rows with a key of their own stay legacy (unattributed in warn) until they run
  `--init-key`, or until someone runs `classifyAtDeploy` against local Convex. That is optional on
  the local stack. T-056 is untouched.

---

## 9. Found on the way (triaged by ruling 1, not bundled)

Triage: the Convex port is **T-057** (P1; a read-only tcm check first, and it gates exposure). The
caller-asserted identities are **T-058** (P2). The bootstrap docs are in scope here (§0).

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

**Ruling 1 (`c34a792`):** U3 and the key floor were accepted. The name-format rule was struck
(T-059). §9 was triaged (T-057, T-058, bootstrap docs in scope). R1 is answered in §1.1, §1.2,
§4.1 and §7, and R2 in §3.6 and §4.2.

**Questions for Aaron, none blocking the design:**

- **Q1, via the SIA planner (D-003), sent by Relay after this revision:** the §3.5 contract
  changes to hub-talk, with the cutover order in §3.6 and §4.2. It also asks the SIA planner for
  SIA's part of step 9's name list: every SIA seat name, and the `HUB_URL` spelling each one uses.
- **Q2: settled by D-007.** All 8 `dev-key` rows are released (§4.3). Any released name that is
  needed again returns by `--init-key`, on Aaron's word per name.
  `forge` and `probe` are settled (SIA's ruling: keep and migrate).
- **Q3, to Aaron directly:** which name his browser client (`client/`) should use now that it has
  no default key.

**Acts that need Aaron's word, in order:**
1. The pre-deploy log read (§4.2 step 2).
2. The deploy act: the Convex push, `classifyAtDeploy`, then the hub (step 3).
3. Each seat's `--init-key` against tcm (steps 5–7).
4. Each `release` or migration of an abandoned name (step 8).
5. The main-checkout update (step 9).
6. K7's read.

---

## 11. Binding conditions from ruling 2

### B1. A new name on the old client, between step 3 and step 9

**What that seat sees.** The old client registers the new name with the `dev-key`. The new hub
refuses it: U1's 409 while any legacy row holds the `dev-key`, and the floor's 400 after that. So no
`agents` row and no `peers` row is made (`src/index.ts:364-370`). The old client swallows the
refusal (`scripts/hub-talk.mjs:169-183`), and it swallows heartbeats too (`:103-109`). What happens
next depends on the mode:

| Old-client call | What the seat sees today (`ea9d057`) |
|---|---|
| `--peer X`, or no-arg mode where it creates the lobby | rc 1: `/a2a/session -> 500 {"error":"Unknown peer: <name>"}` (`convex/sessions.ts:22`) |
| `--session <id> --say` | rc 1: `-> 500 … Unknown peer: <name>` (`convex/messages.ts:29`) |
| no-arg mode, waiting for another seat to open the lobby | It prints `waiting for another ide-session peer…` until `--join-timeout`, then rc 1 `no live IDE peer…`. **This is the silent case:** the other seats cannot see it, because it has no `agents` row. |
| `--session <id> --wait` / `--inbox` | It reads the room; the receipt post fails on stderr ("not a participant"). |

So most paths already end in rc 1, but with the **wrong cause** ("Unknown peer"), and one path
waits in silence. That is ADR-013's shape.

**The rule (binding, and it goes to SIA in Q1; revision 3 extends it to released names, §4.3):**
**between step 3 and step 9, a new seat name, or a released one, is
created (or re-created) only by `--init-key` from the new-client worktree.** After that the name has an owned row
and a peer row, and its seat can keep using the old client from the main checkout like any
migrated name (§3.6). A2A-Hub's seats follow the same rule. The rule ends at step 9, when the new
client is the only client.

**Loud as far as the hub can make it, without changing the old client.** The old client prints the
hub's error body on every `api()` failure (`hub-talk.mjs:156`). So the new Convex functions give
the cause where they throw `Unknown peer`. When the name has no `agents` row either,
`sessions.create` and `messages.send` throw `Unknown peer: <name> (not registered on this hub; if
its register was refused, create it with hub-talk --init-key)`. That turns two of the four paths
into a correct, loud cause, on the old client, with no client change. **The waiting path cannot be
reached from the hub:** the old client sends nothing the hub could refuse until the join timeout.
That path is closed by the rule, not by code.

*Rejected:* making the refused register half-succeed (a peer row with no agent row) so that the old
client could talk. It would split the invariant that register makes both rows, and it would leave a
name anyone could claim. That is a new ambiguity, not a fix.

**Gauge's acceptance item (ruling 2):** on the new hub, the `ea9d057` hub-talk registers a new name
with `--say` into an existing room. Assert rc 1, the stderr containing `not registered on this
hub`, and no `agents` or `peers` row for the name. Then run `--init-key` for that name from the new
client and repeat the same old-client `--say`. Assert rc 0, a turn from the name, and the name's
stored hash unchanged.

### B2. The old hub against the new functions

The deploy act pushes the functions first, then classifies, then redeploys the hub (§4.2 step 3).
For those minutes the `ea9d057` hub runs against the new functions. **Every function the old hub
calls keeps its argument validator and its return shape:**

| Function (old hub call site) | Change | Old hub against it |
|---|---|---|
| `agents.getByKeyHash` (`src/auth.ts:51`) | **Stays `{ name } \| null`.** Legacy, shared and unknown are all `null`. | `if (!agent)` (`auth.ts:62`) sees `null`: warn logs `WOULD REJECT unknown`, strict 403. No object ever reaches it without a name. |
| `agents.register` (`src/index.ts:364`) | Same args (new ones optional). Success still returns the row id. **A refusal throws a `ConvexError` `{ status, reason }`**, never a return value. | The throw reaches the old handler's `catch`: 500 with the reason, and `peers.register` is not reached. A refused name never gets a peer row, and a refused re-key leaves the hash unchanged (K8). A returned `{ ok: false }` would have been read as success, which is why refusal is a throw. The new hub maps the `ConvexError` to 409/400. |
| `agents.getByName` (`index.ts:78,352`) | Unchanged. The new hub reads `keyStatus` through the new functions, not through this one. | Unchanged. |
| `agents.heartbeat` (`index.ts:277`), `agents.listOnline` (`index.ts:302`, `escalation.ts:14`) | Unchanged. `listOnline` rows carry the new optional `keyStatus` field. | Extra field ignored (`/agents/live` projects the fields it needs). |
| `sessions.create`, `messages.send` | Only the text of the `Unknown peer` error changes (B1). | The text is passed through. |
| `messages.markRead` | Unchanged. The `reader` check (§5) is in Express. | Unchanged. |

**The reason travels by a query the old hub never calls:** `agents.keyHashStatus({ apiKeyHash })`,
which returns `"owned" | "legacy" | "shared" | "unknown"` and nothing else (no name, no hash). The new
`requireAgentKey` calls it **only after `getByKeyHash` has returned `null`**, and only to word the
log line. **The auth decision never depends on it.** If the query fails (for example, a new hub
wrongly deployed ahead of its functions), the line says `unknown` and the decision is unchanged.
New functions (`rotateKey`, `keyHashStatus`, `classifyAtDeploy`, `release`) are ones the old hub
never calls.

**Gauge's skew item (ruling 2, in the spirit of Loop 1's `skew.mjs`):** the `ea9d057` hub build
runs against the new functions on a throwaway stack. It is run in **strict** and in warn, with
three keys:
- a legacy key: warn passes with `WOULD REJECT`, strict 403;
- an unknown key: warn passes with `WOULD REJECT`, strict 403;
- an owned key: resolves to its name in both modes.

Also: a refused register through the old hub (U1 and C7) returns non-200, makes no peer row, and
leaves the stored hash unchanged.

---

## 12. The browser client as the human peer `aaron` (revision 3, local stack)

**The problem.** `client/src/App.svelte` posts as `aaron` (`:6`, `:175`) with a hardcoded
`dev-key` (`:8`), which §3.4 removes. Every `/a2a` route needs a key that resolves to an `agents`
row. But registering `aaron` through `/a2a/register` calls `peers.register(type: "agent")`, which
overwrites the type (`convex/peers.ts:16-21`). The hub then re-registers `aaron` as `human` on its
first notification (`src/index.ts:55`). So the peer type would flip back and forth. Relay's
decision, pending Aaron: the browser acts as `aaron`.

**The design: four small changes. No new table, and no split from Loop 3 needed.**

- **H1. Registration never changes an existing peer's type.** A new mutation,
  `peers.ensure({ name, type })`, inserts the peer with `type` if absent. If the peer exists, it
  sets only `isActive: true`, never `type` or `metadata`. `/a2a/register` calls `ensure` instead
  of `peers.register`, with `type = agentCard.kind === "human" ? "human" : "agent"`.
  `peers.register` is unchanged, and the hub's startup still uses it, so `aaron` is human whichever
  runs first. Side effect: register no longer wipes a peer's `metadata` (it passes none today, and
  nothing reads peer metadata at `ea9d057`).
- **H2. `aaron` gets an owned `agents` row** with `agentCard: { name: "aaron", kind: "human" }`.
  It is created by `node scripts/hub-key.mjs init --as aaron --kind human` on the local hub, the
  same code path as `--init-key` with the card's kind as a flag. The key file is
  `127.0.0.1-4000/aaron.key`. U1, C7, the floor and rotate apply to it like any row.
- **H3. A human row is never treated as an online agent.** `agents.listOnline` leaves out rows
  whose `agentCard.kind` is `"human"`. Otherwise `escalation.ts:14-18` could pick `aaron` as
  `agents[0]` and escalate a task to a person as though it were a daemon. `/a2a/agents/live` would
  also list `aaron`.
- **H4. The browser holds the key without it ever being printed.**
  - The Key field starts empty and is `type="password"`.
  - The key is kept in the browser's `localStorage`, with every access in try/catch, so the page
    works without it.
  - To get it there, Aaron runs `node scripts/hub-key.mjs copy --as aaron`. It puts the key on the
    OS clipboard (`clip` / `pbcopy`) and prints only `copied key for aaron@127.0.0.1-4000
    (prefix xxxxxxxx)`. Aaron pastes it into the field.
  - The key never reaches stdout, a file in the repo, or a transcript. With no key, requests get
    the 401 they already get.

**B2 check against the old hub:**
- `peers.ensure` is new, so the old hub never calls it.
- `listOnline` leaving out human rows only hides `aaron` from the old hub, which is correct.
- `peers.register` is unchanged.

**Left as is:**
- The browser's seed post uses `from: "alice"` (`App.svelte:149`), so it posts as `alice` under
  `aaron`'s key. That is T-058's class (a `from` the caller asserts) and is not checked in this
  loop.
- On tcm nothing registers `aaron` as an agent, so H1–H4 are deployed but have no effect there.

**For Gauge:**
- After `hub-key.mjs init --as aaron --kind human`, `peers` shows `aaron` as `human`. It still
  does after a hub restart and after a second register.
- `aaron`'s key resolves to `aaron`.
- `listOnline` and `/a2a/agents/live` leave `aaron` out.
- An escalation with no named target never picks `aaron`.
- An agent re-registering an existing human peer's name does not flip its type. That name is
  owned by its key (C7), so only `aaron`'s own key can re-register it.

**For Aaron (Relay's decision, pending his confirmation):** the browser acts as `aaron`. If he
prefers a separate name (for example `aaron-web`, an ordinary human-kind row), only H2's name
changes.


---

## 13. Build rulings (Relay, on the build at `bc157f5`)

**Departure 2 (`getByKeyHash` reads up to 2 rows, all owned, one name): accepted.** U1 keeps a
hash to one name, and tolerating a same-name duplicate the collapse has not removed yet is harmless.

**Departure 1 (the key floor is decided by the hub via `keyTooShort`): accepted, with a backstop.**
Only the hub sees the plaintext key, so the floor rides on a flag the hub sets. `register` is a
public mutation and the flag is optional, so a direct Convex caller can omit it. Once the last
legacy holder of the retired shared key is released, U1 would no longer block that hash, and a
direct caller could register a new name with it. The public key would then authenticate again.

- **Backstop (built):** `decideRegister` and `decideRotate`, the shared decision functions behind
  every public mutation that can set `apiKeyHash` (`register`, `registerAgent`, `rotateKey`),
  refuse *acquiring* the retired shared key's hash. They refuse it in both modes, in-transaction,
  whatever `keyTooShort` says (`400 the retired shared key cannot be registered`).
- The hash is a constant in `convex/keyLogic.ts` (`RETIRED_SHARED_KEY_HASH`, prefix `7e9f8fd1`),
  never the key itself. K5's search stays clean.
- A legacy row that already holds the hash may keep re-registering it (U2 warn) until its release,
  so the live seats keep working.
- Tested:
  - The pure decision (`tests/key-logic.test.ts`).
  - Each public entry point called directly with no flag (`tests/retired-key.test.ts`). A mutant
    that removes the register check fails 4 of its 8 tests.
  - Live on the throwaway stack: both `agents:register` and `agents:registerAgent`, called through
    `convex run` with the hash and no flag, return that 400 and create no row.
- **The general direct-caller gap is T-057's, not Loop 3's.** A direct Convex caller can still
  register a *new* name with a short key other than the retired one, because the floor rests on the
  hub's flag. U1 and C7 hold for that caller, so it cannot share or take over a key. Closing the gap
  means making hub-only functions unreachable from outside the hub: bind Convex to `127.0.0.1`, or
  make them `internalMutation`s (§9, T-057).
- The v1.8.0-hub skew window (§11 B2) is accepted as is: the old hub sends no flag for those
  minutes, and U1 and C7 still apply while legacy holders exist.

**The 3210 incident is recorded as a breach of the build limit**, self-reported, with no harm
found. **Rule from now on:** every `convex dev` and hub start pins its ports
(`--local-cloud-port`, `--local-site-port`, `PORT`) and is preceded by a port listing.
