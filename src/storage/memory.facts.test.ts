// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import { USER_FACTS_MAX_PER_USER } from "./types";

describe("MemoryStorage user facts", () => {
  test("set new fact returns ok and shows up in list", async () => {
    const s = new MemoryStorage();
    expect(await s.rememberUserFact("u1", "city", "berlin")).toEqual({
      ok: true,
    });
    expect(await s.listUserFacts("u1")).toEqual([
      { key: "city", value: "berlin" },
    ]);
  });

  test("update existing key overwrites the value (no second slot)", async () => {
    const s = new MemoryStorage();
    await s.rememberUserFact("u1", "city", "berlin");
    await s.rememberUserFact("u1", "city", "paris");
    expect(await s.listUserFacts("u1")).toEqual([
      { key: "city", value: "paris" },
    ]);
  });

  test("listUserFacts returns empty array for unknown user", async () => {
    const s = new MemoryStorage();
    expect(await s.listUserFacts("ghost")).toEqual([]);
  });

  test("listUserFacts returns facts sorted by key ascending", async () => {
    const s = new MemoryStorage();
    await s.rememberUserFact("u1", "zeta", "z");
    await s.rememberUserFact("u1", "alpha", "a");
    await s.rememberUserFact("u1", "mu", "m");
    expect(await s.listUserFacts("u1")).toEqual([
      { key: "alpha", value: "a" },
      { key: "mu", value: "m" },
      { key: "zeta", value: "z" },
    ]);
  });

  test("listUserFacts is per-user", async () => {
    const s = new MemoryStorage();
    await s.rememberUserFact("u1", "k", "for-u1");
    await s.rememberUserFact("u2", "k", "for-u2");
    expect(await s.listUserFacts("u1")).toEqual([
      { key: "k", value: "for-u1" },
    ]);
    expect(await s.listUserFacts("u2")).toEqual([
      { key: "k", value: "for-u2" },
    ]);
  });

  test("forgetUserFact existed:true when key was present", async () => {
    const s = new MemoryStorage();
    await s.rememberUserFact("u1", "k", "v");
    expect(await s.forgetUserFact("u1", "k")).toEqual({ existed: true });
    expect(await s.listUserFacts("u1")).toEqual([]);
  });

  test("forgetUserFact existed:false when key missing", async () => {
    const s = new MemoryStorage();
    expect(await s.forgetUserFact("u1", "k")).toEqual({ existed: false });
  });

  test("forgetUserFact existed:false for unknown user without any hash", async () => {
    const s = new MemoryStorage();
    expect(await s.forgetUserFact("ghost", "k")).toEqual({ existed: false });
  });

  test("at the cap, a new key evicts the oldest and stays at the cap", async () => {
    const s = new MemoryStorage();
    for (let i = 0; i < USER_FACTS_MAX_PER_USER; i++) {
      const r = await s.rememberUserFact("u1", `k${i}`, "v");
      expect(r).toEqual({ ok: true });
    }
    const r = await s.rememberUserFact("u1", "overflow", "v");
    expect(r).toEqual({ ok: true });
    const list = await s.listUserFacts("u1");
    expect(list.length).toBe(USER_FACTS_MAX_PER_USER);
    // The oldest-inserted key (k0) is gone; the new one is present.
    expect(list.some((f) => f.key === "k0")).toBe(false);
    expect(list.some((f) => f.key === "overflow")).toBe(true);
  });

  test("updating an existing key at the cap still works", async () => {
    const s = new MemoryStorage();
    for (let i = 0; i < USER_FACTS_MAX_PER_USER; i++) {
      await s.rememberUserFact("u1", `k${i}`, "v");
    }
    // At cap; updating k0 should succeed.
    const r = await s.rememberUserFact("u1", "k0", "updated");
    expect(r).toEqual({ ok: true });
    const list = await s.listUserFacts("u1");
    expect(list.find((f) => f.key === "k0")?.value).toBe("updated");
    expect(list.length).toBe(USER_FACTS_MAX_PER_USER);
  });

  test("eviction is FIFO: oldest-inserted keys go first", async () => {
    const s = new MemoryStorage();
    for (let i = 0; i < USER_FACTS_MAX_PER_USER; i++) {
      await s.rememberUserFact("u1", `k${i}`, "v");
    }
    // Two new keys past the cap should evict the two oldest (k0, k1).
    await s.rememberUserFact("u1", "new0", "v");
    await s.rememberUserFact("u1", "new1", "v");
    const keys = (await s.listUserFacts("u1")).map((f) => f.key);
    expect(keys).not.toContain("k0");
    expect(keys).not.toContain("k1");
    expect(keys).toContain("k2");
    expect(keys).toContain("new0");
    expect(keys).toContain("new1");
    expect(keys.length).toBe(USER_FACTS_MAX_PER_USER);
  });

  test("updating an existing key does not reset its age", async () => {
    const s = new MemoryStorage();
    for (let i = 0; i < USER_FACTS_MAX_PER_USER; i++) {
      await s.rememberUserFact("u1", `k${i}`, "v");
    }
    // Re-touch k0 (the oldest), then overflow. k0 should still be the oldest
    // and get evicted — an update must not renew its position.
    await s.rememberUserFact("u1", "k0", "touched");
    await s.rememberUserFact("u1", "overflow", "v");
    const keys = (await s.listUserFacts("u1")).map((f) => f.key);
    expect(keys).not.toContain("k0");
    expect(keys).toContain("k1");
  });

  test("case-insensitive: Foo and foo collide (later wins, lowercased on read)", async () => {
    const s = new MemoryStorage();
    await s.rememberUserFact("u1", "Foo", "first");
    await s.rememberUserFact("u1", "foo", "second");
    expect(await s.listUserFacts("u1")).toEqual([
      { key: "foo", value: "second" },
    ]);
  });

  test("case-insensitive: FOO updates foo without consuming a new slot", async () => {
    const s = new MemoryStorage();
    for (let i = 0; i < USER_FACTS_MAX_PER_USER - 1; i++) {
      await s.rememberUserFact("u1", `k${i}`, "v");
    }
    await s.rememberUserFact("u1", "foo", "lower");
    // Now at the cap (50 items total). Updating "FOO" should still succeed.
    expect((await s.listUserFacts("u1")).length).toBe(
      USER_FACTS_MAX_PER_USER,
    );
    expect(await s.rememberUserFact("u1", "FOO", "upper")).toEqual({
      ok: true,
    });
    const list = await s.listUserFacts("u1");
    expect(list.length).toBe(USER_FACTS_MAX_PER_USER);
    expect(list.find((f) => f.key === "foo")?.value).toBe("upper");
  });

  test("case-insensitive forget: FOO deletes foo", async () => {
    const s = new MemoryStorage();
    await s.rememberUserFact("u1", "foo", "v");
    expect(await s.forgetUserFact("u1", "FOO")).toEqual({ existed: true });
    expect(await s.listUserFacts("u1")).toEqual([]);
  });
});
