import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { register, registerAgent, rotateKey } from "../convex/agents.js";
import { RETIRED_SHARED_KEY_HASH } from "../convex/keyLogic.js";

// Loop 3 ruling on departure 1: every public mutation that can set apiKeyHash
// refuses to *acquire* the retired shared key's hash, in-transaction, whatever
// keyTooShort says. A direct Convex caller (T-057) omits that flag, so each
// entry point is called here directly, with no flag, against a fake database.

/** Minimal in-memory stand-in for a Convex mutation ctx over `agents`. */
function fakeCtx(seed: Record<string, any>[] = []) {
  let next = 0;
  const rows = new Map<string, any>();
  for (const r of seed) {
    const _id = `id${next++}`;
    rows.set(_id, { _id, _creationTime: next, ...r });
  }
  const query = () => {
    let pred: (r: any) => boolean = () => true;
    const api = {
      withIndex(_name: string, fn: (q: any) => any) {
        const q = {
          eq(field: string, value: unknown) {
            pred = (r) => r[field] === value;
            return q;
          },
        };
        fn(q);
        return api;
      },
      filter() {
        return api;
      },
      async collect() {
        return [...rows.values()].filter(pred);
      },
      async take(n: number) {
        return [...rows.values()].filter(pred).slice(0, n);
      },
      async first() {
        return [...rows.values()].filter(pred)[0] ?? null;
      },
    };
    return api;
  };
  const db = {
    query,
    async get(id: string) {
      return rows.get(id) ?? null;
    },
    async insert(_table: string, doc: any) {
      const _id = `id${next++}`;
      rows.set(_id, { _id, _creationTime: next, ...doc });
      return _id;
    },
    async patch(id: string, fields: any) {
      rows.set(id, { ...rows.get(id), ...fields });
    },
    async delete(id: string) {
      rows.delete(id);
    },
  };
  return { ctx: { db } as any, rows };
}

const call = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error: any) {
    return error.data;
  }
  return null;
};

describe("the retired shared key is never acquired (departure 1 backstop)", () => {
  it("the constant is the sha256 of the retired key (Loop 2's prefix 7e9f8fd1)", () => {
    expect(createHash("sha256").update("dev-key").digest("hex")).toBe(RETIRED_SHARED_KEY_HASH);
  });

  for (const [label, fn] of [
    ["register", register],
    ["registerAgent", registerAgent],
  ] as const) {
    it(`${label}: a new name with the retired hash and no flag is refused, in both modes`, async () => {
      for (const strict of [undefined, false, true]) {
        // Empty table: every legacy holder already released, so U1 cannot help.
        const { ctx, rows } = fakeCtx();
        const data = await refusal(
          call(fn, ctx, { name: "newcomer", apiKeyHash: RETIRED_SHARED_KEY_HASH, agentCard: {}, strict })
        );
        expect(data).toMatchObject({ status: 400 });
        expect(rows.size).toBe(0);
      }
    });

    it(`${label}: an owned name cannot move onto the retired hash`, async () => {
      const { ctx, rows } = fakeCtx([
        { name: "relay", apiKeyHash: "own", keyStatus: "owned", agentCard: {}, lastSeen: 1, status: "online" },
      ]);
      const data = await refusal(call(fn, ctx, { name: "relay", apiKeyHash: RETIRED_SHARED_KEY_HASH, agentCard: {} }));
      expect(data).toMatchObject({ status: 400 });
      expect([...rows.values()][0].apiKeyHash).toBe("own");
    });

    it(`${label}: a legacy holder may still re-register the hash it holds (U2 warn)`, async () => {
      const { ctx, rows } = fakeCtx([
        { name: "atlas", apiKeyHash: RETIRED_SHARED_KEY_HASH, agentCard: {}, lastSeen: 1, status: "online" },
      ]);
      await call(fn, ctx, { name: "atlas", apiKeyHash: RETIRED_SHARED_KEY_HASH, agentCard: {} });
      expect(rows.size).toBe(1);
      expect([...rows.values()][0].apiKeyHash).toBe(RETIRED_SHARED_KEY_HASH);
    });
  }

  it("rotateKey: rotating onto the retired hash is refused and the key is unchanged", async () => {
    const { ctx, rows } = fakeCtx([
      { name: "relay", apiKeyHash: "own", keyStatus: "owned", agentCard: {}, lastSeen: 1, status: "online" },
    ]);
    const data = await refusal(
      call(rotateKey, ctx, { name: "relay", currentHash: "own", newHash: RETIRED_SHARED_KEY_HASH })
    );
    expect(data).toMatchObject({ status: 400 });
    expect([...rows.values()][0].apiKeyHash).toBe("own");
  });
});
