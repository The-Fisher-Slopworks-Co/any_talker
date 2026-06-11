// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { GrammyError } from "grammy";
import { MemoryStorage } from "../storage/memory";
import { deliverReminder, type ReminderApi } from "./delivery";
import { createMainPersonaResolver } from "../managed-bots/persona";
import type { Reminder } from "./types";
import type { AIClient, AIMessage, AskResult } from "../ai/types";
import type { Tool, ToolCallContext } from "../ai/tools/registry";
import { _resetRegistryForTest } from "../ai/tools/registry";

type AskArgs = {
  models: string[];
  system: string;
  messages: AIMessage[];
  tools: Tool[];
  toolCallContext: ToolCallContext;
};

class FakeAI implements AIClient {
  calls: AskArgs[] = [];
  constructor(private readonly impl: () => Promise<AskResult>) {}
  async ask(opts: AskArgs): Promise<AskResult> {
    this.calls.push(opts);
    return this.impl();
  }
}

class FakeTgApi implements ReminderApi {
  richCalls: {
    chat_id: string | number;
    markdown: string;
    reply_parameters?: unknown;
  }[] = [];
  calls: { chat_id: string | number; text: string; other?: unknown }[] = [];
  constructor(
    // Used by both methods so an `impl` that throws models Telegram failing the
    // rich send AND the plain fallback (the permanent/transient classification
    // is driven off the fallback). `richImpl` overrides just the rich send, to
    // exercise the rich-fails-but-plain-succeeds fallback.
    private readonly impl: (...args: unknown[]) => Promise<unknown> = async () =>
      ({}),
    private readonly richImpl?: (...args: unknown[]) => Promise<unknown>,
  ) {}
  async sendRichMessage(params: {
    chat_id: string | number;
    rich_message: { markdown: string };
    reply_parameters?: unknown;
  }) {
    this.richCalls.push({
      chat_id: params.chat_id,
      markdown: params.rich_message.markdown,
      reply_parameters: params.reply_parameters,
    });
    return (this.richImpl ?? this.impl)(params);
  }
  async sendMessage(chat_id: string | number, text: string, other?: unknown) {
    this.calls.push({ chat_id, text, other });
    return this.impl(chat_id, text, other);
  }
}

const okAI = (text = "<i>пора пить чай</i>"): FakeAI =>
  new FakeAI(async () => ({ text, totalTokens: 10 }));

const reminderAsk = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  userId: "u1",
  chatId: "c1",
  lang: "ru",
  fireAtMs: Date.UTC(2026, 4, 20, 15, 0),
  createdAtMs: Date.UTC(2026, 4, 20, 9, 0),
  text: "купить молоко",
  target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
  contextMessages: [],
  ...over,
});

const reminderGuest = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r2",
  userId: "u42",
  chatId: "u42",
  lang: "en",
  fireAtMs: Date.UTC(2026, 4, 20, 15, 0),
  createdAtMs: Date.UTC(2026, 4, 20, 9, 0),
  text: "buy bread",
  target: { kind: "guest_dm", userId: "u42" },
  contextMessages: [],
  ...over,
});

const grammyErr = (code: number) =>
  new GrammyError(
    `fail ${code}`,
    { ok: false, error_code: code, description: "fail" },
    "sendMessage",
    {},
  );

const deps = (ai: AIClient, api: ReminderApi, storage = new MemoryStorage()) =>
  ({ storage, api, ai, resolver: createMainPersonaResolver(storage), botId: null });

describe("deliverReminder (AI-driven)", () => {
  test("ask_reply: builds reminder_fired envelope and sends AI output with reply_parameters", async () => {
    _resetRegistryForTest();
    const ai = okAI("hello <b>friend</b>");
    const api = new FakeTgApi();
    const storage = new MemoryStorage();

    const r = reminderAsk();
    const out = await deliverReminder(deps(ai, api, storage), r, r.fireAtMs);
    expect(out).toBe("delivered");

    // AI was asked exactly once with a reminder envelope
    expect(ai.calls).toHaveLength(1);
    const askMsg = ai.calls[0]!.messages[0]!;
    expect(askMsg.role).toBe("user");
    const envelope = JSON.parse(askMsg.content as string);
    expect(envelope.system_event).toBe("reminder_fired");
    expect(envelope.note).toBe("купить молоко");
    expect(envelope.scheduled_for).toMatch(/^2026-05-20 /);
    expect(envelope.scheduled_at).toMatch(/^2026-05-20 /);

    // Tool context carries chat/user/source from the reminder
    expect(ai.calls[0]!.toolCallContext).toMatchObject({
      source: "ask",
      chatId: "c1",
      userId: "u1",
      replyToMessageId: 7,
      lang: "ru",
    });

    // Telegram was called via sendRichMessage with the AI output as markdown
    // and reply_parameters
    expect(api.richCalls).toHaveLength(1);
    expect(api.calls).toEqual([]);
    expect(api.richCalls[0]!.chat_id).toBe("c1");
    expect(api.richCalls[0]!.markdown).toContain("hello <b>friend</b>");
    expect(api.richCalls[0]!.reply_parameters).toEqual({
      message_id: 7,
      allow_sending_without_reply: true,
    });
  });

  test("guest_dm: sends AI output to userId DM without reply_parameters", async () => {
    _resetRegistryForTest();
    const ai = okAI("howdy");
    const api = new FakeTgApi();
    const r = reminderGuest();
    const out = await deliverReminder(deps(ai, api), r, r.fireAtMs);
    expect(out).toBe("delivered");
    expect(api.richCalls[0]!.chat_id).toBe("u42");
    expect(api.richCalls[0]!.reply_parameters).toBeUndefined();
    expect(ai.calls[0]!.toolCallContext).toMatchObject({
      source: "guest",
      chatId: "u42",
      userId: "u42",
      replyToMessageId: null,
      lang: "en",
    });
  });

  test("applies bot name prefix from chat settings", async () => {
    _resetRegistryForTest();
    const ai = okAI("body");
    const api = new FakeTgApi();
    const storage = new MemoryStorage();
    await storage.saveChatSettings("c1", { botName: "Capybara" });

    const r = reminderAsk();
    await deliverReminder(deps(ai, api, storage), r, r.fireAtMs);
    expect(api.richCalls[0]!.markdown).toContain("<b>Capybara</b>");
    expect(api.richCalls[0]!.markdown).toContain("body");
  });

  test("envelope embeds user_name and user_gender when known", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi();
    const storage = new MemoryStorage();
    await storage.setUserName("u1", "Alice");
    await storage.setUserGender("u1", "female");
    const r = reminderAsk();
    await deliverReminder(deps(ai, api, storage), r, r.fireAtMs);
    const envelope = JSON.parse(ai.calls[0]!.messages[0]!.content as string);
    expect(envelope.user_name).toBe("Alice");
    expect(envelope.user_gender).toBe("female");
  });

  test("envelope falls back to user record name when no override", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi();
    const storage = new MemoryStorage();
    await storage.upsertUser({
      id: "u1",
      firstName: "Bob",
      lastName: "Smith",
      username: null,
      lastSeenAt: 0,
    });
    const r = reminderAsk();
    await deliverReminder(deps(ai, api, storage), r, r.fireAtMs);
    const envelope = JSON.parse(ai.calls[0]!.messages[0]!.content as string);
    expect(envelope.user_name).toBe("Bob Smith");
  });

  test("falls back to note text when AI returns an empty string", async () => {
    _resetRegistryForTest();
    const ai = new FakeAI(async () => ({ text: "   ", totalTokens: 0 }));
    const api = new FakeTgApi();
    const r = reminderAsk();
    const out = await deliverReminder(deps(ai, api), r, r.fireAtMs);
    expect(out).toBe("delivered");
    expect(api.richCalls[0]!.markdown).toContain("купить молоко");
  });

  test("rich send failure falls back to a plain message", async () => {
    _resetRegistryForTest();
    const ai = okAI("plain me");
    // sendRichMessage rejects; the plain sendMessage fallback succeeds.
    const api = new FakeTgApi(
      async () => ({}),
      async () => {
        throw new Error("rich rejected");
      },
    );
    const r = reminderAsk();
    const out = await deliverReminder(deps(ai, api), r, r.fireAtMs);
    expect(out).toBe("delivered");
    expect(api.richCalls).toHaveLength(1);
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]!.chat_id).toBe("c1");
    expect(api.calls[0]!.text).toContain("plain me");
    expect(api.calls[0]!.other).toEqual({
      reply_parameters: { message_id: 7, allow_sending_without_reply: true },
    });
  });

  test("AI throw -> transient (reminder not sent)", async () => {
    _resetRegistryForTest();
    const ai = new FakeAI(async () => {
      throw new Error("boom");
    });
    const api = new FakeTgApi();
    const r = reminderAsk();
    const out = await deliverReminder(deps(ai, api), r, r.fireAtMs);
    expect(out).toBe("transient");
    expect(api.richCalls).toEqual([]);
    expect(api.calls).toEqual([]);
  });

  test("Telegram 403 -> permanent", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi(async () => {
      throw grammyErr(403);
    });
    const r = reminderGuest();
    expect(await deliverReminder(deps(ai, api), r, r.fireAtMs)).toBe(
      "permanent",
    );
  });

  test("Telegram 400 -> permanent", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi(async () => {
      throw grammyErr(400);
    });
    const r = reminderAsk();
    expect(await deliverReminder(deps(ai, api), r, r.fireAtMs)).toBe(
      "permanent",
    );
  });

  test("Telegram 429 -> transient", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi(async () => {
      throw grammyErr(429);
    });
    const r = reminderAsk();
    expect(await deliverReminder(deps(ai, api), r, r.fireAtMs)).toBe(
      "transient",
    );
  });

  test("Telegram 500 -> transient", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi(async () => {
      throw grammyErr(500);
    });
    const r = reminderAsk();
    expect(await deliverReminder(deps(ai, api), r, r.fireAtMs)).toBe(
      "transient",
    );
  });

  test("non-grammy Telegram error -> transient", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi(async () => {
      throw new Error("network blip");
    });
    const r = reminderAsk();
    expect(await deliverReminder(deps(ai, api), r, r.fireAtMs)).toBe(
      "transient",
    );
  });

  test("replays stored contextMessages before the reminder_fired event", async () => {
    _resetRegistryForTest();
    const ai = okAI("re-check");
    const api = new FakeTgApi();
    const r = reminderAsk({
      contextMessages: [
        {
          role: "user",
          content: "Context (replied message from Eugene): <media>",
        },
        {
          role: "user",
          content: JSON.stringify({
            author: "Eugene",
            text: "Через минуту напомни посмотреть на этих людей",
          }),
        },
      ],
    });
    await deliverReminder(deps(ai, api), r, r.fireAtMs);
    const sent = ai.calls[0]!.messages;
    expect(sent).toHaveLength(3);
    expect(sent[0]!.content).toContain("Eugene");
    expect(sent[1]!.content).toContain("Через минуту");
    const envelope = JSON.parse(sent[2]!.content as string);
    expect(envelope.system_event).toBe("reminder_fired");
  });

  test("replays image parts from contextMessages as bytes", async () => {
    _resetRegistryForTest();
    const ai = okAI("ok");
    const api = new FakeTgApi();
    const bytes = new Uint8Array([5, 6, 7, 8]);
    const b64 = Buffer.from(bytes).toString("base64");
    const r = reminderAsk({
      contextMessages: [
        {
          role: "user",
          content: [
            { type: "text", text: "see this:" },
            { type: "image", image_base64: b64, mediaType: "image/jpeg" },
          ],
        },
      ],
    });
    await deliverReminder(deps(ai, api), r, r.fireAtMs);
    const first = ai.calls[0]!.messages[0]!;
    const parts = first.content as Array<{ type: string }>;
    expect(parts[1]).toMatchObject({ type: "image", mediaType: "image/jpeg" });
    const img = parts[1] as unknown as { image: Uint8Array };
    expect(Array.from(img.image)).toEqual([5, 6, 7, 8]);
  });

  test("uses chat-scoped system prompt and model overrides", async () => {
    _resetRegistryForTest();
    const ai = okAI();
    const api = new FakeTgApi();
    const storage = new MemoryStorage();
    await storage.saveChatSettings("c1", {
      systemPrompt: "Be a pirate.",
      models: ["custom/model"],
    });
    const r = reminderAsk();
    await deliverReminder(deps(ai, api, storage), r, r.fireAtMs);
    expect(ai.calls[0]!.models).toEqual(["custom/model"]);
    expect(ai.calls[0]!.system).toContain("Be a pirate.");
  });
});
