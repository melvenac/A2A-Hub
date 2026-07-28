import { describe, it, expect } from "vitest";
import {
  isParticipant,
  qualifiesAsTrigger,
  routingMentions,
  type GateContext,
} from "../src/wrapper/mentions.js";

/** alice + bob + aaron: a group session, seen from alice's side. */
const group: GateContext = {
  name: "alice",
  participants: ["aaron", "alice", "bob"],
  isGroup: true,
};
/** alice + aaron: a 1:1 session, seen from alice's side. */
const direct: GateContext = { name: "alice", participants: ["aaron", "alice"], isGroup: false };

const fromHuman = (content: string) => ({ from: "aaron", fromType: "human", content });
const fromAgent = (from: string, content: string) => ({ from, fromType: "agent", content });

describe("routingMentions", () => {
  it("keeps @words that name a participant", () => {
    expect(routingMentions("@bob can you take this?", group)).toEqual(["bob"]);
    expect(routingMentions("@alice @bob both of you", group)).toEqual(["alice", "bob"]);
  });

  it("is case-insensitive", () => {
    expect(routingMentions("@Bob and @ALICE", group)).toEqual(["bob", "alice"]);
  });

  it("drops @words that name nobody in the session", () => {
    expect(routingMentions("bump @anthropic-ai/sdk to latest", group)).toEqual([]);
    expect(routingMentions("wrap it in @media (min-width: 40em)", group)).toEqual([]);
    expect(routingMentions("mail me at aaron@example.com", group)).toEqual([]);
    expect(routingMentions("annotate it with @Injectable", group)).toEqual([]);
    // A typo'd handle matches nobody rather than routing to nobody.
    expect(routingMentions("@alicce are you there?", group)).toEqual([]);
  });
});

describe("qualifiesAsTrigger", () => {
  it("never answers its own message", () => {
    expect(qualifiesAsTrigger(fromAgent("alice", "@alice hello"), group)).toBe(false);
  });

  it("answers when addressed by name", () => {
    expect(qualifiesAsTrigger(fromHuman("@alice thoughts?"), group)).toBe(true);
    expect(qualifiesAsTrigger(fromAgent("bob", "@alice over to you"), group)).toBe(true);
  });

  it("stays quiet when the mention names another agent", () => {
    expect(qualifiesAsTrigger(fromHuman("@bob thoughts?"), group)).toBe(false);
  });

  it("answers unaddressed humans in a group but not other agents (ADR-007)", () => {
    expect(qualifiesAsTrigger(fromHuman("what does everyone think?"), group)).toBe(true);
    expect(qualifiesAsTrigger(fromAgent("bob", "I think we should ship."), group)).toBe(false);
  });

  it("answers anything from the other peer in a 1:1", () => {
    expect(qualifiesAsTrigger(fromHuman("what do you think?"), direct)).toBe(true);
    expect(qualifiesAsTrigger(fromAgent("bob", "unprompted"), direct)).toBe(true);
  });

  // The v1.5.2 regression. Before the fix every @word was routing, so a message
  // whose only "@" was a package name addressed a participant that does not
  // exist -- and every agent in the room went silent with no error.
  it("answers a message whose only @word is a package name", () => {
    const msg = fromHuman("did the @anthropic-ai/sdk bump land?");
    expect(routingMentions(msg.content, group)).toEqual([]); // nothing was routed
    expect(qualifiesAsTrigger(msg, group)).toBe(true); // ...so the room still answers
    expect(qualifiesAsTrigger(msg, direct)).toBe(true);
  });

  it("still routes when a package name sits next to a real mention", () => {
    const msg = fromHuman("@bob did the @anthropic-ai/sdk bump land?");
    expect(routingMentions(msg.content, group)).toEqual(["bob"]);
    expect(qualifiesAsTrigger(msg, group)).toBe(false); // addressed to bob, not alice
  });
});

describe("isParticipant", () => {
  it("matches participants and self, case-insensitively", () => {
    expect(isParticipant("bob", group)).toBe(true);
    expect(isParticipant("Alice", group)).toBe(true);
    expect(isParticipant("hub", group)).toBe(false);
  });
});
