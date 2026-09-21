import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { askDeniedReason, evaluateAsk } from "../src/ask-policy.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("evaluateAsk", () => {
  it("absent policy allows anyone", () => {
    expect(evaluateAsk(undefined, "alice")).toBe("allow");
    expect(evaluateAsk(null, "bob")).toBe("allow");
    expect(evaluateAsk(undefined, null)).toBe("allow");
  });

  it("present policy allows a listed asker", () => {
    expect(evaluateAsk({ allow: ["alice", "aaron"] }, "alice")).toBe("allow");
  });

  it("present policy 403s an unlisted asker with the reason", () => {
    expect(evaluateAsk({ allow: ["alice"] }, "mallory")).toBe("deny");
    expect(askDeniedReason("mallory", "gitnexus")).toBe(
      "askPolicy does not allow mallory to ask gitnexus"
    );
  });

  it("unauthenticated/legacy caller path behaves as today", () => {
    expect(evaluateAsk({ allow: ["alice"] }, null)).toBe("allow");
    expect(evaluateAsk({ allow: ["alice"] }, undefined)).toBe("allow");
    expect(evaluateAsk({ allow: ["alice"] }, "")).toBe("allow");
  });

  it("empty allow list is present policy, not absent", () => {
    expect(evaluateAsk({ allow: [] }, "alice")).toBe("deny");
  });
});

describe("named-peer HTTP enforcement", () => {
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

  function mount(getByName: ReturnType<typeof vi.fn>) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.agentName = (req.headers["x-agent-name"] as string | undefined) ?? null;
      next();
    });
    app.post("/a2a/message/send", async (req, res) => {
      const to = req.body?.params?.to;
      if (typeof to === "string" && to) {
        const target = await getByName(to);
        if (evaluateAsk(target?.askPolicy, req.agentName) === "deny") {
          return res.status(403).json({
            error: "askPolicy denied",
            reason: askDeniedReason(req.agentName as string, to),
          });
        }
      }
      res.json({ ok: true });
    });
    return app;
  }

  it("present policy 403s an unlisted asker with the reason", async () => {
    const getByName = vi.fn().mockResolvedValue({
      name: "gitnexus",
      askPolicy: { allow: ["aaron"] },
    });
    const { port, close } = await listen(mount(getByName));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/a2a/message/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-name": "mallory" },
        body: JSON.stringify({ params: { to: "gitnexus", message: { parts: [{ text: "hi" }] } } }),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: "askPolicy denied",
        reason: "askPolicy does not allow mallory to ask gitnexus",
      });
    } finally {
      await close();
    }
  });

  it("absent policy allows anyone", async () => {
    const getByName = vi.fn().mockResolvedValue({ name: "gitnexus" });
    const { port, close } = await listen(mount(getByName));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/a2a/message/send`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-name": "mallory" },
        body: JSON.stringify({ params: { to: "gitnexus" } }),
      });
      expect(res.status).toBe(200);
    } finally {
      await close();
    }
  });
});
