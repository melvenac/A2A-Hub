import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { hubAgentCard } from "./agent-card.js";
import { MemoryEngine } from "./memory.js";
import { HubExecutor } from "./executor.js";
import { Classifier } from "./classifier.js";
import { Escalation } from "./escalation.js";
import { AgentQueue } from "./queue.js";
import { RepoFixer } from "./repo-fixer.js";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { requireAgentKey, authMode } from "./auth.js";
import {
  bindName,
  enforce,
  isCaller,
  note,
  sanitize,
  shortId,
  SESSION_NOT_FOUND,
  TASK_NOT_FOUND,
} from "./authz.js";
import { INSTANCE_LIVENESS_MS } from "./identity.js";
import { makeRegisterHandler, makeRotateHandler, whoami } from "./keys.js";
import { askDeniedReason, evaluateAsk } from "./ask-policy.js";
import { DefaultRequestHandler } from "@a2a-js/sdk/server";
import { jsonRpcHandler } from "@a2a-js/sdk/server/express";
import { ConvexTaskStore } from "./task-store.js";
import { HubAgentExecutor, HubUser } from "./a2a-executor.js";
import { mountUi } from "./ui.js";

const app = express();
app.use(express.json());

// CORS for the browser test client (client/ dev server). Hand-rolled to
// avoid a dependency; the hub is not cookie-authenticated so "*" is safe.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Agent-Key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Initialize dependencies
const convexUrl = process.env.CONVEX_URL || "http://127.0.0.1:3210";
const convex = new ConvexHttpClient(convexUrl);
const anthropic = new Anthropic();
const memory = new MemoryEngine(convexUrl);
const classifier = new Classifier(anthropic);
const escalation = new Escalation(convexUrl);
const repoFixer = new RepoFixer(anthropic);
const queue = new AgentQueue({
  getPendingTasks: (agentName) => convex.query(api.tasks.getPending, { agentName }),
});

// Notify the human peer through the chat channel (replaces Telegram).
// Best-effort: hub notifications must never block the agent loop.
const HUMAN_PEER = process.env.HUMAN_PEER || "aaron";
// T-066 (Q3): who owns a non-human registration until Loop 6's enrollment
// decides. Safe only because nothing is public before strict and Loop 6
// (G-001, D-011): register stays open until then.
const HUB_OWNER = process.env.HUB_OWNER || HUMAN_PEER;
let hubSessionId: string | null = null;

async function notifyHuman(content: string) {
  try {
    if (!hubSessionId) {
      await convex.mutation(api.peers.register, { name: "hub", type: "agent" });
      await convex.mutation(api.peers.register, { name: HUMAN_PEER, type: "human" });
      hubSessionId = await convex.mutation(api.sessions.create, {
        title: "Hub activity",
        participantNames: ["hub", HUMAN_PEER],
        maxTurns: 100_000, // activity feed, not a bounded agent conversation
      });
    }
    await convex.mutation(api.messages.send, {
      sessionId: hubSessionId as any,
      peerName: "hub",
      content,
    });
  } catch (error) {
    console.error("notifyHuman failed:", error);
  }
}

// --- T-066 (Loop 5): the caller's owner, and room access ---

type CallerInfo = { name: string | null; owner?: string; human: boolean };

/** The caller's owner and kind, looked up once per request. */
async function callerInfo(req: express.Request): Promise<CallerInfo> {
  const cached = (req as any)._callerInfo as CallerInfo | undefined;
  if (cached) return cached;
  const name = req.agentName ?? null;
  let info: CallerInfo = { name, human: false };
  if (name) {
    const row = await convex.query(api.agents.getByName, { name });
    info = { name, owner: row?.owner, human: row?.human === true };
  }
  (req as any)._callerInfo = info;
  return info;
}

/**
 * Membership for /a2a/session/:sessionId/* (§3). "write" needs a participant;
 * "read" also admits a human owner's view of his agents' rooms (§4, Q1).
 * Returns false when a strict refusal has been sent. A session that does not
 * exist is not an authorisation matter: strict answers it with the same 404 as
 * a room the caller may not see (Q2, no oracle), and warn leaves it as today.
 */
async function sessionGate(
  req: express.Request,
  res: express.Response,
  need: "read" | "write"
): Promise<boolean> {
  const access = await convex.query(api.sessions.access, {
    sessionId: String(req.params.sessionId),
    caller: req.agentName ?? undefined,
  });
  if (!access.exists) {
    if (authMode !== "strict") return true;
    res.status(SESSION_NOT_FOUND.status).json({ error: SESSION_NOT_FOUND.error });
    return false;
  }
  const allowed = access.participant || (need === "read" && access.ownerView);
  return enforce(
    req,
    res,
    allowed,
    `non-member session=${shortId(req.params.sessionId)}`,
    SESSION_NOT_FOUND
  );
}

/**
 * O3: an explicit `to` naming another owner's agent. Returns the refusal text
 * to send (strict), or null to go on. Unknown targets are left to escalation.
 */
async function crossOwnerTo(
  caller: CallerInfo,
  to: string,
  route: string
): Promise<string | null> {
  const target = await convex.query(api.agents.getByName, { name: to });
  if (!target) return null;
  if (caller.name && caller.owner && target.owner === caller.owner) return null;
  const refusal = `cross-owner to=${sanitize(to)}`;
  return note(refusal, route, caller.name) === "reject" ? refusal : null;
}

/** Returns true if the response was already sent (403). Asker is req.agentName. */
async function denyNamedAsk(
  req: express.Request,
  res: express.Response,
  targetName: string
): Promise<boolean> {
  const target = await convex.query(api.agents.getByName, { name: targetName });
  if (evaluateAsk(target?.askPolicy, req.agentName) === "deny") {
    res.status(403).json({
      error: "askPolicy denied",
      reason: askDeniedReason(req.agentName as string, targetName),
    });
    return true;
  }
  return false;
}

// Hub executor
const executor = new HubExecutor({
  searchMemory: (query) => memory.search(query),
  escalate: async (message, agentName, owner) => {
    // Only the hub owner's own traffic is narrated into his activity room (Q5).
    if (!owner || owner === HUMAN_PEER) {
      await notifyHuman(`Escalating${agentName ? ` to ${agentName}` : " to available agent"}...`);
    }
    return escalation.escalateToAgent(message, agentName, owner);
  },
  storeLesson: async (lesson) => {
    await memory.store(lesson);
    await notifyHuman(`Lesson stored: ${lesson.trigger} → ${lesson.category}`);

    // Check if repo fix is needed
    if (["repo-docs", "repo-script", "repo-config"].includes(lesson.category)) {
      const fix = await repoFixer.draftFix(lesson.trigger, lesson.action, lesson.category);
      if (fix) {
        await notifyHuman(
          `Proposed repo fix (${fix.filePaths.join(", ")}):\n${fix.diffPreview.slice(0, 500)}`
        );
      }
    }
  },
  classify: (trigger, action) => classifier.classify(trigger, action),
});

// Every /a2a route is guarded in one place rather than by a per-route check.
// The old pattern was copy-pasted into eleven handlers and only tested for the
// header's presence, so a bogus key returned 200; worse, a new route was
// unguarded until someone remembered to paste the block. Guarding the prefix
// makes the default fail-safe: a route added tomorrow is protected on arrival.
const guardAgentKey = requireAgentKey(convex);
app.use("/a2a", (req, res, next) => {
  // Registration is how an agent *obtains* a key, so it cannot demand one.
  // req.path is relative to the mount point here, hence "/register".
  if (req.path === "/register") return next();
  return guardAgentKey(req, res, next);
});

// The spec transport, on its own path so it cannot interfere with the legacy
// /a2a/<name> routes below. This is additive: nothing already running has to
// move, and the legacy routes retire once the daemons and the chat client
// speak JSON-RPC, not before.
//
// Mounted with app.use, not app.post: jsonRpcHandler returns a Router that
// registers POST "/", so it has to own its mount point. Hanging it off
// app.post("/a2a") left the inner route unmatched and every call 404'd.
const JSONRPC_ROUTE = "POST /a2a/jsonrpc";
const a2aRequestHandler = new DefaultRequestHandler(
  hubAgentCard,
  new ConvexTaskStore(convex, JSONRPC_ROUTE),
  new HubAgentExecutor(executor, {
    // T-004 and O3, the same rules as POST /a2a/message/send: a `to` naming
    // another owner's agent is refused in strict, and a target's askPolicy in
    // every mode (Q9). Returns the reason to reject with, or null.
    authorize: async (caller, to) => {
      const info: CallerInfo = caller
        ? await (async () => {
            const row = await convex.query(api.agents.getByName, { name: caller });
            return { name: caller, owner: row?.owner, human: row?.human === true };
          })()
        : { name: null, human: false };
      if (to) {
        const cross = await crossOwnerTo(info, to, JSONRPC_ROUTE);
        if (cross) return { refusal: cross };
        const target = await convex.query(api.agents.getByName, { name: to });
        if (evaluateAsk(target?.askPolicy, caller) === "deny") {
          return { refusal: askDeniedReason(caller as string, to) };
        }
      }
      return { owner: info.owner };
    },
  })
);
app.use(
  "/a2a/jsonrpc",
  jsonRpcHandler({
    requestHandler: a2aRequestHandler,
    // Authentication is enforced by the guard above. The user carries the
    // caller's name to the executor and task store (T-004, T-066 §6).
    userBuilder: async (req) => new HubUser(req.agentName ?? null),
  })
);

// Routes
// Health has to reflect the whole hub, not just this process. A Convex backend
// that dies under a live hub left this endpoint answering "ok" for days while
// every persistence call behind it failed -- so probe the database too. The
// probe is bounded: a hung backend must surface as degraded, not hang /health.
app.get("/health", async (_req, res) => {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      convex.query(api.peers.list, {}),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("convex probe timed out after 3000ms")), 3000);
      }),
    ]);
    res.json({
      status: "ok",
      agent: hubAgentCard.name,
      convex: { status: "ok", latencyMs: Date.now() - started },
    });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      agent: hubAgentCard.name,
      convex: { status: "unreachable", error: (error as Error).message },
    });
  } finally {
    clearTimeout(timer);
  }
});

app.get("/.well-known/agent-card.json", (_req, res) => {
  res.json(hubAgentCard);
});

// A2A message/send endpoint
app.post("/a2a/message/send", async (req, res) => {

  const message = req.body?.params?.message?.parts?.[0]?.text;
  if (!message) return res.status(400).json({ error: "No message text found" });

  // Direct addressing: route to a named agent instead of "whoever's online".
  const to = req.body?.params?.to ?? req.body?.params?.message?.metadata?.to;
  const caller = await callerInfo(req);
  if (typeof to === "string" && to) {
    // O3: another owner's agent is not askable (cross-account contact comes by
    // invitation, D-010). Checked before askPolicy, so no task is created.
    const cross = await crossOwnerTo(caller, to, "POST /a2a/message/send");
    if (cross) return res.status(403).json({ error: cross });
    if (await denyNamedAsk(req, res, to)) return;
  }

  // The sender is the caller (T-066 §2). `role` is A2A's user/agent, not a name.
  const senderName = caller.name ?? "unknown";
  // Q5: only the hub owner's own traffic is narrated into his activity room,
  // so another owner's text never lands there. An unknown caller (warn) is
  // narrated as today.
  const narrate = !caller.name || caller.owner === HUMAN_PEER;
  if (narrate) {
    await notifyHuman(`Incoming from ${senderName}${to ? ` → ${to}` : ""}: ${message}`);
  }

  try {
    const result = await executor.handleMessage(message, to, caller.owner);

    if (narrate) {
      await notifyHuman(
        `${result.answeredFromMemory ? "Hub (memory)" : "Escalated agent"}: ${result.response}`
      );
    }

    res.json({
      jsonrpc: "2.0",
      id: req.body.id || 1,
      result: {
        task: {
          status: "completed",
          artifacts: [{ parts: [{ kind: "text", text: result.response }] }],
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Wrapper response endpoint
app.post("/a2a/task/:taskId/respond", async (req, res) => {
  try {
    const { taskId } = req.params;

    const responseText = req.body?.response;
    if (!responseText) return res.status(400).json({ error: "Missing response field" });

    // T-066 §5 (Q8): only the agent the task is assigned to answers it, claimed
    // or not. Strict answers another caller exactly as a task that does not
    // exist (Q2); warn leaves a missing task to behave as today.
    const task = await convex.query(api.tasks.getByTaskId, { taskId });
    if (!task) {
      if (authMode === "strict") {
        return res.status(TASK_NOT_FOUND.status).json({ error: TASK_NOT_FOUND.error });
      }
    } else if (
      !enforce(
        req,
        res,
        isCaller(task.assignedAgent, req.agentName),
        `not-assigned task=${shortId(taskId)}`,
        TASK_NOT_FOUND
      )
    ) {
      return;
    }

    await convex.mutation(api.tasks.addMessage, {
      taskId,
      role: "agent",
      content: responseText,
    });

    // Completing a task keeps who it was assigned to; before T-066 this call
    // passed none and the claimant was lost.
    await convex.mutation(api.tasks.updateStatus, {
      taskId,
      status: "completed",
      ...(task?.assignedAgent ? { assignedAgent: task.assignedAgent } : {}),
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Atomic task claim — first agent wins, others get { claimed: false }.
app.post("/a2a/task/:taskId/claim", async (req, res) => {
  try {
    const { taskId } = req.params;

    const agentName = req.body?.agentName;
    if (!agentName) return res.status(400).json({ error: "Missing agentName field" });
    if (!bindName(req, res, agentName, "agentName")) return;

    const result = await convex.mutation(api.tasks.claim, { taskId, agentName });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Agent polling queue
app.get("/a2a/queue/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    if (!bindName(req, res, agentId, "agentId")) return;

    const tasks = await queue.getTasksFor(agentId);
    res.json({ tasks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Agent heartbeat
app.post("/a2a/heartbeat/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    // Bound before the mutation, so a refused heartbeat moves nothing.
    if (!bindName(req, res, agentId, "agentId")) return;
    const instanceId =
      typeof req.body?.instanceId === "string" ? req.body.instanceId : undefined;
    const result = await convex.mutation(api.agents.heartbeat, {
      name: agentId,
      instanceId,
    });
    if (result?.superseded) {
      return res.status(409).json({ error: "superseded" });
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Live agents for IDE-session discovery. lastSeen is on `agents`; chat peers
// have no heartbeat of their own. Dedup by name. `rowCount` is how many
// agents-table rows that name had *before* this map (1 after D2 collapse).
// `kind` comes from agentCard.kind (hub-talk uses "ide-session") so alice/bob
// do not show up as joinable Cursor peers.
app.get("/a2a/agents/live", async (req, res) => {
  try {
    const cutoff = Date.now() - INSTANCE_LIVENESS_MS;
    const kindFilter =
      typeof req.query.kind === "string" && req.query.kind
        ? req.query.kind
        : undefined;
    // T-066 (Q4): a caller sees only its own owner's agents. An unknown caller
    // (warn) gets today's full list and one line (O1); strict never gets here.
    const caller = await callerInfo(req);
    if (!enforce(req, res, caller.name != null, "unknown-caller", SESSION_NOT_FOUND)) return;
    const rows = (await convex.query(api.agents.listOnline, {})).filter(
      (a: { owner?: string }) => caller.name == null || (!!caller.owner && a.owner === caller.owner)
    );
    const rowCountByName = new Map<string, number>();
    const byName = new Map<
      string,
      { name: string; lastSeen: number; kind?: string; rowCount: number }
    >();
    for (const a of rows as {
      name: string;
      lastSeen: number;
      agentCard?: { kind?: string };
    }[]) {
      rowCountByName.set(a.name, (rowCountByName.get(a.name) ?? 0) + 1);
    }
    for (const a of rows as {
      name: string;
      lastSeen: number;
      agentCard?: { kind?: string };
    }[]) {
      const kind = a.agentCard?.kind;
      const prev = byName.get(a.name);
      const lastSeen = prev ? Math.max(prev.lastSeen, a.lastSeen) : a.lastSeen;
      const mergedKind = kind ?? prev?.kind;
      byName.set(a.name, {
        name: a.name,
        lastSeen,
        kind: mergedKind,
        rowCount: rowCountByName.get(a.name) ?? 1,
      });
    }
    let agents = [...byName.values()].filter((a) => a.lastSeen >= cutoff);
    if (kindFilter) agents = agents.filter((a) => a.kind === kindFilter);
    res.json({ agents });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Agent registration — also registers the agent as a chat peer. The key rules
// (uniqueness, owned names, the key floor, migration) live in the mutation
// (Loop 3 §1.3); src/keys.ts maps its refusals to 409/400.
app.post(
  "/a2a/register",
  makeRegisterHandler({ convex, authMode, notifyHuman, hubOwner: HUB_OWNER })
);

// Key rotation (Loop 3 §2): the current key in X-Agent-Key, the new one in the
// body. Guarded by the /a2a prefix, and it fails closed in warn too.
app.post("/a2a/rotate", makeRotateHandler({ convex }));

// Which name this key authenticates as (Loop 3 §2.4). Read-only.
app.get("/a2a/whoami", whoami);

// --- Chat channel routes (peers/sessions/messages) ---

// Create a session between named peers (agents and/or humans).
app.post("/a2a/session", async (req, res) => {
  try {

    const { title, participants, maxTurns } = req.body;
    if (!Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ error: "participants must list at least 2 peer names" });
    }

    // T-066 §3 (Q6): the caller is in any room it creates, and every member
    // shares its owner; cross-owner rooms come by invitation (Loop 6, D-010).
    const caller = req.agentName ?? null;
    const includesCaller = caller != null && participants.includes(caller);
    if (
      !enforce(req, res, includesCaller, "create-without-caller", {
        status: 403,
        error: "participants must include the caller",
      })
    ) {
      return;
    }
    if (includesCaller) {
      const { crossOwner } = await convex.query(api.sessions.createCheck, {
        caller: caller as string,
        participantNames: participants.map(String),
      });
      if (crossOwner) {
        const what = `cross-owner participant=${sanitize(crossOwner)}`;
        if (!enforce(req, res, false, what, { status: 403, error: what })) return;
      }
    }

    const sessionId = await convex.mutation(api.sessions.create, {
      title,
      participantNames: participants,
      maxTurns,
    });
    res.json({ ok: true, sessionId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message into a session as a peer. Turn cap enforced in Convex.
app.post("/a2a/session/:sessionId/message", async (req, res) => {
  try {

    const { from, content } = req.body;
    if (!from || !content) {
      return res.status(400).json({ error: "Missing required fields: from, content" });
    }
    // T-066: the sender is the caller, and it posts only in its own rooms. An
    // owner view is read-only (Q1): a post needs a participant.
    if (!bindName(req, res, from, "from")) return;
    if (!(await sessionGate(req, res, "write"))) return;

    const session = await convex.query(api.sessions.get, {
      sessionId: req.params.sessionId as any,
    });
    for (const p of session?.participants ?? []) {
      if (p.name === req.agentName) continue;
      if (await denyNamedAsk(req, res, p.name)) return;
    }

    const result = await convex.mutation(api.messages.send, {
      sessionId: req.params.sessionId as any,
      peerName: from,
      content,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Discover active sessions for a peer — wrapper daemons poll this.
app.get("/a2a/peer/:peerName/sessions", async (req, res) => {
  try {
    // T-066: a caller lists only its own rooms.
    if (!bindName(req, res, req.params.peerName, "peerName")) return;

    const sessions = await convex.query(api.sessions.listForPeer, {
      peerName: req.params.peerName,
      includeClosed: req.query.includeClosed === "1",
    });
    res.json({ sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Session history for the chat UI: the rooms the caller is in, plus, for a
// human, the rooms his agents are in (T-066 §4). The one response Loop 5
// changes by design. An unknown caller (warn) gets today's full list and one
// line (O1); strict never gets here.
app.get("/a2a/sessions", async (req, res) => {
  try {
    const caller = req.agentName ?? null;
    if (!enforce(req, res, caller != null, "unknown-caller", SESSION_NOT_FOUND)) return;
    const sessions = caller
      ? await convex.query(api.sessions.listVisibleTo, { name: caller })
      : await convex.query(api.sessions.listAll, {});
    res.json({ sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/a2a/session/:sessionId/rename", async (req, res) => {
  try {

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) return res.status(400).json({ error: "Missing required field: title" });
    if (!(await sessionGate(req, res, "write"))) return;

    await convex.mutation(api.sessions.rename, {
      sessionId: req.params.sessionId as any,
      title,
    });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Grant more turns to a session (reopens it if the cap closed it).
app.post("/a2a/session/:sessionId/extend", async (req, res) => {
  try {

    const addTurns = Number(req.body?.addTurns);
    if (!Number.isInteger(addTurns) || addTurns < 1) {
      return res.status(400).json({ error: "addTurns must be a positive integer" });
    }
    if (!(await sessionGate(req, res, "write"))) return;

    const result = await convex.mutation(api.sessions.extend, {
      sessionId: req.params.sessionId as any,
      addTurns,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Poll session messages (optionally only after ?since=<timestamp>).
app.get("/a2a/session/:sessionId/messages", async (req, res) => {
  try {
    if (!(await sessionGate(req, res, "read"))) return;

    const since = req.query.since ? Number(req.query.since) : undefined;
    const after = req.query.after !== undefined ? Number(req.query.after) : undefined;
    const messages = await convex.query(api.messages.list, {
      sessionId: req.params.sessionId as any,
      since,
      after: Number.isFinite(after!) ? after : undefined,
    });
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Read receipts (T-049). The only route that writes read state: hub-talk
// posts here after --inbox or --wait has printed turns, naming the reader.
// Fetching messages never marks anything. `reader` must be the caller (T-049
// limit L2, Loop 3 §5): strict 403s a mismatch; warn logs it and marks as before.
app.post("/a2a/session/:sessionId/read", async (req, res) => {
  try {
    const { reader, throughTurn, via } = req.body ?? {};
    if (typeof reader !== "string" || !reader) {
      return res.status(400).json({ error: "Missing required field: reader" });
    }
    if (via !== "inbox" && via !== "wait") {
      return res.status(400).json({ error: 'via must be "inbox" or "wait"' });
    }
    // Same 403 text as before; the warn line is now `[authz]` (T-066 §7).
    if (!bindName(req, res, reader, "reader")) return;
    // A reader who is the caller but not a participant: markRead answers with
    // its own 404, unchanged in both modes (criteria A6), so this only logs.
    if (isCaller(reader, req.agentName)) {
      const access = await convex.query(api.sessions.access, {
        sessionId: String(req.params.sessionId),
        caller: reader,
      });
      if (access.exists && !access.participant) {
        note(`non-member session=${shortId(req.params.sessionId)}`, "POST /a2a/session/:sessionId/read", reader);
      }
    }
    const result = await convex.mutation(api.messages.markRead, {
      sessionId: req.params.sessionId,
      reader,
      throughTurn: Number(throughTurn),
      via,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.reason });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Who has not been shown which turns, and since when. Read-only.
app.get("/a2a/session/:sessionId/reads", async (req, res) => {
  try {
    if (!(await sessionGate(req, res, "read"))) return;
    const result = await convex.query(api.sessions.readState, {
      sessionId: req.params.sessionId,
    });
    // 400 malformed id, 404 unknown session: never a 500 for the caller's input.
    if (!result.ok) return res.status(result.status).json({ error: result.reason });
    const { ok, ...state } = result;
    res.json(state);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// The chat client, after every API route so it can never shadow one.
mountUi(app, process.env.UI_DIR || "client/dist");

const port = parseInt(process.env.PORT || "4000");
app.listen(port, () => {
  console.log(`Hub running on port ${port}`);
  console.log(`Agent card: ${hubAgentCard.url} (A2A ${hubAgentCard.protocolVersion})`);
  console.log(
    authMode === "strict"
      ? "Auth: STRICT — unknown X-Agent-Key returns 403"
      : "Auth: WARN — unknown X-Agent-Key is logged and allowed. Set AUTH_MODE=strict to enforce."
  );
});
