// Loop 6 precondition: the live-shaped seed (loop-6-qa-criteria.md section 0) on the candidate's scratch
// Convex. tcm's rows at the Loop 5 deploy (loop-5-qa/runs/rl2/menu-agents-summary.txt): 9 names, each
// with its own key, owner=aaron; aaron human-kind since G-002. The 8 agent rows are registered through
// the OLD v1.11.0 hub (onW) on the candidate's database, as the live rows were made before Loop 6.
//   aaron      createHuman (the operator path; OP2's documentation is judged separately)
//   qa-owner0  an owner row with NO kind (tcm's former aaron shape): owner = itself via setOwner
//   qa-o0-agent  an agent owned by qa-owner0
//   qa-owner2  createHuman: the scratch second human (A6)
// Usage: QA_TMP=... node seed6.mjs
import { H, key, sha, cvxRun, register, rows, setRow, check, summary } from "./l6.mjs";
import { join } from "node:path";
setRow("seed");
const LIVE = ["a2a-grok", "atlas", "cursor-grok", "grok", "grok-probe", "grokbot", "melve-76", "relay"];
const out = {};
out.aaron = cvxRun("C:/Users/melve/Worktrees/qa3-cand", "agents:createHuman", { name: "aaron", apiKeyHash: sha(key("aaron")) });
out.owner2 = cvxRun("C:/Users/melve/Worktrees/qa3-cand", "agents:createHuman", { name: "qa-owner2", apiKeyHash: sha(key("qa-owner2")) });
for (const n of LIVE) out[n] = (await register(H.onW, n)).status;
out.owner0 = (await register(H.onW, "qa-owner0", { kind: null })).status;
out.o0agent = (await register(H.onW, "qa-o0-agent")).status;
out.setOwner0 = cvxRun("C:/Users/melve/Worktrees/qa3-cand", "agents:setOwner", { name: "qa-owner0", owner: "qa-owner0" });
out.setO0agent = cvxRun("C:/Users/melve/Worktrees/qa3-cand", "agents:setOwner", { name: "qa-o0-agent", owner: "qa-owner0" });
console.log("seed calls:", JSON.stringify(out));
const all = rows("agents");
const view = all.map((r) => `${r.name}\tkind=${r.agentCard?.kind ?? "-"}\towner=${r.owner ?? "NONE"}\tkeyStatus=${r.keyStatus}\thash=${String(r.apiKeyHash).slice(0, 8)}`).sort();
console.log(view.join("\n"));
const by = Object.fromEntries(all.map((r) => [r.name, r]));
check("P.seed live rows", "8 agent rows kind=ide-session owner=aaron, each its own hash", LIVE.map((n) => [n, by[n]?.agentCard?.kind, by[n]?.owner]),
  LIVE.every((n) => by[n]?.agentCard?.kind === "ide-session" && by[n]?.owner === "aaron" && by[n]?.apiKeyHash === sha(key(n))));
check("P.seed aaron-h", "aaron kind=human owner=aaron", [by.aaron?.agentCard?.kind, by.aaron?.owner], by.aaron?.agentCard?.kind === "human" && by.aaron?.owner === "aaron");
check("P.seed qa-owner0", "no kind, owner=qa-owner0", [by["qa-owner0"]?.agentCard?.kind ?? null, by["qa-owner0"]?.owner], by["qa-owner0"] && by["qa-owner0"].agentCard?.kind === undefined && by["qa-owner0"].owner === "qa-owner0");
check("P.seed qa-o0-agent", "owner=qa-owner0", by["qa-o0-agent"]?.owner, by["qa-o0-agent"]?.owner === "qa-owner0");
check("P.seed qa-owner2", "kind=human owner=qa-owner2", [by["qa-owner2"]?.agentCard?.kind, by["qa-owner2"]?.owner], by["qa-owner2"]?.agentCard?.kind === "human" && by["qa-owner2"]?.owner === "qa-owner2");
const peers = rows("peers").filter((p) => p.type === "human").map((p) => p.name).sort();
check("P.seed human peers", "human peers recorded (baseline for A11)", peers, true);
summary(join(process.env.QA_TMP, "seed6.results.txt"));
