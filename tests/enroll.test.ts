import { describe, expect, it } from "vitest";
import express from "express";
import { cardForStore, ENROLL_TEXT, judgeCode } from "../convex/enrollLogic.js";
import { clientError, mountTrailingNotFound } from "../src/httpError.js";
import { TASK_NOT_FOUND } from "../src/authz.js";
import { charge, GLOBAL_BUCKET, GLOBAL_LIMIT, nameBucket, PER_KEY_LIMIT, resetLimits } from "../src/rateLimit.js";
import { isWellFormedTaskId } from "../src/taskId.js";
import { randomUUID } from "node:crypto";
import { enrollLine } from "../src/authz.js";

describe("judgeCode", () => {
  const now = 1_000_000;
  const row = { issuer: "aaron", expiresAt: now + 1000 };

  it("accepts a live unused code", () => {
    expect(judgeCode(row, now)).toBe("ok");
  });

  it("names a missing, used, and expired code apart", () => {
    expect(judgeCode(null, now)).toBe("not-valid");
    expect(judgeCode({ ...row, usedAt: now - 1 }, now)).toBe("used");
    expect(judgeCode({ ...row, expiresAt: now }, now)).toBe("expired");
  });
});

describe("cardForStore", () => {
  it("drops kind human unless the stored row is already human", () => {
    expect(cardForStore({ name: "n", kind: "human" }, false)).toEqual({ name: "n" });
    expect(cardForStore({ name: "n", kind: "human" }, true)).toEqual({ name: "n", kind: "human" });
    expect(cardForStore({ name: "n", kind: "agent" }, false)).toEqual({ name: "n", kind: "agent" });
  });
});

describe("rate window", () => {
  it("allows 3150 on a name and refuses the next", () => {
    resetLimits();
    const now = 5_000_000;
    for (let i = 0; i < PER_KEY_LIMIT; i++) {
      expect(charge(nameBucket("alice"), PER_KEY_LIMIT, now).ok).toBe(true);
    }
    const blocked = charge(nameBucket("alice"), PER_KEY_LIMIT, now);
    expect(blocked.ok).toBe(false);
    expect(PER_KEY_LIMIT).toBe(3150);
    expect(GLOBAL_LIMIT).toBe(90);
  });

  it("a name bucket does not spend the global bucket", () => {
    resetLimits();
    const now = 6_000_000;
    expect(charge(nameBucket("alice"), PER_KEY_LIMIT, now).ok).toBe(true);
    expect(charge(GLOBAL_BUCKET, GLOBAL_LIMIT, now).ok).toBe(true);
  });

  it("an agent named global does not share the global bucket", () => {
    resetLimits();
    const now = 7_000_000;
    for (let i = 0; i < GLOBAL_LIMIT; i++) {
      expect(charge(GLOBAL_BUCKET, GLOBAL_LIMIT, now).ok).toBe(true);
    }
    expect(charge(GLOBAL_BUCKET, GLOBAL_LIMIT, now).ok).toBe(false);
    expect(charge(nameBucket("global"), PER_KEY_LIMIT, now).ok).toBe(true);
    expect(nameBucket("global")).not.toBe(GLOBAL_BUCKET);
  });
});

describe("task ids", () => {
  it("accepts a UUID v4 and refuses other strings", () => {
    expect(isWellFormedTaskId(randomUUID())).toBe(true);
    expect(isWellFormedTaskId("not-an-id")).toBe(false);
    expect(isWellFormedTaskId("k575twereq1w6f2s3yra5zk5618f4rty")).toBe(false);
  });

  it("a missing UUID is the task-not-found body, which claim does not use", () => {
    expect(TASK_NOT_FOUND).toEqual({ status: 404, error: "task not found" });
  });
});

describe("unmatched routes", () => {
  it("answers 404 json", async () => {
    const app = express();
    mountTrailingNotFound(app);
    const server = await new Promise<import("node:http").Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as { port: number };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/no-such-route`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not found" });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

describe("terse errors", () => {
  it("maps a validator throw to bad request and hides the message", () => {
    const err = new Error("ArgumentValidationError: secret-path /tmp/x");
    const pub = clientError(err);
    expect(pub).toEqual({ status: 400, error: "bad request" });
    expect(JSON.stringify(pub)).not.toContain("secret-path");
  });

  it("maps anything else to internal error", () => {
    expect(clientError(new Error("stack at /app/src/index.ts"))).toEqual({
      status: 500,
      error: "internal error",
    });
  });

  it("passes an Unknown peer sentence through as 404", () => {
    const sentence =
      "Unknown peer: UNREGISTERED (not registered on this hub; if its register was refused, create it with hub-talk --init-key)";
    const wrapped = new Error(`[CONVEX M(sessions:create)] Server Error\nUncaught Error: ${sentence}\n    at handler`);
    expect(clientError(wrapped)).toEqual({ status: 404, error: sentence });
  });
});

describe("enroll line", () => {
  it("uses the authz shape and a fixed condition", () => {
    expect(enrollLine("reject", "no-code", "POST /a2a/register", "new-name")).toBe(
      "[enroll] REJECT no-code on POST /a2a/register caller=new-name"
    );
    expect(enrollLine("warn", "expired", "POST /a2a/register", "new-name")).toContain(
      "WOULD REJECT expired"
    );
    expect(ENROLL_TEXT["no-code"]).toContain("enrollment code");
  });
});
