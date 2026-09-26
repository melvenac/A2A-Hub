import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkNames,
  hubId,
  initKey,
  keyPath,
  keyPrefix,
  recoverPending,
  resolveKey,
  rotateKey,
} from "../scripts/hub-key.mjs";

const HUB = "http://100.124.212.87:4000";
let dir: string;
let env: Record<string, string>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hub-key-"));
  env = { A2A_KEY_DIR: dir };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A fake hub: register/rotate/whoami over a name → key map. */
function fakeHub(opts: { registerStatus?: number; rotateStatus?: number } = {}) {
  const keys = new Map<string, string>();
  const calls: { path: string; key?: string; body?: any }[] = [];
  const fetchImpl = async (url: string, init: any) => {
    const path = new URL(url).pathname;
    const key = init.headers["X-Agent-Key"];
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, key, body });
    const reply = (status: number, json: unknown) =>
      ({ ok: status < 400, status, text: async () => JSON.stringify(json) }) as any;
    if (path === "/a2a/whoami") {
      const name = [...keys].find(([, k]) => k === key)?.[0] ?? null;
      return reply(200, { name });
    }
    if (path === "/a2a/register") {
      const status = opts.registerStatus ?? 200;
      if (status < 400) keys.set(body.name, body.apiKey);
      return reply(status, status < 400 ? { ok: true } : { error: "refused" });
    }
    if (path === "/a2a/rotate") {
      const name = [...keys].find(([, k]) => k === key)?.[0];
      const status = opts.rotateStatus ?? (name ? 200 : 403);
      if (status < 400 && name) keys.set(name, body.newApiKey);
      return reply(status, status < 400 ? { ok: true, name } : { error: "refused" });
    }
    return reply(404, {});
  };
  return { keys, calls, fetchImpl };
}

describe("where keys live (§3.2)", () => {
  it("hub-id is host and port, one directory per hub spelling", () => {
    expect(hubId("http://100.124.212.87:4000")).toBe("100.124.212.87-4000");
    expect(hubId("http://127.0.0.1:4000/")).toBe("127.0.0.1-4000");
    expect(hubId("https://hub.example.com")).toBe("hub.example.com-443");
  });

  it("honours A2A_KEY_DIR (N.5) and refuses path-like names", () => {
    expect(keyPath(HUB, "relay", env)).toBe(join(dir, "100.124.212.87-4000", "relay.key"));
    expect(() => keyPath(HUB, "../x", env)).toThrow();
  });
});

describe("resolveKey fails closed (§3.2, K5)", () => {
  it("AGENT_KEY wins, then the key file", () => {
    mkdirSync(join(dir, "100.124.212.87-4000"), { recursive: true });
    writeFileSync(join(dir, "100.124.212.87-4000", "relay.key"), "file-key\n");
    expect(resolveKey({ hub: HUB, name: "relay", env })).toMatchObject({ key: "file-key", source: "file" });
    expect(resolveKey({ hub: HUB, name: "relay", env: { ...env, AGENT_KEY: "env-key" } })).toMatchObject({
      key: "env-key",
      source: "env",
    });
  });

  it("no key means an error naming --init-key, never a default", () => {
    const r = resolveKey({ hub: HUB, name: "relay", env });
    expect(r.key).toBeUndefined();
    expect(r.error).toContain("--init-key");
  });

  it("a key under another spelling of the hub is named in the error (paths only)", () => {
    mkdirSync(join(dir, "tcm-4000"), { recursive: true });
    writeFileSync(join(dir, "tcm-4000", "relay.key"), "secret-under-other-spelling\n");
    const r = resolveKey({ hub: HUB, name: "relay", env });
    expect(r.error).toContain("tcm-4000");
    expect(r.error).not.toContain("secret-under-other-spelling");
  });
});

describe("initKey (--init-key)", () => {
  it("without --register: writes a 43-char key file, returns only its prefix, and does not call the hub", async () => {
    const fetchImpl = () => {
      throw new Error("hub was called");
    };
    const r = await initKey({ hub: HUB, name: "alice", env, fetchImpl });
    const key = readFileSync(r.path, "utf8").trim();
    expect(key).toHaveLength(43);
    expect(r.prefix).toBe(keyPrefix(key));
    expect(JSON.stringify(r)).not.toContain(key);
  });

  it("with --register: registers, confirms with whoami, then stores", async () => {
    const hub = fakeHub();
    const r = await initKey({ hub: HUB, name: "relay", register: true, env, fetchImpl: hub.fetchImpl });
    expect(hub.keys.get("relay")).toBe(readFileSync(r.path, "utf8").trim());
    expect(hub.calls.map((c) => c.path)).toEqual(["/a2a/register", "/a2a/whoami"]);
    expect(hub.calls[0].body.enrollmentCode).toBeUndefined();
    expect(existsSync(`${r.path}.next`)).toBe(false);
  });

  it("passes enrollmentCode only when --invite gave one", async () => {
    const hub = fakeHub();
    await initKey({
      hub: HUB,
      name: "relay",
      register: true,
      enrollmentCode: "invite-code",
      env,
      fetchImpl: hub.fetchImpl,
    });
    expect(hub.calls[0].body.enrollmentCode).toBe("invite-code");
  });

  it("a 4xx refusal leaves no key file and no pending key", async () => {
    const hub = fakeHub({ registerStatus: 409 });
    await expect(initKey({ hub: HUB, name: "relay", register: true, env, fetchImpl: hub.fetchImpl })).rejects.toThrow(
      /refused \(409\)/
    );
    const path = keyPath(HUB, "relay", env);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.next`)).toBe(false);
  });

  it("a 5xx may follow a commit, so the pending key is kept for recovery", async () => {
    const hub = fakeHub({ registerStatus: 500 });
    await expect(initKey({ hub: HUB, name: "relay", register: true, env, fetchImpl: hub.fetchImpl })).rejects.toThrow(
      /kept/
    );
    expect(existsSync(`${keyPath(HUB, "relay", env)}.next`)).toBe(true);
  });

  it("refuses to overwrite an existing key", async () => {
    await initKey({ hub: HUB, name: "alice", env });
    await expect(initKey({ hub: HUB, name: "alice", env })).rejects.toThrow(/already has a key/);
  });
});

describe("rotateKey (--rotate-key) and recoverPending", () => {
  it("rotates: the file holds the new key, the hub accepted the old one as proof", async () => {
    const hub = fakeHub();
    const first = await initKey({ hub: HUB, name: "relay", register: true, env, fetchImpl: hub.fetchImpl });
    const oldKey = readFileSync(first.path, "utf8").trim();
    await rotateKey({ hub: HUB, name: "relay", env, fetchImpl: hub.fetchImpl });
    const newKey = readFileSync(first.path, "utf8").trim();
    expect(newKey).not.toBe(oldKey);
    expect(hub.keys.get("relay")).toBe(newKey);
    expect(hub.calls.find((c) => c.path === "/a2a/rotate")?.key).toBe(oldKey);
  });

  it("a refused rotation keeps the old key", async () => {
    const hub = fakeHub();
    const first = await initKey({ hub: HUB, name: "relay", register: true, env, fetchImpl: hub.fetchImpl });
    const oldKey = readFileSync(first.path, "utf8").trim();
    const refusing = fakeHub({ rotateStatus: 409 });
    refusing.keys.set("relay", oldKey);
    await expect(rotateKey({ hub: HUB, name: "relay", env, fetchImpl: refusing.fetchImpl })).rejects.toThrow();
    expect(readFileSync(first.path, "utf8").trim()).toBe(oldKey);
    expect(existsSync(`${first.path}.next`)).toBe(false);
  });

  it("promotes a pending key that resolves to the name, and says so", async () => {
    const hub = fakeHub();
    const path = keyPath(HUB, "relay", env);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(`${path}.next`, "live-pending-key\n");
    hub.keys.set("relay", "live-pending-key");
    const log = vi.fn();
    expect(await recoverPending({ hub: HUB, name: "relay", env, fetchImpl: hub.fetchImpl, log })).toBe(true);
    expect(readFileSync(path, "utf8").trim()).toBe("live-pending-key");
    expect(String(log.mock.calls[0][0])).not.toContain("live-pending-key");
  });
});

describe("checkNames (§3.6's gate for the checkout update)", () => {
  it("ok only for a name with a key file whose key resolves to itself", async () => {
    const hub = fakeHub();
    await initKey({ hub: HUB, name: "relay", register: true, env, fetchImpl: hub.fetchImpl });
    const rows = await checkNames({ hub: HUB, names: ["relay", "grok"], env, fetchImpl: hub.fetchImpl });
    expect(rows).toEqual([
      { name: "relay", file: true, whoami: "relay", ok: true },
      { name: "grok", file: false, whoami: null, ok: false },
    ]);
  });
});

describe("hub-talk with no key (K5)", () => {
  it("exits 1 naming --init-key, before any network call", async () => {
    const { createServer } = await import("node:http");
    const { execFile } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end("{}");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const { port } = server.address() as { port: number };
    const script = fileURLToPath(new URL("../scripts/hub-talk.mjs", import.meta.url));
    const childEnv = { ...process.env, HUB_URL: `http://127.0.0.1:${port}`, A2A_KEY_DIR: dir };
    delete childEnv.AGENT_KEY;
    try {
      const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
        execFile(process.execPath, [script, "--as", "nokey", "--inbox"], { env: childEnv }, (err, _o, stderr) =>
          resolve({ code: err ? (err as any).code : 0, stderr })
        );
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("--init-key");
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
