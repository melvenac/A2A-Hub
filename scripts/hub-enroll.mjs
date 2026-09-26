#!/usr/bin/env node
/**
 * Issue one enrollment code (Loop 6, T-067). Not hub-talk.
 *
 *   node scripts/hub-enroll.mjs --as aaron
 *
 * Resolves the name's key the way hub-talk does and never prints it.
 * On 200 the code is printed once, to stderr. On a refusal the hub's
 * error string is printed and the process exits 1.
 */
import { resolveKey } from "./hub-key.mjs";

const HUB = process.env.HUB_URL || "http://127.0.0.1:4000";

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

const name = arg("--as");
if (!name) {
  console.error("Usage: node scripts/hub-enroll.mjs --as <name>");
  process.exit(1);
}

const resolved = resolveKey({ hub: HUB, name });
if (resolved.error || !resolved.key) {
  console.error(`[hub-enroll] ${resolved.error ?? "no key"}`);
  process.exit(1);
}

const res = await fetch(`${HUB}/a2a/enroll`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Agent-Key": resolved.key },
});
const text = await res.text();
let json = {};
try {
  json = text ? JSON.parse(text) : {};
} catch {
  json = {};
}
if (!res.ok || typeof json.code !== "string") {
  console.error(typeof json.error === "string" ? json.error : "enroll refused");
  process.exit(1);
}
console.error(json.code);
process.exit(0);
