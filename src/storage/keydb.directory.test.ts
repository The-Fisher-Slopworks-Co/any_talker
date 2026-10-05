// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import type { RedisClient } from "bun";
import { KeyDBChatsStore } from "./keydb/chats";
import { KeyDBUsersStore } from "./keydb/users";
import type { Chat, User } from "../shared/types";

// Just `hmget`, counting calls: the point of `getMany` is one round trip.
class FakeHash {
  calls = 0;
  constructor(private readonly hash: Record<string, string>) {}

  async hmget(_key: string, fields: string[]): Promise<(string | null)[]> {
    this.calls += 1;
    return fields.map((f) => this.hash[f] ?? null);
  }
}

const asClient = (fake: FakeHash) => fake as unknown as RedisClient;

test("users.getMany reads the hash once and skips missing ids", async () => {
  const ada: User = {
    id: "1",
    firstName: "Ada",
    lastName: null,
    username: "ada",
    firstSeenAt: 5,
    lastSeenAt: 9,
  };
  const fake = new FakeHash({ "1": JSON.stringify(ada) });
  const found = await new KeyDBUsersStore(asClient(fake)).getMany([
    "1",
    "2",
    "1",
  ]);
  expect([...found.keys()]).toEqual(["1"]);
  expect(found.get("1")).toEqual(ada);
  expect(fake.calls).toBe(1);
});

test("chats.getMany reads the hash once and skips missing ids", async () => {
  const chat: Chat = {
    id: "-100",
    type: "supergroup",
    title: "Engines",
    username: null,
    firstSeenAt: 5,
    lastSeenAt: 9,
  };
  const fake = new FakeHash({ "-100": JSON.stringify(chat) });
  const found = await new KeyDBChatsStore(asClient(fake)).getMany([
    "-100",
    "-200",
  ]);
  expect([...found.keys()]).toEqual(["-100"]);
  expect(found.get("-100")).toEqual(chat);
  expect(fake.calls).toBe(1);
});

test("getMany of nothing issues no command", async () => {
  const fake = new FakeHash({});
  expect((await new KeyDBUsersStore(asClient(fake)).getMany([])).size).toBe(0);
  expect((await new KeyDBChatsStore(asClient(fake)).getMany([])).size).toBe(0);
  expect(fake.calls).toBe(0);
});
