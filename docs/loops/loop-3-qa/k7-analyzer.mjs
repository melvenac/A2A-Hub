// Instrument A (loop-3-qa-criteria.md, K7): summarise an `agents` table dump, read-only.
// Input: `convex data agents --limit <L> --format jsonl` on stdin. Prints counts, names and 8-hex
// prefixes only. It never prints a full hash, a key or an agentCard.
// Usage: ... | node k7-analyzer.mjs --limit L --auth-mode <value read from the hub>
//          [--phase deploy --expect-rows N --expect-owned N --expect-legacy N]
//          [--expect-prefix name=abcd1234]...
// Phase "complete" (the default) passes only on the completion conditions of design §4.4.
// Exit 0 pass, 1 fail, 2 undetermined (nothing parsed, or the count reached the limit).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = { phase: "complete", prefixes: {} };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = argv[i + 1];
  if (a === "--limit") { opt.limit = Number(v); i++; }
  else if (a === "--auth-mode") { opt.authMode = v; i++; }
  else if (a === "--phase") { opt.phase = v; i++; }
  else if (a === "--expect-rows") { opt.rows = Number(v); i++; }
  else if (a === "--expect-owned") { opt.owned = Number(v); i++; }
  else if (a === "--expect-legacy") { opt.legacy = Number(v); i++; }
  else if (a === "--expect-prefix") { const [n, p] = v.split("="); opt.prefixes[n] = p; i++; }
  else if (a === "--input") { opt.input = v; i++; }
}
if (!opt.limit || !opt.authMode) { console.log("UNDETERMINED: --limit and --auth-mode are required"); process.exit(2); }

const P = (h) => String(h).slice(0, 8);
const DEV = createHash("sha256").update("dev-key").digest("hex");
const text = readFileSync(opt.input ?? 0, "utf8");
const rows = [];
let nonJson = 0;
for (const line of text.split(/\r?\n/)) {
  if (!line.trim()) continue;
  try { const r = JSON.parse(line); if (r && typeof r === "object" && "name" in r) rows.push(r); else nonJson++; }
  catch { nonJson++; }
}
if (rows.length === 0) { console.log(`UNDETERMINED: no rows parsed (${nonJson} non-JSON lines); an empty input is not an empty table`); process.exit(2); }
if (rows.length >= opt.limit) { console.log(`UNDETERMINED: ${rows.length} rows at --limit ${opt.limit}; the table may be truncated`); process.exit(2); }

const byName = new Map(), byHash = new Map();
for (const r of rows) {
  (byName.get(r.name) ?? byName.set(r.name, []).get(r.name)).push(r);
  (byHash.get(r.apiKeyHash) ?? byHash.set(r.apiKeyHash, []).get(r.apiKeyHash)).push(r);
}
// Canonical row per name: newest lastSeen, ties by _id (the rule register uses).
const canon = (list) => list.reduce((c, r) => (r.lastSeen > c.lastSeen || (r.lastSeen === c.lastSeen && r._id < c._id) ? r : c));
// What getByKeyHash would answer under U3: a name only if exactly one row holds the hash and it is owned.
const resolves = (h) => { const l = byHash.get(h) ?? []; return l.length === 1 && l[0].keyStatus === "owned" ? l[0].name : null; };

const flags = [];
const dupNames = [...byName].filter(([, l]) => l.length > 1).map(([n]) => n);
if (dupNames.length) flags.push(`duplicate rows: ${dupNames.join(", ")}`);
const shared = [...byHash].filter(([, l]) => new Set(l.map((r) => r.name)).size > 1);
for (const [h, l] of shared) flags.push(`shared hash ${P(h)} held by ${[...new Set(l.map((r) => r.name))].join(", ")}`);
const stale = rows.filter((r) => canon(byName.get(r.name)) !== r);
for (const r of stale) flags.push(`stale hash ${P(r.apiKeyHash)} on a non-canonical row of ${r.name}${resolves(r.apiKeyHash) ? " (RESOLVES)" : ""}`);
const counts = { owned: 0, legacy: 0, none: 0 };
for (const r of rows) counts[r.keyStatus === "owned" ? "owned" : r.keyStatus === "legacy" ? "legacy" : "none"]++;
if (counts.legacy) flags.push(`legacy rows: ${rows.filter((r) => r.keyStatus === "legacy").map((r) => r.name).join(", ")}`);
if (counts.none) flags.push(`rows with no keyStatus: ${rows.filter((r) => !r.keyStatus).map((r) => r.name).join(", ")}`);
const devHolders = byHash.get(DEV)?.map((r) => r.name) ?? [];
if (devHolders.length) flags.push(`dev-key (${P(DEV)}) held by ${devHolders.join(", ")}`);
if (opt.authMode !== "warn") flags.push(`AUTH_MODE is "${opt.authMode}", not warn`);
if (nonJson) flags.push(`${nonJson} non-JSON line(s) ignored`);
for (const [n, p] of Object.entries(opt.prefixes)) {
  const l = byName.get(n);
  const got = l ? P(canon(l).apiKeyHash) : "absent";
  if (got !== p) flags.push(`prefix mismatch for ${n}: stored ${got}, --init-key printed ${p}`);
}

console.log(`rows ${rows.length} (limit ${opt.limit}), names ${byName.size}, hashes ${byHash.size}; keyStatus owned ${counts.owned}, legacy ${counts.legacy}, none ${counts.none}; AUTH_MODE ${opt.authMode}`);
for (const [n, l] of [...byName].sort()) { const c = canon(l); console.log(`  ${n}: ${P(c.apiKeyHash)} ${c.keyStatus ?? "(none)"} resolves=${resolves(c.apiKeyHash) === n}`); }
console.log(`dev-key ${P(DEV)}: held by ${devHolders.length} row(s), resolves to ${resolves(DEV) ?? "no name"}`);
for (const f of flags) console.log(`FLAG ${f}`);

let pass;
if (opt.phase === "deploy") {
  // After step 3: legacy rows are expected here; judge against the stated counts only.
  pass = rows.length === opt.rows && counts.owned === opt.owned && counts.legacy === opt.legacy && counts.none === 0
    && !dupNames.length && !stale.length && resolves(DEV) === null && opt.authMode === "warn";
} else {
  pass = flags.length === 0;
}
console.log(pass ? `PASS (${opt.phase})` : `FAIL (${opt.phase})`);
process.exit(pass ? 0 : 1);
