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
 *   npx tsx src/wrapper/daemon.ts --name gitnexus --repo C:\path\to\gitnexus [--repo-bash]
 *
 * --repo makes this peer a standing expert on one codebase: replies come from a
 * Claude Agent SDK session rooted there (tool access to its files) instead of
 * from the persona string. Read-only unless --repo-bash. See repo-reply.ts.
 *
 * Persona resolution (role text, composed with hub conventions):
 *   --persona text > --persona-file path > personas/<name>.md > generic default.
 *   `--print-persona` prints the composed system prompt and exits (debug).
 *
 * Env:
 *   HUB_URL             hub base URL (default http://localhost:4000)
 *   AGENT_KEY           X-Agent-Key value (else the key file; no default, T-003)
 *   ANTHROPIC_API_KEY   if set, replies use a real LLM; otherwise a
 *                       deterministic fallback proves the transport loop
 *   WRAPPER_MODEL       model for replies (default claude-haiku-4-5-20251001)
 *   WRAPPER_MAX_TOKENS  budget cap per reply (default 300)
 *   POLL_MS             poll interval (default 2000)
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { isSupersededError } from "../identity.js";
import {
  isParticipant,
  qualifiesAsTrigger,
  type GateContext,
} from "./mentions.js";
import { makeRepoReplier } from "./repo-reply.js";

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
const AGENT_KEY = await resolveAgentKey(NAME, HUB_URL);
// Process identity for ADR-011 Layer B. Register is the takeover; heartbeat
// renews or learns we were superseded. One clean seam: this id on both calls.
const INSTANCE_ID = randomUUID();
const MODEL = process.env.WRAPPER_MODEL || "claude-haiku-4-5-20251001";
const MAX_TOKENS = parseInt(process.env.WRAPPER_MAX_TOKENS || "300");
const POLL_MS = parseInt(process.env.POLL_MS || "2000");

const headers = { "Content-Type": "application/json", "X-Agent-Key": AGENT_KEY };

/**
 * The daemon's key (T-003, Loop 3 §3.2): AGENT_KEY, else this name's key file,
 * else exit 1. There is no shared default. One implementation for every
 * client lives in scripts/hub-key.mjs; the daemon runs from src/ (tsx) or
 * dist/src/ (built), so it looks for the script in both layouts.
 */
async function resolveAgentKey(name: string, hub: string): Promise<string> {
  const candidates = [
    new URL("../../scripts/hub-key.mjs", import.meta.url),
    new URL("../../../scripts/hub-key.mjs", import.meta.url),
  ];
  const found = candidates.find((u) => existsSync(u));
  if (!found) {
    if (process.env.AGENT_KEY) return process.env.AGENT_KEY;
    console.error(`[${name}] scripts/hub-key.mjs not found and AGENT_KEY unset; refusing to start`);
    process.exit(1);
  }
  const { resolveKey } = (await import(found.href)) as {
    resolveKey: (o: { hub: string; name: string }) => { key?: string; error?: string };
  };
  const r = resolveKey({ hub, name });
  if (!r.key) {
    console.error(`[${name}] ${r.error}`);
    process.exit(1);
  }
  return r.key;
}

/** A hub error from hub() below carries its status as "→ <status>:". */
function hasStatus(error: { message: string }, status: number): boolean {
  return error.message.includes(`→ ${status}:`);
}
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// --repo turns this peer into a standing expert on one codebase: replies come
// from an Agent SDK session rooted there, with tool access to its files, instead
// of from the persona string alone. Read-only unless --repo-bash is passed.
const REPO_PATH = arg("--repo") ?? process.env.AGENT_REPO;
const repoReplier = REPO_PATH
  ? makeRepoReplier({
      repoPath: resolve(REPO_PATH),
      name: NAME,
      model: process.env.REPO_AGENT_MODEL,
      maxBudgetUsd: parseFloat(process.env.REPO_AGENT_BUDGET_USD || "2"),
      timeoutMs: parseInt(process.env.REPO_AGENT_TIMEOUT_MS || "180000"),
      allowBash: process.argv.includes("--repo-bash"),
    })
  : null;

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
  if (repoReplier) return repoReplier(transcript);
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
          instanceId: INSTANCE_ID,
          agentCard: { name: NAME, description: PERSONA.slice(0, 120) },
        }),
      });
      break;
    } catch (error: any) {
      // A refusal is not a boot race: retrying cannot fix a refused key.
      if (/→ 4dd:/.test(error.message)) {
        console.error(`[${NAME}] register refused: ${error.message}`);
        process.exit(1);
      }
      if (attempt >= 10) throw error;
      console.log(`[${NAME}] hub not reachable (attempt ${attempt}), retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const mode = repoReplier
    ? `repo:${resolve(REPO_PATH!)}${process.argv.includes("--repo-bash") ? " +bash" : " read-only"}`
    : anthropic
      ? MODEL
      : "fallback";
  console.log(`[${NAME}] registered with hub at ${HUB_URL} (replies: ${mode})`);

  while (true) {
    try {
      await hub(`/a2a/heartbeat/${NAME}`, {
        method: "POST",
        body: JSON.stringify({ instanceId: INSTANCE_ID }),
      });
      await handleTasks();
      await handleSessions();
    } catch (error: any) {
      if (isSupersededError(error)) {
        console.error(`[${NAME}] superseded by a newer instance, exiting`);
        process.exit(0);
      }
      // strict: this key no longer authenticates (rotated or released).
      // Retrying would only repeat the 403, so stop loudly (Loop 3 §2.3).
      if (hasStatus(error, 403) && /Invalid X-Agent-Key/.test(error.message)) {
        console.error(`[${NAME}] key rejected for ${NAME}; run hub-talk --init-key or --rotate-key`);
        process.exit(1);
      }
      console.error(`[${NAME}] poll error: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
