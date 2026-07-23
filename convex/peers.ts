import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Upsert by name — registering an existing peer updates it instead of duplicating.
export const register = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("human"), v.literal("agent"), v.literal("group")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("peers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        type: args.type,
        metadata: args.metadata,
        isActive: true,
      });
      return existing._id;
    }
    return await ctx.db.insert("peers", { ...args, isActive: true });
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("peers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("peers").collect();
  },
});
