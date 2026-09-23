import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { computeReadState, numberTurns } from "./readLogic.js";

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

// Active-only by default so daemons don't poll dead sessions; viewers pass
// includeClosed to see the full history.
export const listForPeer = query({
  args: { peerName: v.string(), includeClosed: v.optional(v.boolean()) },
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
      if (!session || !(session.isActive || args.includeClosed)) continue;
      const members = await ctx.db
        .query("sessionPeers")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id))
        .collect();
      const participants = [];
      for (const member of members) {
        const p = await ctx.db.get(member.peerId);
        if (p) participants.push({ name: p.name, type: p.type });
      }
      sessions.push({ ...session, participants });
    }
    return sessions;
  },
});

// Full history for the chat UI: every session, with participant names.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();
    const result = [];
    for (const s of sessions) {
      const memberships = await ctx.db
        .query("sessionPeers")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .collect();
      const participants = [];
      for (const m of memberships) {
        const peer = await ctx.db.get(m.peerId);
        if (peer) participants.push(peer.name);
      }
      result.push({ ...s, participants });
    }
    return result;
  },
});

export const rename = mutation({
  args: { sessionId: v.id("sessions"), title: v.string() },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) throw new Error("title must not be empty");
    await ctx.db.patch(args.sessionId, { title });
  },
});

// Grant more turns to a session and reopen it if the cap closed it. Lets a
// conversation that hit maxTurns mid-thought continue with its transcript
// intact instead of being reseeded from scratch.
export const extend = mutation({
  args: { sessionId: v.id("sessions"), addTurns: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.addTurns) || args.addTurns < 1) {
      throw new Error("addTurns must be a positive integer");
    }
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    const maxTurns = session.maxTurns + args.addTurns;
    await ctx.db.patch(args.sessionId, { maxTurns, isActive: true });
    return { ok: true as const, maxTurns };
  },
});

// Explicit done-signal: either participant (or the hub) closes the session.
export const close = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { isActive: false });
  },
});

// Read receipts for a room (T-049): per participant, the last recorded read
// (null if none ever) and the turns by others it has not been shown. Read-only.
export const readState = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const peerNames = new Map<string, string>();
    const nameOf = async (peerId: any) => {
      if (!peerNames.has(peerId)) {
        const peer = await ctx.db.get(peerId);
        peerNames.set(peerId, (peer as { name?: string } | null)?.name ?? "unknown");
      }
      return peerNames.get(peerId)!;
    };

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const turns = [];
    for (const { message, turn } of numberTurns(messages)) {
      turns.push({ turn, from: await nameOf(message.peerId), createdAt: message.createdAt });
    }

    const memberships = await ctx.db
      .query("sessionPeers")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const members = [];
    for (const m of memberships) {
      members.push({
        name: await nameOf(m.peerId),
        readThroughTurn: m.readThroughTurn,
        readAt: m.readAt,
        readVia: m.readVia,
      });
    }

    return {
      turnCount: session.turnCount,
      participants: computeReadState(turns, members),
    };
  },
});
