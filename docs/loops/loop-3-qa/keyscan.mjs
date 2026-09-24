// Completeness scan: every literal or defaulted agent key in tracked files under a path.
// Usage: node keyscan.mjs <repo> <pathspec> [--expect-keyfn N]
// Fails closed: exit 2 if the known-positive count of key(n) copies is not what --expect-keyfn says.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [repo, spec] = process.argv.slice(2);
const ei = process.argv.indexOf("--expect-keyfn");
const expectKeyfn = ei > -1 ? Number(process.argv[ei + 1]) : null;

const files = execFileSync("git", ["-C", repo, "ls-files", "--", spec], { encoding: "utf8" })
  .split("\n").filter(Boolean);

const RULES = [
  ["keyfn",      /\bkey\s*=\s*\(\s*\w+\s*\)\s*=>/],                  // a local key(n) helper
  ["tmpl-key",   /`\$\{[^}]+\}-key`/],                                // `${n}-key`
  ["dev-key",    /dev-key/],                                          // the shared key, any context
  ["apiKey",     /\bapiKey\s*:\s*(?!key\()[^,}\s]+/],                 // register body not using key()
  ["hdr",        /["']?X-Agent-Key["']?\s*:\s*(?!key\()[^,}\s]+/i],   // header value not using key()
  ["env",        /\bAGENT_KEY\s*[:=]\s*(?!key\()[^,}\s]+/],           // hub-talk env not using key()
  ["str-key",    /["'][\w.-]*-key["']/],                              // any "<x>-key" string literal
];

const hits = [];
let scanned = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(join(repo, f), "utf8"); } catch { continue; }
  scanned++;
  text.split(/\r?\n/).forEach((line, i) => {
    const kinds = RULES.filter(([, re]) => re.test(line)).map(([k]) => k);
    if (kinds.length) hits.push({ f, n: i + 1, kinds, line: line.trim().slice(0, 150) });
  });
}

const keyfn = hits.filter((h) => h.kinds.includes("keyfn")).length;
console.log(`scanned ${scanned} tracked files under ${spec}; ${hits.length} lines hit`);
const byKind = {};
for (const h of hits) for (const k of h.kinds) byKind[k] = (byKind[k] || 0) + 1;
console.log("by rule:", JSON.stringify(byKind));
for (const h of hits) console.log(`${h.f}:${h.n} [${h.kinds.join(",")}] ${h.line}`);
if (expectKeyfn !== null) {
  if (keyfn !== expectKeyfn) { console.log(`KNOWN POSITIVE FAILED: keyfn ${keyfn}, expected ${expectKeyfn}`); process.exit(2); }
  console.log(`known positive ok: keyfn ${keyfn} = ${expectKeyfn}`);
}
