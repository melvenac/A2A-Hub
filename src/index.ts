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
import { createHash } from "crypto";
import { requireAgentKey, authMode } from "./auth.js";
import { evaluateNameClaim, INSTANCE_LIVENESS_MS } from "./identity.js";
import { askDeniedReason, evaluateAsk } from "./ask-policy.js";
import { DefaultRequestHandler } from "@a2a-js/sdk/server";
import { jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { ConvexTaskStore } from "./task-store.js";
import { HubAgentExecutor } from "./a2a-executor.js";

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
  escalate: async (message, agentName) => {
    await notifyHuman(`Escalating${agentName ? ` to ${agentName}` : " to available agent"}...`);
    return escalation.escalateToAgent(message, agentName);
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
const a2aRequestHandler = new DefaultRequestHandler(
  hubAgentCard,
  new ConvexTaskStore(convex),
  new HubAgentExecutor(executor)
);
app.use(
  "/a2a/jsonrpc",
  jsonRpcHandler({
    requestHandler: a2aRequestHandler,
    // Authentication is already enforced by the guard above; this only tells
    // the SDK not to build a user of its own.
    userBuilder: UserBuilder.noAuthentication,
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
  if (typeof to === "string" && to && (await denyNamedAsk(req, res, to))) return;

  const senderName = req.body?.params?.message?.role || "unknown";
  await notifyHuman(`Incoming from ${senderName}${to ? ` → ${to}` : ""}: ${message}`);

  try {
    const result = await executor.handleMessage(message, to);

    await notifyHuman(
      `${result.answeredFromMemory ? "Hub (memory)" : "Escalated agent"}: ${result.response}`
    );

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

    await convex.mutation(api.tasks.addMessage, {
      taskId,
      role: "agent",
      content: responseText,
    });

    await convex.mutation(api.tasks.updateStatus, {
      taskId,
      status: "completed",
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
    const rows = await convex.query(api.agents.listOnline, {});
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

// Agent registration — also registers the agent as a chat peer.
app.post("/a2a/register", async (req, res) => {
  try {
    const { name, apiKey, agentCard } = req.body;
    if (!name || !apiKey) {
      return res.status(400).json({ error: "Missing required fields: name, apiKey" });
    }

    const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");
    const card = agentCard ?? { name, description: `Agent ${name}` };
    const instanceId =
      typeof req.body.instanceId === "string" ? req.body.instanceId : undefined;

    const existing = await convex.query(api.agents.getByName, { name });
    const claim = evaluateNameClaim(existing?.apiKeyHash, apiKeyHash, authMode);
    if (claim === "reject") {
      return res.status(409).json({ error: "Name claimed by a different identity" });
    }
    if (claim === "warn") {
      console.warn(
        `[auth] WOULD REJECT name claim on ${name} ` +
          `(AUTH_MODE=warn; set AUTH_MODE=strict to enforce)`
      );
    }

    await convex.mutation(api.agents.register, {
      name,
      apiKeyHash,
      agentCard: card,
      instanceId,
    });
    await convex.mutation(api.peers.register, { name, type: "agent" });
    await notifyHuman(`Agent ${name} is now online`);
    res.json({ ok: true, message: `Agent ${name} registered` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Chat channel routes (peers/sessions/messages) ---

// Create a session between named peers (agents and/or humans).
app.post("/a2a/session", async (req, res) => {
  try {

    const { title, participants, maxTurns } = req.body;
    if (!Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ error: "participants must list at least 2 peer names" });
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

    const sessions = await convex.query(api.sessions.listForPeer, {
      peerName: req.params.peerName,
      includeClosed: req.query.includeClosed === "1",
    });
    res.json({ sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Full session history for the chat UI.
app.get("/a2a/sessions", async (req, res) => {
  try {

    const sessions = await convex.query(api.sessions.listAll, {});
    res.json({ sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/a2a/session/:sessionId/rename", async (req, res) => {
  try {

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) return res.status(400).json({ error: "Missing required field: title" });

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
// Fetching messages never marks anything. `reader` is asserted by the client —
// under the shared dev-key the hub cannot check it (named limit, until T-003).
app.post("/a2a/session/:sessionId/read", async (req, res) => {
  try {
    const { reader, throughTurn, via } = req.body ?? {};
    if (typeof reader !== "string" || !reader) {
      return res.status(400).json({ error: "Missing required field: reader" });
    }
    if (via !== "inbox" && via !== "wait") {
      return res.status(400).json({ error: 'via must be "inbox" or "wait"' });
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
