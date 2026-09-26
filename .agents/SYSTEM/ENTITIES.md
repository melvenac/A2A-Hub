# Data Model — A2A Intelligent Hub

> **Source of Truth:** `convex/schema.ts`
> **Last Synced:** 2026-07-22 (Session 5 — chat channel tables, conversations removed)

---

## Tables

### experiences
Lessons learned from agent interactions, searchable by trigger.

| Field | Type | Description |
|---|---|---|
| `trigger` | `string` | What situation triggered this experience |
| `action` | `string` | What action was taken |
| `context` | `string` | Surrounding context |
| `outcome` | `string` | What happened as a result |
| `confidence` | `number` | Confidence score (0-1) |
| `sourceAgent` | `string` | Which agent reported this |
| `category` | `union` | One of: `repo-docs`, `repo-script`, `repo-config`, `user-env`, `user-error` |
| `createdAt` | `number` | Timestamp |

**Indexes:**
- `search_trigger` — Full-text search on `trigger`, filterable by `category`

---

### tasks
A2A task lifecycle tracking.

| Field | Type | Description |
|---|---|---|
| `taskId` | `string` | Unique task identifier |
| `status` | `union` | One of: `pending`, `in-progress`, `escalated`, `completed`, `cancelled` |
| `messages` | `array<{role, content, timestamp}>` | Conversation messages |
| `assignedAgent` | `string?` | Agent currently working on this |
| `createdAt` | `number` | Timestamp |
| `resolvedAt` | `number?` | When task was resolved |

**Indexes:**
- `by_status` — Filter tasks by status
- `by_taskId` — Lookup task by taskId (used by atomic `claim` mutation)

**Mutations of note:** `tasks.claim` — atomic claim (only if `pending`/`escalated` and unassigned or already ours). First agent wins; shared by runtime wrappers and dev-time orchestration.

---

### agents
Registered wrapper agents.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Agent name (unique identifier) |
| `apiKeyHash` | `string` | Hashed API key for authentication |
| `agentCard` | `any` | A2A protocol agent card metadata. `kind: "human"` marks a human peer's row (the browser client's `aaron`): its peer stays `human`, and `listOnline` leaves it out (Loop 3 §12) |
| `lastSeen` | `number` | Last heartbeat timestamp |
| `status` | `union` | One of: `online`, `offline` |
| `activeInstanceId` | `string?` | Live daemon process id (ADR-011). Absent = legacy client |
| `lastHeartbeatAt` | `number?` | Last instance-aware heartbeat. Absent = legacy / stale |
| `askPolicy` | `{ allow: string[] }?` | Who may ask this peer (ADR-012). Absent = allow all |
| `keyStatus` | `"owned" | "legacy"?` | T-003. Stored, never derived from how many names share a hash. `owned` is set when a name acquires a key under the v1.9.0 rules (insert, migration, rotate) or by `classifyAtDeploy` for a row unshared at deploy. Absent reads as `legacy`. **Only an owned row authenticates** |
| `owner` | `string?` | T-066 (Loop 5 §4). The human who owns the row. A human-kind row owns itself. Set at register by the hub, never from the request body: a human's own name, otherwise `HUB_OWNER` (default `aaron`) until Loop 6's enrollment. Rows present at deploy get one from `agents:assignOwnerAtDeploy` (internal, run before and after the hub swap). No query-time default: a row without an owner gives no one an owner view. **An owner sees the rooms his agents are in** (`convex/accessLogic.ts`). The join key for Loop 6's accounts (D-010) |

**Indexes:**
- `by_name` — Lookup agent by name
- `by_apiKeyHash` — Auth lookup from a presented key hash

### enrollmentCodes
One-time enrollment codes (T-067, Loop 6). The plaintext code is never stored. `codeHash` is `hashKey` of the code. `issuer` is the human who issued it. `expiresAt` is 24 hours after `createdAt`. `usedAt` is absent until the code is consumed on an insert. Index `by_hash` on `codeHash`.

`POST /a2a/enroll` (human-kind caller, both modes) writes a row through `agents.issueEnrollmentCode`. `agents:createHuman` is internal and is the only insert that stores `kind: "human"`. A valid code on a new name sets `owner` to the issuer. A codeless warn insert still uses `HUB_OWNER`.

`agents.register` (and `registerAgent`, which also returns what happened) decides by `convex/keyLogic.ts` `decideRegister`. A key held by another name is refused (U1). So is a key under 32 characters that the name does not already hold. On an owned name, a different key is refused (C7). A legacy name re-registering the key it holds is allowed in warn (U2). A legacy name presenting a fresh key is a **migration**: its row is deleted and a fresh owned row inserted, in one transaction (D-007). Refusals throw a `ConvexError { status, reason }`. Every refusal leaves the stored hash unchanged. `agents.rotateKey` is the only way an owned row changes its key: a compare-and-swap on the current hash. Rotation also takes the instance lease. Any write that takes a name off a hash first stamps that hash's unclassified co-holders `legacy`, so attrition never promotes a row. `agents.classifyAtDeploy` and `agents.release` are internal (admin key only). A same-key re-register patches the existing row (`agentCard`, `lastSeen`, `status: "online"`) instead of inserting a duplicate. After the upsert it collapses extras for that name, keeping **max `lastSeen`** and deleting the rest (bounded per mutation). A register with `instanceId` also sets `activeInstanceId` / `lastHeartbeatAt` (takeover). Clients that omit `instanceId` leave those fields untouched. `GET /a2a/agents/live` reports `rowCount` per name (table rows before HTTP mapping). From T-066 it lists only the caller's owner's agents. `getByName` and `listOnline` also return `owner` (and `getByName` returns `human`); neither ever returns `apiKeyHash`. `agents:assignOwnerAtDeploy({owner})` fills rows with no owner (a human-kind row gets itself) and returns counts. `agents:setOwner({name, owner})` sets one name's owner. Both are internal.

---

### a2aTasks
A2A protocol tasks (the spec's Task lifecycle), stored whole. This is separate from `tasks` above, which backs the hub's own agent queue and has an unrelated shape. The spec object is kept intact rather than split into columns, so `TaskState` and future spec fields need no migration. Backs `ConvexTaskStore` (`src/task-store.ts`).

| Field | Type | Description |
|---|---|---|
| `taskId` | `string` | A2A task id |
| `contextId` | `string` | A2A context id |
| `task` | `any` | The spec `Task` object, whole (owned by the SDK) |
| `updatedAt` | `number` | Timestamp of the last save |
| `createdBy` | `string?` | T-066 (Loop 5 §6). The JSON-RPC caller that created the task, written on insert only. Only it may load the task by id (`tasks/get`, `tasks/cancel`); another caller gets the same error as a nonexistent id in strict. Absent on tasks saved before Loop 5 (loads for anyone) |

**Indexes:**
- `by_taskId` — Lookup by A2A task id

`a2aTasks.save` upserts on `by_taskId`, deliberately unlike an insert-only write. A later save never changes `createdBy`. `a2aTasks.load` reads by `taskId`; `a2aTasks.loadFor` also returns `createdBy`.

---

### peers
Humans and agents as first-class chat entities (ADR-005/006). Aaron is a peer, not a relay.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique display name |
| `type` | `union` | One of: `human`, `agent`, `group` |
| `metadata` | `any?` | Evolving profile data |
| `isActive` | `boolean` | Soft delete |

**Indexes:**
- `by_name` — Lookup peer by name

---

### sessions
Conversations — 1:1 or multi-participant, with turn-cap termination so autonomous agents converge.

| Field | Type | Description |
|---|---|---|
| `title` | `string?` | Session title |
| `isActive` | `boolean` | Closed sessions reject new messages |
| `turnCount` | `number` | Messages sent so far |
| `maxTurns` | `number` | Cap (default 16); reaching it auto-closes the session |
| `metadata` | `any?` | Arbitrary session data |
| `createdAt` | `number` | Timestamp |

**Access (T-066):** no new field. `sessions.access({sessionId, caller})` answers `{exists, participant, ownerView}`. `sessions.listVisibleTo({name})` is `listAll`'s entry shape filtered to the rooms a caller is in plus, for a human, the rooms his agents are in. `sessions.createCheck({caller, participantNames})` names the first participant another owner owns. `listAll`, `get` and `listForPeer` are unchanged.

---

### sessionPeers
Join table — who's in each session, with observation config (Honcho pattern).

| Field | Type | Description |
|---|---|---|
| `sessionId` | `Id<"sessions">` | Session |
| `peerId` | `Id<"peers">` | Participant |
| `observeMe` | `boolean` | Should the system analyze this peer? |
| `observeOthers` | `boolean` | Can this peer see insights about others? |
| `joinedAt` | `number` | Timestamp |
| `leftAt` | `number?` | When they left |
| `readThroughTurn` | `number?` | Read receipts (T-049): highest turn delivered to this participant's `hub-talk`. Absent = no read ever recorded |
| `readAt` | `number?` | When that mark was set (hub clock) |
| `readVia` | `"inbox" \| "wait"`? | Which `hub-talk` call delivered it |

Read state is written only by `messages.markRead` (`POST /a2a/session/:id/read`). It is monotonic, and never set by fetching messages. It is read by `sessions.readState` (`GET /a2a/session/:id/reads`).

**Indexes:**
- `by_session` — Members of a session
- `by_peer` — Sessions for a peer

---

### messages
Every message has an explicit peer and session association. Turn cap enforced atomically in `messages.send`.

| Field | Type | Description |
|---|---|---|
| `sessionId` | `Id<"sessions">` | Session |
| `peerId` | `Id<"peers">` | Sender |
| `content` | `string` | Message text |
| `createdAt` | `number` | Timestamp |

**Indexes:**
- `by_session` — Messages in a session

---

### repoFixes
Drafted code fixes awaiting human approval.

| Field | Type | Description |
|---|---|---|
| `experienceId` | `Id<"experiences">` | Source experience that prompted the fix |
| `diffPreview` | `string` | Unified diff of proposed changes |
| `filePaths` | `array<string>` | Files affected |
| `status` | `union` | One of: `pending`, `approved`, `rejected`, `pushed` |
| `approvedBy` | `string?` | Who approved (via chat channel) |
| `feedback` | `string?` | Rejection feedback |
| `createdAt` | `number` | Timestamp |

**Indexes:**
- `by_status` — Filter fixes by approval status
