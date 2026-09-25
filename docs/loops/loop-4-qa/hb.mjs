// Heartbeat one QA agent every 10 s until killed (B4/B5 liveness). Usage: node hb.mjs <name> <hubUrl>
import { heartbeat, keyFile } from "./l4.mjs";
const [name, hubUrl] = process.argv.slice(2);
const key = keyFile(hubUrl, name);
for (;;) {
  const r = await heartbeat(hubUrl, name, key);
  console.log(`${new Date().toISOString()} ${name} heartbeat ${r.status}`);
  await new Promise((res) => setTimeout(res, 10_000));
}
