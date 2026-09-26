// Loop 6 rows G1b, G1c, G1d, G1e (loop-6-qa-criteria.md G). Old = v1.11.0 hubs on the baseline database
// (ooW 4720 / ooS 4721 on cvxO); candidate = nW 4710 / nS 4711 on cvxN. hub-talk is the CANDIDATE's
// (the static hunk review in G1c shows it differs from v1.11.0 only by --invite).
// Usage: QA_TMP=... node rows-g6.mjs
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { H, TMP, TREE, key, placeKey, hub, register, issue, setRow, check, summary, sleep, SECRETS } from "./l6.mjs";
const HT = join(TREE.cand, "scripts", "hub-talk.mjs");
const envFor = (url) => { const e = { ...process.env, HUB_URL: url, A2A_KEY_DIR: join(TMP, "keys") }; delete e.AGENT_KEY; delete e.ANTHROPIC_API_KEY; return e; };
const talk = (url, args) => { const r = spawnSync(process.execPath, [HT, ...args], { env: envFor(url), encoding: "utf8", timeout: 90_000 }); return { rc: r.status, out: ((r.stdout ?? "") + (r.stderr ?? "")).replace(/\r/g, "").trim() }; };
const kfile = (url, name) => { const u = new URL(url); return join(TMP, "keys", `${u.hostname}-${u.port}`, `${name}.key`); };
const OLD = { warn: H.ooW, strict: "http://127.0.0.1:4721" }, NEW = { warn: H.nW, strict: H.nS };
const cls = (s) => (typeof s === "number" ? `${Math.floor(s / 100)}xx` : String(s));
const clip = (t) => String(t).replace(/\s+/g, " ").slice(0, 160);

// Names present on both databases with the same key: registered codeless through each side's warn hub.
const G = ["qa-g1", "qa-g2"];
for (const n of G) { await register(OLD.warn, n); await register(NEW.warn, n); for (const u of [...Object.values(OLD), ...Object.values(NEW)]) placeKey(n, u); }

// ---------------------------------------------------------------- G1d
setRow("G1d");
for (const mode of ["warn", "strict"]) {
  const o = talk(OLD[mode], ["--as", "qa-g1", "--peer", "qa-nobody-g1d", "--say", "hi"]);
  const c = talk(NEW[mode], ["--as", "qa-g1", "--peer", "qa-nobody-g1d", "--say", "hi"]);
  const msg = (x) => /is not registered on this hub/.test(x.out);
  check(`G1d ${mode}`, "hub-talk --peer <unregistered>: rc 1 and the 'is not registered on this hub' fix-it message, as on v1.11.0", { old: [o.rc, clip(o.out)], cand: [c.rc, clip(c.out)] },
    o.rc === 1 && msg(o) && c.rc === 1 && msg(c));
}

// ---------------------------------------------------------------- G1e: client-matched error text, old vs candidate
setRow("G1e");
const cases = [
  ["hub-talk.mjs:272 /Unknown peer/", /Unknown peer/, (b, m) => hub(b, "POST", "/a2a/session", { as: "qa-g1", body: { title: "g1e", participants: ["qa-g1", "qa-nobody-g1e"], maxTurns: 4 } }), ["warn", "strict"]],
  ["daemon.ts:317 403 /Invalid X-Agent-Key/", /Invalid X-Agent-Key/, (b) => hub(b, "GET", "/a2a/whoami", { rawKey: "qa6-unknown-" + "2".repeat(40) }), ["strict"]],
  ["register: taken name, new key (409)", null, (b) => register(b, "qa-g1", { apiKey: key("qa-g1e-other") }), ["warn", "strict"]],
  ["register: key under 32 chars, existing name", null, (b) => register(b, "qa-g2", { apiKey: "short-key-g1e" }), ["warn", "strict"]],
  ["register: key held by another name", null, (b) => register(b, "qa-g1e-new", { apiKey: key("qa-g2") }), ["warn"]],
];
for (const [label, re, fn, modes] of cases) for (const mode of modes) {
  const o = await fn(OLD[mode]); const c = await fn(NEW[mode]);
  const oe = o.json?.error ?? o.text, ce = c.json?.error ?? c.text;
  const ok = cls(o.status) === cls(c.status) && (!re || (re.test(oe) && re.test(ce)));
  check(`G1e ${label} ${mode}`, "same status class old vs candidate; the client's regex still matches", { old: [o.status, clip(oe)], cand: [c.status, clip(ce)] }, ok);
}

// ---------------------------------------------------------------- G1b: rotate codeless both modes; init-key on an owned name 409
setRow("G1b");
for (const mode of ["warn", "strict"]) {
  const n = `qa-g1b-${mode}`;
  if (mode === "warn") await register(NEW.warn, n); else { const { json } = await issue(NEW.strict, "aaron"); if (json?.code) SECRETS.push(json.code); await register(NEW.strict, n, { code: json?.code }); }
  placeKey(n, NEW[mode]);
  const before = readFileSync(kfile(NEW[mode], n), "utf8").trim();
  const r = talk(NEW[mode], ["--as", n, "--rotate-key"]);
  const after = readFileSync(kfile(NEW[mode], n), "utf8").trim();
  const oldKey = await hub(NEW.strict, "GET", "/a2a/whoami", { rawKey: before });
  const newKey = await hub(NEW[mode], "GET", "/a2a/whoami", { rawKey: after });
  if (!SECRETS.includes(after)) SECRETS.push(after);
  const again = talk(NEW[mode], ["--as", `qa-g1`, "--init-key"]); // qa-g1 holds its own key; this machine has a key file, so initKey exits before any request
  check(`G1b rotate ${mode}`, "--rotate-key works with no code; old key resolves to no name (strict 403); new key is the name", { rc: r.rc, changed: before !== after, oldKeyStrict: oldKey.status, newKey: [newKey.status, newKey.json?.name] },
    r.rc === 0 && before !== after && oldKey.status === 403 && newKey.status === 200 && newKey.json?.name === n);
  check(`G1b init-key on an owned name ${mode} (key file present)`, "refused before any request (hub-key.mjs:173-174), rc != 0", { rc: again.rc, out: clip(again.out) }, again.rc !== 0);
}
{ // the hub-side 409: a fresh key for an owned name, as initKey would send it without a local file
  const w = await register(NEW.warn, "qa-g2", { apiKey: key("qa-g1b-fresh") }); const s = await register(NEW.strict, "qa-g2", { apiKey: key("qa-g1b-fresh") });
  check("G1b init-key on an owned name (hub side)", "409 in both modes", { warn: [w.status, w.json?.error], strict: [s.status, s.json?.error] }, w.status === 409 && s.status === 409);
}

// ---------------------------------------------------------------- G1c: --invite
setRow("G1c");
{ const P = 4793, PL = join(TMP, "g1c-proxy.jsonl");
  const px = spawn(process.execPath, [join(import.meta.dirname, "proxy.mjs"), String(P), NEW.strict, PL], { stdio: "ignore" }); await sleep(1000);
  const stray = talk(`http://127.0.0.1:${P}`, ["--as", "qa-g1c", "--invite", "x", "--peer", "qa-g1"]);
  await sleep(500); const reqs = readFileSync(PL, "utf8").trim().split("\n").filter(Boolean).length;
  const { json } = await issue(NEW.strict, "aaron"); if (json?.code) SECRETS.push(json.code);
  const ok = talk(NEW.strict, ["--as", "qa-g1c-ok", "--init-key", "--invite", json?.code ?? ""]);
  const who = await hub(NEW.strict, "GET", "/a2a/whoami", { rawKey: existsSync(kfile(NEW.strict, "qa-g1c-ok")) ? readFileSync(kfile(NEW.strict, "qa-g1c-ok"), "utf8").trim() : "x" });
  px.kill();
  check("G1c stray --invite", "--invite without --init-key: exit 1 with the usage line, and NO request reaches the hub (proxy count 0)", { rc: stray.rc, out: clip(stray.out), requests: reqs }, stray.rc === 1 && /--invite is only valid with --init-key/.test(stray.out) && reqs === 0);
  check("G1c --init-key --invite", "enrolls a new name in strict", { rc: ok.rc, whoami: [who.status, who.json?.name] }, ok.rc === 0 && who.json?.name === "qa-g1c-ok"); }

const f = summary(join(TMP, "rows-g6.results.txt"));
process.exitCode = f ? 1 : 0;
