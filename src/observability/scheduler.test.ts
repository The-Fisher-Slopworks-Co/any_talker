// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { runObservabilityTick } from "./scheduler";
import type { NotifyApi } from "./types";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

class FakeNotify implements NotifyApi {
  sent: Array<{ chatId: string | number; text: string }> = [];
  rich: Array<{ chatId: string | number; markdown: string }> = [];
  richFails = false;
  async sendMessage(chatId: string | number, text: string) {
    this.sent.push({ chatId, text });
    return {};
  }
  async sendRichMessage(params: {
    chat_id: string | number;
    rich_message: { markdown: string };
  }) {
    if (this.richFails) throw new Error("rich unavailable");
    this.rich.push({
      chatId: params.chat_id,
      markdown: params.rich_message.markdown,
    });
    return {};
  }
}

const tick = (storage: MemoryStorage, api: NotifyApi, nowMs: number) =>
  runObservabilityTick({ storage, api, ownerId: "owner", nowMs });

describe("runObservabilityTick — spike scan", () => {
  test("alerts the owner once when a user's spend spikes, then dedupes", async () => {
    const storage = new MemoryStorage();
    // $2 today, over the default $0.5 user absolute threshold.
    await storage.addUserSpend("u1", 2, NOW);
    const api = new FakeNotify();

    await tick(storage, api, NOW);
    const spikes = () => api.sent.filter((m) => m.text.includes("spike"));
    expect(spikes()).toHaveLength(1);
    expect(spikes()[0]!.chatId).toBe("owner");

    // Same UTC day → claimAlert suppresses a second DM.
    await tick(storage, api, NOW + 1000);
    expect(spikes()).toHaveLength(1);
  });

  test("no spike DM when spend is below threshold", async () => {
    const storage = new MemoryStorage();
    await storage.addUserSpend("u1", 0.01, NOW);
    const api = new FakeNotify();
    await tick(storage, api, NOW);
    expect(api.sent).toEqual([]);
  });
});

describe("runObservabilityTick — digest", () => {
  test("first tick establishes cadence without sending", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(1, NOW);
    const api = new FakeNotify();
    await tick(storage, api, NOW);
    expect(api.rich).toEqual([]);
    expect(await storage.getDigestState()).toEqual({ lastSentAtMs: NOW });
  });

  test("sends the digest as a rich message once the interval has elapsed", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(1, NOW);
    const api = new FakeNotify();
    await tick(storage, api, NOW); // establish
    await tick(storage, api, NOW + 25 * HOUR); // > 24h default
    expect(api.rich).toHaveLength(1);
    expect(api.rich[0]!.chatId).toBe("owner");
    expect(api.rich[0]!.markdown).toContain("digest");
    expect(api.sent).toEqual([]);
  });

  test("falls back to a plain DM when the rich send fails", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(1, NOW);
    const api = new FakeNotify();
    api.richFails = true;
    await tick(storage, api, NOW); // establish
    await tick(storage, api, NOW + 25 * HOUR);
    expect(api.rich).toEqual([]);
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!.text).toContain("digest");
  });

  test("a quiet interval advances the clock but sends nothing", async () => {
    const storage = new MemoryStorage();
    const api = new FakeNotify();
    await tick(storage, api, NOW); // establish
    await tick(storage, api, NOW + 25 * HOUR);
    expect(api.sent).toEqual([]);
    expect(api.rich).toEqual([]);
    expect(await storage.getDigestState()).toEqual({
      lastSentAtMs: NOW + 25 * HOUR,
    });
  });

  test("new users seen since the last digest are reported", async () => {
    const storage = new MemoryStorage();
    const api = new FakeNotify();
    await tick(storage, api, NOW); // establish at NOW
    // A user first seen after the baseline.
    await storage.upsertUser({
      id: "u9",
      firstName: "New",
      lastName: null,
      username: "newbie",
      firstSeenAt: NOW + HOUR,
      lastSeenAt: NOW + HOUR,
    });
    await tick(storage, api, NOW + 25 * HOUR);
    expect(api.rich).toHaveLength(1);
    expect(api.rich[0]!.markdown).toContain("New users: 1");
    expect(api.rich[0]!.markdown).toContain("@newbie");
  });

  test("private chats are left out of the chat ranking", async () => {
    const storage = new MemoryStorage();
    const api = new FakeNotify();
    await storage.upsertChat({
      id: "-100",
      type: "supergroup",
      title: "The group",
      username: null,
      firstSeenAt: 1,
      lastSeenAt: NOW,
    });
    await storage.upsertChat({
      id: "42",
      type: "private",
      title: null,
      username: "solo",
      firstSeenAt: 1,
      lastSeenAt: NOW,
    });
    // The private chat outspends the group, so it would top the ranking.
    await storage.addChatSpend("-100", 0.5, NOW);
    await storage.addChatSpend("42", 5, NOW);
    await storage.addGlobalSpend(5.5, NOW);
    await tick(storage, api, NOW); // establish
    await tick(storage, api, NOW + 25 * HOUR);

    const md = api.rich[0]!.markdown;
    expect(md).toContain("The group");
    expect(md).not.toContain("@solo");
  });
});
