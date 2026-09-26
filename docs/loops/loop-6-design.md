# Loop 6 design: only an owner's invitation creates a name (T-067)

Rivet (hub name a2a-grok), 2026-09-25. Draft for Relay's ruling; nothing built.
Brief: `docs/loops/loop-6-enrollment-brief.md` at `4af8b4c` (origin/master),
including the turn-5 ruling on that file. `src/`, `convex/`, and `scripts/`
are unchanged from `7a54924` to `4af8b4c` (docs-only fast-forward). Line
numbers below are from that tree. No source changes in this commit. tcm was
not read and not written.

## 0. The principle

**A name that does not exist yet is created only with a one-time code issued by
a human owner, and that human becomes the row's `owner`.** A name that already
exists keeps registering with its own key and no code. Warn logs a new
violation and still allows the old register path. Strict refuses it. Rate
limiting is the one check that can refuse in warn, and only above measured
traffic.

## 1. Siblings checked at 7a54924

The brief's `keys.ts:61` path is real, and it is not the only way a caller
becomes human:

- `src/keys.ts:61` sets `owner` to the registrant when `agentCard.kind` is
  `"human"`. The body `owner` field is already unread (`:58-60`).
- `convex/accessLogic.ts:15-27`: `isHumanRow` is `agentCard.kind === "human"`,
  and `ownerOf` falls back to the row's own name when that is true, even if
  `owner` was not stored. Stripping the `owner` argument is not enough.
- `convex/agents.ts:183-192`: a re-register (`same`) patches `agentCard`. An
  existing non-human row can send `kind: "human"` on a later register and
  become a human without a new insert. This is the same hole on an existing
  name.
- `src/keys.ts:80-81` sets the peer type from `kind` on every successful
  register. `peers.ensure` must not be how a second human appears.
- `src/keys.ts:85` and `:124` return `error.message`, on top of the 15
  `src/index.ts` catch blocks (`:336`, `:384`, `:400`, `:413`, `:434`, `:489`,
  `:549`, `:581`, `:597`, `:614`, `:631`, `:651`, `:669`, `:708`, `:724`).
- `GET /a2a/whoami` (`src/index.ts:506`) sits behind the `/a2a` key guard
  (`:202-206`). A missing key is already 401 (`src/auth.ts:73-75`) and never
  reaches whoami. The brief lists whoami with the unauthenticated routes. The
  unauthenticated surface is `POST /a2a/register`, `/ui/*`, and the 401 from a
  missing key. whoami itself is authenticated.
- `POST /a2a/session/:sessionId/read` (`src/index.ts:677-705`) does not use
  `sessionGate`. A non-member gets markRead's
  `"<reader> is not a participant of this session"` (`convex/messages.ts:125-130`).
  A missing session gets `"session not found"` (`:107-108`). Other session
  routes already collapse those in strict (`src/index.ts:121-132`,
  `src/authz.ts:121-122`).
- Neither `Dockerfile` nor `docker-compose.yml` sets `NODE_ENV`. The runtime
  command is `node dist/src/index.js` (`Dockerfile:42`). `/ui` uses
  `express.static` with `fallthrough: false` (`src/ui.ts:21-25`), so a missing
  file is Express's default 404.
- Compose runs one hub process: `container_name: a2a-hub`
  (`docker-compose.yml:24-26`). No `replicas` field. Traefik is in front
  (`:35-40`). I did not test which address the hub sees.

Looked at and left alone: the `src/wrapper/daemon.ts` refused-register retry
(handoff open item). Existing names re-register, so the retry does not fire
for a seat that already has a row. A brand-new daemon name fails closed in
strict once, then retries; that is the handoff bug, not this loop's fix.

## 2. Codes

New table `enrollmentCodes` (build updates `convex/schema.ts` and
`.agents/SYSTEM/ENTITIES.md` together):

| field | |
|---|---|
| `codeHash` | `hashKey` of the code (`src/auth.ts:37`). No plaintext column. |
| `issuer` | the human name that issued it |
| `expiresAt` | `createdAt + 24h` |
| `usedAt` | absent until consumed |
| `createdAt` | |

Index `by_hash` on `codeHash`. Optional fields only, so the v1.11.0 hub never
mentions the table and the deploy-window Convex push stays additive (Preserve 7).

The code is 32 random bytes, base64url, no padding. It is returned in the
issue response and nowhere else. Logs and later responses carry neither the
code nor the hash.

Consume happens in the same mutation as the insert. A crash cannot burn a
code without a row, or insert a row without burning the code. A code is
consumed only on `decision.kind === "insert"`. `same`, `legacy-same`,
`migrate`, and `refuse` do not mark it used.

TTL of 24 hours is this seat's choice. Aaron issues a code, then the new seat
runs `--init-key` in the same sitting. A shorter window is a ruling change,
not a build blocker.

## 3. Register

`makeRegisterHandler` (`src/keys.ts:30-88`) gains an optional `enrollmentCode`
on the JSON body. The handler hashes it and passes `enrollmentCodeHash` into
`registerAgent`. The plaintext is not an argument to Convex.

`registerAgent`'s args gain optional `enrollmentCodeHash`. Omitted means
today's call. The v1.11.0 hub omits it (skew).

**Insert (no row for that name).**

- Valid code, not used, not expired: insert. `owner` is the code's `issuer`.
  The body cannot set `owner` (already true at `src/keys.ts:58-60`). `kind:
  "human"` is not stored (section 5).
- No code, strict: 403 `{ "error": "this name is new and needs an enrollment code from its owner" }`.
  No mutation.
- No code, warn: insert as today, `owner` = `HUB_OWNER` (`src/index.ts:60-63`),
  and log `[enroll]`. This is what keeps current hub-talk `--init-key` working
  until strict.
- Expired: 403 `{ "error": "this enrollment code is expired" }`. Not consumed.
- Used: 403 `{ "error": "this enrollment code is already used" }`. Not consumed again.
- No matching hash: 403 `{ "error": "this enrollment code is not valid" }`.
  The text does not say whether any code exists, or for which name.

Warn and a bad code: the register still succeeds as a codeless warn insert
(Acceptance B), the code is not consumed, and the `[enroll]` line names the
condition (`expired`, `used`, or `not valid`). Strict refuses with that text.

**Existing row (`same`, `legacy-same`, `migrate`).** No code. The code field,
if a caller sends one, is ignored and not consumed. Owner is not changed
(`convex/agents.ts:177-178`, `:191`). This is `--inbox`, `--say`, `--wait`,
`--peer`, and every lobby `register(ME)`.

**`--rotate-key` is not enrollment.** Ruled in the room, turn 5, and written
into the brief at `4af8b4c`. It calls only `POST /a2a/rotate`
(`scripts/hub-key.mjs:217-231`, reached from `scripts/hub-talk.mjs:99-104`),
proven by the current key (`src/keys.ts:90-122`). No code, in both modes.
A rotated secret is still the same name.

**`--init-key` on a name that already holds its own key stays a 409 in both
modes.** `initKey` always generates a new key (`scripts/hub-key.mjs:176`).
`decideRegister` then refuses an owned row that does not hold that hash:
409 `"name holds its own key; use rotate"` (`convex/keyLogic.ts:80-83`).
If this machine already has the key file, `initKey` exits before the request
(`scripts/hub-key.mjs:173-174`). The every-run re-register above is the other
path: the key the name already holds, `decision.kind === "same"`, no code.

## 4. How Aaron issues a code

One pasteable command, not a chat-page control. The page would put a one-time
secret in the browser, and account-management UI beyond issuing a code is out
of scope. I looked at that option and did not take it.

New script `scripts/hub-enroll.mjs`. It is not `hub-talk`. The only hub-talk
change in this loop is `--invite` (section 6).

```
$env:HUB_URL="http://100.124.212.87:4000"; node scripts/hub-enroll.mjs --as aaron
```

Steps the script takes:

1. Resolve aaron's existing key file the way hub-talk does. Never print the key.
2. `POST /a2a/enroll` with `X-Agent-Key`. No code in the request.
3. On 200, print the code once to stderr, then exit 0. The response is
   `{ "ok": true, "code": "<code>", "expiresAt": <ms> }` and is the only
   response that contains a code.
4. On a refusal, print the hub's `error` string and exit 1. No code.

`POST /a2a/enroll` is behind the key guard. The caller must be a human-kind
row (`callerInfo`, `src/index.ts:92-102`). An agent key is refused in both
modes: 403 `{ "error": "only a human owner can issue an enrollment code" }`.
This is fail-closed, like rotate (`src/keys.ts:95-98`), not like a warn-only
authz check.

I am asking for a ruling on that, because Acceptance B says every refusal in
A succeeds in warn, and A includes "an agent key cannot issue." Item 3 of the
brief names only two warn cases: a codeless new name, and a human-kind
self-declaration. Allowing agents to mint codes during the warn soak would
make enrollment unenforced on the live hub. Section 14 asks Relay to pick.

The issue handler writes the hash via an internal mutation the HTTP process
calls. It logs `[enroll] ISSUE issuer=<name>` with no code and no hash.

## 5. Humans come from the operator

A register body with `kind: "human"` does not create an owner.

- Strict: 403 `{ "error": "a register cannot create a human owner" }`, whether
  the name is new or already a non-human row. Logged `[enroll]`.
- Warn: the register succeeds (Acceptance B). The handler strips `kind` before
  the mutation when the stored row is not already human, and logs `[enroll]`.
  The mutation also drops `kind: "human"` on any write whose stored row is not
  already human, so a direct `registerAgent` call cannot persist it either.
- A row that is already human (aaron) re-registers unchanged, including its
  card. That is Preserve 2, not a new human.

Second human, operator only, not the HTTP API. New internal mutation
`agents:createHuman`, admin key, same channel as `assignOwnerAtDeploy`
(`convex/agents.ts:316-318`):

```
npx convex run agents:createHuman '{"name":"<name>","apiKeyHash":"<hash>"}'
```

It inserts the agents row with `agentCard.kind = "human"` and `owner = name`,
and ensures a `peers` row of type `human`. The hash is produced by the
operator off to the side. The plaintext key is not an argument. There is no
HTTP route for this. Acceptance A's scratch second owner is created this way
on the scratch stack.

## 6. hub-talk: `--invite` only

`scripts/hub-talk.mjs` and `initKey` (`scripts/hub-key.mjs:163-199`):

- `--invite <code>` is valid only together with `--init-key`. Any other
  invocation that passes `--invite` exits 1 with a usage line before a request.
- On that one `initKey` register, the JSON body gains `enrollmentCode`.
  `scripts/hub-key.mjs:185-187` is the only call that changes.
- `register()` at `scripts/hub-talk.mjs:213-228` is not modified. Every
  `--inbox`, `--say`, `--wait`, `--peer`, and lobby register stays byte-identical.
- `--rotate-key` is not modified.

No other hub-talk flag. Issuing stays in `hub-enroll.mjs` (section 4).

## 7. Warn, strict, and the `[enroll]` line

Same shape as `[authz]` (`src/authz.ts:54-62`):

```
[enroll] REJECT <what> on <route> caller=<who>
[enroll] WOULD REJECT <what> on <route> caller=<who> (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
```

`<what>` is a fixed condition (`no-code`, `expired`, `used`, `not-valid`,
`kind=human`, `agent-issue`), never a code, a hash, a path, or a stack.
`<who>` goes through `sanitize`.

Warn logs and continues for: codeless insert, bad code on an insert (section 3),
and `kind=human` (section 5). Strict refuses those. Agent issue is the
exception proposed in section 4: refused in both modes.

`scripts/tcm/a2a-readonly` `auth-log` (`:52-72`) is widened. No new menu item
and no new allow rule (Loop 5's A1 shape). The header gains `enroll-lines=$e`.
The printed set adds `\[enroll\]` next to `\[auth\]` and `\[authz\]`. Masking
stays. Installing that file on tcm is the deploy act, on Aaron's word. The
build only changes the repo copy.

## 8. T-070

In strict, `POST /a2a/session/:sessionId/read` for a caller who is not a
participant returns the same status and JSON as a well-formed id that is not
a session: 404 `{ "error": "session not found" }` (`SESSION_NOT_FOUND`). It
does not call out the reader name. It does not write a read cursor.

A malformed id stays 400 `{ "error": "not a session id" }` (`convex/messages.ts:102-104`)
for both the missing and the non-member case, because that answer does not
reveal that a session exists.

Warn is unchanged: markRead's participant reason still returns, and the
existing `[authz]` note at `src/index.ts:695-696` stays. T-070's sentence is
strict-only, matching Loop 5 Q2 (`src/index.ts:108-110`).

## 9. Error responses

The build re-derives the inventory from the candidate and treats this list as
the 7a54924 starting point, not as the acceptance list.

| source | today | answer |
|---|---|---|
| `NODE_ENV` unset (`Dockerfile:42`) | Express HTML for a thrown error or a static miss | `ENV NODE_ENV=production` in the runtime stage |
| `express.json()` (`src/index.ts:33`) with no error middleware | default parser error, path included when not production | 400 `{ "error": "malformed json" }` |
| `express.static` miss (`src/ui.ts:21-25`) | default 404 page | 404 `{ "error": "not found" }` |
| 15 `index.ts` catches plus `src/keys.ts:85` and `:124` | 500 `{ "error": error.message }` | 500 `{ "error": "internal error" }`; the real error is `console.error` only |
| Convex validator throw on a bad id (T-055 class) | 500 with the validator text | 400 `{ "error": "bad request" }` |
| `src/auth.ts:86` | 503 `{ "error": "Auth backend unavailable" }` | already terse; keep it. The log line may keep the message; the response does not grow |

No response in this class includes a path, a stack, or `error.message`.
Malformed session and task ids that the handlers already map to 400 stay 400.

## 10. Rate limiting (T-005)

In-process fixed window, because a Convex write per poll would put the limiter
on the hot path, and compose runs one `a2a-hub` container
(`docker-compose.yml:26`). The build confirms that replica count again before
relying on it.

- Authenticated routes: one bucket per `req.agentName`. A request that got
  past the key guard counts here, including whoami.
- Unauthenticated: `POST /a2a/register`, `/ui/*`, and a missing-key 401.
- Over the limit: 429 `{ "error": "too many requests" }` and `Retry-After`
  (seconds until the window resets). This refuses in warn and in strict.
  Preserve 6's exception.

I did not read tcm, so this draft has no measured peak and no numeric limit.
`src/index.ts` does not log each request, so `docker logs` will not contain
the poll rate by itself. The build, when Aaron authorizes that read, counts
live seats from the log (heartbeat / hub-talk lines) and applies the intervals
already in the repo:

- hub-talk `--wait` sleeps `POLL_MS` of 2000 (`scripts/hub-talk.mjs:73`, `:469`):
  about one read per 2 seconds per seat, plus one register and one heartbeat
  per process start (`:367-372`).
- A daemon loops every `POLL_MS` of 2000 (`src/wrapper/daemon.ts:96`, `:323`)
  and does a heartbeat plus a session poll per loop.

Headroom is 10 times that peak per key, sustained for a minute. The constant
is written down in the build commit next to the seat count it came from.
A replay of that pattern must not 429 (Acceptance F).

**Funnel source.** Not assumed. The build runs one request through the same
proxy path the hub uses and records `req.socket.remoteAddress`. It does not
trust `X-Forwarded-For` unless that test shows Traefik overwrites it and
Express is configured to use it.

If the address is loopback or a single docker bridge address, per-source
limiting is one bucket for every caller. In that case the design's
alternative, which is what we ship until a test shows distinct sources:

- Authenticated per-key limits stay (they do not need the source address).
- Unauthenticated traffic uses one global bucket, sized from the measured
  register and `/ui` rate with the same 10x headroom, and the doc says it is
  not a per-client control.
- G-001 is unchanged: no public address before strict, and not before that
  source test has been recorded.

## 11. Skew and what stays

Convex changes are additive optional args and a new table. The v1.11.0 hub's
`registerAgent` call still validates. During the convex-first window the old
process has no code check, so open register still works, which is the deploy
window (Preserve 7). After the new image, warn still allows a codeless insert.
Strict is its own later act.

Unchanged for an existing name, both modes, through today's hub-talk (Preserve 1-5):

- register on every run, `--inbox`, `--say`, `--wait`, `--peer`, read receipts
- `--rotate-key` (section 3)
- the key and the owner already stored; no row is re-enrolled
- Loop 5 identity, membership, owner view, askPolicy, `[authz]`
- daemon heartbeat and poll
- Aaron's chat page and his agents' rooms

## 12. Verification the author will run (not acceptance)

On a scratch stack, pinned ports, not the main checkout, not tcm:

- strict: new name without a code refused with the no-code text; with a code,
  `owner` is the issuer; second use and an expired code get their own texts;
  a code from `createHuman`'s second owner yields that owner; an agent key
  cannot issue; a body cannot set `owner` or `kind: "human"`
- warn: those register cases succeed, log `[enroll]`, and do not persist a
  human kind; the auth-log header in the repo script counts `enroll-lines`
- grep of the run log for a planted fake code and a planted hash, then the
  real log, with the planted line found first (Acceptance C)
- strict `/read`: non-member body equals missing-session body, byte for byte
- one seat's `--wait` pattern under the limit does not 429; a burst does
- old hub image against the new Convex functions: existing-name register works

Gauge writes the criteria. This list is the author's check.

## 13. Out of scope

Cross-account rooms and room invitations. Self-service human sign-up. A page
for issuing codes or managing accounts. Tailscale Funnel and T-057. Turning
on `AUTH_MODE=strict`. The Loop 5 deploy. Any hub-talk flag other than
`--invite`.

## 14. Questions for a ruling

1. **Agent issue in warn.** I refuse it in both modes (section 4). Acceptance B
   can be read as "an agent key's issue succeeds in warn." I looked for an
   existing seat that issues codes and did not find one, so there is no
   hub-talk path to preserve. Please rule.
2. **No measured limit yet.** I did not read tcm. Section 10 is the procedure
   and the 10x headroom. The number waits for your go-ahead to read the log,
   which I am treating as separate from the Loop 5 deploy go-ahead.
3. **`hub-enroll.mjs` rather than a hub-talk issue flag.** Confirm that stays
   outside the hub-talk contract. Anything else hub-talk would need comes back
   as a D-003 question.
