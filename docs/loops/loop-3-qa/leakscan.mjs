// Instrument K (loop-3-qa-criteria.md, K6): count secrets in run artifacts without printing them.
// It runs inside the process that holds the keys: import { scan, shapes } and pass the keys in.
// It reports per-artifact counts only. No key, hash or matched text is ever printed or returned.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** Count, per file, occurrences of every key and of every key's full sha256 hex. */
export function scan(files, keys) {
  const needles = [...new Set(keys)].flatMap((k) => [["key", k], ["hash", sha(k)]]);
  return files.map((f) => {
    let text;
    try { text = readFileSync(f, "utf8"); } catch (e) { return { file: f, error: e.code ?? "unreadable" }; }
    const hits = { key: 0, hash: 0 };
    for (const [kind, n] of needles) hits[kind] += text.split(n).length - 1;
    return { file: f, ...hits };
  });
}

/** Key-shaped runs in a client's output (K6.2): 43-char base64url and 64-hex. Counts only. */
export function shapes(text) {
  return {
    base64url43: (text.match(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g) ?? []).length,
    hex64: (text.match(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/gi) ?? []).length,
  };
}

// Selftest (known positive): `node leakscan.mjs --selftest <scratch dir>`
if (process.argv[2] === "--selftest") {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { randomBytes } = await import("node:crypto");
  const dir = process.argv[3];
  if (!dir) { console.log("usage: --selftest <scratch dir>"); process.exit(2); }
  mkdirSync(dir, { recursive: true });
  const k = randomBytes(32).toString("base64url");         // 43 chars, like the design's keys
  const other = randomBytes(32).toString("base64url");
  const files = {
    clean: "hub log line: [auth] WOULD REJECT unknown X-Agent-Key on GET /a2a/whoami\n",
    key: `oops ${k} leaked\n`,
    hash: `hash ${sha(k)} leaked\n`,
    prefixOnly: `prefix ${sha(k).slice(0, 8)} is allowed\n`,
    otherKey: `not ours ${other}\n`,
  };
  const paths = Object.fromEntries(Object.entries(files).map(([n, t]) => { const p = join(dir, `${n}.log`); writeFileSync(p, t); return [n, p]; }));
  const res = Object.fromEntries(scan(Object.values(paths), [k]).map((r, i) => [Object.keys(paths)[i], r]));
  const sh = Object.fromEntries(Object.entries(files).map(([n, t]) => [n, shapes(t)]));
  const want = [
    ["clean: 0 key, 0 hash", res.clean.key === 0 && res.clean.hash === 0],
    ["key planted: 1 key", res.key.key === 1],
    ["hash planted: 1 hash", res.hash.hash === 1],
    ["8-hex prefix only: 0 hash (allowed)", res.prefixOnly.hash === 0 && res.prefixOnly.key === 0],
    ["another key: 0 hits for ours", res.otherKey.key === 0],
    ["shapes: key-shaped run seen in key.log", sh.key.base64url43 === 1],
    ["shapes: 64-hex run seen in hash.log", sh.hash.hex64 === 1],
    ["shapes: clean and prefix logs carry none", sh.clean.base64url43 + sh.clean.hex64 + sh.prefixOnly.hex64 === 0],
  ];
  let bad = 0;
  for (const [n, ok] of want) { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"} ${n}`); }
  console.log(bad ? `\nK selftest: ${bad} failed` : `\nK selftest: all ${want.length} pass (counts only; nothing matched was printed)`);
  process.exit(bad ? 1 : 0);
}
