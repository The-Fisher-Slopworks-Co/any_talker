import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { buildContext } from "./context-builder";

describe("buildContext", () => {
  test("no reply: just system + current user message", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "hello",
      replyTarget: null,
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hello" },
    ]);
  });

  test("reply to non-bot message includes synthetic context", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "what does that mean",
      replyTarget: { messageId: 999, text: "to be or not to be", authorFirstName: "Alice" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      {
        role: "user",
        content: "Context (replied message from Alice): to be or not to be",
      },
      { role: "user", content: "what does that mean" },
    ]);
  });

  test("reply to bot message walks single ancestor", async () => {
    const storage = new MemoryStorage();
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "follow-up",
      replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "follow-up" },
    ]);
  });

  test("reply chain walks ancestors in chronological order", async () => {
    const storage = new MemoryStorage();
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    await storage.saveConversation("c1", 200, {
      userQuestion: "Q2",
      botAnswer: "A2",
      parentBotMsgId: 100,
      ts: 2,
    });
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "Q3",
      replyTarget: { messageId: 200, text: "A2", authorFirstName: "Bot" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "A2" },
      { role: "user", content: "Q3" },
    ]);
  });

  test("missing ancestor stops walk and includes synthetic for current node", async () => {
    const storage = new MemoryStorage();
    // Storage has no node for messageId=500
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "hi",
      replyTarget: { messageId: 500, text: "old bot reply", authorFirstName: "Bot" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Context (replied message from Bot): old bot reply" },
      { role: "user", content: "hi" },
    ]);
  });

  test("depth cap honored", async () => {
    const storage = new MemoryStorage();
    // Build a very deep chain
    const depth = 25;
    let prevId: number | null = null;
    for (let i = 1; i <= depth; i++) {
      await storage.saveConversation("c1", i, {
        userQuestion: `Q${i}`,
        botAnswer: `A${i}`,
        parentBotMsgId: prevId,
        ts: i,
      });
      prevId = i;
    }
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "next",
      replyTarget: { messageId: depth, text: `A${depth}`, authorFirstName: "Bot" },
      maxDepth: 5,
    });
    // 1 system + (5 user + 5 assistant) + 1 current user = 12
    expect(msgs.length).toBe(12);
    expect(msgs[1]).toEqual({ role: "user", content: `Q${depth - 4}` });
  });

  test("reply target without text uses <media> placeholder", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "what is this",
      replyTarget: { messageId: 12, text: null, authorFirstName: "Alice" },
    });
    expect(msgs[1]).toEqual({
      role: "user",
      content: "Context (replied message from Alice): <media>",
    });
  });

  test("empty userText with non-bot reply: synthetic context becomes the prompt", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "",
      replyTarget: { messageId: 999, text: "what is 2+2?", authorFirstName: "Alice" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Context (replied message from Alice): what is 2+2?" },
    ]);
  });

  test("empty userText with bot-msg reply: chain becomes the prompt (no trailing empty user)", async () => {
    const storage = new MemoryStorage();
    await storage.saveConversation("c1", 100, {
      userQuestion: "Q1",
      botAnswer: "A1",
      parentBotMsgId: null,
      ts: 1,
    });
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      systemPrompt: "SYS",
      userText: "",
      replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot" },
    });
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
    ]);
  });
});
