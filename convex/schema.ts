import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  experiences: defineTable({
    trigger: v.string(),
    action: v.string(),
    context: v.string(),
    outcome: v.string(),
    confidence: v.number(),
    sourceAgent: v.string(),
    category: v.union(
      v.literal("repo-docs"),
      v.literal("repo-script"),
      v.literal("repo-config"),
      v.literal("user-env"),
      v.literal("user-error")
    ),
    createdAt: v.number(),
  }).searchIndex("search_trigger", {
    searchField: "trigger",
    filterFields: ["category"],
  }),

  tasks: defineTable({
    taskId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in-progress"),
      v.literal("escalated"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    messages: v.array(
      v.object({
        role: v.string(),
        content: v.string(),
        timestamp: v.number(),
      })
    ),
    assignedAgent: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_taskId", ["taskId"]),

  agents: defineTable({
    name: v.string(),
    apiKeyHash: v.string(),
    agentCard: v.any(),
    lastSeen: v.number(),
    status: v.union(v.literal("online"), v.literal("offline")),
    // ADR-011: optional so existing rows need no migration. Absent = legacy
    // client (hub-talk / ask-agent) — neither supersedes nor is superseded.
    activeInstanceId: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    // ADR-012: absent = allow all. Present { allow } is who may ask this peer.
    // Optional `what` can slot in later without migrating existing rows.
    askPolicy: v.optional(
      v.object({
        allow: v.array(v.string()),
        what: v.optional(v.any()),
      })
    ),
    // T-003 (Loop 3 §1.1): stored, never derived from a holder count. Only an
    // owned row authenticates. Optional so rows present at deploy stay valid;
    // absent reads as legacy until agents:classifyAtDeploy runs.
    keyStatus: v.optional(v.union(v.literal("owned"), v.literal("legacy"))),
    // T-066 (Loop 5 §4): the human who owns this row; a human-kind row owns
    // itself. An owner sees the rooms his agents are in (accessLogic). Optional
    // so rows present at deploy stay valid; agents:assignOwnerAtDeploy fills
    // them once. Loop 6's accounts keep this as the join key (D-010).
    owner: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    // Auth looks agents up by key hash on every guarded request.
    .index("by_apiKeyHash", ["apiKeyHash"]),

  // Loop 6 (T-067). The plaintext code never lands here. Optional fields so a
  // v1.11.0 hub that never mentions the table still deploys against it.
  enrollmentCodes: defineTable({
    codeHash: v.string(),
    issuer: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_hash", ["codeHash"]),

  // A2A protocol tasks (the spec's Task lifecycle), stored whole.
  //
  // Deliberately separate from the `tasks` table above, which backs the hub's
  // own agent queue and has an unrelated shape. Keeping the spec object intact
  // rather than shredding it into columns means TaskState and future spec
  // fields survive without a migration — the SDK owns this shape, we don't.
  a2aTasks: defineTable({
    taskId: v.string(),
    contextId: v.string(),
    task: v.any(),
    updatedAt: v.number(),
    // T-066 (Loop 5 §6): the caller that created the task. Only it may load
    // the task by id. Absent on tasks saved before Loop 5 (anyone may load).
    createdBy: v.optional(v.string()),
  }).index("by_taskId", ["taskId"]),

  // --- Chat channel (ADR-005: peers/sessions/messages, replaces Telegram) ---

  // Humans and agents as first-class entities. Aaron is a peer, not a relay.
  peers: defineTable({
    name: v.string(),
    type: v.union(v.literal("human"), v.literal("agent"), v.literal("group")),
    metadata: v.optional(v.any()),
    isActive: v.boolean(),
  }).index("by_name", ["name"]),

  // Conversations — 1:1 or multi-participant, with turn-cap termination.
  sessions: defineTable({
    title: v.optional(v.string()),
    isActive: v.boolean(),
    turnCount: v.number(),
    maxTurns: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }),

  // Who's in each session, with observation config (Honcho pattern).
  sessionPeers: defineTable({
    sessionId: v.id("sessions"),
    peerId: v.id("peers"),
    observeMe: v.boolean(),
    observeOthers: v.boolean(),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    // T-049 read receipts: highest turn delivered to this participant's
    // hub-talk (--inbox or --wait). Optional so existing rows need no
    // migration; absent means no read has ever been recorded.
    readThroughTurn: v.optional(v.number()),
    readAt: v.optional(v.number()),
    readVia: v.optional(v.union(v.literal("inbox"), v.literal("wait"))),
  })
    .index("by_session", ["sessionId"])
    .index("by_peer", ["peerId"]),

  // Every message has an explicit peer and session association.
  messages: defineTable({
    sessionId: v.id("sessions"),
    peerId: v.id("peers"),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  repoFixes: defineTable({
    experienceId: v.id("experiences"),
    diffPreview: v.string(),
    filePaths: v.array(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("pushed")
    ),
    approvedBy: v.optional(v.string()),
    feedback: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_status", ["status"]),
});
