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
const convexUrl = process.env.CONVEX_URL!;
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

// Routes
app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: hubAgentCard.name });
});

app.get("/.well-known/agent-card.json", (_req, res) => {
  res.json(hubAgentCard);
});

// A2A message/send endpoint
app.post("/a2a/message/send", async (req, res) => {
  const apiKey = req.headers["x-agent-key"] as string;
  if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

  const message = req.body?.params?.message?.parts?.[0]?.text;
  if (!message) return res.status(400).json({ error: "No message text found" });

  // Direct addressing: route to a named agent instead of "whoever's online".
  const to = req.body?.params?.to ?? req.body?.params?.message?.metadata?.to;

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
    const apiKey = req.headers["x-agent-key"] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

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
    const apiKey = req.headers["x-agent-key"] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

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
    const apiKey = req.headers["x-agent-key"] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

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
    await convex.mutation(api.agents.heartbeat, { name: agentId });
    res.json({ ok: true });
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

    await convex.mutation(api.agents.register, { name, apiKeyHash, agentCard: card });
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
    const apiKey = req.headers["x-agent-key"] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

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
    const apiKey = req.headers["x-agent-key"] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

    const { from, content } = req.body;
    if (!from || !content) {
      return res.status(400).json({ error: "Missing required fields: from, content" });
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
    const apiKey = req.headers["x-agent-key"] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

    const sessions = await convex.query(api.sessions.listForPeer, {
      peerName: req.params.peerName,
    });
    res.json({ sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Poll session messages (optionally only after ?since=<timestamp>).
app.get("/a2a/session/:sessionId/messages", async (req, res) => {
  try {
    const apiKey = req.headers["x-agent-key"] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing X-Agent-Key" });

    const since = req.query.since ? Number(req.query.since) : undefined;
    const messages = await convex.query(api.messages.list, {
      sessionId: req.params.sessionId as any,
      since,
    });
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const port = parseInt(process.env.PORT || "4000");
app.listen(port, () => {
  console.log(`Hub running on port ${port}`);
});
