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

// Every request is bounded. Without this the round trip below hangs forever
// whenever the daemon can't answer (expired ANTHROPIC_API_KEY is the usual
// cause), and the script never reaches its exit.
function fetchT(url, opts = {}, ms = 10_000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

// 1. Health + CORS
try {
  const health = await fetchT(`${HUB}/health`);
  check("hub /health", health.ok);
  check(
    "CORS allow-origin",
    health.headers.get("access-control-allow-origin") === "*",
    health.headers.get("access-control-allow-origin") ?? "missing"
  );
} catch (e) {
  check("hub /health", false, e.name === "TimeoutError" ? "timed out" : "unreachable");
  check("CORS allow-origin", false, "hub unreachable");
}
try {
  const preflight = await fetchT(`${HUB}/a2a/message/send`, { method: "OPTIONS" });
  check(
    "CORS preflight 204 + X-Agent-Key",
    preflight.status === 204 &&
      (preflight.headers.get("access-control-allow-headers") || "").includes("X-Agent-Key")
  );
} catch (e) {
  check("CORS preflight 204 + X-Agent-Key", false, e.name === "TimeoutError" ? "timed out" : "unreachable");
}

// 2. Dev server
try {
  const page = await fetchT(CLIENT);
  const html = await page.text();
  check("vite dev server serves client", page.ok && html.includes("main.js"));
} catch (e) {
  check("vite dev server serves client", false, e.name === "TimeoutError" ? "timed out" : "unreachable");
}

// 3. Addressed round trip, exactly as the browser client sends it.
// Generous budget -- this leg waits on a real model call through the daemon.
const start = Date.now();
try {
  const res = await fetchT(
    `${HUB}/a2a/message/send`,
    {
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
    },
    60_000
  );
  const body = await res.json();
  const reply = body.result?.task?.artifacts?.[0]?.parts?.[0]?.text ?? "";
  // What this proves is routing: addressed -> bob claims -> reply returns.
  // Don't assert on a "[bob" prefix -- HUB_CONVENTIONS tells the model to reply
  // plain, so only the fallback path emits one. Asserting it meant this check
  // passed only while the API key was broken.
  const viaFallback = reply.includes(`[bob fallback`);
  check(
    "addressed message → bob daemon replies",
    res.ok && reply.trim().length > 0,
    `${Date.now() - start}ms via ${viaFallback ? "FALLBACK (llm down)" : "model"}: ${reply.slice(0, 60)}`
  );
} catch (e) {
  check(
    "addressed message → bob daemon replies",
    false,
    e.name === "TimeoutError"
      ? `no reply within 60s (${Date.now() - start}ms) — check the bob window and ANTHROPIC_API_KEY`
      : e.message
  );
}

process.exit(failures ? 1 : 0);
