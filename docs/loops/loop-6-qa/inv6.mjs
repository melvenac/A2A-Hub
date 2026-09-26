// INV1 (loop-6-qa-criteria.md): every place the hub writes an error response, derived from the source at
// a SHA (git show), not copied from the design. Lists each `res.status(<4xx|5xx>)` site and each response
// written inside a `catch`, with file:line, the status, and whether the body passes a message through
// (`error.message`, `err.message`, `e.message`, `String(error)`). Also lists error middleware
// (4-argument app.use) and express.static / express.json setup, whose defaults are error sources.
// Usage: node inv6.mjs <sha> [--plant]   (--plant adds one known extra catch to the parsed text: selftest)
import { execFileSync } from "node:child_process";
const [sha, flag] = [process.argv[2], process.argv[3]];
if (!sha) throw new Error("usage: inv6.mjs <sha> [--plant]");
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20 });
const files = git("ls-tree", "-r", "--name-only", sha, "src").split("\n").filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
const rows = []; let plantedSeen = false;
for (const f of files) {
  let text = git("show", `${sha}:${f}`);
  if (flag === "--plant" && f === "src/index.ts") text += `\napp.get("/qa-planted", async (_req, res) => {\n  try { throw new Error("x"); } catch (error: any) {\n    res.status(500).json({ error: error.message }); // QA-PLANTED\n  }\n});\n`;
  // Blank comments, keeping length so line numbers hold.
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, (m, p) => p + " ".repeat(m.length - p.length));
  const lines = src.split("\n");
  let catchDepth = -1, depth = 0;
  lines.forEach((l, i) => {
    const n = i + 1;
    if (/\bcatch\s*(\(|\{)/.test(l) && catchDepth < 0) catchDepth = depth;
    for (const c of l) { if (c === "{") depth++; else if (c === "}") { depth--; if (catchDepth >= 0 && depth <= catchDepth) catchDepth = -1; } }
    const st = /res\s*\.\s*status\(\s*(\d{3})\s*\)/.exec(l) ?? /res\s*\.\s*sendStatus\(\s*(\d{3})\s*\)/.exec(l);
    const passthrough = /\b(error|err|e)\.message\b|String\((error|err|e)\)/.test(l);
    if (st && +st[1] >= 400) rows.push({ at: `${f}:${n}`, status: +st[1], inCatch: catchDepth >= 0, passthrough });
    else if (catchDepth >= 0 && /res\s*\.\s*(json|send|end)\(/.test(l)) rows.push({ at: `${f}:${n}`, status: "default", inCatch: true, passthrough });
    if (/app\.use\(\s*(async\s*)?\(\s*\w+\s*(:\s*\w+)?\s*,\s*\w+\s*(:[^,]+)?,\s*\w+\s*(:[^,]+)?,\s*\w+/.test(l)) rows.push({ at: `${f}:${n}`, status: "error-middleware", inCatch: false, passthrough });
    if (/express\.(static|json|urlencoded)\(/.test(l)) rows.push({ at: `${f}:${n}`, status: `default:${/express\.(\w+)/.exec(l)[1]}`, inCatch: false, passthrough: false });
    if (/QA-PLANTED/.test(text.split("\n")[i] ?? "")) plantedSeen = rows.some((r) => r.at === `${f}:${n}`);
  });
}
for (const r of rows) console.log(`${r.at}\t${r.status}\t${r.inCatch ? "catch" : "-"}\t${r.passthrough ? "PASSTHROUGH" : "-"}`);
const pt = rows.filter((r) => r.passthrough);
console.log(`\n${sha}: ${files.length} files, ${rows.length} error sites, ${pt.length} pass a message through (${[...new Set(pt.map((r) => r.at.split(":")[0]))].join(", ")})`);
if (flag === "--plant") { console.log(plantedSeen ? "PLANT FOUND" : "PLANT MISSED"); process.exitCode = plantedSeen ? 0 : 2; }
