// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { Update } from "@grammyjs/types/update";
import { extractUpdateMeta, prettyFields } from "./log-update";

const baseUser = {
  id: 789,
  is_bot: false,
  first_name: "Alice",
  username: "alice",
};

const baseChat = { id: 456, type: "private" as const, first_name: "Alice" };

describe("extractUpdateMeta", () => {
  test("plain text message", () => {
    const update = {
      update_id: 8472,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: baseUser,
        text: "hi there",
      },
    } as unknown as Update;

    expect(extractUpdateMeta(update)).toEqual({
      update_id: 8472,
      type: "message",
      chat: { id: 456, type: "private" },
      from: { id: 789, username: "alice" },
      flags: { text_len: 8 },
    });
  });

  test("command message extracts the command name and sets is_command", () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: baseUser,
        text: "/ask hello",
        entities: [{ type: "bot_command", offset: 0, length: 4 }],
      },
    } as unknown as Update;

    const meta = extractUpdateMeta(update);
    expect(meta.flags.is_command).toBe(true);
    expect(meta.flags.command).toBe("ask");
  });

  test("command stripped of @botname suffix", () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: baseUser,
        text: "/ask@my_bot hi",
        entities: [{ type: "bot_command", offset: 0, length: 11 }],
      },
    } as unknown as Update;

    expect(extractUpdateMeta(update).flags.command).toBe("ask");
  });

  test("photo with caption sets has_photo and has_caption", () => {
    const update = {
      update_id: 2,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: baseUser,
        photo: [{ file_id: "x", file_unique_id: "y", width: 1, height: 1 }],
        caption: "/ask look",
        caption_entities: [{ type: "bot_command", offset: 0, length: 4 }],
      },
    } as unknown as Update;

    const meta = extractUpdateMeta(update);
    expect(meta.flags.has_photo).toBe(true);
    expect(meta.flags.has_caption).toBe(true);
    expect(meta.flags.text_len).toBeUndefined();
    expect(meta.flags.command).toBe("ask");
  });

  test("reply and forward flags set when present, omitted otherwise", () => {
    const update = {
      update_id: 3,
      message: {
        message_id: 2,
        date: 1,
        chat: baseChat,
        from: baseUser,
        text: "ok",
        reply_to_message: { message_id: 1, date: 0, chat: baseChat },
        forward_origin: { type: "user", date: 0, sender_user: baseUser },
      },
    } as unknown as Update;

    const meta = extractUpdateMeta(update);
    expect(meta.flags.is_reply).toBe(true);
    expect(meta.flags.is_forward).toBe(true);
  });

  test("guest_message marked as guest", () => {
    const update = {
      update_id: 4,
      guest_message: {
        message_id: 1,
        date: 1,
        chat: { id: -100, type: "supergroup", title: "G" },
        from: baseUser,
        text: "hi",
        guest_query_id: "q1",
      },
    } as unknown as Update;

    const meta = extractUpdateMeta(update);
    expect(meta.type).toBe("guest_message");
    expect(meta.flags.is_guest).toBe(true);
    expect(meta.chat).toEqual({ id: -100, type: "supergroup" });
  });

  test("callback_query reports type and from without chat or message flags", () => {
    const update = {
      update_id: 5,
      callback_query: {
        id: "cb1",
        from: baseUser,
        chat_instance: "ci",
        data: "x",
      },
    } as unknown as Update;

    const meta = extractUpdateMeta(update);
    expect(meta.type).toBe("callback_query");
    expect(meta.from).toEqual({ id: 789, username: "alice" });
    expect(meta.chat).toBeUndefined();
    expect(meta.flags).toEqual({});
  });

  test("inline_query reports type and from", () => {
    const update = {
      update_id: 6,
      inline_query: {
        id: "iq1",
        from: baseUser,
        query: "hello",
        offset: "",
      },
    } as unknown as Update;

    const meta = extractUpdateMeta(update);
    expect(meta.type).toBe("inline_query");
    expect(meta.from).toEqual({ id: 789, username: "alice" });
  });

  test("omits username when missing", () => {
    const update = {
      update_id: 7,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: { id: 100, is_bot: false, first_name: "Bob" },
        text: "x",
      },
    } as unknown as Update;

    expect(extractUpdateMeta(update).from).toEqual({ id: 100 });
  });

  test("unknown update type falls back to 'unknown'", () => {
    const update = { update_id: 99 } as unknown as Update;
    const meta = extractUpdateMeta(update);
    expect(meta.type).toBe("unknown");
    expect(meta.update_id).toBe(99);
  });
});

describe("prettyFields", () => {
  test("compact rendering for /ask command", () => {
    const meta = extractUpdateMeta({
      update_id: 8472,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: baseUser,
        text: "/ask hello",
        entities: [{ type: "bot_command", offset: 0, length: 4 }],
      },
    } as unknown as Update);

    expect(prettyFields(meta)).toEqual({
      update_id: 8472,
      type: "message",
      chat: "456:private",
      from: "789:@alice",
      flags: "cmd:ask,text(10)",
    });
  });

  test("from without username uses bare id", () => {
    const meta = extractUpdateMeta({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: { id: 100, is_bot: false, first_name: "Bob" },
        text: "x",
      },
    } as unknown as Update);

    expect(prettyFields(meta).from).toBe("100");
  });

  test("photo with caption emits photo,caption flags", () => {
    const meta = extractUpdateMeta({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: baseUser,
        photo: [{ file_id: "x", file_unique_id: "y", width: 1, height: 1 }],
        caption: "look",
      },
    } as unknown as Update);

    expect(prettyFields(meta).flags).toBe("caption,photo");
  });

  test("album item exposes media_group_id in flags", () => {
    const meta = extractUpdateMeta({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        chat: baseChat,
        from: baseUser,
        photo: [{ file_id: "x", file_unique_id: "y", width: 1, height: 1 }],
        media_group_id: "1234567890",
      },
    } as unknown as Update);

    expect(meta.flags.media_group_id).toBe("1234567890");
    expect(prettyFields(meta).flags).toBe("photo,group:1234567890");
  });

  test("omits flags field when no signal", () => {
    const meta = extractUpdateMeta({
      update_id: 1,
      callback_query: { id: "1", from: baseUser, chat_instance: "ci" },
    } as unknown as Update);

    expect(prettyFields(meta)).toEqual({
      update_id: 1,
      type: "callback_query",
      from: "789:@alice",
    });
  });
});
