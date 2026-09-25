#!/usr/bin/env node
/**
 * hub-key — per-agent keys on the client side (T-003, Loop 3 design §3).
 *
 * One implementation for every client: hub-talk, daemon.ts, ask-agent, the
 * compliance probe and start-stack.ps1 all resolve keys through here.
 *
 * Where a key lives: $A2A_KEY_DIR/<hub-id>/<name>.key, where A2A_KEY_DIR
 * defaults to ~/.a2a-hub/keys and <hub-id> is HUB_URL's host and port
 * ("127.0.0.1-4000", "100.124.212.87-4000"). The directory is outside every
 * repository. Use ONE spelling per hub (docs/joining-the-hub.md).
 *
 * Resolution: AGENT_KEY if set, else the key file, else fail closed. A key is
 * generated here (32 CSPRNG bytes), goes straight to its file, and is never
 * printed: output names the file and an 8-hex hash prefix only.
 *
 * CLI (rc 0 ok, 1 error):
 *   node scripts/hub-key.mjs init   --as <name> [--hub <url>] [--kind <kind>] [--register]
 *   node scripts/hub-key.mjs rotate --as <name> [--hub <url>]
 *   node scripts/hub-key.mjs check  --names <a,b,...> [--hub <url>]
 *   node scripts/hub-key.mjs copy   --as <name> [--hub <url>]     (to the OS clipboard)
 *   node scripts/hub-key.mjs path   --as <name> [--hub <url>]
 */
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const KEY_FLOOR = 32;
export const DEFAULT_HUB = "http://127.0.0.1:4000";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function keyDir(env = process.env) {
  return env.A2A_KEY_DIR || join(homedir(), ".a2a-hub", "keys");
}

/** "http://100.124.212.87:4000" → "100.124.212.87-4000". */
export function hubId(hubUrl) {
  const u = new URL(hubUrl);
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  return `${u.hostname.toLowerCase()}-${port}`;
}

function checkName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw new Error(`not a usable agent name for a key file: ${JSON.stringify(name)}`);
  }
}

export function keyPath(hubUrl, name, env = process.env) {
  checkName(name);
  return join(keyDir(env), hubId(hubUrl), `${name}.key`);
}

export function generateKey() {
  return randomBytes(32).toString("base64url");
}

/** First 8 hex of the key's sha256 — what K7's read-only check prints. */
export function keyPrefix(key) {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

function readKeyFile(path) {
  if (!existsSync(path)) return null;
  const key = readFileSync(path, "utf8").trim();
  return key || null;
}

function writeKeyFile(path, key, { overwrite = false } = {}) {
  mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${key}\n`, { mode: 0o600, flag: overwrite ? "w" : "wx" });
}

/** Other hub-id directories holding <name>.key: a HUB_URL spelling mismatch. */
export function otherHubDirs(hubUrl, name, env = process.env) {
  const dir = keyDir(env);
  const mine = hubId(hubUrl);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== mine)
    .filter((d) => existsSync(join(dir, d.name, `${name}.key`)))
    .map((d) => d.name);
}

/**
 * The key for `name` on `hubUrl`: { key, source } or { error }. Never throws
 * for a missing key, and the error never contains a key.
 */
export function resolveKey({ hub = DEFAULT_HUB, name, env = process.env }) {
  if (env.AGENT_KEY) return { key: env.AGENT_KEY, source: "env" };
  let path;
  try {
    path = keyPath(hub, name, env);
  } catch (error) {
    return { error: error.message };
  }
  const key = readKeyFile(path);
  if (key) return { key, source: "file", path };
  let error =
    `no key for ${name} on ${hub}: run hub-talk --as ${name} --init-key ` +
    `(looked in ${path}; AGENT_KEY is unset)`;
  const others = otherHubDirs(hub, name, env);
  if (others.length) {
    error +=
      `. Found a key for ${name} under ${others.join(", ")}: ` +
      `your HUB_URL spells this hub differently`;
  }
  return { error };
}

async function hubCall(hub, path, { method = "GET", key, body, fetchImpl = fetch } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers["X-Agent-Key"] = key;
  const res = await fetchImpl(`${hub}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, json };
}

/** Which name `key` authenticates as on `hub` (null if none). */
export async function whoamiWith(hub, key, fetchImpl = fetch) {
  const r = await hubCall(hub, "/a2a/whoami", { key, fetchImpl });
  if (!r.ok) return null;
  return typeof r.json.name === "string" ? r.json.name : null;
}

function describeCard(name, kind) {
  const description =
    kind === "human"
      ? `Human peer ${name}`
      : kind === "ide-session"
        ? `Coding-session peer ${name}`
        : `Agent ${name}`;
  return { name, description, ...(kind ? { kind } : {}) };
}

/**
 * Generate a key for `name` and store it. With `register`, also register the
 * name on the hub with it (a fresh name, or §4.1's migration of a legacy one)
 * and confirm with whoami before the file becomes the name's key.
 */
export async function initKey({
  hub = DEFAULT_HUB,
  name,
  kind,
  register = false,
  env = process.env,
  fetchImpl = fetch,
}) {
  const path = keyPath(hub, name, env);
  if (register) await recoverPending({ hub, name, env, fetchImpl });
  if (existsSync(path)) {
    throw new Error(`${name} already has a key on ${hubId(hub)} (${path}); use rotate`);
  }
  const key = generateKey();
  if (!register) {
    writeKeyFile(path, key);
    return { path, prefix: keyPrefix(key) };
  }
  const next = `${path}.next`;
  writeKeyFile(next, key, { overwrite: true });
  // Delete .next only on a definite refusal. On a transport error the hub may
  // have committed, and recoverPending promotes .next on the next run.
  const r = await hubCall(hub, "/a2a/register", {
    method: "POST",
    body: { name, apiKey: key, agentCard: describeCard(name, kind) },
    fetchImpl,
  });
  if (!r.ok) throw settle(next, r, "register");
  const who = await whoamiWith(hub, key, fetchImpl);
  if (who !== name) {
    throw new Error(
      `registered, but the new key resolves to ${who ?? "no one"}, not ${name}; ` +
        `kept ${next} for the next run to check`
    );
  }
  renameSync(next, path);
  return { path, prefix: keyPrefix(key) };
}

/**
 * A 4xx is a definite refusal: nothing was written, so the pending key goes.
 * A 5xx may follow a commit (the mutation succeeded, a later step failed), so
 * the pending key stays for recoverPending to check on the next run.
 */
function settle(next, r, what) {
  const reason = r.json.error ?? "unknown";
  if (r.status >= 400 && r.status < 500) {
    unlinkSync(next);
    return new Error(`${what} refused (${r.status}): ${reason}`);
  }
  return new Error(`${what} failed (${r.status}): ${reason}; kept ${next} for the next run to check`);
}

/** Replace `name`'s key file key via POST /a2a/rotate (§2). */
export async function rotateKey({ hub = DEFAULT_HUB, name, env = process.env, fetchImpl = fetch }) {
  await recoverPending({ hub, name, env, fetchImpl });
  const path = keyPath(hub, name, env);
  const current = readKeyFile(path);
  if (!current) throw new Error(`no key file for ${name} on ${hubId(hub)} to rotate (${path})`);
  const key = generateKey();
  const next = `${path}.next`;
  writeKeyFile(next, key, { overwrite: true });
  // A definite refusal leaves the old key current, so .next goes. A transport
  // error may follow a commit, so .next stays for recoverPending.
  const r = await hubCall(hub, "/a2a/rotate", {
    method: "POST",
    key: current,
    body: { newApiKey: key },
    fetchImpl,
  });
  if (!r.ok) throw settle(next, r, "rotate");
  renameSync(next, path);
  return { path, prefix: keyPrefix(key) };
}

/**
 * An interrupted --init-key or --rotate-key leaves <name>.key.next. If that key
 * resolves to the name, it is the live key: promote it. Never silent (ADR-013).
 */
export async function recoverPending({ hub = DEFAULT_HUB, name, env = process.env, fetchImpl = fetch, log = console.error }) {
  const path = keyPath(hub, name, env);
  const next = `${path}.next`;
  const pending = readKeyFile(next);
  if (!pending) return false;
  if ((await whoamiWith(hub, pending, fetchImpl)) === name) {
    renameSync(next, path);
    log(`[hub-key] ${name}: promoted an interrupted key change (${keyPrefix(pending)}) to ${path}`);
    return true;
  }
  const current = readKeyFile(path);
  if (current && (await whoamiWith(hub, current, fetchImpl)) === name) {
    unlinkSync(next);
    log(`[hub-key] ${name}: discarded an unused pending key; ${path} is current`);
    return false;
  }
  log(`[hub-key] ${name}: ${next} exists and neither it nor ${path} resolves to ${name}`);
  return false;
}

/** For each name: key file present, and does it resolve to itself? */
export async function checkNames({ hub = DEFAULT_HUB, names, env = process.env, fetchImpl = fetch }) {
  const rows = [];
  for (const name of names) {
    let key = null;
    try {
      key = readKeyFile(keyPath(hub, name, env));
    } catch {
      key = null;
    }
    const who = key ? await whoamiWith(hub, key, fetchImpl) : null;
    rows.push({ name, file: Boolean(key), whoami: who, ok: Boolean(key) && who === name });
  }
  return rows;
}

function copyToClipboard(text) {
  const cmd =
    process.platform === "win32"
      ? ["clip", []]
      : process.platform === "darwin"
        ? ["pbcopy", []]
        : ["xclip", ["-selection", "clipboard"]];
  const r = spawnSync(cmd[0], cmd[1], { input: text, stdio: ["pipe", "ignore", "pipe"] });
  if (r.status !== 0) throw new Error(`could not copy to the clipboard with ${cmd[0]}`);
}

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const cmd = argv[0];
  const hub = flag(argv, "--hub", env.HUB_URL || DEFAULT_HUB);
  const name = flag(argv, "--as");
  const out = (line) => console.log(line);
  try {
    switch (cmd) {
      case "init": {
        const r = await initKey({
          hub,
          name,
          kind: flag(argv, "--kind"),
          register: argv.includes("--register"),
          env,
        });
        out(`key for ${name}@${hubId(hub)} written to ${r.path} (prefix ${r.prefix})`);
        return 0;
      }
      case "rotate": {
        const r = await rotateKey({ hub, name, env });
        out(`key for ${name}@${hubId(hub)} rotated in ${r.path} (prefix ${r.prefix})`);
        return 0;
      }
      case "check": {
        const names = (flag(argv, "--names", "") || "").split(",").filter(Boolean);
        if (!names.length) throw new Error("check needs --names <a,b,...>");
        const rows = await checkNames({ hub, names, env });
        for (const r of rows) {
          out(`${r.ok ? "ok  " : "FAIL"} ${r.name}: key file ${r.file ? "yes" : "no"}, whoami ${r.whoami ?? "null"}`);
        }
        return rows.every((r) => r.ok) ? 0 : 1;
      }
      case "copy": {
        const r = resolveKey({ hub, name, env: { ...env, AGENT_KEY: "" } });
        if (r.error) throw new Error(r.error);
        copyToClipboard(r.key);
        out(`copied key for ${name}@${hubId(hub)} to the clipboard (prefix ${keyPrefix(r.key)})`);
        return 0;
      }
      case "path":
        out(keyPath(hub, name, env));
        return 0;
      default:
        throw new Error("usage: hub-key.mjs <init|rotate|check|copy|path> --as <name> [--hub <url>]");
    }
  } catch (error) {
    console.error(`[hub-key] ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}
