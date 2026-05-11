import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { handleCheckCallback } from "./check-callback";
import type { CheckApi } from "../../checks/resolve";
import type { RecurringCheck } from "../../checks/types";

class FakeApi implements CheckApi {
  sent: Array<{ chat_id: string | number; text: string }> = [];
  edited: Array<{ chat_id: string | number; message_id: number }> = [];

  async sendMessage(chat_id: string | number, text: string) {
    this.sent.push({ chat_id, text });
    return { message_id: 1 };
  }
  async editMessageReplyMarkup(chat_id: string | number, message_id: number) {
    this.edited.push({ chat_id, message_id });
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
    question: "q",
    yesButton: "Y",
    noButton: "N",
    yesReply: "{name} y {count}",
    noReply: "{name} n {count}",
    timeoutMinutes: 25,
    counter: 10,
    counterMode: "always_increment",
    enabled: true,
    lastFiredAtMs: 0,
    pendingMessageId: 42,
    pendingFiredAtMs: 1000,
    createdAtMs: 0,
    ...over,
  };
}

describe("handleCheckCallback", () => {
  test("not_found when check id is unknown", async () => {
    const storage = new MemoryStorage();
    const api = new FakeApi();
    const out = await handleCheckCallback({
      storage,
      api,
      checkId: "nope",
      answer: "yes",
      fromUserId: "user-1",
      callbackMessageId: 42,
    });
    expect(out.kind).toBe("not_found");
  });

  test("stale when message id doesn't match pending", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck());
    const api = new FakeApi();
    const out = await handleCheckCallback({
      storage,
      api,
      checkId: "c1",
      answer: "yes",
      fromUserId: "user-1",
      callbackMessageId: 999,
    });
    expect(out.kind).toBe("stale");
    expect(api.sent).toHaveLength(0);
  });

  test("wrong_user when from is not target", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck());
    const api = new FakeApi();
    const out = await handleCheckCallback({
      storage,
      api,
      checkId: "c1",
      answer: "yes",
      fromUserId: "intruder",
      callbackMessageId: 42,
    });
    expect(out.kind).toBe("wrong_user");
    expect(api.sent).toHaveLength(0);
  });

  test("resolved on valid click", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck());
    const api = new FakeApi();
    const out = await handleCheckCallback({
      storage,
      api,
      checkId: "c1",
      answer: "no",
      fromUserId: "user-1",
      callbackMessageId: 42,
    });
    expect(out.kind).toBe("resolved");
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.text).toBe("Nikita n 11");
    const saved = await storage.getCheck("c1");
    expect(saved?.pendingMessageId).toBeNull();
    expect(saved?.counter).toBe(11);
  });

  test("stale when not pending", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck({ pendingMessageId: null }));
    const api = new FakeApi();
    const out = await handleCheckCallback({
      storage,
      api,
      checkId: "c1",
      answer: "yes",
      fromUserId: "user-1",
      callbackMessageId: 42,
    });
    expect(out.kind).toBe("stale");
  });
});
