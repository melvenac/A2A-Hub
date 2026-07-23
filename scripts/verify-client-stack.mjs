#!/usr/bin/env node
// Verifies the Svelte-client stack end-to-end without a browser:
// 1. hub /health + CORS headers (what the browser preflight needs)
// 2. vite dev server serves the client HTML
// 3. POST /a2a/message/send addressed to bob → daemon claims → responds.
//    With a dummy ANTHROPIC key, classify fails — response must still arrive
//    (executor best-effort fix).
const HUB = "http://127.0.0.1:4000";
const CLIENT = "http://localhost:5173"; // vite binds ::1 — let DNS pick the family
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// 1. Health + CORS
const health = await fetch(`${HUB}/health`);
check("hub /health", health.ok);
check(
  "CORS allow-origin",
  health.headers.get("access-control-allow-origin") === "*",
  health.headers.get("access-control-allow-origin") ?? "missing"
);
const preflight = await fetch(`${HUB}/a2a/message/send`, { method: "OPTIONS" });
check(
  "CORS preflight 204 + X-Agent-Key",
  preflight.status === 204 &&
    (preflight.headers.get("access-control-allow-headers") || "").includes("X-Agent-Key")
);

// 2. Dev server
try {
  const page = await fetch(CLIENT);
  const html = await page.text();
  check("vite dev server serves client", page.ok && html.includes("main.js"));
} catch {
  check("vite dev server serves client", false, "unreachable");
}

// 3. Addressed round trip, exactly as the browser client sends it
const start = Date.now();
const res = await fetch(`${HUB}/a2a/message/send`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Agent-Key": "dev-key" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    params: {
      to: "bob",
      message: { role: "aaron", parts: [{ kind: "text", text: "verify-client-stack ping" }] },
    },
  }),
});
const body = await res.json();
const reply = body.result?.task?.artifacts?.[0]?.parts?.[0]?.text ?? "";
check(
  "addressed message → bob daemon replies",
  res.ok && reply.includes("[bob"),
  `${Date.now() - start}ms: ${reply.slice(0, 70)}`
);

process.exit(failures ? 1 : 0);
