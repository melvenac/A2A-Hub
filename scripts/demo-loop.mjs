#!/usr/bin/env node
/**
 * Milestone 2 gate: autonomous 2-agent loop, zero human relay.
 *
 * Prereqs (each in its own terminal, or backgrounded):
 *   npx convex dev --local          # local backend :3210
 *   CONVEX_URL=http://127.0.0.1:3210 npx tsx src/index.ts
 *   npx tsx src/wrapper/daemon.ts --name alice
 *   npx tsx src/wrapper/daemon.ts --name bob
 *
 * This script only ASSIGNS the goal (creates the session + seed message as
 * alice), then passively watches. Every subsequent message is daemon↔daemon.
 */
const HUB = process.env.HUB_URL || "http://localhost:4000";
const headers = { "Content-Type": "application/json", "X-Agent-Key": "dev-key" };

async function hub(path, init) {
  const res = await fetch(`${HUB}${path}`, { headers, ...init });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

const { sessionId } = await hub("/a2a/session", {
  method: "POST",
  body: JSON.stringify({
    title: "demo: autonomous loop",
    participants: ["alice", "bob"],
    maxTurns: 8,
  }),
});
console.log(`session ${sessionId} created (alice ↔ bob, maxTurns 8)`);

// Seed: the goal assignment. This is the ONLY message not sent by a daemon.
await hub(`/a2a/session/${sessionId}/message`, {
  method: "POST",
  body: JSON.stringify({
    from: "alice",
    content: "bob, confirm you can hear me and tell me one thing about the A2A hub.",
  }),
});
console.log("seed message sent as alice — hands off from here\n");

let seen = 0;
const start = Date.now();
while (Date.now() - start < 60_000) {
  await new Promise((r) => setTimeout(r, 2000));
  const { messages } = await hub(`/a2a/session/${sessionId}/messages`);
  for (const m of messages.slice(seen)) {
    console.log(`  [turn ${++seen}] ${m.from}: ${m.content}`);
  }
  const last = messages[messages.length - 1];
  if (messages.length >= 2 && last && /\bDONE\b\s*$/.test(last.content.trim())) {
    console.log(`\nGATE PASSED: ${messages.length} turns, converged with DONE, zero human messages after seed.`);
    process.exit(0);
  }
}
console.log("\nGATE FAILED: no convergence within 60s");
process.exit(1);
