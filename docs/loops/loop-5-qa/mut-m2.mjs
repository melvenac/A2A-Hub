// M2 (a Convex function): sessionAccess grants ownerView to any caller, not only a human. E3 as written
// (qa-a3 owns no row) cannot see it, so E3b: an AGENT named as another row's owner still gets no owner
// view. Control on the candidate, then deploy the mutant functions to cvxN, check, and redeploy the
// pristine functions (from the archive copy), verifying the restore with the same control.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { H, CVX, TREE, TMP, hub, register, cq, cvxRun, check, summary } from "./l5.mjs";

const BASE = join(TMP, "mut-base"), MUT = join(TMP, "mut");
const ADMIN = JSON.parse(readFileSync(join(TREE.cand, ".convex/local/default/config.json"), "utf8")).adminKey;
function deploy(dir) {
  const r = spawnSync(process.execPath, [join(dir, "node_modules/convex/bin/main.js"), "deploy", "--yes", "--typecheck", "disable", "--codegen", "disable"], {
    cwd: dir, encoding: "utf8", env: { ...process.env, CONVEX_SELF_HOSTED_URL: CVX.N, CONVEX_SELF_HOSTED_ADMIN_KEY: ADMIN, CONVEX_DEPLOYMENT: "" },
  });
  return { rc: r.status, tail: ((r.stdout ?? "") + (r.stderr ?? "")).replace(/[A-Za-z0-9|_:-]{40,}/g, "<masked>").trim().split("\n").slice(-2).join(" | ") };
}
// E3b setup: qa-m2y is owned by the AGENT qa-a3; room R = [qa-m2y, qa-m2z] (created through the warn hub)
for (const n of ["qa-m2y", "qa-m2z"]) await register(H.nW, n);
cvxRun(TREE.cand, "agents:setOwner", { name: "qa-m2y", owner: "qa-a3" });
const R = (await hub(H.nW, "POST", "/a2a/session", { as: "qa-m2y", body: { title: "E3b room", participants: ["qa-m2y", "qa-m2z"], maxTurns: 6 } })).json?.sessionId;
const probe = async () => ({ read: (await hub(H.nS, "GET", `/a2a/session/${R}/messages`, { as: "qa-a3" })).status, listed: ((await hub(H.nS, "GET", "/a2a/sessions", { as: "qa-a3" })).json?.sessions ?? []).some((s) => s._id === R) });
const c1 = await probe();
check("E3b (candidate)", "an agent named as another row's owner gets NO owner view: 404, not listed", c1, c1.read === 404 && !c1.listed);
// the mutant
const f = "convex/accessLogic.ts"; copyFileSync(join(BASE, f), join(MUT, f));
const src = readFileSync(join(MUT, f), "utf8").replace(/\r\n/g, "\n");
const from = "  if (!isHumanRow(callerRow)) return { participant, ownerView: false };\n";
if (!src.includes(from)) throw new Error("M2 anchor not found");
writeFileSync(join(MUT, f), src.replace(from, ""));
const tsc = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: MUT, encoding: "utf8" });
const d1 = deploy(MUT);
const m = await probe();
check("M2 mutant", "with the human-only guard removed, E3b must FAIL (the agent gets an owner view)", { landed: !readFileSync(join(MUT, f), "utf8").includes(from), tsc: tsc.status, deploy: d1, probe: m }, d1.rc === 0 && tsc.status === 0 && (m.read === 200 || m.listed));
// restore: pristine functions from the archive copy, then the same control
copyFileSync(join(BASE, f), join(MUT, f));
const d2 = deploy(BASE.replace(/mut-base$/, "mut")); // the working copy, now pristine again (it has node_modules)
const c2 = await probe();
check("M2 restore", "pristine functions redeployed; E3b passes again (404, not listed)", { deploy: d2, probe: c2 }, d2.rc === 0 && c2.read === 404 && !c2.listed);
const acc = await cq(CVX.N, "sessions:access", { sessionId: R, caller: "aaron" });
check("M2 restore (owner view intact)", "aaron still has his owner view elsewhere (A-agents via nS)", { aaronAg: (await hub(H.nS, "GET", `/a2a/session/${JSON.parse(readFileSync(join(TMP, "l5-ids.json"), "utf8")).S.Aag}/messages`, { as: "aaron" })).status, accessR: acc }, true);
process.exitCode = summary(join(TMP, "mut-m2.results.txt")) ? 1 : 0;
