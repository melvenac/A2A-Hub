import { describe, expect, it } from "vitest";
import {
  decideAccess,
  isHumanRow,
  ownerOf,
  crossOwnerParticipant,
  type OwnedRow,
} from "../convex/accessLogic.js";

const human = (name: string, owner?: string): OwnedRow => ({ name, agentCard: { kind: "human" }, owner });
const agent = (name: string, owner?: string): OwnedRow => ({ name, agentCard: { kind: "ide-session" }, owner });
const rows = (...r: OwnedRow[]) => new Map(r.map((x) => [x.name, x]));

describe("ownerOf / isHumanRow", () => {
  it("a human owns itself, even with no stored owner", () => {
    expect(ownerOf(human("aaron"))).toBe("aaron");
    expect(isHumanRow(human("aaron"))).toBe(true);
  });
  it("an agent has its stored owner, or none", () => {
    expect(ownerOf(agent("relay", "aaron"))).toBe("aaron");
    expect(ownerOf(agent("relay"))).toBeUndefined();
    expect(ownerOf(null)).toBeUndefined();
  });
});

describe("decideAccess", () => {
  const all = rows(human("aaron"), agent("relay", "aaron"), agent("atlas", "aaron"), human("bea"), agent("bot", "bea"));

  it("a participant has access; ownerView is not needed", () => {
    expect(decideAccess("relay", all.get("relay"), ["relay", "atlas"], all)).toEqual({
      participant: true,
      ownerView: false,
    });
  });

  it("an agent never sees a room it is not in, even its owner's agents' rooms", () => {
    expect(decideAccess("relay", all.get("relay"), ["atlas", "grok"], all)).toEqual({
      participant: false,
      ownerView: false,
    });
  });

  it("a human sees the rooms his agents are in (owner view)", () => {
    expect(decideAccess("aaron", all.get("aaron"), ["relay", "atlas"], all).ownerView).toBe(true);
  });

  it("a human does not see a second owner's rooms", () => {
    expect(decideAccess("aaron", all.get("aaron"), ["bot", "bea"], all)).toEqual({
      participant: false,
      ownerView: false,
    });
    expect(decideAccess("bea", all.get("bea"), ["relay", "atlas"], all).ownerView).toBe(false);
  });

  it("another human in the room does not give an owner view", () => {
    // bea is a human participant; aaron does not own her.
    expect(decideAccess("aaron", all.get("aaron"), ["bea", "bot"], all).ownerView).toBe(false);
  });

  it("an unowned agent gives no owner view", () => {
    const r = rows(human("aaron"), agent("stray"));
    expect(decideAccess("aaron", r.get("aaron"), ["stray", "other"], r).ownerView).toBe(false);
  });

  it("an unknown caller (warn, null) has no access", () => {
    expect(decideAccess(null, null, ["relay"], all)).toEqual({ participant: false, ownerView: false });
  });

  it("a caller with no agents row can still be a participant, but gets no owner view", () => {
    expect(decideAccess("hub", null, ["hub", "aaron"], all).participant).toBe(true);
    expect(decideAccess("ghost", null, ["relay"], all).ownerView).toBe(false);
  });
});

describe("crossOwnerParticipant", () => {
  const all = rows(human("aaron"), agent("relay", "aaron"), agent("bot", "bea"), agent("stray"));
  it("null when every participant with a row shares the caller's owner (a human counts as his own)", () => {
    expect(crossOwnerParticipant(all.get("relay"), ["relay", "aaron"], all)).toBeNull();
  });
  it("names the first participant another owner owns, or an unowned one", () => {
    expect(crossOwnerParticipant(all.get("relay"), ["relay", "bot"], all)).toBe("bot");
    expect(crossOwnerParticipant(all.get("relay"), ["stray", "relay"], all)).toBe("stray");
  });
  it("skips a name with no row, which sessions.create answers as an unknown peer", () => {
    expect(crossOwnerParticipant(all.get("relay"), ["relay", "nobody"], all)).toBeNull();
  });
  it("an unowned caller matches no owned participant", () => {
    expect(crossOwnerParticipant(all.get("stray"), ["stray", "relay"], all)).toBe("relay");
  });
});
