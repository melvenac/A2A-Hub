// K7: reads `convex data agents --format jsonl` on stdin. Prints names, kind, keyStatus, 8-char
// prefixes and verdict lines only. Never a full hash, key or agentCard beyond kind. Fails closed.
const DEV = "7e9f8fd1";
let buf = "";
process.stdin.on("data", (c) => (buf += c)).on("end", () => {
  const rows = []; let bad = 0;
  for (const l of buf.split(/\r?\n/)) { if (!l.trim()) continue; try { rows.push(JSON.parse(l)); } catch { bad++; } }
  if (!rows.length) { console.log(`UNDETERMINED: 0 rows (${bad} unparsable)`); process.exit(2); }
  const byName = new Map(), byHash = new Map();
  for (const r of rows) {
    byName.set(r.name, (byName.get(r.name) ?? 0) + 1);
    byHash.set(r.apiKeyHash, (byHash.get(r.apiKeyHash) ?? 0) + 1);
  }
  for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name)))
    console.log(`${r.name}\tkind=${r.agentCard?.kind ?? "-"}\tkeyStatus=${r.keyStatus ?? "NONE"}\thash=${String(r.apiKeyHash ?? "none").slice(0, 8)}`);
  const checks = {
    oneRowPerName: [...byName.values()].every((n) => n === 1),
    oneNamePerHash: [...byHash.values()].every((n) => n === 1),
    allOwned: rows.every((r) => r.keyStatus === "owned"),
    devKeyHeldByNone: rows.every((r) => !String(r.apiKeyHash ?? "").startsWith(DEV)),
    unparsableZero: bad === 0,
  };
  for (const [k, v] of Object.entries(checks)) console.log(`${v ? "PASS" : "FAIL"} ${k}`);
  console.log(`rows=${rows.length} K7=${Object.values(checks).every(Boolean) ? "PASS" : "FAIL"}`);
});
