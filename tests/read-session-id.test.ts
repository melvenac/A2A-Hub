import { describe, it, expect } from "vitest";
import { markRead } from "../convex/messages.js";
import { readState } from "../convex/sessions.js";

// Loop 1 A2.6: a malformed or unknown session id must come back as 400 / 404,
// never 500. With `v.id("sessions")` Convex rejects a malformed id in the
// argument validator, before the handler's own checks run — so the declared
// validator is asserted directly, and the handler paths with a fake db.

const KNOWN = "sess_known";
const MISSING = "sess_missing";

function fakeCtx() {
  const sessions: Record<string, { turnCount: number }> = { [KNOWN]: { turnCount: 0 } };
  const empty = { withIndex: () => ({ collect: async () => [], first: async () => null }) };
  return {
    db: {
      // Stands in for Convex: a string that is not a sessions id normalizes to null.
      normalizeId: (table: string, id: string) =>
        table === "sessions" && id.startsWith("sess_") ? id : null,
      get: async (id: string) => sessions[id] ?? null,
      query: () => empty,
      patch: async () => {},
    },
  };
}

const sessionIdValidator = (fn: any) => JSON.parse(fn.exportArgs()).value.sessionId.fieldType;

describe("read-receipt functions take the session id as a string (A2.6)", () => {
  for (const [name, fn] of [["markRead", markRead], ["readState", readState]] as const) {
    it(`${name} does not declare v.id("sessions"), which would 500 before the handler`, () => {
      expect(sessionIdValidator(fn)).toEqual({ type: "string" });
    });
  }
});

describe("markRead session id handling", () => {
  const call = (sessionId: string) =>
    (markRead as any)._handler(fakeCtx(), { sessionId, reader: "b", throughTurn: 1, via: "wait" });

  it("a malformed id is 400", async () => {
    expect(await call("not-an-id")).toMatchObject({ ok: false, status: 400 });
  });
  it("an unknown id is 404", async () => {
    expect(await call(MISSING)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("readState session id handling", () => {
  const call = (sessionId: string) => (readState as any)._handler(fakeCtx(), { sessionId });

  it("a malformed id is 400", async () => {
    expect(await call("not-an-id")).toMatchObject({ ok: false, status: 400 });
  });
  it("an unknown id is 404", async () => {
    expect(await call(MISSING)).toMatchObject({ ok: false, status: 404 });
  });
  it("a known id is ok", async () => {
    expect(await call(KNOWN)).toMatchObject({ ok: true, turnCount: 0, participants: [] });
  });
});
