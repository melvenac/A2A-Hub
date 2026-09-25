// BF3 (O4, as ruled): rows registered through the OLD hub after the first backfill have no owner; the
// candidate hub is serving (the swap); aaron's view does not see their room until a SECOND
// assignOwnerAtDeploy, which counts exactly them; then 0 rows lack an owner.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { H, CVX, TREE, TMP, hub, register, cq, cvxData, cvxRun, check, summary } from "./l5.mjs";

for (const [n, k] of [["qa-gap1", "ide-session"], ["qa-gap2", "ide-session"], ["aaron", "human"]]) {
  const r = await register(H.ooW, n, k); check("BF3 setup", `old hub registers ${n} (${k})`, { status: r.status }, r.status === 200);
}
const s = await hub(H.ooW, "POST", "/a2a/session", { as: "qa-gap1", body: { title: "gap-room", participants: ["qa-gap1", "qa-gap2"], maxTurns: 8 } });
const gap = s.json?.sessionId;
await hub(H.ooW, "POST", `/a2a/session/${gap}/message`, { as: "qa-gap1", body: { from: "qa-gap1", content: "gap seed" } });
writeFileSync(join(TMP, "gap-room.txt"), String(gap));
const lacking = () => cvxData(TREE.old, "agents").filter((r) => !r.owner).map((r) => r.name).sort();
const sees = async () => ((await hub(H.noW, "GET", "/a2a/sessions", { as: "aaron" })).json?.sessions ?? []).some((x) => x._id === gap);
const acc = async () => cq(CVX.O, "sessions:access", { sessionId: gap, caller: "aaron" });
const pre = { lacking: lacking(), aaronListSees: await sees(), access: await acc() };
check("BF3 before", "after the swap, before the second run: the gap rows lack an owner and aaron's view does NOT see their room (no query-time default)", pre,
  JSON.stringify(pre.lacking) === '["aaron","qa-gap1","qa-gap2"]' && pre.aaronListSees === false && pre.access.ownerView === false);
const r = cvxRun(TREE.old, "agents:assignOwnerAtDeploy", { owner: "aaron" });
const post = { result: r, lacking: lacking(), aaronListSees: await sees(), access: await acc() };
check("BF3 after", "second run counts exactly the gap rows (2 assigned, aaron self 1); aaron's view sees the room; 0 rows lack an owner", post,
  r.assigned === 2 && r.self === 1 && post.lacking.length === 0 && post.aaronListSees === true && post.access.ownerView === true);
process.exitCode = summary(join(TMP, "bf3.results.txt")) ? 1 : 0;
