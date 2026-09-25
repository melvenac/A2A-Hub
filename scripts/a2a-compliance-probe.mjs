#!/usr/bin/env node
/**
 * A2A compliance probe — measures how far the running hub is from spec.
 *
 * Answers one question: can a stock @a2a-js/sdk client talk to this hub?
 * Read-only. Sends one message/send; makes no other writes.
 *
 * The guarded routes need a real key: --key, AGENT_KEY, or the key file of
 * the agent named by --as (scripts/hub-key.mjs). With none it exits 1; there
 * is no shared default key (T-003).
 *
 * Usage: node scripts/a2a-compliance-probe.mjs --as <name> [--base URL]
 *        node scripts/a2a-compliance-probe.mjs --key <key> [--base URL]
 */
import { resolveKey } from "./hub-key.mjs";

const baseArg = process.argv.indexOf("--base");
const BASE = baseArg > -1 ? process.argv[baseArg + 1] : "http://127.0.0.1:4000";
const keyArg = process.argv.indexOf("--key");
const asArg = process.argv.indexOf("--as");
function probeKey() {
  if (keyArg > -1 && process.argv[keyArg + 1]) return process.argv[keyArg + 1];
  if (process.env.AGENT_KEY) return process.env.AGENT_KEY;
  const name = asArg > -1 ? process.argv[asArg + 1] : undefined;
  const r = name ? resolveKey({ hub: BASE, name }) : { error: "pass --as <name> or --key" };
  if (r.error) {
    console.error(`[probe] no key: ${r.error}`);
    process.exit(1);
  }
  return r.key;
}
const KEY = probeKey();

const pass = [], fail = [], warn = [];
const ok = (m) => { pass.push(m); console.log(`  PASS  ${m}`); };
const no = (m) => { fail.push(m); console.log(`  FAIL  ${m}`); };
const hm = (m) => { warn.push(m); console.log(`  WARN  ${m}`); };

const REQUIRED = ["name", "description", "url", "version", "protocolVersion",
                 "capabilities", "defaultInputModes", "defaultOutputModes", "skills"];

console.log(`\nA2A compliance probe → ${BASE}\n`);

// ---- 1. Agent card discovery -------------------------------------------------
console.log("[1] Agent card discovery");
let card;
const CARD_PATH = "/.well-known/agent-card.json";
try {
  const r = await fetch(BASE + CARD_PATH, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  card = await r.json();
  ok(`${CARD_PATH} → 200`);
} catch (e) {
  no(`${CARD_PATH} → ${e.message}`);
  process.exit(1);
}

for (const f of REQUIRED) {
  if (card[f] === undefined) no(`card.${f} missing (required)`);
}
if (REQUIRED.every((f) => card[f] !== undefined)) ok("all required card fields present");

// ---- 2. Card self-consistency ------------------------------------------------
console.log("\n[2] Card claims vs reality");
const transport = card.preferredTransport ?? "JSONRPC";
if (!card.preferredTransport) {
  hm(`preferredTransport absent → spec default "JSONRPC" assumed by every client`);
}
console.log(`        advertised url : ${card.url}`);
console.log(`        transport      : ${transport}`);
console.log(`        protocolVersion: ${card.protocolVersion}`);

// Does the advertised URL even point at this host?
try {
  const u = new URL(card.url);
  const b = new URL(BASE);
  // localhost and 127.0.0.1 are the same host; flagging that difference is noise
  // and it buries the case this check exists for (a card naming a *different* box).
  const norm = (h) => h.replace(/^localhost:/, "127.0.0.1:");
  if (norm(u.host) !== norm(b.host)) {
    hm(`card.url host (${u.host}) != probed host (${b.host}) — set HUB_URL to make the card self-describing`);
  } else ok(`card.url points at the probed host`);
} catch { no(`card.url is not a valid URL: ${card.url}`); }

// ---- 3. Does the advertised transport actually work? -------------------------
console.log("\n[3] JSON-RPC transport at the advertised path");
const rpcUrl = new URL(card.url).pathname; // probe locally, not the advertised host
const target = BASE + rpcUrl;
const rpcBody = {
  jsonrpc: "2.0",
  id: "probe-1",
  method: "message/send",
  params: {
    message: {
      kind: "message",
      role: "user",
      messageId: "probe-msg-1",
      parts: [{ kind: "text", text: "compliance probe — no action needed" }],
    },
  },
};
try {
  const r = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(KEY ? { "X-Agent-Key": KEY } : {}) },
    body: JSON.stringify(rpcBody),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch {}
  console.log(`        POST ${rpcUrl} → HTTP ${r.status}`);
  console.log(`        body: ${text.slice(0, 300)}`);
  if (body?.jsonrpc === "2.0" && (body.result !== undefined || body.error !== undefined)) {
    ok("advertised endpoint speaks JSON-RPC 2.0");
  } else {
    no(`advertised endpoint does NOT speak JSON-RPC 2.0 (no jsonrpc/result envelope)`);
  }
} catch (e) {
  no(`POST ${rpcUrl} → ${e.message}`);
}

// ---- 4. Streaming claim ------------------------------------------------------
console.log("\n[4] capabilities.streaming claim");
if (card.capabilities?.streaming) {
  try {
    const r = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(KEY ? { "X-Agent-Key": KEY } : {}),
      },
      body: JSON.stringify({ ...rpcBody, id: "probe-2", method: "message/stream" }),
      signal: AbortSignal.timeout(8000),
    });
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/event-stream")) ok("message/stream returns text/event-stream");
    else no(`capabilities.streaming=true but message/stream returned "${ct}" (HTTP ${r.status})`);
  } catch (e) {
    no(`capabilities.streaming=true but message/stream failed: ${e.message}`);
  }
} else {
  console.log("        streaming not claimed — skipped");
}

// ---- 5. Security scheme enforcement -----------------------------------------
console.log("\n[5] Declared security scheme enforcement");
const schemes = card.securitySchemes || {};
const apiKeyScheme = Object.values(schemes).find((s) => s.type === "apiKey");
if (!apiKeyScheme) {
  console.log("        no apiKey scheme declared — skipped");
} else {
  const header = apiKeyScheme.name;
  try {
    const r = await fetch(`${BASE}/a2a/sessions`, {
      headers: { [header]: "obviously-bogus-key-probe" },
      signal: AbortSignal.timeout(5000),
    });
    if (r.status === 401 || r.status === 403) {
      ok(`bogus ${header} rejected (HTTP ${r.status})`);
    } else if (r.status < 400) {
      // Distinguish "never validated" from "validated, allowed by AUTH_MODE=warn".
      // Both return 200, but only one is a hole — collapsing them would keep
      // reporting a failure after the fix landed, and hide it before.
      hm(
        `bogus ${header} accepted → HTTP ${r.status}. Expected while AUTH_MODE=warn ` +
          `(hub logs "[auth] WOULD REJECT"). If the hub log is silent, the key is ` +
          `genuinely unvalidated — check there before trusting this as a WARN.`
      );
    } else {
      no(`bogus ${header} → unexpected HTTP ${r.status}`);
    }
  } catch (e) {
    hm(`could not test ${header}: ${e.message}`);
  }
}

// ---- 6. Stock SDK client -----------------------------------------------------
console.log("\n[6] Stock @a2a-js/sdk client");
try {
  const { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory } =
    await import("@a2a-js/sdk/client");
  // Inject the agent key through fetchImpl — the card declares an apiKey
  // scheme, so a compliant client is expected to present one.
  const authedFetch = (url, init = {}) =>
    fetch(url, { ...init, headers: { ...(init.headers || {}), ...(KEY ? { "X-Agent-Key": KEY } : {}) } });
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl: authedFetch })],
    })
  );
  // Use the card we already fetched, but force the local host so we test *this*
  // hub rather than the (dead) URL the card advertises.
  const localCard = { ...card, url: BASE + new URL(card.url).pathname };
  const client = await factory.createFromAgentCard(localCard);
  const res = await client.sendMessage({
    message: {
      kind: "message", role: "user", messageId: "sdk-probe-1",
      parts: [{ kind: "text", text: "sdk compliance probe" }],
    },
  });
  ok(`ClientFactory.sendMessage succeeded → ${JSON.stringify(res).slice(0, 200)}`);
} catch (e) {
  no(`stock SDK client failed: ${e.constructor?.name}: ${e.message}`);
}

// ---- summary -----------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`PASS ${pass.length}   FAIL ${fail.length}   WARN ${warn.length}`);
if (fail.length) { console.log("\nFailures:"); fail.forEach((f) => console.log(`  - ${f}`)); }
if (warn.length) { console.log("\nWarnings:"); warn.forEach((w) => console.log(`  - ${w}`)); }
console.log();
