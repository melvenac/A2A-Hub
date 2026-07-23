import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_MAX_TURNS = 16;

// Create a session with named participants. Peers must be registered first.
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    participantNames: v.array(v.string()),
    maxTurns: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const peerIds = [];
    for (const name of args.participantNames) {
      const peer = await ctx.db
        .query("peers")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (!peer) throw new Error(`Unknown peer: ${name}`);
      peerIds.push(peer._id);
    }

    const sessionId = await ctx.db.insert("sessions", {
      title: args.title,
      isActive: true,
      turnCount: 0,
      maxTurns: args.maxTurns ?? DEFAULT_MAX_TURNS,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    for (const peerId of peerIds) {
      await ctx.db.insert("sessionPeers", {
        sessionId,
        peerId,
        observeMe: true,
        observeOthers: true,
        joinedAt: Date.now(),
      });
    }

    return sessionId;
  },
});

export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const memberships = await ctx.db
      .query("sessionPeers")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const participants = [];
    for (const m of memberships) {
      const peer = await ctx.db.get(m.peerId);
      if (peer) participants.push({ name: peer.name, type: peer.type });
    }
    return { ...session, participants };
  },
});

export const listForPeer = query({
  args: { peerName: v.string() },
  handler: async (ctx, args) => {
    const peer = await ctx.db
      .query("peers")
      .withIndex("by_name", (q) => q.eq("name", args.peerName))
      .first();
    if (!peer) return [];
    const memberships = await ctx.db
      .query("sessionPeers")
      .withIndex("by_peer", (q) => q.eq("peerId", peer._id))
      .collect();
    const sessions = [];
    for (const m of memberships) {
      const session = await ctx.db.get(m.sessionId);
      if (session && session.isActive) sessions.push(session);
    }
    return sessions;
  },
});

// Explicit done-signal: either participant (or the hub) closes the session.
export const close = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { isActive: false });
  },
});
