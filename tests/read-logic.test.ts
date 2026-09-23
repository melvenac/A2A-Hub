import { describe, it, expect } from "vitest";
import { computeReadState, numberTurns, validateMark } from "../convex/readLogic.js";
import { unreadOwnLines } from "../scripts/hub-receipts.mjs";

const turns = [
  { turn: 1, from: "atlas", createdAt: 1000 },
  { turn: 2, from: "grok", createdAt: 2000 },
  { turn: 3, from: "atlas", createdAt: 3000 },
];

describe("computeReadState", () => {
  it("a participant with no recorded read has lastRead null and every turn by others unread", () => {
    const [grok] = computeReadState(turns, [{ name: "grok" }]);
    expect(grok.lastRead).toBeNull();
    expect(grok.unread).toEqual([
      { turn: 1, from: "atlas", sentAt: 1000 },
      { turn: 3, from: "atlas", sentAt: 3000 },
    ]);
  });

  it("read-through-N is reported as a mark, not as null, and only turns above it are unread", () => {
    const [grok] = computeReadState(turns, [
      { name: "grok", readThroughTurn: 1, readAt: 1500, readVia: "wait" },
    ]);
    expect(grok.lastRead).toEqual({ turn: 1, at: 1500, via: "wait" });
    expect(grok.unread.map((t) => t.turn)).toEqual([3]);
  });

  it("never-read and read-through-turn-0-equivalent are not the same state", () => {
    const [never] = computeReadState(turns, [{ name: "grok" }]);
    const [read] = computeReadState(turns, [
      { name: "grok", readThroughTurn: 3, readAt: 4000, readVia: "inbox" },
    ]);
    expect(never.lastRead).toBeNull();
    expect(read.lastRead).not.toBeNull();
    expect(read.unread).toEqual([]);
  });

  it("a sender's own turns are never unread by the sender, even with no mark at all", () => {
    const [atlas] = computeReadState(turns, [{ name: "atlas" }]);
    expect(atlas.lastRead).toBeNull();
    expect(atlas.unread).toEqual([{ turn: 2, from: "grok", sentAt: 2000 }]);
  });
});

describe("numberTurns", () => {
  it("numbers by 1-based insertion order, the same rule messages.list uses", () => {
    expect(numberTurns(["a", "b"]).map((x) => x.turn)).toEqual([1, 2]);
  });
});

describe("validateMark", () => {
  it("accepts a turn inside the room", () => {
    expect(validateMark(3, 3)).toBeNull();
  });
  it("rejects a mark past the room's last turn", () => {
    expect(validateMark(4, 3)).toMatch(/past the room's last turn/);
  });
  it("rejects zero, negatives and fractions", () => {
    expect(validateMark(0, 3)).not.toBeNull();
    expect(validateMark(-1, 3)).not.toBeNull();
    expect(validateMark(1.5, 3)).not.toBeNull();
    expect(validateMark(Number.NaN, 3)).not.toBeNull();
  });
});

describe("unreadOwnLines", () => {
  const state = {
    turnCount: 3,
    participants: computeReadState(turns, [
      { name: "atlas" },
      { name: "grok" },
      { name: "relay", readThroughTurn: 1, readAt: Date.UTC(2026, 8, 23, 7, 58, 10), readVia: "wait" },
    ]),
  };

  it("lists only the caller's own turns, and says never-read and read-through-N differently", () => {
    const lines = unreadOwnLines(state, "atlas");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("turn 1 (yours): unread by grok");
    expect(lines.find((l) => l.includes("by grok") && l.includes("turn 3"))).toContain(
      "never read this room",
    );
    expect(lines.find((l) => l.includes("by relay"))).toContain(
      "read through turn 1 at 2026-09-23T07:58:10Z (wait)",
    );
    expect(lines.join("\n")).not.toContain("by atlas");
  });

  it("gives the unread turn's send time as the since", () => {
    const lines = unreadOwnLines(state, "atlas");
    expect(lines[0]).toContain(`since ${new Date(1000).toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  });

  it("prints nothing for a caller whose turns have all been shown", () => {
    const allRead = {
      turnCount: 3,
      participants: computeReadState(turns, [
        { name: "atlas", readThroughTurn: 3, readAt: 5000, readVia: "inbox" },
        { name: "grok" },
      ]),
    };
    expect(unreadOwnLines(allRead, "grok")).toEqual([]);
    // ...while atlas, whose turns grok has never been shown, gets lines.
    expect(unreadOwnLines(allRead, "atlas")).toHaveLength(2);
  });
});
