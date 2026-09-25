// Build the client mutants (M1-M5, M7) from the replay's client stage (a scratch copy, never the
// candidate). Each edit is asserted to land, built with vite to QA_TMP/mut/<id>, and the source is
// restored and shown byte-identical to git archive's copy afterwards.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { TMP, keyFile, H } from "./l4.mjs";

const client = join(TMP, "rep-new", "client");
const src = join(client, "src", "App.svelte");
const pristine = readFileSync(join(TMP, "rep-new", "ctx", "client", "src", "App.svelte"), "utf8");
if (readFileSync(src, "utf8") !== pristine) throw new Error("replay client source differs from the archive before mutating");
const planted = keyFile(H.newW, "qa-l4c");
const M = {
  M1: ['JSON.stringify({ from: me, content: text })', 'JSON.stringify({ from: "alice", content: text })'],
  M1b: ['JSON.stringify({ from: me, content: text })', 'JSON.stringify({ from: picked[0], content: text })'],
  M2: ['let hubUrl = import.meta.env.DEV ? "http://127.0.0.1:4000" : window.location.origin;', 'let hubUrl = "http://127.0.0.1:4620";'],
  M3: ['    if (!key) {\n      authState = "nokey";', '    if (!key) {\n      fetch(`${hubUrl}/a2a/whoami`, { headers: hdrs() });\n      authState = "nokey";'],
  M4: ['livePeers = (body.agents || []).filter((a) => a.name !== me && a.name !== "hub");', 'livePeers = [...(body.agents || []).filter((a) => a.name !== me && a.name !== "hub"), { name: "qa-fixed" }];'],
  M5: null, // vite base
  M7: ['const KEY_STORE = "a2a-hub:aaron-key";', `const KEY_STORE = "a2a-hub:aaron-key"; const QA_PLANT = "${planted}"; console.debug(QA_PLANT.length);`],
};
for (const [id, edit] of Object.entries(M)) {
  const out = join(TMP, "mut", id);
  rmSync(out, { recursive: true, force: true });
  let text = pristine.replace(/\r\n/g, "\n");
  const crlf = pristine.includes("\r\n");
  const args = ["vite", "build", "--outDir", out, "--emptyOutDir"];
  if (edit) {
    if (!text.includes(edit[0])) throw new Error(`${id}: anchor not found`);
    text = text.replace(edit[0], edit[1]);
    if (!text.includes(edit[1])) throw new Error(`${id}: edit did not land`);
    writeFileSync(src, crlf ? text.replace(/\n/g, "\r\n") : text);
  } else args.push("--base", "/");
  try {
    execFileSync("npx.cmd", args, { cwd: client, stdio: ["ignore", "pipe", "pipe"], shell: true });
    console.log(`${id}: built ${edit ? "(edit landed)" : "(--base /)"} -> ${out}`);
  } finally { writeFileSync(src, pristine); }
}
console.log(`restored: ${readFileSync(src, "utf8") === pristine ? "byte-identical to archive" : "DIFFERS"}`);
