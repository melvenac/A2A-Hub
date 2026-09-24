// H4.2/H4.3 (loop-3-qa-criteria.md), run ONLY after Relay's go (clipboard ruling):
// (a) never reads or restores the clipboard's earlier contents; (b) Relay warned Aaron first;
// (c) the step's last act sets the clipboard to empty. The key is compared in-process, never printed.
// QA_TMP=<run dir> node rows-h4.mjs
import { H, hub, hubKey, keyOf, keyShaped, P8, check, report, finish } from "./l3.mjs";
import { spawnSync } from "node:child_process";

const ps = (cmd) => spawnSync("powershell", ["-NoProfile", "-STA", "-Command", cmd], { encoding: "utf8" });
const key = keyOf("aaron", H.W);
const r = await hubKey(["copy", "--as", "aaron", "--hub", H.W], { hub: H.W });
const out = (r.stdout + r.stderr).trim();
const clip = ps("Get-Clipboard -Raw").stdout.replace(/\r?\n$/, "");   // read AFTER copy only; never before
const matches = key !== null && clip === key;
// (c) last act: clear, then prove empty
ps("Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear()");
const after = ps("Get-Clipboard -Raw").stdout.trim();
const lines = out.split(/\r?\n/).filter(Boolean);
check("H4.2", "hub-key copy --as aaron: output is exactly one 'copied key for aaron@<hub-id> (prefix xxxxxxxx)' line, prefix matches the key's hash, no key-shaped run; clipboard (read in-process after the copy, never printed) equals the key file; then cleared",
  { exit: r.code, lines: lines.length, shape: /^copied key for aaron@127\.0\.0\.1-4510 \(prefix [0-9a-f]{8}\)$/.test(lines[0] ?? ""), prefixMatches: (lines[0] ?? "").includes(`prefix ${key ? P8(key) : "none"}`), shaped: keyShaped(out), clipboardEqualsKeyFile: matches, clearedAfter: after === "" },
  r.code === 0 && lines.length === 1 && /^copied key for aaron@127\.0\.0\.1-4510 \(prefix [0-9a-f]{8}\)$/.test(lines[0]) && lines[0].includes(`prefix ${P8(key)}`) && !keyShaped(out) && matches && after === "");
report("H4.clipboard", `the run never read the clipboard before the copy; it read it once after the copy (compared in-process), then set it to empty; empty confirmed: ${after === ""}`);
const noKey = await hub(H.W, "GET", "/a2a/sessions");
check("H4.3", "with no key, a guarded request (as the browser would send) gets 401", noKey.status, noKey.status === 401);
process.exit(finish("rows-h4") ? 1 : 0);
