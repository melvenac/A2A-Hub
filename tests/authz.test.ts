import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  authzLine,
  bindName,
  enforce,
  isCaller,
  note,
  routeOf,
  shortId,
  sanitize,
  verdict,
} from "../src/authz.js";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function fakeReq(agentName: string | null, route = "/a2a/queue/:agentId", method = "GET"): Request {
  return {
    agentName,
    method,
    baseUrl: "",
    route: { path: route },
    originalUrl: route,
  } as unknown as Request;
}

function fakeRes() {
  const res = { statusCode: 0, body: undefined as unknown };
  const r = {
    status(code: number) {
      res.statusCode = code;
      return r;
    },
    json(body: unknown) {
      res.body = body;
      return r;
    },
  };
  return { res: r as unknown as Response, seen: res };
}

describe("verdict", () => {
  it("allowed is ok in both modes", () => {
    expect(verdict(true, "warn")).toBe("ok");
    expect(verdict(true, "strict")).toBe("ok");
  });
  it("refused only in strict; warn lets it through", () => {
    expect(verdict(false, "warn")).toBe("warn");
    expect(verdict(false, "strict")).toBe("reject");
  });
});

describe("isCaller", () => {
  it("matches only the caller's own name", () => {
    expect(isCaller("relay", "relay")).toBe(true);
    expect(isCaller("atlas", "relay")).toBe(false);
  });
  it("an unknown caller (warn) matches nothing, not even an empty name", () => {
    expect(isCaller("relay", null)).toBe(false);
    expect(isCaller("", "")).toBe(false);
    expect(isCaller(undefined, undefined)).toBe(false);
  });
});

describe("sanitize: a caller-supplied value never carries a key into the log", () => {
  it("masks 32+ key-like runs, strips newlines, caps length", () => {
    const key = "a".repeat(20) + "B9_-" + "c".repeat(20);
    expect(sanitize(key)).toBe("<masked>");
    expect(sanitize(`relay\n[authz] REJECT forged`)).not.toMatch(/\n/);
    expect(sanitize("x".repeat(10) + " " + "y".repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it("leaves ordinary names and ids alone", () => {
    expect(sanitize("qa-a1")).toBe("qa-a1");
    expect(sanitize("k57frxw0ptb8tadmqdwy0khhks8ey006")).toBe("<masked>");
  });
});

describe("shortId", () => {
  it("a 32-character Convex id becomes an 8-character prefix, never a maskable run", () => {
    expect(shortId("k57frxw0ptb8tadmqdwy0khhks8ey006")).toBe("k57frxw0…");
    expect(shortId("0b5d2c1e-9f3a-4e7b-8c6d-1a2b3c4d5e6f")).toBe("0b5d2c1e…");
  });
});

describe("authzLine", () => {
  it("warn says WOULD REJECT and how to enforce; strict says REJECT", () => {
    const w = authzLine("warn", "from=atlas", "POST /a2a/session/:sessionId/message", "relay");
    expect(w).toBe(
      "[authz] WOULD REJECT from=atlas on POST /a2a/session/:sessionId/message caller=relay " +
        "(AUTH_MODE=warn; set AUTH_MODE=strict to enforce)"
    );
    expect(authzLine("reject", "from=atlas", "POST /x", "relay")).toBe(
      "[authz] REJECT from=atlas on POST /x caller=relay"
    );
  });
  it("an unknown caller is logged as unknown", () => {
    expect(authzLine("warn", "unknown-caller", "GET /a2a/sessions", null)).toContain("caller=unknown");
  });
  it("never starts with [auth] (kept apart from key validity, B5)", () => {
    expect(authzLine("warn", "x", "GET /y", "z").startsWith("[authz] ")).toBe(true);
  });
});

describe("routeOf", () => {
  it("is the route template, not the raw path", () => {
    expect(routeOf(fakeReq("relay", "/a2a/session/:sessionId/messages"))).toBe(
      "GET /a2a/session/:sessionId/messages"
    );
  });
});

describe("enforce", () => {
  it("allowed: continues, logs nothing", () => {
    const { res, seen } = fakeRes();
    expect(enforce(fakeReq("relay"), res, true, "x", { status: 403, error: "no" }, "strict")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(seen.statusCode).toBe(0);
  });
  it("warn: continues, sends nothing, logs one WOULD REJECT line", () => {
    const { res, seen } = fakeRes();
    expect(enforce(fakeReq("relay"), res, false, "x", { status: 403, error: "no" }, "warn")).toBe(true);
    expect(seen.statusCode).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[authz\] WOULD REJECT x on GET /);
  });
  it("strict: refuses with the given status and error, logs one REJECT line", () => {
    const { res, seen } = fakeRes();
    expect(
      enforce(fakeReq("relay"), res, false, "x", { status: 404, error: "session not found" }, "strict")
    ).toBe(false);
    expect(seen).toEqual({ statusCode: 404, body: { error: "session not found" } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[authz\] REJECT x on GET /);
  });
});

describe("bindName", () => {
  it("as itself: continues in both modes, no line", () => {
    for (const mode of ["warn", "strict"] as const) {
      const { res } = fakeRes();
      expect(bindName(fakeReq("relay"), res, "relay", "agentId", mode)).toBe(true);
    }
    expect(warn).not.toHaveBeenCalled();
  });
  it("as another name: strict 403 '<field> is not the caller'", () => {
    const { res, seen } = fakeRes();
    expect(bindName(fakeReq("relay"), res, "atlas", "agentId", "strict")).toBe(false);
    expect(seen).toEqual({ statusCode: 403, body: { error: "agentId is not the caller" } });
    expect(String(warn.mock.calls[0][0])).toBe(
      "[authz] REJECT agentId=atlas on GET /a2a/queue/:agentId caller=relay"
    );
  });
  it("reader keeps /read's existing 403 text", () => {
    const { res, seen } = fakeRes();
    bindName(fakeReq("relay"), res, "atlas", "reader", "strict");
    expect(seen.body).toEqual({ error: "reader is not the caller" });
  });
  it("as another name in warn: continues and logs WOULD REJECT", () => {
    const { res, seen } = fakeRes();
    expect(bindName(fakeReq("relay"), res, "atlas", "from", "warn")).toBe(true);
    expect(seen.statusCode).toBe(0);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[authz\] WOULD REJECT from=atlas /);
  });
  it("a key pasted as the asserted name is masked in the line", () => {
    const { res } = fakeRes();
    bindName(fakeReq("relay"), res, "k".repeat(43), "from", "warn");
    expect(String(warn.mock.calls[0][0])).toContain("from=<masked>");
    expect(String(warn.mock.calls[0][0])).not.toContain("k".repeat(32));
  });
});

describe("note", () => {
  it("logs and returns the verdict, sends nothing", () => {
    expect(note("a2a-task=t1", "POST /a2a/jsonrpc", "qa-b1", "strict")).toBe("reject");
    expect(note("a2a-task=t1", "POST /a2a/jsonrpc", "qa-b1", "warn")).toBe("warn");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
