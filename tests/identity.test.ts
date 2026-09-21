import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import {
  decideHeartbeat,
  evaluateNameClaim,
  INSTANCE_LIVENESS_MS,
  isSupersededError,
} from "../src/identity.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("evaluateNameClaim (Layer A)", () => {
  it("same-hash re-register is silent", () => {
    expect(evaluateNameClaim("abc", "abc", "warn")).toBe("ok");
    expect(evaluateNameClaim("abc", "abc", "strict")).toBe("ok");
  });

  it("first register (no existing row) is ok", () => {
    expect(evaluateNameClaim(undefined, "abc", "strict")).toBe("ok");
  });

  it("different-hash claim logs in warn and 409s in strict", () => {
    expect(evaluateNameClaim("abc", "def", "warn")).toBe("warn");
    expect(evaluateNameClaim("abc", "def", "strict")).toBe("reject");
  });
});

describe("decideHeartbeat (Layer B)", () => {
  const now = 1_000_000;

  it("no-instanceId client is unaffected in every case", () => {
    expect(
      decideHeartbeat({ now, activeInstanceId: "Y", lastHeartbeatAt: now })
    ).toBe("legacy");
    expect(
      decideHeartbeat({
        now,
        instanceId: undefined,
        activeInstanceId: "Y",
        lastHeartbeatAt: now - 10,
      })
    ).toBe("legacy");
  });

  it("stale instance is replaced", () => {
    expect(
      decideHeartbeat({
        now,
        instanceId: "X",
        activeInstanceId: "Y",
        lastHeartbeatAt: now - INSTANCE_LIVENESS_MS - 1,
      })
    ).toBe("active");
  });

  it("fresh instance is superseded by a newer one and learns it on its next heartbeat", () => {
    // X registered (takeover lives in register, not here). Y's next heartbeat:
    expect(
      decideHeartbeat({
        now,
        instanceId: "Y",
        activeInstanceId: "X",
        lastHeartbeatAt: now - 1_000,
      })
    ).toBe("superseded");
  });

  it("active instance renews", () => {
    expect(
      decideHeartbeat({
        now,
        instanceId: "X",
        activeInstanceId: "X",
        lastHeartbeatAt: now - 1_000,
      })
    ).toBe("active");
  });

  it("missing lastHeartbeatAt is treated as stale", () => {
    expect(
      decideHeartbeat({
        now,
        instanceId: "X",
        activeInstanceId: "Y",
      })
    ).toBe("active");
  });
});

describe("register HTTP name claim", () => {
  async function listen(app: express.Express) {
    const server = await new Promise<import("node:http").Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as { port: number };
    return {
      port,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
  }

  function mount(convex: { query: ReturnType<typeof vi.fn>; mutation: ReturnType<typeof vi.fn> }, mode: "warn" | "strict") {
    const app = express();
    app.use(express.json());
    app.post("/a2a/register", async (req, res) => {
      const { name, apiKey } = req.body;
      const apiKeyHash = `hash:${apiKey}`;
      const existing = await convex.query("getByName", { name });
      const claim = evaluateNameClaim(existing?.apiKeyHash, apiKeyHash, mode);
      if (claim === "reject") {
        return res.status(409).json({ error: "Name claimed by a different identity" });
      }
      if (claim === "warn") {
        console.warn(`[auth] WOULD REJECT name claim on ${name}`);
      }
      await convex.mutation("register", { name, apiKeyHash, instanceId: req.body.instanceId });
      res.json({ ok: true });
    });
    return app;
  }

  it("same-hash re-register is silent and calls register", async () => {
    const convex = {
      query: vi.fn().mockResolvedValue({ name: "alice", apiKeyHash: "hash:k1" }),
      mutation: vi.fn().mockResolvedValue("id"),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = mount(convex, "strict");
    const { port, close } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/a2a/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "alice", apiKey: "k1" }),
      });
      expect(res.status).toBe(200);
      expect(convex.mutation).toHaveBeenCalledOnce();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("different-hash claim 409s in strict and does not register", async () => {
    const convex = {
      query: vi.fn().mockResolvedValue({ name: "alice", apiKeyHash: "hash:owner" }),
      mutation: vi.fn(),
    };
    const app = mount(convex, "strict");
    const { port, close } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/a2a/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "alice", apiKey: "other" }),
      });
      expect(res.status).toBe(409);
      expect(convex.mutation).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("different-hash claim logs in warn and still registers", async () => {
    const convex = {
      query: vi.fn().mockResolvedValue({ name: "alice", apiKeyHash: "hash:owner" }),
      mutation: vi.fn().mockResolvedValue("id"),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = mount(convex, "warn");
    const { port, close } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/a2a/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "alice", apiKey: "other" }),
      });
      expect(res.status).toBe(200);
      expect(convex.mutation).toHaveBeenCalledOnce();
      expect(warn.mock.calls.some((c) => String(c[0]).includes("WOULD REJECT name claim"))).toBe(true);
    } finally {
      await close();
    }
  });
});

describe("heartbeat HTTP + superseded", () => {
  it("no-instanceId client is unaffected", async () => {
    const mutation = vi.fn().mockResolvedValue({ ok: true });
    const app = express();
    app.use(express.json());
    app.post("/a2a/heartbeat/:agentId", async (req, res) => {
      const instanceId =
        typeof req.body?.instanceId === "string" ? req.body.instanceId : undefined;
      const result = await mutation({ name: req.params.agentId, instanceId });
      if (result?.superseded) return res.status(409).json({ error: "superseded" });
      res.json({ ok: true });
    });
    const server = await new Promise<import("node:http").Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const { port } = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}/a2a/heartbeat/alice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      expect(mutation).toHaveBeenCalledWith({ name: "alice", instanceId: undefined });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("superseded heartbeat is 409 and daemon recognises it", async () => {
    expect(
      isSupersededError({
        message: `/a2a/heartbeat/alice → 409: ${JSON.stringify({ error: "superseded" })}`,
      })
    ).toBe(true);
    expect(isSupersededError({ message: "/a2a/heartbeat/alice → 500: boom" })).toBe(false);
  });
});
