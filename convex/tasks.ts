import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    taskId: v.string(),
    messages: v.array(
      v.object({ role: v.string(), content: v.string(), timestamp: v.number() })
    ),
    assignedAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    taskId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in-progress"),
      v.literal("escalated"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    assignedAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("taskId"), args.taskId))
      .first();
    if (task) {
      await ctx.db.patch(task._id, {
        status: args.status,
        assignedAgent: args.assignedAgent,
        ...(args.status === "completed" ? { resolvedAt: Date.now() } : {}),
      });
    }
  },
});

export const getByTaskId = query({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("taskId"), args.taskId))
      .first();
  },
});

export const addMessage = mutation({
  args: {
    taskId: v.string(),
    role: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("taskId"), args.taskId))
      .first();
    if (task) {
      await ctx.db.patch(task._id, {
        messages: [...task.messages, { role: args.role, content: args.content, timestamp: Date.now() }],
      });
    }
  },
});

// Atomic claim: assigns the task to the agent only if it is still claimable.
// Convex mutations are transactional, so two agents cannot both win.
// Shared by runtime wrappers and dev-time orchestration (ADR: "both machinery").
export const claim = mutation({
  args: {
    taskId: v.string(),
    agentName: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();
    if (!task) return { claimed: false as const, reason: "not-found" };

    const claimable =
      (task.status === "pending" || task.status === "escalated") &&
      (!task.assignedAgent || task.assignedAgent === args.agentName);
    if (!claimable) {
      return { claimed: false as const, reason: "already-claimed" };
    }

    await ctx.db.patch(task._id, {
      status: "in-progress",
      assignedAgent: args.agentName,
    });
    return { claimed: true as const };
  },
});

export const getPending = query({
  args: { agentName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .filter((q) =>
        q.and(
          q.eq(q.field("assignedAgent"), args.agentName),
          q.or(
            q.eq(q.field("status"), "pending"),
            q.eq(q.field("status"), "escalated")
          )
        )
      )
      .collect();
  },
});
