# Messaging App Architecture — A2A Hub v2

> **Status:** Proposed (ADR-005)
> **Date:** 2026-03-23
> **Inspiration:** [Honcho](https://github.com/plastic-labs/honcho) (plastic-labs) — patterns borrowed, not the stack

---

## Why

The Claude Code Telegram plugin silently drops ~70% of messages due to fire-and-forget MCP notifications. Rather than patch a third-party plugin, we build a purpose-built messaging app that doubles as the memory layer. Messages persist in Convex — zero drops, real-time delivery, full control.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                  Next.js Frontend                 │
│         (PWA — works on phone + desktop)          │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────┐  │
│  │  Chat   │  │ Dashboard │  │  Agent Status   │  │
│  │  UI     │  │  Viewer   │  │  & Registry     │  │
│  └────┬────┘  └─────┬────┘  └────────┬────────┘  │
│       │             │                │            │
└───────┼─────────────┼────────────────┼────────────┘
        │             │                │
        ▼             ▼                ▼
┌──────────────────────────────────────────────────┐
│                 Convex Backend                     │
│                                                   │
│  ┌───────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ messages  │  │   peers    │  │ sessionPeers │ │
│  │  table    │  │   table    │  │   table      │ │
│  └─────┬─────┘  └────────────┘  └──────────────┘ │
│        │                                          │
│        ▼                                          │
│  ┌─────────────────────────────────┐              │
│  │   Background Functions          │              │
│  │   (reasoning / insight          │              │
│  │    extraction)                   │              │
│  └─────────────┬───────────────────┘              │
│                │                                  │
│                ▼                                  │
│  ┌─────────────────────────────────┐              │
│  │  representations / insights     │              │
│  │  table (searchable)             │              │
│  └─────────────────────────────────┘              │
│                                                   │
│  ┌─────────────────────────────────┐              │
│  │  A2A Hub Integration            │              │
│  │  (tasks, experiences, agents)   │              │
│  └─────────────────────────────────┘              │
└──────────────────────────────────────────────────┘
```

---

## Data Model (Convex Tables)

### peers

Models both humans and agents as first-class entities with evolving profiles.

```typescript
peers: defineTable({
  name: v.string(),                    // display name
  type: v.union(                       // "human" | "agent" | "group"
    v.literal("human"),
    v.literal("agent"),
    v.literal("group")
  ),
  workspaceId: v.optional(v.string()), // multi-tenant future
  metadata: v.optional(v.any()),       // evolving profile data (JSONB equivalent)
  config: v.optional(v.any()),         // default observation settings
  isActive: v.boolean(),
})
```

**Examples:** Aaron (human), Clark (agent), Brian (human), Alice wrapper (agent), Hub classifier (agent)

### sessions

Conversations — can be 1:1 or multi-participant.

```typescript
sessions: defineTable({
  title: v.optional(v.string()),
  isActive: v.boolean(),               // soft delete
  metadata: v.optional(v.any()),
  createdAt: v.number(),
})
```

### sessionPeers

Join table — who's in each session, with per-peer observation config.

```typescript
sessionPeers: defineTable({
  sessionId: v.id("sessions"),
  peerId: v.id("peers"),
  observeMe: v.boolean(),              // should the system analyze this peer?
  observeOthers: v.boolean(),          // can this peer see insights about others?
  joinedAt: v.number(),
  leftAt: v.optional(v.number()),
  config: v.optional(v.any()),         // per-session overrides
})
```

### messages

Every message has an explicit peer and session association.

```typescript
messages: defineTable({
  sessionId: v.id("sessions"),
  peerId: v.id("peers"),               // who sent it
  content: v.string(),
  tokenCount: v.optional(v.number()),  // cached for batching
  createdAt: v.number(),
})
```

### representations

Insights extracted by background reasoning — what one peer "knows" about another.

```typescript
representations: defineTable({
  sessionId: v.id("sessions"),
  observerId: v.id("peers"),           // who this insight is for
  observedId: v.id("peers"),           // who this insight is about
  content: v.string(),                 // the extracted insight
  sourceMessageIds: v.array(v.id("messages")), // provenance
  createdAt: v.number(),
})
```

---

## Key Patterns (from Honcho, mapped to Convex)

### 1. Session-Peers Join Table

Instead of hardcoding "user + bot" conversations, model any combination of participants. A debugging session might include Aaron, Clark, and the Hub classifier — each with different visibility settings.

### 2. Hierarchical Config Fallback

```
Message config > Session config > Peer default config > Global defaults
```

Resolved at query time in Convex queries. No config duplication — just check each level and use the first non-null value.

### 3. Background Reasoning via Convex Functions

```
Message mutation (insert)
  → triggers scheduled function
    → batches recent messages by (observer, observed) pair
      → one LLM call per batch
        → writes representations to multiple observers
```

Convex's `ctx.scheduler.runAfter()` replaces Honcho's QueueManager. No separate worker process needed.

### 4. Single LLM Call, Multiple Writes

When reasoning about what Peer A said, write the insight to ALL observers' representation collections in one mutation. One API call serves N observers.

### 5. Messaging = Memory

Every conversation automatically feeds the memory system. No separate "capture" step. Background functions continuously extract insights as messages flow in. This replaces the vault-writer's session-end-only approach for Hub conversations.

---

## Frontend (Next.js PWA)

### Core Views

1. **Chat** — Real-time messaging with any peer/session. Convex subscriptions push new messages instantly.
2. **Dashboard** — Hub activity, task status, agent health.
3. **Peers** — Browse all entities (humans + agents), see their profiles and insight history.

### PWA Benefits

- Install to phone home screen — feels like a native app
- Works offline (Convex handles sync on reconnect)
- Push notifications via service worker
- No App Store review process
- Same codebase for desktop + mobile

---

## How It Replaces Telegram

| Telegram Plugin | Messaging App |
|---|---|
| Fire-and-forget notifications | Convex persistence — messages never lost |
| Only works when Claude Code is running | Hub runs 24/7 on VPS |
| No message history | Full conversation history in Convex |
| Single bot chat | Multi-participant sessions |
| No insight extraction | Background reasoning on every conversation |
| Third-party dependency | Fully owned |

---

## Integration with Existing A2A Hub

The messaging app shares the same Convex backend as the Hub. This means:

- **experiences** table (existing) feeds into conversation context
- **tasks** table (existing) can be viewed/managed from the chat UI
- **agents** table (existing) maps to the peers table (or extends it)
- Hub's classify → memory → escalate loop can trigger messages in the app

No new backend service — just new Convex tables + a Next.js frontend alongside the existing Express hub.

---

## Build Sequence

1. **Convex schema** — Add peers, sessions, sessionPeers, messages, representations tables
2. **Basic mutations/queries** — CRUD for peers, sessions, messages
3. **Next.js app** — Chat UI with Convex subscriptions (real-time)
4. **PWA setup** — Service worker, manifest, install prompt
5. **Background reasoning** — Scheduled functions for insight extraction
6. **Hub integration** — Connect existing tasks/experiences to the messaging layer
7. **Observation config** — Per-peer visibility settings UI
