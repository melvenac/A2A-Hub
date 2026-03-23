# Data Model — A2A Intelligent Hub

> **Source of Truth:** `convex/schema.ts`
> **Last Synced:** 2026-03-22

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

**Indexes:**
- `by_name` — Lookup agent by name

---

### conversations
Multi-turn task conversations.

| Field | Type | Description |
|---|---|---|
| `taskId` | `string` | Associated task ID |
| `messages` | `array<{role, content, timestamp}>` | Full conversation history |
| `participants` | `array<string>` | Agent names involved |
| `summary` | `string?` | AI-generated conversation summary |
| `createdAt` | `number` | Timestamp |

**Indexes:**
- `by_taskId` — Lookup conversation by task

---

### repoFixes
Drafted code fixes awaiting human approval.

| Field | Type | Description |
|---|---|---|
| `experienceId` | `Id<"experiences">` | Source experience that prompted the fix |
| `diffPreview` | `string` | Unified diff of proposed changes |
| `filePaths` | `array<string>` | Files affected |
| `status` | `union` | One of: `pending`, `approved`, `rejected`, `pushed` |
| `approvedBy` | `string?` | Who approved (via Telegram) |
| `feedback` | `string?` | Rejection feedback |
| `createdAt` | `number` | Timestamp |

**Indexes:**
- `by_status` — Filter fixes by approval status
