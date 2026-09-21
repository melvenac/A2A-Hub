import { describe, it, expect } from "vitest";
import { isPairRoom, selectLobby, participantNames } from "../scripts/hub-rooms.mjs";

const LOBBY = "cursor-to-cursor";
const ME = "atlas";

function session(id: string, participants: any[], extra: any = {}) {
  return {
    _id: id,
    title: LOBBY,
    isActive: true,
    turnCount: 0,
    maxTurns: 64,
    createdAt: 1,
    participants,
    ...extra,
  };
}

describe("lobby selection", () => {
  // The observed failure: a kickoff aimed at one peer landed in whichever
  // room happened to be open.
  it("with --peer, chooses the room for that pair", () => {
    const rooms = [
      session("developer-room", ["atlas", "forge"], { createdAt: 20 }),
      session("qa-room", ["atlas", "probe"], { createdAt: 10 }),
    ];
    expect(selectLobby(rooms, { me: ME, peer: "probe", title: LOBBY })).toBe("qa-room");
  });

  it("with --peer, does not fall back to a room with the wrong peer", () => {
    const rooms = [session("developer-room", ["atlas", "forge"], { createdAt: 20 })];
    // Nothing suitable — the caller creates the right room instead of
    // speaking into the developer's.
    expect(selectLobby(rooms, { me: ME, peer: "probe", title: LOBBY })).toBeUndefined();
  });

  it("without --peer, takes the newest open room containing me", () => {
    const rooms = [
      session("older", ["atlas", "forge"], { createdAt: 5 }),
      session("newer", ["atlas", "probe"], { createdAt: 50 }),
    ];
    expect(selectLobby(rooms, { me: ME, title: LOBBY })).toBe("newer");
  });

  it("ignores closed, full, and differently titled rooms", () => {
    const rooms = [
      session("closed", ["atlas", "probe"], { isActive: false, createdAt: 90 }),
      session("full", ["atlas", "probe"], { turnCount: 64, maxTurns: 64, createdAt: 80 }),
      session("other-title", ["atlas", "probe"], { title: "something-else", createdAt: 70 }),
      session("good", ["atlas", "probe"], { createdAt: 10 }),
    ];
    expect(selectLobby(rooms, { me: ME, peer: "probe", title: LOBBY })).toBe("good");
  });

  it("treats participants given as objects the same as names", () => {
    const rooms = [session("obj", [{ name: "atlas" }, { name: "probe" }])];
    expect(participantNames(rooms[0])).toEqual(["atlas", "probe"]);
    expect(selectLobby(rooms, { me: ME, peer: "probe", title: LOBBY })).toBe("obj");
  });

  it("a pair room is exactly the two peers, not a superset", () => {
    const three = session("three", ["atlas", "probe", "forge"]);
    expect(isPairRoom(three, ME, "probe")).toBe(false);
    expect(selectLobby([three], { me: ME, peer: "probe", title: LOBBY })).toBeUndefined();
  });

  it("returns undefined rather than throwing on an empty or missing list", () => {
    expect(selectLobby([], { me: ME, peer: "probe", title: LOBBY })).toBeUndefined();
    expect(selectLobby(undefined, { me: ME, title: LOBBY })).toBeUndefined();
  });
});
