#!/usr/bin/env node
/**
 * Ask another repo's agent a question and wait for the answer.
 *
 * This is the entrance for an agent working in one repo that needs something
 * only another repo's agent knows — the thing that removes the human as relay.
 * Without it the only ways into a hub session are the chat client (a human
 * typing) and a daemon (autonomous); a coding session is neither.
 *
 * Usage:
 *   node scripts/ask-agent.mjs <peer> "question"        [--from name]
 *                                                       [--turns N]
 *                                                       [--timeout SECONDS]
 *                                                       [--json]
 *
 * Example:
 *   node scripts/ask-agent.mjs gitnexus "why does analyze hold a lock on .gitnexus/lbug?"
 *
 * Two participants means no @mention is needed — in a 2-peer session the other
 * side answers every message (ADR-007's no-cascade rule only gates group rooms).
 *
 * Exit codes: 0 answered, 1 usage/transport error, 2 no reply before timeout.
 */
const HUB = process.env.HUB_URL || "http://127.0.0.1:4000";
import { generateKey, resolveKey } from "./hub-key.mjs";

// Set in main once FROM is known (T-003: there is no shared default key).
let AGENT_KEY;
let hdrs;

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const positional = process.argv.slice(2).filter((a, i, all) => {
  if (a.startsWith("--")) return false;
  const prev = all[i - 1];
  return !(prev && prev.startsWith("--") && prev !== "--json");
});
const [peer, question] = positional;

if (!peer || !question) {
  console.error(
    'Usage: node scripts/ask-agent.mjs <peer> "question" [--from name] [--turns N] [--timeout SECONDS] [--json]',
  );
  process.exit(1);
}

const FROM = arg("--from", `ask-${process.pid}`);
const TURNS = parseInt(arg("--turns", "8"));
const TIMEOUT_MS = parseInt(arg("--timeout", "150")) * 1000;
const AS_JSON = process.argv.includes("--json");

const log = (msg) => {
  if (!AS_JSON) console.error(msg);
};

async function api(path, init) {
  const res = await fetch(`${HUB}${path}`, { headers: hdrs, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  // --from <name> is a standing identity: its key comes from AGENT_KEY or its
  // key file. The default ask-<pid> is a fresh name each run, so it gets an
  // ephemeral key: generated in memory, never stored or printed (Loop 3 §3.4).
  if (arg("--from")) {
    const r = resolveKey({ hub: HUB, name: FROM });
    if (r.error) throw new Error(r.error);
    AGENT_KEY = r.key;
  } else {
    AGENT_KEY = generateKey();
  }
  hdrs = { "Content-Type": "application/json", "X-Agent-Key": AGENT_KEY };

  // Register the asker as a peer. Registration takes no auth header.
  const reg = await fetch(`${HUB}/a2a/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: FROM,
      apiKey: AGENT_KEY,
      agentCard: {
        name: FROM,
        description: `Ephemeral asker opened by ask-agent.mjs`,
      },
    }),
  });
  if (!reg.ok) {
    const body = await reg.json().catch(() => ({}));
    throw new Error(`register ${FROM} refused (${reg.status}): ${body.error ?? "unknown"}`);
  }

  const { sessionId } = await api("/a2a/session", {
    method: "POST",
    body: JSON.stringify({
      title: question.slice(0, 48),
      participants: [FROM, peer],
      maxTurns: TURNS,
    }),
  });
  log(`[ask] session ${sessionId} with ${peer}`);

  const sent = await api(`/a2a/session/${sessionId}/message`, {
    method: "POST",
    body: JSON.stringify({ from: FROM, content: question }),
  });
  if (sent.ok === false) throw new Error(`send rejected: ${sent.reason}`);

  const deadline = Date.now() + TIMEOUT_MS;
  let waited = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    waited += 2500;
    const { messages } = await api(`/a2a/session/${sessionId}/messages`);
    const reply = (messages || []).find((m) => m.from === peer);
    if (reply) {
      if (AS_JSON) {
        console.log(
          JSON.stringify(
            { sessionId, peer, question, answer: reply.content, waitedMs: waited },
            null,
            2,
          ),
        );
      } else {
        console.log(reply.content);
        console.error(`\n[ask] answered in ${Math.round(waited / 1000)}s`);
      }
      return 0;
    }
    if (waited % 20000 === 0) log(`[ask] waiting for ${peer}... ${waited / 1000}s`);
  }

  // A repo agent reads files before answering, so a long wait is normal. Say
  // what to check rather than implying the question was bad.
  log(
    `[ask] no reply from ${peer} within ${TIMEOUT_MS / 1000}s.\n` +
      `      Is a daemon running for it? Check: node -e "fetch('${HUB}/a2a/agents').then(r=>r.json()).then(b=>console.log(b))"\n` +
      `      Session ${sessionId} stays open — the reply will land there if it is just slow.`,
  );
  return 2;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`[ask] ${error.message}`);
    process.exit(1);
  });
