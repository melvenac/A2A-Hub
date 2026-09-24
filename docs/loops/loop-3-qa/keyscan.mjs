// Completeness scan: every literal or defaulted agent key in tracked files under the given paths.
// Usage: node keyscan.mjs <repo> <pathspec>... [--expect RULE=N]...
// Prints file:line and the rules hit. Comment lines are tagged [comment] and reported, not counted.
// Fails closed: exit 2 if any --expect count (code lines only) differs, i.e. the known positive failed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const repo = argv[0];
const specs = [], expect = {};
for (let i = 1; i < argv.length; i++) {
  if (argv[i] === "--expect") { const [r, n] = argv[++i].split("="); expect[r] = Number(n); }
  else specs.push(argv[i]);
}

const files = execFileSync("git", ["-C", repo, "ls-files", "--", ...specs], { encoding: "utf8" })
  .split("\n").filter(Boolean);

const RULES = [
  ["keyfn",    /\bkey\s*=\s*\(\s*\w+\s*\)\s*=>/],                        // a key(n) helper
  ["tmpl-key", /`\$\{[^}]+\}-key`/],                                      // `${n}-key`
  ["dev-key",  /dev-key/],                                                // the shared key, any context
  ["apiKey",   /\bapiKey\s*:\s*(?!key\()[^,}\s]+/],                       // register body not using key()
  ["hdr",      /["']?X-Agent-Key["']?\s*:\s*(?!key\()[^,}\s]+/i],         // header value not using key()
  ["env",      /\bAGENT_KEY\s*[:=]\s*(?!key\()[^,}\s]+/],                 // hub-talk env not using key()
  ["str-key",  /["'][\w.-]*-key["']/],                                    // any "<x>-key" string literal
  ["fallback", /\b(AGENT_KEY|apiKey|agentKey|KEY)\b.*\|\|\s*["'`]/],      // a key falling back to a literal
];
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

const hits = [];
let scanned = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(join(repo, f), "utf8"); } catch { continue; }
  scanned++;
  text.split(/\r?\n/).forEach((line, i) => {
    const kinds = RULES.filter(([, re]) => re.test(line)).map(([k]) => k);
    if (kinds.length) hits.push({ f, n: i + 1, kinds, comment: isComment(line), line: line.trim().slice(0, 150) });
  });
}

console.log(`scanned ${scanned} tracked files under ${specs.join(" ")}; ${hits.length} lines hit`);
const byKind = {};
for (const h of hits) if (!h.comment) for (const k of h.kinds) byKind[k] = (byKind[k] || 0) + 1;
console.log("by rule (code lines):", JSON.stringify(byKind));
for (const h of hits) console.log(`${h.f}:${h.n} [${h.kinds.join(",")}]${h.comment ? " [comment]" : ""} ${h.line}`);
let bad = 0;
for (const [r, n] of Object.entries(expect)) {
  const got = byKind[r] || 0;
  console.log(`${got === n ? "known positive ok" : "KNOWN POSITIVE FAILED"}: ${r} ${got}, expected ${n}`);
  if (got !== n) bad++;
}
if (bad) process.exit(2);
