// Loop 5 hub-side mutants (M1, M3-M11; M2 is a Convex function, run by mut-m2.mjs). For each: restore
// from the pristine archive copy, apply one edit and assert it landed, require `tsc --noEmit` clean,
// run the named row's check on the real candidate first (must PASS: the control), then start the
// mutant hub on :4740 against the candidate DB, run the same check (must FAIL: caught), stop it by PID.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { H, CVX, TMP, SECRETS, sha, hub, key, register, cq, withLog, sleep, results, summary } from "./l5.mjs";

const BASE = join(TMP, "mut-base"), MUT = join(TMP, "mut");
const { S, FAKE } = JSON.parse(readFileSync(join(TMP, "l5-ids.json"), "utf8"));
const ENVF = "C:/Users/melve/Worktrees/a2a-qa/.env";
const rpcSend = (base, as, text, to) => hub(base, "POST", "/a2a/jsonrpc", { as, body: { jsonrpc: "2.0", id: 7, method: "message/send", params: { message: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "text", text }], metadata: { to } }, configuration: { blocking: true } } } });
const beat = async (base) => { for (const n of ["qa-a1", "qa-a2", "qa-a3", "qa-b1", "qa-b2"]) await hub(base, "POST", `/a2a/heartbeat/${n}`, { as: n, body: {} }); };
const hubRooms = async () => ((await hub(H.nS, "GET", "/a2a/sessions", { as: "aaron" })).json?.sessions ?? []).filter((s) => JSON.stringify(s.participants?.slice().sort()) === '["aaron","hub"]');

const M = [
  { id: "M1", row: "A9", file: "src/index.ts", mode: "strict", from: '    if (!bindName(req, res, agentId, "agentId")) return;\n\n    const tasks', to: "    const tasks",
    check: async (b) => { const r = await hub(b, "GET", "/a2a/queue/qa-a2", { as: "qa-a1" }); return [r.status === 403, { status: r.status }]; } },
  { id: "M3", row: "A7/E1", file: "src/index.ts", mode: "strict", from: "await convex.query(api.sessions.listVisibleTo, { name: caller })", to: "await convex.query(api.sessions.listAll, {})",
    check: async (b) => { const ids = ((await hub(b, "GET", "/a2a/sessions", { as: "qa-a3" })).json?.sessions ?? []).map((s) => s._id); const leak = [S.Ain, S.Aag, S.B].filter((i) => ids.includes(i)).length; return [leak === 0, { visibleToA3: leak }]; } },
  { id: "M4", row: "A2 oracle", file: "src/index.ts", mode: "strict", from: '    `non-member session=${shortId(req.params.sessionId)}`,\n    SESSION_NOT_FOUND\n  );', to: '    `non-member session=${shortId(req.params.sessionId)}`,\n    { status: 403, error: "session not found" }\n  );',
    check: async (b) => { const f = await hub(b, "GET", `/a2a/session/${S.Ain}/messages`, { as: "qa-b1" }); const a = await hub(b, "GET", `/a2a/session/${FAKE}/messages`, { as: "qa-b1" }); return [f.status === 404 && f.status === a.status && f.text === a.text, { forbidden: f.status, absent: a.status }]; } },
  { id: "M5", row: "C1", file: "src/index.ts", mode: "strict", from: '        if (evaluateAsk(target?.askPolicy, caller) === "deny") {\n          return { refusal: askDeniedReason(caller as string, to) };\n        }', to: "",
    check: async (b) => { await beat(b); const r = await rpcSend(b, "qa-a1", `M5 ${Date.now()}`, "qa-a2"); const st = r.json?.result?.status?.state; return [st === "rejected", { state: st }]; } },
  { id: "M6", row: "B4", file: "src/authz.ts", mode: "strict", from: '  console.warn(authzLine(v, what, routeOf(req), req.agentName));', to: '  console.warn(authzLine(v, what, routeOf(req), req.agentName) + ` k=${String(req.headers["x-agent-key"]).slice(0, 40)}`);',
    check: async (b) => { const w = await withLog([b], () => hub(b, "POST", `/a2a/session/${S.Ain}/message`, { as: "qa-a1", body: { from: "qa-a2", content: "M6" } }));
      const raw = readFileSync(join(TMP, "logs", `${b === H.mut ? "mut" : "nS"}.err.log`), "utf8"); const tail = raw.slice(-4000);
      const leak = SECRETS.some((s) => tail.includes(s.slice(0, 32)) || tail.includes(sha(s))) || Object.values(w.lines).flat().some((l) => l.bad32 || !l.ok);
      return [!leak, { lines: Object.values(w.lines).flat().length, leak }]; } },
  { id: "M7", row: "B1 A1", file: "src/authz.ts", mode: "warn", from: '  return mode === "strict" ? "reject" : "warn";', to: '  return "reject";',
    check: async (b) => { const r = await hub(b, "POST", `/a2a/session/${S.Ain}/message`, { as: "qa-a1", body: { from: "qa-a2", content: "M7" } }); return [r.status === 200, { status: r.status }]; } },
  { id: "M8", row: "A12 (Q8)", file: "src/index.ts", mode: "strict", from: "      ...(task?.assignedAgent ? { assignedAgent: task.assignedAgent } : {}),\n", to: "",
    check: async (b) => { const text = `M8 ${b} ${Date.now()}`;
      Promise.race([hub(H.nW, "POST", "/a2a/message/send", { as: "qa-a1", body: { jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text }] }, to: "qa-a3" } } }), sleep(2500)]);
      let t = null; for (let i = 0; i < 20 && !t; i++) { t = ((await hub(H.nW, "GET", "/a2a/queue/qa-a3", { as: "qa-a3" })).json?.tasks ?? []).find((x) => JSON.stringify(x).includes(text)); if (!t) await sleep(500); }
      const id = t?.taskId ?? t?.id; await hub(b, "POST", `/a2a/task/${id}/respond`, { as: "qa-a3", body: { response: "ok" } });
      const row = await cq(CVX.N, "tasks:getByTaskId", { taskId: id }); return [row?.assignedAgent === "qa-a3", { task: !!id, assignedAgent: row?.assignedAgent ?? null }]; } },
  { id: "M9", row: "E6", file: "src/keys.ts", mode: "strict", from: '          owner: card?.kind === "human" ? name : hubOwner,', to: '          owner: req.body?.owner ?? (card?.kind === "human" ? name : hubOwner),',
    check: async (b) => { const n = `qa-m9-${b.slice(-4)}`; await register(b, n, "ide-session", { top: { owner: "qa-x" } }); const o = (await cq(CVX.N, "agents:getByName", { name: n }))?.owner; return [o === "aaron", { owner: o }]; } },
  { id: "M10", row: "A15(c)", file: "src/index.ts", mode: "strict", from: "  const narrate = !caller.name || caller.owner === HUMAN_PEER;", to: "  const narrate = true;",
    check: async (b) => { await beat(b); const text = `M10 ${b} ${Date.now()}`;
      Promise.race([hub(b, "POST", "/a2a/message/send", { as: "qa-b1", body: { jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text }] } } } }), sleep(2500)]);
      await sleep(3000); let hits = 0; for (const r of await hubRooms()) hits += ((await hub(H.nS, "GET", `/a2a/session/${r._id}/messages`, { as: "aaron" })).json?.messages ?? []).filter((m) => m.content.includes(text)).length;
      return [hits === 0, { narratedHits: hits }]; } },
  { id: "M11", row: "A20", file: "src/index.ts", mode: "strict", from: "        const cross = await crossOwnerTo(info, to, JSONRPC_ROUTE);\n        if (cross) return { refusal: cross };\n", to: "",
    check: async (b) => { await beat(b); const r = await rpcSend(b, "qa-b1", `M11 ${Date.now()}`, "qa-a1"); const st = r.json?.result?.status?.state; return [st === "rejected", { state: st }]; } },
];

const out = [];
const only = process.argv[2] ? process.argv[2].split(",") : null;
for (const m of M.filter((x) => !only || only.includes(x.id))) {
  const f = join(MUT, m.file);
  copyFileSync(join(BASE, m.file), f);
  const pristine = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  if (!pristine.includes(m.from)) { out.push(`INVALID ${m.id}: anchor not found`); console.log(out.at(-1)); continue; }
  writeFileSync(f, pristine.replace(m.from, m.to));
  const landed = !readFileSync(f, "utf8").includes(m.from) || m.to.includes(m.from);
  const tsc = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: MUT, encoding: "utf8" });
  // control: the check on the real candidate must pass
  const ctrlBase = m.mode === "warn" ? H.nW : H.nS;
  const [ctrlPass, ctrlObs] = await m.check(ctrlBase);
  // mutant hub
  const env = { ...process.env, PORT: "4740", CONVEX_URL: CVX.N, AUTH_MODE: m.mode, HUB_URL: H.mut }; delete env.AGENT_KEY;
  const { openSync } = await import("node:fs");
  const lo = openSync(join(TMP, "logs", "mut.out.log"), "a"), le = openSync(join(TMP, "logs", "mut.err.log"), "a");
  const p = spawn(process.execPath, [`--env-file=${ENVF}`, "--import", "tsx", "src/index.ts", "--qa-port=4740"], { cwd: MUT, env, stdio: ["ignore", lo, le] });
  let up = false; for (let i = 0; i < 40 && !up; i++) { await sleep(500); up = (await hub(H.mut, "GET", "/health")).status === 200; }
  const [mutPass, mutObs] = up ? await m.check(H.mut) : [true, { error: "mutant hub did not start" }];
  p.kill(); await sleep(1500);
  const free = (await hub(H.mut, "GET", "/health")).status === "socket-error";
  copyFileSync(join(BASE, m.file), f); // restore
  const caught = up && ctrlPass && !mutPass;
  const line = `${caught ? "CAUGHT" : "NOT CAUGHT"} ${m.id} (${m.row}, ${m.mode}): landed=${landed} tsc=${tsc.status === 0 ? "clean" : "ERRORS"} control(candidate)=${ctrlPass ? "pass" : "FAIL"} ${JSON.stringify(ctrlObs)} mutant=${mutPass ? "pass" : "fail"} ${JSON.stringify(mutObs)} port4740free=${free}`;
  out.push(line); console.log(line);
  if (tsc.status !== 0) console.log(tsc.stdout.slice(0, 400));
}
writeFileSync(join(TMP, "mut5.results.txt"), out.join("\n") + "\n");
process.exitCode = out.every((l) => l.startsWith("CAUGHT") && /tsc=clean/.test(l) && /landed=true/.test(l)) ? 0 : 1;
