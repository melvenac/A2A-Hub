// Show what differs between old and new on the C1 routes that differed, and the /ui 404 body shape.
import { H, hub } from "./l4.mjs";
const paths = process.argv.slice(2);
function walk(a, b, at = "") {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return [`${at}: ${JSON.stringify(a)?.slice(0, 80)} | ${JSON.stringify(b)?.slice(0, 80)}`];
  if (a && typeof a === "object") {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...ks].flatMap((k) => walk(a[k], b[k], `${at}.${k}`));
  }
  return a === b ? [] : [`${at}: ${JSON.stringify(a)?.slice(0, 80)} | ${JSON.stringify(b)?.slice(0, 80)}`];
}
for (const [o, w] of [[H.oldW, H.newW], [H.oldS, H.newS]]) for (const p of paths) {
  const x = await hub(o, "GET", p), y = await hub(w, "GET", p);
  console.log(`== ${o.slice(-4)} vs ${w.slice(-4)} GET ${p}: ${x.status}/${y.status}`);
  if (x.json && y.json) console.log(walk(x.json, y.json).join("\n") || "(parsed bodies equal)");
  else console.log(x.text === y.text ? "(text equal)" : `text differs: ${x.text.slice(0, 100)} | ${y.text.slice(0, 100)}`);
}
const m = await hub(H.newW, "GET", "/ui/does-not-exist");
console.log("\n/ui 404 body, paths redacted:\n" + m.text.replace(/[A-Z]:\\[^\s)<]+/g, "<path>").replace(/\/[\w./-]+node_modules[\w./-]*/g, "<path>").slice(0, 400));
const n = await hub(H.oldW, "GET", "/nope");
console.log("\nold /nope body:\n" + n.text.slice(0, 200));
