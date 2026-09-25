import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Persistence for the A2A spec's Task lifecycle, backing ConvexTaskStore.
//
// `save` upserts. The `agents` table's insert-only register is exactly the bug
// that left 39 rows for ~5 agents; a task store that appended would be worse,
// since TaskStore.load is documented to return *the* task and duplicates would
// make which one you get an accident of insertion order.
export const save = mutation({
  args: {
    taskId: v.string(),
    contextId: v.string(),
    task: v.any(),
    // T-066 (Loop 5 §6): the caller that created the task. Optional, so the
    // v1.10.0 hub's calls still validate. Recorded once, never changed by a
    // later save, so a follow-up by another caller cannot take the task over.
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("a2aTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        contextId: args.contextId,
        task: args.task,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    const { createdBy, ...rest } = args;
    return await ctx.db.insert("a2aTasks", {
      ...rest,
      ...(createdBy ? { createdBy } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const load = query({
  args: { taskId: v.string() },
  handler: async (ctx, args): Promise<any | null> => {
    const row = await ctx.db
      .query("a2aTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();
    return row ? row.task : null;
  },
});

/** T-066: the task plus who created it, for the hub's creator-only load. */
export const loadFor = query({
  args: { taskId: v.string() },
  handler: async (ctx, args): Promise<{ task: any; createdBy: string | null } | null> => {
    const row = await ctx.db
      .query("a2aTasks")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .first();
    return row ? { task: row.task, createdBy: row.createdBy ?? null } : null;
  },
});
