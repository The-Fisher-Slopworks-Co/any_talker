// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { createUserFactsTools } from "./user-facts";
import type { Tool, ToolCallContext } from "./registry";

const ctx = (over: Partial<ToolCallContext> = {}): ToolCallContext => ({
  source: "ask",
  chatId: "c1",
  userId: "u1",
  replyToMessageId: 1,
  timezone: "UTC",
  lang: "en",
  now: 0,
  ...over,
});

type ToolsByName = {
  remember_fact: Tool;
  list_facts: Tool;
  forget_fact: Tool;
};

function makeTools(): { tools: ToolsByName; storage: MemoryStorage } {
  const storage = new MemoryStorage();
  const arr = createUserFactsTools({ storage });
  const tools: Partial<ToolsByName> = {};
  for (const t of arr) {
    (tools as Record<string, Tool>)[t.name] = t;
  }
  return { tools: tools as ToolsByName, storage };
}

describe("user-facts tool factory", () => {
  test("exposes remember_fact, list_facts, forget_fact", () => {
    const { tools } = makeTools();
    expect(tools.remember_fact).toBeDefined();
    expect(tools.list_facts).toBeDefined();
    expect(tools.forget_fact).toBeDefined();
    expect(tools.remember_fact.name).toBe("remember_fact");
    expect(tools.list_facts.name).toBe("list_facts");
    expect(tools.forget_fact.name).toBe("forget_fact");
  });
});

describe("remember_fact validation", () => {
  test("rejects empty key", () => {
    const { tools } = makeTools();
    const r = tools.remember_fact.parameters.safeParse({
      key: "",
      value: "x",
    });
    expect(r.success).toBe(false);
  });

  test("rejects key longer than 64 chars", () => {
    const { tools } = makeTools();
    const r = tools.remember_fact.parameters.safeParse({
      key: "a".repeat(65),
      value: "x",
    });
    expect(r.success).toBe(false);
  });

  test("accepts key exactly 64 chars", () => {
    const { tools } = makeTools();
    const r = tools.remember_fact.parameters.safeParse({
      key: "a".repeat(64),
      value: "x",
    });
    expect(r.success).toBe(true);
  });

  test("rejects key with bad chars (hyphen, dot, space, unicode)", () => {
    const { tools } = makeTools();
    for (const bad of ["foo-bar", "foo.bar", "foo bar", "café"]) {
      const r = tools.remember_fact.parameters.safeParse({
        key: bad,
        value: "x",
      });
      expect(r.success).toBe(false);
    }
  });

  test("accepts mixed case key (validation only, case is normalised in storage)", () => {
    const { tools } = makeTools();
    const r = tools.remember_fact.parameters.safeParse({
      key: "FavTeam_1",
      value: "x",
    });
    expect(r.success).toBe(true);
  });

  test("rejects empty value", () => {
    const { tools } = makeTools();
    const r = tools.remember_fact.parameters.safeParse({
      key: "k",
      value: "",
    });
    expect(r.success).toBe(false);
  });

  test("rejects value longer than 500 chars", () => {
    const { tools } = makeTools();
    const r = tools.remember_fact.parameters.safeParse({
      key: "k",
      value: "x".repeat(501),
    });
    expect(r.success).toBe(false);
  });

  test("accepts value exactly 500 chars", () => {
    const { tools } = makeTools();
    const r = tools.remember_fact.parameters.safeParse({
      key: "k",
      value: "x".repeat(500),
    });
    expect(r.success).toBe(true);
  });
});

describe("forget_fact validation", () => {
  test("rejects empty key", () => {
    const { tools } = makeTools();
    const r = tools.forget_fact.parameters.safeParse({ key: "" });
    expect(r.success).toBe(false);
  });

  test("rejects key with bad chars", () => {
    const { tools } = makeTools();
    const r = tools.forget_fact.parameters.safeParse({ key: "foo-bar" });
    expect(r.success).toBe(false);
  });

  test("accepts a valid key", () => {
    const { tools } = makeTools();
    const r = tools.forget_fact.parameters.safeParse({ key: "foo_bar" });
    expect(r.success).toBe(true);
  });
});

describe("list_facts validation", () => {
  test("accepts an empty object", () => {
    const { tools } = makeTools();
    expect(tools.list_facts.parameters.safeParse({}).success).toBe(true);
  });
});

describe("remember_fact + list_facts + forget_fact round-trip", () => {
  test("happy-path: remember -> list -> forget", async () => {
    const { tools, storage } = makeTools();
    const c = ctx({ userId: "u-happy" });

    const r1 = await tools.remember_fact.execute(
      { key: "favourite_colour", value: "blue" },
      c,
    );
    expect(r1).toEqual({ ok: true });

    const r2 = await tools.remember_fact.execute(
      { key: "pet", value: "cat named pumpkin" },
      c,
    );
    expect(r2).toEqual({ ok: true });

    const listed = (await tools.list_facts.execute({}, c)) as Array<{
      key: string;
      value: string;
    }>;
    expect(listed).toEqual([
      { key: "favourite_colour", value: "blue" },
      { key: "pet", value: "cat named pumpkin" },
    ]);

    const forgotten = await tools.forget_fact.execute({ key: "pet" }, c);
    expect(forgotten).toEqual({ existed: true });

    const after = (await tools.list_facts.execute({}, c)) as Array<{
      key: string;
      value: string;
    }>;
    expect(after).toEqual([{ key: "favourite_colour", value: "blue" }]);

    // Sanity: also confirm via storage directly.
    expect(await storage.listUserFacts("u-happy")).toEqual([
      { key: "favourite_colour", value: "blue" },
    ]);
  });

  test("list_facts returns empty array when user has no facts", async () => {
    const { tools } = makeTools();
    const out = await tools.list_facts.execute({}, ctx({ userId: "u-none" }));
    expect(out).toEqual([]);
  });

  test("forget_fact returns existed:false when nothing to forget", async () => {
    const { tools } = makeTools();
    const out = await tools.forget_fact.execute(
      { key: "nope" },
      ctx({ userId: "u-x" }),
    );
    expect(out).toEqual({ existed: false });
  });
});

describe("userId plumbing", () => {
  test("remember/list/forget all key off ctx.userId, not a parameter", async () => {
    const { tools, storage } = makeTools();
    const alice = ctx({ userId: "alice" });
    const bob = ctx({ userId: "bob" });

    await tools.remember_fact.execute({ key: "lang", value: "rust" }, alice);
    await tools.remember_fact.execute({ key: "lang", value: "go" }, bob);

    expect(await tools.list_facts.execute({}, alice)).toEqual([
      { key: "lang", value: "rust" },
    ]);
    expect(await tools.list_facts.execute({}, bob)).toEqual([
      { key: "lang", value: "go" },
    ]);

    // Forget on alice should not touch bob.
    await tools.forget_fact.execute({ key: "lang" }, alice);
    expect(await tools.list_facts.execute({}, alice)).toEqual([]);
    expect(await storage.listUserFacts("bob")).toEqual([
      { key: "lang", value: "go" },
    ]);
  });

  test("case-insensitive: Foo and foo collide via the tool layer", async () => {
    const { tools } = makeTools();
    const c = ctx({ userId: "u-case" });
    await tools.remember_fact.execute({ key: "Foo", value: "1" }, c);
    await tools.remember_fact.execute({ key: "foo", value: "2" }, c);
    const out = (await tools.list_facts.execute({}, c)) as Array<{
      key: string;
      value: string;
    }>;
    expect(out).toEqual([{ key: "foo", value: "2" }]);

    const forgotten = await tools.forget_fact.execute({ key: "FOO" }, c);
    expect(forgotten).toEqual({ existed: true });
    expect(await tools.list_facts.execute({}, c)).toEqual([]);
  });

  test("returns limit_reached through the tool when storage rejects", async () => {
    const { tools, storage } = makeTools();
    const c = ctx({ userId: "u-cap" });
    for (let i = 0; i < 50; i++) {
      await storage.rememberUserFact("u-cap", `k${i}`, "v");
    }
    const r = await tools.remember_fact.execute(
      { key: "overflow", value: "v" },
      c,
    );
    expect(r).toEqual({ ok: false, reason: "limit_reached" });
  });
});
