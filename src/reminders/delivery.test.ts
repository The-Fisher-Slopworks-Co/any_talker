// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { GrammyError } from "grammy";
import { deliverReminder, type ReminderApi } from "./delivery";
import type { Reminder } from "./types";

class FakeApi implements ReminderApi {
  calls: { chat_id: string | number; text: string; other?: unknown }[] = [];
  constructor(private readonly impl: (...args: unknown[]) => Promise<unknown>) {}
  async sendMessage(chat_id: string | number, text: string, other?: unknown) {
    this.calls.push({ chat_id, text, other });
    return this.impl(chat_id, text, other);
  }
}

const okImpl = async () => ({});

const reminderAsk = (): Reminder => ({
  id: "r1",
  userId: "u1",
  fireAtMs: 1,
  text: "hello",
  target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
  createdAtMs: 0,
});
const reminderGuest = (): Reminder => ({
  id: "r2",
  userId: "u42",
  fireAtMs: 1,
  text: "dm",
  target: { kind: "guest_dm", userId: "u42" },
  createdAtMs: 0,
});

const grammyErr = (code: number) =>
  new GrammyError(
    `fail ${code}`,
    { ok: false, error_code: code, description: "fail" },
    "sendMessage",
    {},
  );

describe("deliverReminder", () => {
  test("ask_reply -> sendMessage with reply_parameters", async () => {
    const api = new FakeApi(okImpl);
    const out = await deliverReminder(api, reminderAsk());
    expect(out).toBe("delivered");
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]?.chat_id).toBe("c1");
    expect(api.calls[0]?.text).toBe("hello");
    expect(api.calls[0]?.other).toEqual({
      reply_parameters: { message_id: 7, allow_sending_without_reply: true },
    });
  });

  test("guest_dm -> sendMessage to userId, no reply_parameters", async () => {
    const api = new FakeApi(okImpl);
    const out = await deliverReminder(api, reminderGuest());
    expect(out).toBe("delivered");
    expect(api.calls[0]?.chat_id).toBe("u42");
    expect(api.calls[0]?.other).toBeUndefined();
  });

  test("403 -> permanent", async () => {
    const api = new FakeApi(async () => {
      throw grammyErr(403);
    });
    expect(await deliverReminder(api, reminderGuest())).toBe("permanent");
  });

  test("400 -> permanent", async () => {
    const api = new FakeApi(async () => {
      throw grammyErr(400);
    });
    expect(await deliverReminder(api, reminderAsk())).toBe("permanent");
  });

  test("429 -> transient", async () => {
    const api = new FakeApi(async () => {
      throw grammyErr(429);
    });
    expect(await deliverReminder(api, reminderAsk())).toBe("transient");
  });

  test("500 -> transient", async () => {
    const api = new FakeApi(async () => {
      throw grammyErr(500);
    });
    expect(await deliverReminder(api, reminderAsk())).toBe("transient");
  });

  test("non-grammy error -> transient", async () => {
    const api = new FakeApi(async () => {
      throw new Error("network blip");
    });
    expect(await deliverReminder(api, reminderAsk())).toBe("transient");
  });
});
