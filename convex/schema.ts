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
  }).index("by_name", ["name"]),

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
