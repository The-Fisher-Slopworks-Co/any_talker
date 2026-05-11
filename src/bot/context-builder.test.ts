// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { buildContext } from "./context-builder";

const SENDER = {
  firstName: "John",
  lastName: "Doe",
  nameOverride: null,
  gender: null,
};
const envelope = (extra: { quote?: string; text?: string } = {}) => {
  const obj: Record<string, string> = { author: "John Doe" };
  if (extra.quote !== undefined) obj.quote = extra.quote;
  obj.text = extra.text ?? "";
  return JSON.stringify(obj);
};

describe("buildContext", () => {
  test("no reply: just current user JSON envelope", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "hello",
      quote: null,
      replyTarget: null,
      image: null,
    });
    expect(msgs).toEqual([{ role: "user", content: envelope({ text: "hello" }) }]);
  });

  test("envelope contains author, quote, text in that exact order", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "what does this mean",
      quote: "to be or not to be",
      replyTarget: null,
      image: null,
    });
    expect(msgs[0]!.content).toBe(
      JSON.stringify({ author: "John Doe", quote: "to be or not to be", text: "what does this mean" }),
    );
    // Field order check (the keys must come out as author, quote, text):
    expect(Object.keys(JSON.parse(msgs[0]!.content as string))).toEqual([
      "author",
      "quote",
      "text",
    ]);
  });

  test("author falls back to first name when last name missing", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: { firstName: "Alice", lastName: null, nameOverride: null, gender: null },
      userText: "hi",
      quote: null,
      replyTarget: null,
      image: null,
    });
    expect(JSON.parse(msgs[0]!.content as string).author).toBe("Alice");
  });

  test("nameOverride takes precedence over firstName + lastName", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: { firstName: "John", lastName: "Doe", nameOverride: "Pseudonym", gender: null },
      userText: "hi",
      quote: null,
      replyTarget: null,
      image: null,
    });
    expect(JSON.parse(msgs[0]!.content as string).author).toBe("Pseudonym");
  });

  test("empty/whitespace nameOverride falls back to firstName + lastName", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: { firstName: "John", lastName: "Doe", nameOverride: "   ", gender: null },
      userText: "hi",
      quote: null,
      replyTarget: null,
      image: null,
    });
    expect(JSON.parse(msgs[0]!.content as string).author).toBe("John Doe");
  });

  test("gender field appears between author and text when set", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: { firstName: "Саша", lastName: null, nameOverride: null, gender: "female" },
      userText: "привет",
      quote: null,
      replyTarget: null,
      image: null,
    });
    expect(msgs[0]!.content).toBe(
      JSON.stringify({ author: "Саша", gender: "female", text: "привет" }),
    );
    expect(Object.keys(JSON.parse(msgs[0]!.content as string))).toEqual([
      "author",
      "gender",
      "text",
    ]);
  });

  test("gender is omitted when null", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "hi",
      quote: null,
      replyTarget: null,
      image: null,
    });
    const parsed = JSON.parse(msgs[0]!.content as string);
    expect("gender" in parsed).toBe(false);
  });

  test("quote field is omitted when not provided", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "hi",
      quote: null,
      replyTarget: null,
      image: null,
    });
    const parsed = JSON.parse(msgs[0]!.content as string);
    expect("quote" in parsed).toBe(false);
  });

  test("reply to non-bot message includes synthetic context", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "what does that mean",
      quote: null,
      replyTarget: { messageId: 999, text: "to be or not to be", authorFirstName: "Alice", image: null },
      image: null,
    });
    expect(msgs).toEqual([
      {
        role: "user",
        content: "Context (replied message from Alice): to be or not to be",
      },
      { role: "user", content: envelope({ text: "what does that mean" }) },
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
      sender: SENDER,
      userText: "follow-up",
      quote: null,
      replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot", image: null },
      image: null,
    });
    expect(msgs).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: envelope({ text: "follow-up" }) },
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
      sender: SENDER,
      userText: "Q3",
      quote: null,
      replyTarget: { messageId: 200, text: "A2", authorFirstName: "Bot", image: null },
      image: null,
    });
    expect(msgs).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "A2" },
      { role: "user", content: envelope({ text: "Q3" }) },
    ]);
  });

  test("missing ancestor stops walk and includes synthetic for current node", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "hi",
      quote: null,
      replyTarget: { messageId: 500, text: "old bot reply", authorFirstName: "Bot", image: null },
      image: null,
    });
    expect(msgs).toEqual([
      { role: "user", content: "Context (replied message from Bot): old bot reply" },
      { role: "user", content: envelope({ text: "hi" }) },
    ]);
  });

  test("depth cap honored", async () => {
    const storage = new MemoryStorage();
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
      sender: SENDER,
      userText: "next",
      quote: null,
      replyTarget: { messageId: depth, text: `A${depth}`, authorFirstName: "Bot", image: null },
      image: null,
      maxDepth: 5,
    });
    // (5 user + 5 assistant) + 1 current user = 11
    expect(msgs.length).toBe(11);
    expect(msgs[0]).toEqual({ role: "user", content: `Q${depth - 4}` });
  });

  test("reply target without text uses <media> placeholder", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "what is this",
      quote: null,
      replyTarget: { messageId: 12, text: null, authorFirstName: "Alice", image: null },
      image: null,
    });
    expect(msgs[0]).toEqual({
      role: "user",
      content: "Context (replied message from Alice): <media>",
    });
  });

  test("empty userText with non-bot reply: synthetic context becomes the prompt", async () => {
    const storage = new MemoryStorage();
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "",
      quote: null,
      replyTarget: { messageId: 999, text: "what is 2+2?", authorFirstName: "Alice", image: null },
      image: null,
    });
    expect(msgs).toEqual([
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
      sender: SENDER,
      userText: "",
      quote: null,
      replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot", image: null },
      image: null,
    });
    expect(msgs).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
    ]);
  });

  test("reply photo is attached to the synthetic context message when reply isn't in the chain", async () => {
    const storage = new MemoryStorage();
    const replyBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1]);
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "what's on this picture?",
      quote: null,
      image: null,
      replyTarget: {
        messageId: 999,
        text: null,
        authorFirstName: "Alice",
        image: replyBytes,
      },
    });
    expect(msgs).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Context (replied message from Alice): <media>" },
          { type: "image", image: replyBytes, mediaType: "image/jpeg" },
        ],
      },
      { role: "user", content: envelope({ text: "what's on this picture?" }) },
    ]);
  });

  test("image is attached as a content part alongside the envelope", async () => {
    const storage = new MemoryStorage();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "what is on this picture?",
      quote: null,
      replyTarget: null,
      image: bytes,
    });
    expect(msgs).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: envelope({ text: "what is on this picture?" }) },
          { type: "image", image: bytes, mediaType: "image/jpeg" },
        ],
      },
    ]);
  });

  test("image-only message (no text, no quote) still produces multi-part envelope", async () => {
    const storage = new MemoryStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    const msgs = await buildContext({
      storage,
      chatId: "c1",
      sender: SENDER,
      userText: "",
      quote: null,
      replyTarget: null,
      image: bytes,
    });
    expect(msgs).toHaveLength(1);
    expect(Array.isArray(msgs[0]!.content)).toBe(true);
  });

  test("quote-only message (empty text) still produces envelope when reply is to bot msg", async () => {
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
      sender: SENDER,
      userText: "",
      quote: "explain this part",
      replyTarget: { messageId: 100, text: "A1", authorFirstName: "Bot", image: null },
      image: null,
    });
    expect(msgs).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: envelope({ quote: "explain this part", text: "" }) },
    ]);
  });
});
