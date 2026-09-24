import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
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

// Loop 3 §12 H1: registration never changes an existing peer's type. The hub's
// /a2a/register uses this, so an agent row for the human peer `aaron` leaves it
// human. Inserts with `type` when absent; when present, only reactivates it.
export const ensure = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("human"), v.literal("agent"), v.literal("group")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("peers")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      if (!existing.isActive) await ctx.db.patch(existing._id, { isActive: true });
      return existing._id;
    }
    return await ctx.db.insert("peers", { ...args, isActive: true });
  },
});

/**
 * The `Unknown peer` error, with its likely cause (Loop 3 §11, B1). An old
 * hub-talk swallows a refused register and only prints this later; naming the
 * cause here makes that loud without changing the old client.
 */
export async function unknownPeerError(ctx: QueryCtx, name: string): Promise<Error> {
  const agent = await ctx.db
    .query("agents")
    .withIndex("by_name", (q) => q.eq("name", name))
    .first();
  return new Error(
    agent
      ? `Unknown peer: ${name}`
      : `Unknown peer: ${name} (not registered on this hub; if its register was refused, create it with hub-talk --init-key)`
  );
}

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
