import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Send a message into a session. Enforces the turn cap so two autonomous
// agents converge instead of looping forever. Convex mutations are
// transactional, so the turn check + increment is atomic.
export const send = mutation({
  args: {
    sessionId: v.id("sessions"),
    peerName: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!session.isActive) {
      return { ok: false as const, reason: "session-closed" };
    }
    if (session.turnCount >= session.maxTurns) {
      await ctx.db.patch(args.sessionId, { isActive: false });
      return { ok: false as const, reason: "max-turns-reached" };
    }

    const peer = await ctx.db
      .query("peers")
      .withIndex("by_name", (q) => q.eq("name", args.peerName))
      .first();
    if (!peer) throw new Error(`Unknown peer: ${args.peerName}`);

    const messageId = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      peerId: peer._id,
      content: args.content,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.sessionId, { turnCount: session.turnCount + 1 });

    return { ok: true as const, messageId, turn: session.turnCount + 1 };
  },
});

// Poll messages in a session, optionally only those after a timestamp.
export const list = query({
  args: {
    sessionId: v.id("sessions"),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const filtered = args.since ? all.filter((m) => m.createdAt > args.since!) : all;

    const result = [];
    for (const m of filtered) {
      const peer = await ctx.db.get(m.peerId);
      result.push({
        content: m.content,
        from: peer?.name ?? "unknown",
        createdAt: m.createdAt,
      });
    }
    return result;
  },
});
