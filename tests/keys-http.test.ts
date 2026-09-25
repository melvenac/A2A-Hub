import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { makeRotateHandler, whoami } from "../src/keys.js";
import { checkReader } from "../src/auth.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const CURRENT = "current-test-key-000000000000000000";
const NEXT = "next-test-key-00000000000000000000000";

async function call(
  app: express.Express,
  method: string,
  path: string,
  { key, body }: { key?: string; body?: unknown } = {}
) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(key ? { "x-agent-key": key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

/** Mount a handler behind a stand-in guard that sets req.agentName. */
function mount(agentName: string | null, route: string, handler: express.RequestHandler, method = "post") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.agentName = agentName;
    next();
  });
  (app as any)[method](route, handler);
  return app;
}

describe("POST /a2a/rotate (§2.1)", () => {
  it("rotates for a caller the guard resolved; the name comes from the key, not the body", async () => {
    const convex = { query: vi.fn(), mutation: vi.fn().mockResolvedValue({ ok: true }) };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await call(mount("alice", "/a2a/rotate", makeRotateHandler({ convex: convex as any })), "POST", "/a2a/rotate", {
      key: CURRENT,
      body: { newApiKey: NEXT, name: "bob" },
    });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, name: "alice" });
    const args = convex.mutation.mock.calls[0][1];
    expect(args.name).toBe("alice");
    expect(args.currentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.newHash).not.toBe(args.currentHash);
    expect(JSON.stringify(r.json)).not.toContain(NEXT);
  });

  it("fails closed without a resolved caller (wrong, legacy or no key), in warn too", async () => {
    const convex = { query: vi.fn(), mutation: vi.fn() };
    const r = await call(mount(null, "/a2a/rotate", makeRotateHandler({ convex: convex as any })), "POST", "/a2a/rotate", {
      key: "wrong",
      body: { newApiKey: NEXT },
    });
    expect(r.status).toBe(403);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("refuses a short new key or the same key (400)", async () => {
    const convex = { query: vi.fn(), mutation: vi.fn() };
    const app = mount("alice", "/a2a/rotate", makeRotateHandler({ convex: convex as any }));
    expect((await call(app, "POST", "/a2a/rotate", { key: CURRENT, body: { newApiKey: "short" } })).status).toBe(400);
    expect((await call(app, "POST", "/a2a/rotate", { key: CURRENT, body: { newApiKey: CURRENT } })).status).toBe(400);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("a mutation refusal (stale key, U1) becomes its status", async () => {
    const convex = {
      query: vi.fn(),
      mutation: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { data: { status: 409, reason: "stale key" } })),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await call(mount("alice", "/a2a/rotate", makeRotateHandler({ convex: convex as any })), "POST", "/a2a/rotate", {
      key: CURRENT,
      body: { newApiKey: NEXT },
    });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("stale key");
  });
});

describe("GET /a2a/whoami (§2.4)", () => {
  it("returns the caller's name, or null", async () => {
    expect((await call(mount("alice", "/a2a/whoami", whoami, "get"), "GET", "/a2a/whoami")).json).toEqual({ name: "alice" });
    expect((await call(mount(null, "/a2a/whoami", whoami, "get"), "GET", "/a2a/whoami")).json).toEqual({ name: null });
  });
});

describe("checkReader: POST /read's reader must be the caller (§5, K4)", () => {
  it("ok when they match, in both modes", () => {
    expect(checkReader("alice", "alice", "warn")).toBe("ok");
    expect(checkReader("alice", "alice", "strict")).toBe("ok");
  });

  it("a mismatch or an unknown caller: warn logs, strict rejects", () => {
    for (const caller of ["bob", null, undefined]) {
      expect(checkReader("alice", caller, "warn")).toBe("warn");
      expect(checkReader("alice", caller, "strict")).toBe("reject");
    }
  });
});
