import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { runChecksTick } from "./runner";
import type { CheckApi } from "./resolve";
import type { RecurringCheck } from "./types";

class FakeApi implements CheckApi {
  sent: Array<{
    chat_id: string | number;
    text: string;
    other?: unknown;
  }> = [];
  editedMarkup: Array<{ chat_id: string | number; message_id: number }> = [];
  nextMessageId = 100;

  async sendMessage(
    chat_id: string | number,
    text: string,
    other?: unknown,
  ): Promise<{ message_id: number }> {
    this.sent.push({ chat_id, text, other });
    return { message_id: this.nextMessageId++ };
  }

  async editMessageReplyMarkup(
    chat_id: string | number,
    message_id: number,
  ): Promise<unknown> {
    this.editedMarkup.push({ chat_id, message_id });
    return {};
  }
}

function makeCheck(over: Partial<RecurringCheck> = {}): RecurringCheck {
  return {
    id: "c1",
    title: "Sport",
    chatId: "chat-1",
    targetUserId: "user-1",
    targetName: "Nikita",
    scheduleHour: 23,
    scheduleMinute: 30,
    timezone: "UTC",
    question: "{name}, sport? day {count}",
    yesButton: "Yes",
    noButton: "No",
    yesReply: "{name}, lying. Day {count}",
    noReply: "{name}. Day {count}",
    timeoutMinutes: 25,
    counter: 722,
    counterMode: "always_increment",
    enabled: true,
    lastFiredAtMs: 0,
    pendingMessageId: null,
    pendingFiredAtMs: null,
    createdAtMs: 0,
    ...over,
  };
}

const utcMs = (y: number, mo: number, d: number, h: number, mn: number) =>
  Date.UTC(y, mo - 1, d, h, mn);

describe("runChecksTick fire path", () => {
  test("fires due check and sets pending state", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck());
    const api = new FakeApi();
    const now = utcMs(2026, 5, 11, 23, 35);

    await runChecksTick({ storage, api, nowMs: now });

    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.chat_id).toBe("chat-1");
    expect(api.sent[0]?.text).toBe(
      `<a href="tg://user?id=user-1">Nikita</a>, sport? day 722`,
    );
    expect(api.sent[0]?.other).toEqual({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Yes", callback_data: "check:c1:yes" },
            { text: "No", callback_data: "check:c1:no" },
          ],
        ],
      },
    });
    const saved = await storage.getCheck("c1");
    expect(saved?.pendingMessageId).toBe(100);
    expect(saved?.pendingFiredAtMs).toBe(now);
    expect(saved?.lastFiredAtMs).toBe(now);
  });

  test("does not fire when lastFiredAtMs is past the scheduled time today", async () => {
    const storage = new MemoryStorage();
    const now = utcMs(2026, 5, 11, 23, 35);
    await storage.saveCheck(makeCheck({ lastFiredAtMs: now - 60_000 }));
    const api = new FakeApi();

    await runChecksTick({ storage, api, nowMs: now });
    expect(api.sent).toHaveLength(0);
  });

  test("does not fire when disabled", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck({ enabled: false }));
    const api = new FakeApi();
    await runChecksTick({
      storage,
      api,
      nowMs: utcMs(2026, 5, 11, 23, 35),
    });
    expect(api.sent).toHaveLength(0);
  });

  test("does not fire if already pending", async () => {
    const storage = new MemoryStorage();
    const now = utcMs(2026, 5, 11, 23, 35);
    await storage.saveCheck(
      makeCheck({
        pendingMessageId: 42,
        pendingFiredAtMs: now - 60_000,
        lastFiredAtMs: now - 60_000,
      }),
    );
    const api = new FakeApi();
    await runChecksTick({ storage, api, nowMs: now });
    expect(api.sent).toHaveLength(0);
  });
});

describe("runChecksTick timeout path", () => {
  test("resolves as timeout when pending and timeoutMinutes elapsed", async () => {
    const storage = new MemoryStorage();
    const firedAt = utcMs(2026, 5, 11, 23, 30);
    await storage.saveCheck(
      makeCheck({
        pendingMessageId: 42,
        pendingFiredAtMs: firedAt,
        lastFiredAtMs: firedAt,
        timeoutMinutes: 25,
      }),
    );
    const api = new FakeApi();
    const now = firedAt + 26 * 60_000;

    await runChecksTick({ storage, api, nowMs: now });

    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.text).toBe("Nikita. Day 723");
    expect(api.sent[0]?.other).toEqual({
      reply_parameters: { message_id: 42, allow_sending_without_reply: true },
    });
    const saved = await storage.getCheck("c1");
    expect(saved?.counter).toBe(723);
    expect(saved?.pendingMessageId).toBeNull();
    expect(saved?.pendingFiredAtMs).toBeNull();
  });

  test("does not resolve before timeout has elapsed", async () => {
    const storage = new MemoryStorage();
    const firedAt = utcMs(2026, 5, 11, 23, 30);
    await storage.saveCheck(
      makeCheck({
        pendingMessageId: 42,
        pendingFiredAtMs: firedAt,
        lastFiredAtMs: firedAt,
        timeoutMinutes: 25,
      }),
    );
    const api = new FakeApi();
    const now = firedAt + 10 * 60_000;
    await runChecksTick({ storage, api, nowMs: now });
    expect(api.sent).toHaveLength(0);
  });

  test("does not run timeout for disabled check", async () => {
    const storage = new MemoryStorage();
    const firedAt = utcMs(2026, 5, 11, 23, 30);
    await storage.saveCheck(
      makeCheck({
        enabled: false,
        pendingMessageId: 42,
        pendingFiredAtMs: firedAt,
        lastFiredAtMs: firedAt,
        timeoutMinutes: 25,
      }),
    );
    const api = new FakeApi();
    await runChecksTick({
      storage,
      api,
      nowMs: firedAt + 26 * 60_000,
    });
    expect(api.sent).toHaveLength(0);
  });
});

describe("runChecksTick fire failure", () => {
  test("does not mark fired if send fails (retries next tick)", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck());
    const api = new FakeApi();
    api.sendMessage = async () => {
      throw new Error("boom");
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      const now = utcMs(2026, 5, 11, 23, 35);
      await runChecksTick({ storage, api, nowMs: now });
      const saved = await storage.getCheck("c1");
      expect(saved?.pendingMessageId).toBeNull();
      expect(saved?.lastFiredAtMs).toBe(0);
    } finally {
      console.error = originalError;
    }
  });
});
