// F1 class search (ruling 3): does ANY public Convex function return apiKeyHash to a public caller?
// Enumerates every public query in the tree's convex/*.ts and calls each ONCE on the running deployment,
// with exactly the arguments its validator declares (values chosen by argument name). A result carrying an
// `apiKeyHash` field anywhere is flagged. Public mutations are listed, not called (side effects).
// Only declared arguments are sent, and any hash argument is a dummy that is no key's hash: a call that
// fails validation makes Convex echo its arguments into its log, which K6 would then count.
//   QA_TMP=... node f1scan.mjs <tree> [--expect getByName,listOnline]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CVX, cq, data } from "./l3.mjs";

const hasField = (v) => v !== null && typeof v === "object" && (Array.isArray(v) ? v.some(hasField) : ("apiKeyHash" in v || Object.values(v).some(hasField)));
const DUMMY_HASH = createHash("sha256").update("qa-f1-dummy-not-a-key").digest("hex");

export async function f1scan(tree, cvx = CVX.A) {
  const files = readdirSync(join(tree, "convex")).filter((f) => f.endsWith(".ts") && !f.startsWith("_") && !f.endsWith(".test.ts"));
  const agent = data("agents")[0], session = data("sessions")[0], peer = data("peers")[0];
  const VALUE = { name: agent?.name, apiKeyHash: DUMMY_HASH, sessionId: session?._id, peerName: peer?.name, taskId: "qa-no-such-task", text: "qa", agentName: agent?.name };
  const queries = [], mutations = [], flagged = [], uncalled = [], unknownArgs = [];
  for (const f of files) {
    const src = readFileSync(join(tree, "convex", f), "utf8");
    for (const m of src.matchAll(/export const (\w+) = (query|mutation)\(\{(?:\s*\/\/[^\n]*)*\s*args:\s*\{([^}]*)\}/g)) {
      const path = `${f.replace(".ts", "")}:${m[1]}`;
      if (m[2] === "mutation") { mutations.push(path); continue; }
      queries.push(path);
      const fields = [...m[3].matchAll(/(\w+)\s*:\s*(v\.optional\()?/g)].map((x) => ({ k: x[1], optional: !!x[2] }));
      const args = {};
      for (const { k, optional } of fields) { if (optional) continue; if (!(k in VALUE)) unknownArgs.push(`${path}.${k}`); else args[k] = VALUE[k]; }
      const r = await cq(cvx, path, args);
      if (!r.ok) { uncalled.push(path); continue; }
      if (hasField(r.value)) flagged.push(path);
    }
  }
  const allQueries = files.flatMap((f) => [...readFileSync(join(tree, "convex", f), "utf8").matchAll(/export const (\w+) = query\(/g)].map((m) => `${f.replace(".ts", "")}:${m[1]}`));
  const unparsed = allQueries.filter((p) => !queries.includes(p));
  return { queries, mutations, uncalled: [...uncalled, ...unparsed], unknownArgs, flagged };
}

if (process.argv[1]?.endsWith("f1scan.mjs")) {
  const tree = process.argv[2];
  const ei = process.argv.indexOf("--expect");
  const expect = ei > -1 ? process.argv[ei + 1].split(",") : [];
  const r = await f1scan(tree);
  console.log(JSON.stringify({ queries: r.queries.length, uncalled: r.uncalled, unknownArgs: r.unknownArgs, flagged: r.flagged }));
  const ok = r.uncalled.length === 0 && expect.every((e) => r.flagged.some((f) => f.endsWith(`:${e}`))) && (expect.length > 0 || r.flagged.length === 0);
  console.log(ok ? "known positive ok" : "KNOWN POSITIVE FAILED");
  process.exit(ok ? 0 : 2);
}
