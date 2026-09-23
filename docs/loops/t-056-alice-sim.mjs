// Read-only replay of daemon.ts handleSessions() for alice, then ONE Anthropic
// call with the transcript of the first room alice would answer (as the daemon does).
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = "C:/Users/melve/Projects/A2A-Hub";
const { qualifiesAsTrigger } = await import(pathToFileURL(`${ROOT}/dist/src/wrapper/mentions.js`).href);
const H = "http://127.0.0.1:4000", h = { "X-Agent-Key": "dev-key" };
const NAME = "alice";
const get = async (p) => { const r = await fetch(H + p, { headers: h }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };

const { sessions } = await get(`/a2a/peer/${NAME}/sessions`);
let first = null;
for (const s of sessions) {
  const tag = `${s._id.slice(0, 10)} ${JSON.stringify(s.title)}`;
  if (!s.isActive || s.turnCount >= s.maxTurns) continue;
  const { messages } = await get(`/a2a/session/${s._id}/messages`);
  if (!messages?.length) continue;
  const last = messages[messages.length - 1];
  if (/\bDONE\b\W*$/.test(last.content.trim())) continue;
  const gate = { name: NAME, participants: (s.participants ?? []).map((p) => String(p.name ?? p)), isGroup: (s.participants?.length ?? 2) > 2 };
  const trigger = [...messages].reverse().find((m) => qualifiesAsTrigger(m, gate));
  if (!trigger) { console.log("no trigger ", tag); continue; }
  const myLast = [...messages].reverse().find((m) => m.from === NAME);
  if (myLast && myLast.createdAt >= trigger.createdAt) { console.log("answered  ", tag); continue; }
  console.log("WOULD REPLY", tag, "roles:", messages.map((m) => (m.from === NAME ? "A" : "U")).join(""));
  first ??= { s, messages };
}
if (!first) { console.log("no room qualifies"); process.exit(0); }

const transcript = first.messages.map((m) => ({ role: m.from === NAME ? "assistant" : "user", content: m.from === NAME ? m.content : `${m.from}: ${m.content}` }));
console.log(`\nfirst room: ${first.s._id} ${JSON.stringify(first.s.title)}; transcript roles ${transcript.map((t) => t.role[0]).join("")}; ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? "present" : "ABSENT"}`);
try {
  const msg = await new Anthropic().messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 300, system: "You are alice.", messages: transcript });
  console.log("API OK:", JSON.stringify(msg.content[0]).slice(0, 160));
} catch (e) {
  console.log("API ERROR:", e.status, String(e.message).slice(0, 300));
}
