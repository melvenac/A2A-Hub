import { describe, expect, it } from "vitest";
import {
  decideRegister,
  decideRotate,
  describeKeyHash,
  resolveKeyHolder,
} from "../convex/keyLogic.js";

// Loop 3 design §7: the whole register decision, one row per case.
describe("decideRegister, §7's table", () => {
  const owned = { apiKeyHash: "H", keyStatus: "owned" as const };
  const legacy = { apiKeyHash: "H", keyStatus: "legacy" as const };
  const unclassified = { apiKeyHash: "H" }; // no keyStatus reads as legacy
  const d = (o: Partial<Parameters<typeof decideRegister>[0]>) =>
    decideRegister({
      existing: null,
      presentedHash: "H",
      heldByOtherName: false,
      keyTooShort: false,
      strict: false,
      ...o,
    });

  it("U1: a hash another name holds is refused 409 in both modes, for a new name and an owned one", () => {
    for (const strict of [false, true]) {
      expect(d({ heldByOtherName: true, strict })).toMatchObject({ kind: "refuse", status: 409 });
      expect(d({ existing: owned, presentedHash: "X", heldByOtherName: true, strict })).toMatchObject({
        kind: "refuse",
        status: 409,
      });
    }
  });

  it("floor: acquiring a key under 32 characters is 400 in both modes", () => {
    for (const strict of [false, true]) {
      expect(d({ keyTooShort: true, strict })).toMatchObject({ kind: "refuse", status: 400 });
    }
  });

  it("floor: re-registering the hash a name already holds is exempt", () => {
    expect(d({ existing: legacy, keyTooShort: true, heldByOtherName: true })).toEqual({
      kind: "same",
      legacy: true,
    });
  });

  it("a new name inserts", () => {
    expect(d({})).toEqual({ kind: "insert" });
  });

  it("owned, same hash: ok in both modes", () => {
    for (const strict of [false, true]) expect(d({ existing: owned, strict }).kind).toBe("same");
  });

  it("C7: owned, different hash is 409 in warn and strict", () => {
    for (const strict of [false, true]) {
      expect(d({ existing: owned, presentedHash: "X", strict })).toMatchObject({ kind: "refuse", status: 409 });
    }
  });

  it("U2: legacy, same hash: warn allows it as legacy, strict refuses, shared or not", () => {
    for (const existing of [legacy, unclassified]) {
      for (const heldByOtherName of [true, false]) {
        expect(d({ existing, heldByOtherName })).toEqual({ kind: "same", legacy: true });
        expect(d({ existing, heldByOtherName, strict: true })).toMatchObject({ kind: "refuse", status: 409 });
      }
    }
  });

  it("§4.1: legacy, fresh unshared hash migrates in warn and is refused in strict", () => {
    expect(d({ existing: legacy, presentedHash: "X" })).toEqual({ kind: "migrate" });
    expect(d({ existing: unclassified, presentedHash: "X" })).toEqual({ kind: "migrate" });
    expect(d({ existing: legacy, presentedHash: "X", strict: true })).toMatchObject({
      kind: "refuse",
      status: 409,
    });
  });

  it("R1: the last holder of a shared hash is still legacy, so it still migrates", () => {
    // After the others left, nobody else holds H: status, not a count, decides.
    expect(d({ existing: legacy, heldByOtherName: false })).toEqual({ kind: "same", legacy: true });
    expect(d({ existing: legacy, presentedHash: "fresh", heldByOtherName: false })).toEqual({
      kind: "migrate",
    });
  });
});

describe("decideRotate (§2.2)", () => {
  const owned = { apiKeyHash: "cur", keyStatus: "owned" as const };
  const r = (o: Partial<Parameters<typeof decideRotate>[0]>) =>
    decideRotate({ row: owned, currentHash: "cur", newHash: "new", newHeldByOtherName: false, ...o });

  it("rotates an owned row proven by its current hash", () => {
    expect(r({})).toEqual({ kind: "rotate" });
  });

  it("refuses a stale or wrong current hash, a legacy row, or no row (409)", () => {
    expect(r({ currentHash: "old" })).toMatchObject({ status: 409 });
    expect(r({ row: { apiKeyHash: "cur", keyStatus: "legacy" } })).toMatchObject({ status: 409 });
    expect(r({ row: { apiKeyHash: "cur" } })).toMatchObject({ status: 409 });
    expect(r({ row: null })).toMatchObject({ status: 409 });
  });

  it("refuses a new hash another name holds (U1) and a no-op rotation", () => {
    expect(r({ newHeldByOtherName: true })).toMatchObject({ status: 409 });
    expect(r({ newHash: "cur" })).toMatchObject({ status: 400 });
  });
});

describe("resolveKeyHolder (U3) and describeKeyHash", () => {
  it("only an owned row held by one name authenticates", () => {
    expect(resolveKeyHolder([{ name: "a", keyStatus: "owned" }])).toEqual({ name: "a" });
    expect(resolveKeyHolder([])).toBeNull();
    expect(resolveKeyHolder([{ name: "a", keyStatus: "legacy" }])).toBeNull();
    expect(resolveKeyHolder([{ name: "a" }])).toBeNull();
  });

  it("a hash two names hold resolves to nobody, even if both rows claim owned", () => {
    expect(
      resolveKeyHolder([
        { name: "a", keyStatus: "owned" },
        { name: "b", keyStatus: "owned" },
      ])
    ).toBeNull();
  });

  it("R1: a single legacy holder (the dev-key's last row) still resolves to nobody", () => {
    expect(resolveKeyHolder([{ name: "atlas", keyStatus: "legacy" }])).toBeNull();
  });

  it("describes why, for the log line", () => {
    expect(describeKeyHash([])).toBe("unknown");
    expect(describeKeyHash([{ name: "a" }])).toBe("legacy");
    expect(describeKeyHash([{ name: "a" }, { name: "b" }])).toBe("shared");
    expect(describeKeyHash([{ name: "a", keyStatus: "owned" }])).toBe("owned");
  });
});
