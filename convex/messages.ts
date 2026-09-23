import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { numberTurns, validateMark } from "./readLogic.js";

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

// Poll messages in a session, optionally only those after a turn number
// (preferred) or a timestamp (legacy).
//
// `turn` is the message's 1-based position in the room, which is what
// `send` reports back as the turn it wrote. It is derived from insertion
// order rather than stored, so rooms written before this change are numbered
// correctly too. A turn number is the cursor a reader can trust: unlike a
// timestamp it cannot be advanced by the reader's own write.
export const list = query({
  args: {
    sessionId: v.id("sessions"),
    since: v.optional(v.number()),
    after: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const numbered = numberTurns(all);
    const filtered = numbered.filter(
      ({ message, turn }) =>
        (args.after === undefined || turn > args.after) &&
        (args.since === undefined || message.createdAt > args.since),
    );

    const result = [];
    for (const { message, turn } of filtered) {
      const peer = await ctx.db.get(message.peerId);
      result.push({
        content: message.content,
        from: peer?.name ?? "unknown",
        fromType: peer?.type ?? "unknown",
        createdAt: message.createdAt,
        turn,
      });
    }
    return result;
  },
});

// Record that `reader` has been shown every turn up to `throughTurn` (T-049).
//
// The ONLY writer of read state. hub-talk calls it after --inbox or --wait has
// printed turns; nothing that merely fetches (daemon, web client, a plain GET
// of messages) calls it, and `list` above is a query, which cannot write.
// Monotonic: an older mark never moves the stored one backwards.
export const markRead = mutation({
  args: {
    sessionId: v.id("sessions"),
    reader: v.string(),
    throughTurn: v.number(),
    via: v.union(v.literal("inbox"), v.literal("wait")),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return { ok: false as const, status: 404, reason: "session not found" };
    }
    const invalid = validateMark(args.throughTurn, session.turnCount);
    if (invalid) return { ok: false as const, status: 400, reason: invalid };

    const peer = await ctx.db
      .query("peers")
      .withIndex("by_name", (q) => q.eq("name", args.reader))
      .first();
    const membership = peer
      ? (
          await ctx.db
            .query("sessionPeers")
            .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
            .collect()
        ).find((m) => m.peerId === peer._id)
      : undefined;
    if (!membership) {
      return {
        ok: false as const,
        status: 404,
        reason: `${args.reader} is not a participant of this session`,
      };
    }

    const stored = membership.readThroughTurn;
    if (stored !== undefined && stored >= args.throughTurn) {
      return { ok: true as const, readThroughTurn: stored, advanced: false };
    }
    await ctx.db.patch(membership._id, {
      readThroughTurn: args.throughTurn,
      readAt: Date.now(),
      readVia: args.via,
    });
    return { ok: true as const, readThroughTurn: args.throughTurn, advanced: true };
  },
});
