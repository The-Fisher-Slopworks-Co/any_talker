// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { Message } from "grammy/types";
import { MemoryStorage } from "../storage/memory";
import { resolveReplyImages } from "./reply-images";

const photoSize = (id: string, w = 800, h = 600) => ({
  file_id: id,
  file_unique_id: `u_${id}`,
  width: w,
  height: h,
});

const makeMessage = (overrides: Partial<Message> & { message_id: number }): Message =>
  ({
    date: 1,
    chat: { id: 1, type: "private" },
    ...overrides,
  }) as Message;

describe("resolveReplyImages", () => {
  test("single-photo reply: downloads one image from reply_to_message", async () => {
    const storage = new MemoryStorage();
    const downloaded: string[] = [];
    const bytes = new Uint8Array([1, 2, 3]);
    const replyToMessage = makeMessage({
      message_id: 100,
      photo: [photoSize("low", 90, 90), photoSize("hi", 800, 600)],
    });
    const result = await resolveReplyImages({
      chatId: "c1",
      replyToMessage,
      storage,
      fetchPhoto: async (id) => {
        downloaded.push(id);
        return bytes;
      },
    });
    expect(downloaded).toEqual(["hi"]);
    expect(result).toEqual([bytes]);
  });

  test("album reply: pulls all photos from storage index, sorted by message_id", async () => {
    const storage = new MemoryStorage();
    await storage.appendAlbumPhoto("c1", "group42", {
      messageId: 102,
      fileId: "third",
    });
    await storage.appendAlbumPhoto("c1", "group42", {
      messageId: 100,
      fileId: "first",
    });
    await storage.appendAlbumPhoto("c1", "group42", {
      messageId: 101,
      fileId: "second",
    });
    const downloaded: string[] = [];
    const replyToMessage = makeMessage({
      message_id: 101,
      media_group_id: "group42",
      photo: [photoSize("second")],
    });
    const result = await resolveReplyImages({
      chatId: "c1",
      replyToMessage,
      storage,
      fetchPhoto: async (id) => {
        downloaded.push(id);
        return new Uint8Array([id.length]);
      },
    });
    expect(downloaded).toEqual(["first", "second", "third"]);
    expect(result).toHaveLength(3);
  });

  test("album reply with empty index falls back to single-photo from reply_to_message", async () => {
    const storage = new MemoryStorage();
    const downloaded: string[] = [];
    const replyToMessage = makeMessage({
      message_id: 200,
      media_group_id: "missing_group",
      photo: [photoSize("only")],
    });
    const result = await resolveReplyImages({
      chatId: "c1",
      replyToMessage,
      storage,
      fetchPhoto: async (id) => {
        downloaded.push(id);
        return new Uint8Array([0xaa]);
      },
    });
    expect(downloaded).toEqual(["only"]);
    expect(result).toHaveLength(1);
  });

  test("returns empty array when reply has no photo and no album", async () => {
    const storage = new MemoryStorage();
    const replyToMessage = makeMessage({ message_id: 1, text: "hello" });
    const result = await resolveReplyImages({
      chatId: "c1",
      replyToMessage,
      storage,
      fetchPhoto: async () => new Uint8Array(),
    });
    expect(result).toEqual([]);
  });

  test("album indexed in a different chat is not visible", async () => {
    const storage = new MemoryStorage();
    await storage.appendAlbumPhoto("other_chat", "g1", {
      messageId: 1,
      fileId: "x",
    });
    const replyToMessage = makeMessage({
      message_id: 5,
      media_group_id: "g1",
      photo: [photoSize("fallback")],
    });
    const result = await resolveReplyImages({
      chatId: "c1",
      replyToMessage,
      storage,
      fetchPhoto: async (id) => new Uint8Array([id.charCodeAt(0)]),
    });
    expect(result).toEqual([new Uint8Array(["f".charCodeAt(0)])]);
  });

  test("album fetch failure returns empty array (no partial image)", async () => {
    const storage = new MemoryStorage();
    await storage.appendAlbumPhoto("c1", "g", { messageId: 1, fileId: "a" });
    await storage.appendAlbumPhoto("c1", "g", { messageId: 2, fileId: "b" });
    const replyToMessage = makeMessage({
      message_id: 1,
      media_group_id: "g",
      photo: [photoSize("a")],
    });
    const result = await resolveReplyImages({
      chatId: "c1",
      replyToMessage,
      storage,
      fetchPhoto: async (id) => {
        if (id === "b") throw new Error("download failed");
        return new Uint8Array([1]);
      },
    });
    expect(result).toEqual([]);
  });

  test("duplicate appends for the same message_id keep one entry", async () => {
    const storage = new MemoryStorage();
    await storage.appendAlbumPhoto("c1", "g", { messageId: 1, fileId: "old" });
    await storage.appendAlbumPhoto("c1", "g", { messageId: 1, fileId: "new" });
    const replyToMessage = makeMessage({
      message_id: 1,
      media_group_id: "g",
      photo: [photoSize("ignored")],
    });
    const seen: string[] = [];
    await resolveReplyImages({
      chatId: "c1",
      replyToMessage,
      storage,
      fetchPhoto: async (id) => {
        seen.push(id);
        return new Uint8Array();
      },
    });
    expect(seen).toEqual(["new"]);
  });
});
