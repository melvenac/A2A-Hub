import { describe, expect, it } from "vitest";
import { cardForStore, ENROLL_TEXT, judgeCode } from "../convex/enrollLogic.js";
import { clientError } from "../src/httpError.js";
import { charge, GLOBAL_LIMIT, PER_KEY_LIMIT, resetLimits } from "../src/rateLimit.js";
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
      expect(charge("alice", PER_KEY_LIMIT, now).ok).toBe(true);
    }
    const blocked = charge("alice", PER_KEY_LIMIT, now);
    expect(blocked.ok).toBe(false);
    expect(PER_KEY_LIMIT).toBe(3150);
    expect(GLOBAL_LIMIT).toBe(90);
  });

  it("a name bucket does not spend the global bucket", () => {
    resetLimits();
    const now = 6_000_000;
    expect(charge("alice", PER_KEY_LIMIT, now).ok).toBe(true);
    expect(charge("global", GLOBAL_LIMIT, now).ok).toBe(true);
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
