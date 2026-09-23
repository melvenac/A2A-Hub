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
| `agentCard` | `any` | A2A protocol agent card metadata |
| `lastSeen` | `number` | Last heartbeat timestamp |
| `status` | `union` | One of: `online`, `offline` |
| `activeInstanceId` | `string?` | Live daemon process id (ADR-011). Absent = legacy client |
| `lastHeartbeatAt` | `number?` | Last instance-aware heartbeat. Absent = legacy / stale |
| `askPolicy` | `{ allow: string[] }?` | Who may ask this peer (ADR-012). Absent = allow all |

**Indexes:**
- `by_name` — Lookup agent by name
- `by_apiKeyHash` — Auth lookup from a presented key hash

`agents.register` upserts on `by_name`: a second register for the same name patches the existing row (`apiKeyHash`, `agentCard`, `lastSeen`, `status: "online"`) instead of inserting a duplicate. After the upsert it collapses extras for that name, keeping **max `lastSeen`** and deleting the rest (bounded per mutation). A register with `instanceId` also sets `activeInstanceId` / `lastHeartbeatAt` (takeover). Clients that omit `instanceId` leave those fields untouched. `GET /a2a/agents/live` reports `rowCount` per name (table rows before HTTP mapping).

---

### a2aTasks
A2A protocol tasks (the spec's Task lifecycle), stored whole. This is separate from `tasks` above, which backs the hub's own agent queue and has an unrelated shape. The spec object is kept intact rather than split into columns, so `TaskState` and future spec fields need no migration. Backs `ConvexTaskStore` (`src/task-store.ts`).

| Field | Type | Description |
|---|---|---|
| `taskId` | `string` | A2A task id |
| `contextId` | `string` | A2A context id |
| `task` | `any` | The spec `Task` object, whole (owned by the SDK) |
| `updatedAt` | `number` | Timestamp of the last save |

**Indexes:**
- `by_taskId` — Lookup by A2A task id

`a2aTasks.save` upserts on `by_taskId`, deliberately unlike an insert-only write. `a2aTasks.load` reads by `taskId`.

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
