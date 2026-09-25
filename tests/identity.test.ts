import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import {
  decideHeartbeat,
  decideRegister,
  INSTANCE_LIVENESS_MS,
  isSupersededError,
} from "../src/identity.js";
import { makeRegisterHandler } from "../src/keys.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// 32+ characters: test-only keys, registered on no stack (Loop 3 O6).
const K1 = "k1-test-key-000000000000000000000000";
const OTHER = "other-test-key-000000000000000000000";

// decideRegister replaced evaluateNameClaim (Loop 3 §7). The name-claim cases
// that used to live here are the owned-name rows of its table.
describe("decideRegister (Layer A, Loop 3 §7)", () => {
  const owned = { apiKeyHash: "abc", keyStatus: "owned" as const };
  const base = { heldByOtherName: false, keyTooShort: false };

  it("same-hash re-register of an owned name is silent in both modes", () => {
    for (const strict of [false, true]) {
      expect(decideRegister({ ...base, existing: owned, presentedHash: "abc", strict })).toEqual({
        kind: "same",
        legacy: false,
      });
    }
  });

  it("first register (no existing row) inserts", () => {
    expect(
      decideRegister({ ...base, existing: null, presentedHash: "abc", strict: true }).kind
    ).toBe("insert");
  });

  it("different-hash claim on an owned name is 409 in warn as well as strict (C7)", () => {
    for (const strict of [false, true]) {
      expect(decideRegister({ ...base, existing: owned, presentedHash: "def", strict })).toMatchObject({
        kind: "refuse",
        status: 409,
      });
    }
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

describe("register HTTP (src/keys.ts makeRegisterHandler)", () => {
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

  function mount(
    convex: { query: ReturnType<typeof vi.fn>; mutation: ReturnType<typeof vi.fn> },
    mode: "warn" | "strict"
  ) {
    const app = express();
    app.use(express.json());
    app.post(
      "/a2a/register",
      makeRegisterHandler({ convex: convex as any, authMode: mode, notifyHuman: async () => {} })
    );
    return app;
  }

  async function post(app: express.Express, body: unknown) {
    const { port, close } = await listen(app);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/a2a/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    } finally {
      await close();
    }
  }

  /** A refusal as the Convex client delivers it: ConvexError with data. */
  function refusal(status: number, reason: string) {
    return Object.assign(new Error(reason), { data: { status, reason } });
  }

  it("a same-hash re-register is silent and registers the peer", async () => {
    const convex = {
      query: vi.fn(),
      mutation: vi.fn().mockResolvedValue({ id: "id", event: "same" }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await post(mount(convex, "strict"), { name: "alice", apiKey: K1 });
    expect(r.status).toBe(200);
    expect(convex.mutation).toHaveBeenCalledTimes(2); // registerAgent, peers.ensure
    expect(warn).not.toHaveBeenCalled();
  });

  it("passes the key floor and the mode to the mutation, never the key", async () => {
    const convex = {
      query: vi.fn(),
      mutation: vi.fn().mockResolvedValue({ id: "id", event: "insert" }),
    };
    await post(mount(convex, "strict"), { name: "alice", apiKey: "short" });
    const args = convex.mutation.mock.calls[0][1];
    expect(args).toMatchObject({ name: "alice", keyTooShort: true, strict: true });
    expect(JSON.stringify(args)).not.toContain("short\"");
    expect(args.apiKeyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a mutation refusal becomes its status and registers no peer (C7, both modes)", async () => {
    for (const mode of ["warn", "strict"] as const) {
      const convex = {
        query: vi.fn(),
        mutation: vi.fn().mockRejectedValue(refusal(409, "name holds its own key; use rotate")),
      };
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = await post(mount(convex, mode), { name: "alice", apiKey: OTHER });
      expect(r.status).toBe(409);
      expect(r.json.error).toContain("own key");
      expect(convex.mutation).toHaveBeenCalledOnce(); // no peers.ensure
    }
  });

  it("a legacy re-register in warn is logged, and a migration is logged", async () => {
    for (const [event, text] of [
      ["legacy-same", "WOULD REJECT legacy key on register alice"],
      ["migrate", "MIGRATE alice"],
    ]) {
      const convex = { query: vi.fn(), mutation: vi.fn().mockResolvedValue({ id: "id", event }) };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const r = await post(mount(convex, "warn"), { name: "alice", apiKey: OTHER });
      expect(r.status).toBe(200);
      expect(warn.mock.calls.some((c) => String(c[0]).includes(text))).toBe(true);
      warn.mockRestore();
    }
  });

  it("a human-kind card makes a human peer; anything else an agent peer (§12 H1)", async () => {
    for (const [card, type] of [
      [{ name: "aaron", kind: "human" }, "human"],
      [{ name: "alice", kind: "ide-session" }, "agent"],
    ] as const) {
      const convex = {
        query: vi.fn(),
        mutation: vi.fn().mockResolvedValue({ id: "id", event: "insert" }),
      };
      await post(mount(convex, "warn"), { name: card.name, apiKey: K1, agentCard: card });
      expect(convex.mutation.mock.calls[1][1]).toEqual({ name: card.name, type });
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
