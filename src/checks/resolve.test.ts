import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { resolveCheck, type CheckApi } from "./resolve";
import type { RecurringCheck } from "./types";

class FakeApi implements CheckApi {
  sent: Array<{
    chat_id: string | number;
    text: string;
    other?: unknown;
  }> = [];
  editedMarkup: Array<{
    chat_id: string | number;
    message_id: number;
  }> = [];
  sendImpl: () => Promise<{ message_id: number }> = async () => ({
    message_id: 99,
  });

  async sendMessage(
    chat_id: string | number,
    text: string,
    other?: unknown,
  ): Promise<{ message_id: number }> {
    this.sent.push({ chat_id, text, other });
    return this.sendImpl();
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
    question: "{name}, did you do sport?",
    yesButton: "Yes",
    noButton: "No",
    yesReply: "{name}, lying. Day {count}",
    noReply: "{name}. Day {count}",
    timeoutMinutes: 25,
    counter: 722,
    counterMode: "always_increment",
    enabled: true,
    lastFiredAtMs: 0,
    pendingMessageId: 42,
    pendingFiredAtMs: 1000,
    createdAtMs: 0,
    ...over,
  };
}

describe("resolveCheck", () => {
  test("on No: increments counter, sends noReply, clears pending", async () => {
    const storage = new MemoryStorage();
    const check = makeCheck();
    await storage.saveCheck(check);
    const api = new FakeApi();

    const out = await resolveCheck({
      storage,
      api,
      check,
      answer: "no",
      fromUserId: "user-1",
    });

    const expectedNoReply = `<a href="tg://user?id=user-1">Nikita</a>. Day 723`;
    expect(out).toEqual({
      kind: "resolved",
      newCounter: 723,
      reply: expectedNoReply,
    });
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.text).toBe(expectedNoReply);
    expect(api.sent[0]?.other).toEqual({
      parse_mode: "HTML",
      reply_parameters: { message_id: 42, allow_sending_without_reply: true },
    });
    expect(api.editedMarkup).toEqual([{ chat_id: "chat-1", message_id: 42 }]);
    const saved = await storage.getCheck("c1");
    expect(saved?.counter).toBe(723);
    expect(saved?.pendingMessageId).toBeNull();
    expect(saved?.pendingFiredAtMs).toBeNull();
  });

  test("on Yes with always_increment: counter goes up, yesReply", async () => {
    const storage = new MemoryStorage();
    const check = makeCheck();
    await storage.saveCheck(check);
    const api = new FakeApi();

    const out = await resolveCheck({
      storage,
      api,
      check,
      answer: "yes",
      fromUserId: "user-1",
    });

    expect(out).toEqual({
      kind: "resolved",
      newCounter: 723,
      reply: `<a href="tg://user?id=user-1">Nikita</a>, lying. Day 723`,
    });
    expect((await storage.getCheck("c1"))?.counter).toBe(723);
  });

  test("on Yes with reset_on_yes: counter resets to 0", async () => {
    const storage = new MemoryStorage();
    const check = makeCheck({ counterMode: "reset_on_yes", counter: 5 });
    await storage.saveCheck(check);
    const api = new FakeApi();

    const out = await resolveCheck({
      storage,
      api,
      check,
      answer: "yes",
      fromUserId: "user-1",
    });

    expect(out).toEqual({
      kind: "resolved",
      newCounter: 0,
      reply: `<a href="tg://user?id=user-1">Nikita</a>, lying. Day 0`,
    });
    expect((await storage.getCheck("c1"))?.counter).toBe(0);
  });

  test("on No with reset_on_yes: counter still increments", async () => {
    const storage = new MemoryStorage();
    const check = makeCheck({ counterMode: "reset_on_yes", counter: 5 });
    await storage.saveCheck(check);
    const api = new FakeApi();

    const out = await resolveCheck({
      storage,
      api,
      check,
      answer: "no",
      fromUserId: "user-1",
    });

    if (out.kind !== "resolved") throw new Error("unexpected outcome");
    expect(out.newCounter).toBe(6);
  });

  test("timeout treated as no", async () => {
    const storage = new MemoryStorage();
    const check = makeCheck();
    await storage.saveCheck(check);
    const api = new FakeApi();

    const out = await resolveCheck({
      storage,
      api,
      check,
      answer: "timeout",
      fromUserId: null,
    });

    expect(out).toEqual({
      kind: "resolved",
      newCounter: 723,
      reply: `<a href="tg://user?id=user-1">Nikita</a>. Day 723`,
    });
  });

  test("wrong_user: doesn't change state or send", async () => {
    const storage = new MemoryStorage();
    const check = makeCheck();
    await storage.saveCheck(check);
    const api = new FakeApi();

    const out = await resolveCheck({
      storage,
      api,
      check,
      answer: "yes",
      fromUserId: "intruder",
    });

    expect(out.kind).toBe("wrong_user");
    expect(api.sent).toHaveLength(0);
    const saved = await storage.getCheck("c1");
    expect(saved?.counter).toBe(722);
    expect(saved?.pendingMessageId).toBe(42);
  });

  test("not_pending: returns not_pending if pendingMessageId is null", async () => {
    const storage = new MemoryStorage();
    const check = makeCheck({ pendingMessageId: null });
    await storage.saveCheck(check);
    const api = new FakeApi();

    const out = await resolveCheck({
      storage,
      api,
      check,
      answer: "no",
      fromUserId: "user-1",
    });

    expect(out.kind).toBe("not_pending");
    expect(api.sent).toHaveLength(0);
  });
});
