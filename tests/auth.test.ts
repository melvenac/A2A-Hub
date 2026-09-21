import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { ConvexHttpClient } from "convex/browser";
import type { NextFunction, Request, Response } from "express";

type AuthMode = "warn" | "strict";

function mockRes() {
  const res = {} as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(headers: Record<string, string> = {}, path = "/heartbeat") {
  return {
    headers,
    method: "GET",
    path,
  } as unknown as Request;
}

async function loadAuth(mode: AuthMode) {
  vi.resetModules();
  if (mode === "strict") {
    process.env.AUTH_MODE = "strict";
  } else {
    delete process.env.AUTH_MODE;
  }
  return import("../src/auth.js");
}

async function invoke(
  mode: AuthMode,
  opts: {
    headers?: Record<string, string>;
    path?: string;
    queryResult?: { name: string } | null;
    queryError?: Error;
  } = {}
) {
  const { requireAgentKey } = await loadAuth(mode);
  const query = vi.fn();
  if (opts.queryError) {
    query.mockRejectedValue(opts.queryError);
  } else {
    query.mockResolvedValue(opts.queryResult ?? null);
  }
  const convex = { query } as unknown as ConvexHttpClient;
  const mw = requireAgentKey(convex);
  const req = mockReq(opts.headers, opts.path);
  const res = mockRes();
  const next = vi.fn() as unknown as NextFunction;
  await mw(req, res, next);
  return { req, res, next, query };
}

afterEach(() => {
  delete process.env.AUTH_MODE;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("requireAgentKey", () => {
  it.each(["warn", "strict"] as const)(
    "missing header -> 401 in %s",
    async (mode) => {
      const { res, next, query } = await invoke(mode);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Missing X-Agent-Key" });
      expect(next).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    }
  );

  it("unknown key -> 403 in strict, next() not called", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { res, next } = await invoke("strict", {
      headers: { "x-agent-key": "bogus" },
      queryResult: null,
    });

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid X-Agent-Key" });
    expect(next).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("unknown key -> next() in warn, req.agentName === null, warning logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { req, res, next } = await invoke("warn", {
      headers: { "x-agent-key": "bogus" },
      queryResult: null,
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.agentName).toBeNull();
    expect(res.status).not.toHaveBeenCalled();
    expect(warn.mock.calls.some((call) => String(call[0]).includes("WOULD REJECT"))).toBe(true);
  });

  it("valid key -> next() called, req.agentName === the registered name", async () => {
    const { req, res, next, query } = await invoke("strict", {
      headers: { "x-agent-key": "alice-secret" },
      queryResult: { name: "alice" },
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.agentName).toBe("alice");
    expect(res.status).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
  });

  it("convex query throws -> 503", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, next } = await invoke("strict", {
      headers: { "x-agent-key": "alice-secret" },
      queryError: new Error("ECONNREFUSED"),
    });

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "Auth backend unavailable" });
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it("/register reachable without a key", async () => {
    const { requireAgentKey } = await loadAuth("strict");
    const query = vi.fn();
    const convex = { query } as unknown as ConvexHttpClient;
    const guardAgentKey = requireAgentKey(convex);

    const app = express();
    // Same exemption the hub mounts in src/index.ts — registration is how a
    // key is obtained, so the prefix guard cannot demand one here.
    app.use("/a2a", (req, res, next) => {
      if (req.path === "/register") return next();
      return guardAgentKey(req, res, next);
    });
    app.post("/a2a/register", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const server = await new Promise<import("node:http").Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });

    try {
      const { port } = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${port}/a2a/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(query).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
