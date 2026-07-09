// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { contactHandler, type ContactInput } from "./contact";

const baseInput = (overrides: Partial<ContactInput> = {}): ContactInput => ({
  storage: new MemoryStorage(),
  ownerId: "1",
  now: 1_000,
  isPrivateChat: true,
  fromUserId: "1",
  contact: {
    user_id: 42,
    first_name: "Alice",
    last_name: "Smith",
  },
  ...overrides,
});

describe("contactHandler", () => {
  test("ignored when chat is not private", async () => {
    const storage = new MemoryStorage();
    const out = await contactHandler(baseInput({ storage, isPrivateChat: false }));
    expect(out.kind).toBe("ignored");
    expect(await storage.listWhitelist("users")).toEqual([]);
  });

  test("ignored when sender is not the owner", async () => {
    const storage = new MemoryStorage();
    const out = await contactHandler(baseInput({ storage, fromUserId: "999" }));
    expect(out.kind).toBe("ignored");
    expect(await storage.listWhitelist("users")).toEqual([]);
  });

  test("noUserId when contact has no user_id (not on Telegram)", async () => {
    const storage = new MemoryStorage();
    const out = await contactHandler(
      baseInput({
        storage,
        contact: { first_name: "Bob" },
      }),
    );
    expect(out.kind).toBe("noUserId");
    expect(await storage.listWhitelist("users")).toEqual([]);
  });

  test("isOwner when owner shares their own contact", async () => {
    const storage = new MemoryStorage();
    const out = await contactHandler(
      baseInput({
        storage,
        contact: { user_id: 1, first_name: "Owner" },
      }),
    );
    expect(out.kind).toBe("isOwner");
    expect(await storage.listWhitelist("users")).toEqual([]);
  });

  test("added: writes whitelist entry and creates a stub user record", async () => {
    const storage = new MemoryStorage();
    const out = await contactHandler(baseInput({ storage }));
    expect(out.kind).toBe("added");
    if (out.kind === "added") expect(out.label).toBe("Alice Smith");

    expect(await storage.listWhitelist("users")).toEqual([
      { id: "42", label: "Alice Smith" },
    ]);
    expect(await storage.getUser("42")).toEqual({
      id: "42",
      firstName: "Alice",
      lastName: "Smith",
      username: null,
      firstSeenAt: 1_000,
      lastSeenAt: 1_000,
    });
  });

  test("added: handles contact with no last_name", async () => {
    const storage = new MemoryStorage();
    const out = await contactHandler(
      baseInput({
        storage,
        contact: { user_id: 42, first_name: "Alice" },
      }),
    );
    expect(out.kind).toBe("added");
    if (out.kind === "added") expect(out.label).toBe("Alice");
    expect(await storage.getUser("42")).toEqual({
      id: "42",
      firstName: "Alice",
      lastName: null,
      username: null,
      firstSeenAt: 1_000,
      lastSeenAt: 1_000,
    });
  });

  test("added: existing user record is preserved (not overwritten)", async () => {
    const storage = new MemoryStorage();
    await storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: "Smith",
      username: "alice_real",
      firstSeenAt: 5_000,
      lastSeenAt: 5_000,
    });
    const out = await contactHandler(baseInput({ storage }));
    expect(out.kind).toBe("added");
    expect(await storage.getUser("42")).toEqual({
      id: "42",
      firstName: "Alice",
      lastName: "Smith",
      username: "alice_real",
      firstSeenAt: 5_000,
      lastSeenAt: 5_000,
    });
  });

  test("alreadyWhitelisted: returns existing label without mutating storage", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42", label: "Old Label" });
    await storage.upsertUser({
      id: "42",
      firstName: "Alice",
      lastName: "Smith",
      username: "alice_real",
      firstSeenAt: 5_000,
      lastSeenAt: 5_000,
    });
    const out = await contactHandler(baseInput({ storage }));
    expect(out.kind).toBe("alreadyWhitelisted");
    if (out.kind === "alreadyWhitelisted") expect(out.label).toBe("Alice Smith");

    expect(await storage.listWhitelist("users")).toEqual([
      { id: "42", label: "Old Label" },
    ]);
    expect(await storage.getUser("42")).toEqual({
      id: "42",
      firstName: "Alice",
      lastName: "Smith",
      username: "alice_real",
      firstSeenAt: 5_000,
      lastSeenAt: 5_000,
    });
  });
});
