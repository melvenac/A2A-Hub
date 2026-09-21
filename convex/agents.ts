import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { decideHeartbeat } from "./instanceLogic.js";

export const register = mutation({
  args: {
    name: v.string(),
    apiKeyHash: v.string(),
    agentCard: v.any(),
    instanceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const instanceFields = args.instanceId
      ? { activeInstanceId: args.instanceId, lastHeartbeatAt: now }
      : {};

    const dupes = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .collect();

    if (dupes.length === 0) {
      return await ctx.db.insert("agents", {
        name: args.name,
        apiKeyHash: args.apiKeyHash,
        agentCard: args.agentCard,
        lastSeen: now,
        status: "online",
        ...instanceFields,
      });
    }

    // Canonical row: newest lastSeen; tie-break by _id so heartbeat's
    // .first() and this mutation agree after extras are gone.
    let canonical = dupes[0];
    for (const row of dupes) {
      if (
        row.lastSeen > canonical.lastSeen ||
        (row.lastSeen === canonical.lastSeen && row._id < canonical._id)
      ) {
        canonical = row;
      }
    }

    await ctx.db.patch(canonical._id, {
      apiKeyHash: args.apiKeyHash,
      agentCard: args.agentCard,
      lastSeen: now,
      status: "online",
      ...instanceFields,
    });

    // Convex caps mutation writes; leftover extras self-heal on the next register.
    const MAX_DELETES = 4000;
    let deleted = 0;
    for (const row of dupes) {
      if (row._id === canonical._id) continue;
      if (deleted >= MAX_DELETES) break;
      await ctx.db.delete(row._id);
      deleted++;
    }

    return canonical._id;
  },
});

export const heartbeat = mutation({
  args: { name: v.string(), instanceId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true; superseded?: true }> => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (!agent) return { ok: true };

    const now = Date.now();
    const decision = decideHeartbeat({
      instanceId: args.instanceId,
      activeInstanceId: agent.activeInstanceId,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      now,
    });

    if (decision === "superseded") return { ok: true, superseded: true };

    if (decision === "legacy") {
      await ctx.db.patch(agent._id, { lastSeen: now, status: "online" });
      return { ok: true };
    }

    await ctx.db.patch(agent._id, {
      lastSeen: now,
      status: "online",
      activeInstanceId: args.instanceId,
      lastHeartbeatAt: now,
    });
    return { ok: true };
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ name: string; apiKeyHash: string } | null> => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    return agent ? { name: agent.name, apiKeyHash: agent.apiKeyHash } : null;
  },
});

// Resolves a presented X-Agent-Key (already hashed by the caller) to its agent.
// Returns null when nothing matches — an unknown key must never inherit another
// agent's identity, so callers treat null as "unauthenticated", not "any agent".
export const getByKeyHash = query({
  args: { apiKeyHash: v.string() },
  handler: async (ctx, args): Promise<{ name: string } | null> => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_apiKeyHash", (q) => q.eq("apiKeyHash", args.apiKeyHash))
      .first();
    return agent ? { name: agent.name } : null;
  },
});

export const listOnline = query({
  args: {},
  handler: async (ctx): Promise<any[]> => {
    return await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("status"), "online"))
      .collect();
  },
});
