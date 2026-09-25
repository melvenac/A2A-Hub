import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  classifyAtDeploy,
  getByKeyHash,
  getByName,
  keyHashStatus,
  listOnline,
  register,
  registerAgent,
  rotateKey,
} from "../convex/agents.js";
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

// Ruling 3, F1: no public function returns apiKeyHash, so a direct caller
// cannot read the stored hash that rotateKey takes as proof.
describe("no public function returns apiKeyHash (ruling 3, F1)", () => {
  const seed = () =>
    fakeCtx([
      { name: "victim", apiKeyHash: "victim-hash", keyStatus: "owned", agentCard: { kind: "ide-session" }, lastSeen: 1, status: "online" },
      { name: "other", apiKeyHash: "other-hash", keyStatus: "owned", agentCard: {}, lastSeen: 2, status: "online" },
    ]);

  it("every public agents query answers without a hash in any shape", async () => {
    const { ctx } = seed();
    const outputs = [
      await call(getByName, ctx, { name: "victim" }),
      await call(listOnline, ctx, {}),
      await call(getByKeyHash, ctx, { apiKeyHash: "victim-hash" }),
      await call(keyHashStatus, ctx, { apiKeyHash: "victim-hash" }),
    ];
    for (const out of outputs) {
      const text = JSON.stringify(out);
      expect(text).not.toContain("apiKeyHash");
      expect(text).not.toContain("victim-hash");
    }
  });

  it("getByName keeps what the hub needs (askPolicy), and listOnline what its callers read", async () => {
    const { ctx } = seed();
    // T-066 adds owner (and human on getByName). Still no apiKeyHash, keyStatus
    // or instance lease: the exact key lists below are the F1 guard.
    expect(await call(getByName, ctx, { name: "victim" })).toEqual({
      name: "victim",
      askPolicy: undefined,
      owner: undefined,
      human: false,
    });
    const rows = await call(listOnline, ctx, {});
    expect(rows.map((r: any) => Object.keys(r).sort())).toEqual([
      ["agentCard", "lastSeen", "name", "owner", "status"],
      ["agentCard", "lastSeen", "name", "owner", "status"],
    ]);
  });

  it("the takeover chain fails: step 1 yields no hash, so rotation has no proof", async () => {
    const { ctx, rows } = seed();
    const looked = await call(getByName, ctx, { name: "victim" });
    const stolen = (looked as any)?.apiKeyHash;
    expect(stolen).toBeUndefined();
    const data = await refusal(
      call(rotateKey, ctx, { name: "victim", currentHash: stolen ?? "", newHash: "attacker-hash" })
    );
    expect(data).toMatchObject({ status: 409 });
    expect([...rows.values()].find((r) => r.name === "victim").apiKeyHash).toBe("victim-hash");
    expect(await call(getByKeyHash, ctx, { apiKeyHash: "victim-hash" })).toEqual({ name: "victim" });
  });
});

// Ruling 3, F2: no path marks a row holding the retired hash owned.
describe("classifyAtDeploy never promotes the retired key (ruling 3, F2)", () => {
  it("a lone unclassified row holding it stays legacy and authenticates nobody", async () => {
    const { ctx, rows } = fakeCtx([
      { name: "alice", apiKeyHash: RETIRED_SHARED_KEY_HASH, agentCard: {}, lastSeen: 1, status: "online" },
    ]);
    const counts = await call(classifyAtDeploy, ctx, {});
    expect(counts).toMatchObject({ owned: 0, legacy: 1 });
    expect([...rows.values()][0].keyStatus).toBe("legacy");
    expect(await call(getByKeyHash, ctx, { apiKeyHash: RETIRED_SHARED_KEY_HASH })).toBeNull();
  });

  it("control: a lone row holding a fresh 43-character key's hash is promoted", async () => {
    const fresh = createHash("sha256").update("x".repeat(43)).digest("hex");
    const { ctx, rows } = fakeCtx([{ name: "bob", apiKeyHash: fresh, agentCard: {}, lastSeen: 1, status: "online" }]);
    expect(await call(classifyAtDeploy, ctx, {})).toMatchObject({ owned: 1, legacy: 0 });
    expect([...rows.values()][0].keyStatus).toBe("owned");
    expect(await call(getByKeyHash, ctx, { apiKeyHash: fresh })).toEqual({ name: "bob" });
  });

  it("repairs a row an earlier build marked owned, and the lookup refuses it either way", async () => {
    const { ctx, rows } = fakeCtx([
      { name: "alice", apiKeyHash: RETIRED_SHARED_KEY_HASH, keyStatus: "owned", agentCard: {}, lastSeen: 1, status: "online" },
    ]);
    expect(await call(getByKeyHash, ctx, { apiKeyHash: RETIRED_SHARED_KEY_HASH })).toBeNull();
    expect(await call(classifyAtDeploy, ctx, {})).toMatchObject({ demoted: 1 });
    expect([...rows.values()][0].keyStatus).toBe("legacy");
  });
});
