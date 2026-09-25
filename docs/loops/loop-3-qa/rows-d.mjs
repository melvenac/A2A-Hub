// Loop 3 rows, part D (loop-3-qa-criteria.md): H1 after a hub restart, H3.2 escalation (isolated cvxE).
// QA_TMP=<run dir> QA_ESC=<esc copy> node rows-d.mjs h1-after-restart | h32
import { CVX, sha, newKey, name, cq, cm, check, finish } from "./l3.mjs";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const mode = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (mode === "h1-after-restart") {
  const t = (await cq(CVX.A, "peers:getByName", { name: "aaron" })).value?.type ?? null;
  check("H1.2c", "after a restart of the warn hub, aaron is still human", t, t === "human");
}

if (mode === "h32") {
  const ESC = process.env.QA_ESC; if (!ESC) throw new Error("QA_ESC must be set");
  const empty = (await cq(CVX.E, "agents:listOnline", {})).value;
  const escCall = join(process.env.QA_TMP, "esc-call.mjs");
  writeFileSync(escCall, `const { Escalation } = await import(${JSON.stringify(pathToFileURL(join(ESC, "src", "escalation.ts")).href)});
const e = new Escalation(${JSON.stringify(CVX.E)});
console.log("RESULT " + await e.escalateToAgent("qa escalation test"));\n`);
  const escalate = () => {
    const c = spawn(process.execPath, ["--import", "tsx", escCall], { cwd: ESC, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
    return { child: c, out: () => out, done: new Promise((r) => c.on("close", (code) => r(code))) };
  };
  await cm(CVX.E, "peers:register", { name: "aaron", type: "human" });
  const reg = await cm(CVX.E, "agents:registerAgent", { name: "aaron", apiKeyHash: sha(newKey()), agentCard: { name: "aaron", kind: "human" } });
  const e1 = escalate();
  const code1 = await Promise.race([e1.done, sleep(30_000).then(() => "timeout")]);
  if (code1 === "timeout") e1.child.kill();
  const tasksAaron = (await cq(CVX.E, "tasks:getPending", { agentName: "aaron" })).value ?? [];
  check("H3.2a", "isolated deployment, aaron (human) is the only agents row: escalation with no named target returns 'No agents are currently online' and creates no task",
    { startedEmpty: Array.isArray(empty) && empty.length === 0, aaronRow: reg.ok, exit: code1, text: /No agents are currently online/.test(e1.out()), tasksForAaron: tasksAaron.length },
    Array.isArray(empty) && empty.length === 0 && reg.ok && /No agents are currently online/.test(e1.out()) && tasksAaron.length === 0);
  const d = name("escd");
  await cm(CVX.E, "agents:registerAgent", { name: d, apiKeyHash: sha(newKey()), agentCard: { name: d, kind: "repo-daemon" } });
  const e2 = escalate();
  let assigned = [];
  for (let i = 0; i < 40 && assigned.length === 0; i++) { await sleep(500); assigned = (await cq(CVX.E, "tasks:getPending", { agentName: d })).value ?? []; }
  e2.child.kill(); await e2.done;
  const toAaron = (await cq(CVX.E, "tasks:getPending", { agentName: "aaron" })).value ?? [];
  check("H3.2b", "known positive: with aaron and one qa- daemon row, the escalated task's assignedAgent is the daemon (call stopped once the task exists); none to aaron",
    { tasksForDaemon: assigned.length, tasksForAaron: toAaron.length }, assigned.length >= 1 && toAaron.length === 0);
}

process.exit(finish(`rows-d-${mode}`) ? 1 : 0);
