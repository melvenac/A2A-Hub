// M3: A3 against a hub whose GET /messages marks the caller read. A3 must FAIL here.
// QA_MUTANT_HUB=<:4440> plus the usual QA_* env.
import { createHash } from "node:crypto";
import { hub, key, reads, cq, check, results, DIRECT } from "./harness.mjs";
const MUT = process.env.QA_MUTANT_HUB;
if (!MUT) throw new Error("QA_MUTANT_HUB must be set");
const tag = Date.now().toString(36);
const [a, b] = ["a", "b"].map((x) => `qa-m3${x}-${tag}`);
for (const n of [a, b]) await hub("POST", "/a2a/register", { name: n, apiKey: key(n), agentCard: { name: n, description: `QA ${n}`, kind: "ide-session" } });
const room = await hub("POST", "/a2a/session", { title: "qa-M3", participants: [a, b], maxTurns: 500 }, { headers: { "X-Agent-Key": key(a) } });
const sid = room.json.sessionId;
await hub("POST", `/a2a/session/${sid}/message`, { from: a, content: "M3 turn" }, { headers: { "X-Agent-Key": key(a) } });
const bMark = async () => (await reads(sid, a)).participant(b)?.lastRead ?? null;

// The dev-key (Loop 3): no seat on this stack holds it, so it resolves to no name. It is refused in
// strict (403) and passes unattributed in warn (200), and the mutant's mark cannot reach B.
const devHolder = await cq("agents:getByKeyHash", { apiKeyHash: createHash("sha256").update("dev-key").digest("hex") });
const before = await bMark();
const g1 = await hub("GET", `/a2a/session/${sid}/messages`, undefined, { base: MUT, headers: { "X-Agent-Key": "dev-key" } });
const afterDev = await bMark();
check("M3.devkey", "the dev-key resolves to no name; 403 (strict) or 200 (warn); B unmarked", { holder: devHolder?.name ?? null, status: g1.status, before, after: afterDev },
  devHolder === null && [200, 403].includes(g1.status) && before === null && afterDev === null);

// Per-seat key: the mutant must fire, so A3's observation must change.
const g2 = await hub("GET", `/a2a/session/${sid}/messages`, undefined, { base: MUT, headers: { "X-Agent-Key": key(b) } });
const afterSeat = await bMark();
check("M3.fires", "mutant fires under B's own key: B marked by a plain GET (A3 would fail -> mutant killed)", { status: g2.status, before: afterDev, after: afterSeat }, afterDev === null && afterSeat?.turn === 1);

// Control: the same GET with B's key on the UNMUTATED candidate leaves a fresh B unmarked.
const [c, d] = ["c", "d"].map((x) => `qa-m3${x}-${tag}`);
for (const n of [c, d]) await hub("POST", "/a2a/register", { name: n, apiKey: key(n), agentCard: { name: n, description: `QA ${n}`, kind: "ide-session" } });
const sid2 = (await hub("POST", "/a2a/session", { title: "qa-M3-ctl", participants: [c, d], maxTurns: 500 }, { headers: { "X-Agent-Key": key(c) } })).json.sessionId;
await hub("POST", `/a2a/session/${sid2}/message`, { from: c, content: "M3 control" }, { headers: { "X-Agent-Key": key(c) } });
await hub("GET", `/a2a/session/${sid2}/messages`, undefined, { base: DIRECT, headers: { "X-Agent-Key": key(d) } });
const ctl = (await reads(sid2, c)).participant(d)?.lastRead ?? null;
check("M3.control", "same GET with the reader's own key on the candidate: reader stays unmarked", ctl, ctl === null);
const failed = results.filter((r) => !r.pass).length;
console.log(`\nM3: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
