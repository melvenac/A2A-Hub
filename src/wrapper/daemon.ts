/**
 * A2A wrapper daemon — makes an agent autonomous on the hub.
 *
 * Registers with the hub, then loops:
 *   1. heartbeat
 *   2. task queue: poll → atomic claim → respond (LLM or fallback)
 *   3. sessions: poll active sessions → reply to messages from other peers
 *
 * No human in the loop. Turn caps live server-side (sessions auto-close),
 * so a runaway conversation is structurally impossible.
 *
 * Usage:
 *   npx tsx src/wrapper/daemon.ts --name alice [--persona "role text" | --persona-file path]
 *
 * Persona resolution (role text, composed with hub conventions):
 *   --persona text > --persona-file path > personas/<name>.md > generic default.
 *   `--print-persona` prints the composed system prompt and exits (debug).
 *
 * Env:
 *   HUB_URL             hub base URL (default http://localhost:4000)
 *   AGENT_KEY           X-Agent-Key value (default dev-key)
 *   ANTHROPIC_API_KEY   if set, replies use a real LLM; otherwise a
 *                       deterministic fallback proves the transport loop
 *   WRAPPER_MODEL       model for replies (default claude-haiku-4-5-20251001)
 *   WRAPPER_MAX_TOKENS  budget cap per reply (default 300)
 *   POLL_MS             poll interval (default 2000)
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isParticipant,
  qualifiesAsTrigger,
  type GateContext,
} from "./mentions.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const nameArg = arg("--name") || process.env.AGENT_NAME;
if (!nameArg) {
  console.error("Usage: daemon.ts --name <agentName> [--persona <text>]");
  process.exit(1);
}
// Re-bind so the narrowing survives into the closures below.
const NAME: string = nameArg;
const NAME_LC = NAME.toLowerCase();

// Role text: who this agent is. Hub conventions are always appended below,
// so persona sources only need to describe the role.
function loadRole(): string | undefined {
  const inline = arg("--persona");
  if (inline) return inline;
  const file = arg("--persona-file") ?? join("personas", `${NAME_LC}.md`);
  try {
    return readFileSync(file, "utf8").trim() || undefined;
  } catch {
    if (arg("--persona-file")) {
      console.error(`persona file not found: ${file}`);
      process.exit(1);
    }
    return undefined;
  }
}

const HUB_CONVENTIONS = `Sessions may include humans and other AI agents — the participant you're replying to is not necessarily human. Transcript lines are prefixed with the sender's name, but write your own replies plain — never prefix them with a name label. Messages addressed @name are meant for that participant; to address someone specific, start your message with @theirname. Reply briefly and helpfully. When the exchange reaches a natural conclusion, end your reply with DONE.`;

const ROLE = loadRole();
const PERSONA = ROLE
  ? `${ROLE}\n\nYou operate as ${NAME}, an autonomous agent peer on the A2A hub. ${HUB_CONVENTIONS}`
  : `You are ${NAME}, an autonomous agent peer on the A2A hub. ${HUB_CONVENTIONS}`;

if (process.argv.includes("--print-persona")) {
  console.log(PERSONA);
  process.exit(0);
}

const HUB_URL = process.env.HUB_URL || "http://127.0.0.1:4000";
const AGENT_KEY = process.env.AGENT_KEY || "dev-key";
const MODEL = process.env.WRAPPER_MODEL || "claude-haiku-4-5-20251001";
const MAX_TOKENS = parseInt(process.env.WRAPPER_MAX_TOKENS || "300");
const POLL_MS = parseInt(process.env.POLL_MS || "2000");

const headers = { "Content-Type": "application/json", "X-Agent-Key": AGENT_KEY };
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function hub(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${HUB_URL}${path}`, { headers, ...init });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

type Turn = { role: "user" | "assistant"; content: string };

// One reply. Real LLM when a key is present; deterministic fallback otherwise
// so the transport loop can be verified without API spend.
let fallbackCount = 0;
async function generateReply(transcript: Turn[]): Promise<string> {
  if (anthropic) {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PERSONA,
      messages: transcript,
    });
    const block = msg.content[0];
    return block.type === "text" ? block.text : "(non-text response)";
  }
  fallbackCount++;
  const last = transcript[transcript.length - 1]?.content ?? "";
  return fallbackCount >= 3
    ? `[${NAME} fallback] Acknowledged: "${last.slice(0, 60)}". DONE`
    : `[${NAME} fallback #${fallbackCount}] Received: "${last.slice(0, 60)}". Continuing.`;
}

// --- Task queue handling (addressed escalations) ---
async function handleTasks() {
  const { tasks } = await hub(`/a2a/queue/${NAME}`);
  for (const task of tasks ?? []) {
    const claim = await hub(`/a2a/task/${task.taskId}/claim`, {
      method: "POST",
      body: JSON.stringify({ agentName: NAME }),
    });
    if (!claim.claimed) continue; // another agent won

    const transcript: Turn[] = task.messages.map((m: any) => ({
      role: m.role === "agent" ? "assistant" : "user",
      content: m.content,
    }));
    const reply = await generateReply(transcript);
    await hub(`/a2a/task/${task.taskId}/respond`, {
      method: "POST",
      body: JSON.stringify({ response: reply }),
    });
    console.log(`[${NAME}] answered task ${task.taskId}`);
  }
}

// --- Session handling (peer conversations) ---
// Reply only when the latest message is from someone else — otherwise we'd
// answer ourselves. repliedTo prevents double replies between polls.
const repliedTo = new Map<string, number>();

async function handleSessions() {
  const { sessions } = await hub(`/a2a/peer/${NAME}/sessions`);
  for (const session of sessions ?? []) {
    const id = session._id;
    // At the cap, don't generate a reply that can't be sent. Leaving the
    // message unmarked lets us answer it if the session gets extended.
    if (!session.isActive || session.turnCount >= session.maxTurns) continue;
    const { messages } = await hub(`/a2a/session/${id}/messages`);
    if (!messages?.length) continue;

    // Conversation is over when the latest message signs off with DONE
    // (tolerant of trailing punctuation/markdown: "DONE.", "**DONE**").
    const last = messages[messages.length - 1];
    if (/\bDONE\b\W*$/.test(last.content.trim())) continue;

    // @mention gating (deterministic) lives in ./mentions.ts so it is testable
    // without booting this loop. Gate on the newest message addressed to ME,
    // not the newest message overall — otherwise the first agent to answer a
    // room question makes every other agent see "last message is from an
    // agent" and go mute.
    const gate: GateContext = {
      name: NAME,
      participants: (session.participants ?? []).map((p: any) =>
        String(p.name ?? p)
      ),
      isGroup: (session.participants?.length ?? 2) > 2,
    };
    const trigger = [...messages].reverse().find((m: any) =>
      qualifiesAsTrigger(m, gate)
    );
    if (!trigger) continue;
    const myLast = [...messages].reverse().find((m: any) => m.from === NAME);
    if (myLast && myLast.createdAt >= trigger.createdAt) continue;
    if ((repliedTo.get(id) ?? 0) >= trigger.createdAt) continue;

    // Label other speakers so the model can tell participants apart.
    const transcript: Turn[] = messages.map((m: any) => ({
      role: m.from === NAME ? "assistant" : "user",
      content: m.from === NAME ? m.content : `${m.from}: ${m.content}`,
    }));
    let reply = await generateReply(transcript);
    // Models sometimes mimic the transcript's "name: " labels — strip a
    // leading label when it names a session participant. Intentional
    // "@name" handoffs are left alone (they carry mention routing).
    const label = reply.match(/^\s*([a-z0-9_-]+):\s+/i);
    if (label && isParticipant(label[1], gate)) {
      reply = reply.slice(label[0].length);
    }

    const result = await hub(`/a2a/session/${id}/message`, {
      method: "POST",
      body: JSON.stringify({ from: NAME, content: reply }),
    });
    if (result.ok) {
      repliedTo.set(id, trigger.createdAt);
      console.log(`[${NAME}] replied in session ${id} (turn ${result.turn})`);
    } else {
      // Not marked as replied — a session extend can revive it later.
      console.log(`[${NAME}] session ${id}: ${result.reason}`);
    }
  }
}

async function main() {
  // Retry registration — the hub may still be booting.
  for (let attempt = 1; ; attempt++) {
    try {
      await hub("/a2a/register", {
        method: "POST",
        body: JSON.stringify({
          name: NAME,
          apiKey: AGENT_KEY,
          agentCard: { name: NAME, description: PERSONA.slice(0, 120) },
        }),
      });
      break;
    } catch (error: any) {
      if (attempt >= 10) throw error;
      console.log(`[${NAME}] hub not reachable (attempt ${attempt}), retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.log(`[${NAME}] registered with hub at ${HUB_URL} (llm: ${anthropic ? MODEL : "fallback"})`);

  while (true) {
    try {
      await hub(`/a2a/heartbeat/${NAME}`, { method: "POST", body: "{}" });
      await handleTasks();
      await handleSessions();
    } catch (error: any) {
      console.error(`[${NAME}] poll error: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
