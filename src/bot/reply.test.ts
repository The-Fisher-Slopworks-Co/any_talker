import { test, expect, describe } from "bun:test";
import type { Message } from "grammy/types";
import { resolveReplyAuthor } from "./reply";

const msg = (overrides: Partial<Message>): Message => overrides as Message;

describe("resolveReplyAuthor", () => {
  test("plain message: takes from.first_name", () => {
    expect(
      resolveReplyAuthor(msg({ from: { id: 1, is_bot: false, first_name: "Alice" } })),
    ).toBe("Alice");
  });

  test("plain message with no from: returns null", () => {
    expect(resolveReplyAuthor(msg({}))).toBeNull();
  });

  test("forwarded from a user: takes the original sender's first_name (not the forwarder)", () => {
    const r = msg({
      from: { id: 999, is_bot: false, first_name: "Forwarder" },
      forward_origin: {
        type: "user",
        date: 0,
        sender_user: { id: 7, is_bot: false, first_name: "Original" },
      },
    });
    expect(resolveReplyAuthor(r)).toBe("Original");
  });

  test("forwarded from a hidden user: uses sender_user_name", () => {
    const r = msg({
      forward_origin: { type: "hidden_user", date: 0, sender_user_name: "Anon" },
    });
    expect(resolveReplyAuthor(r)).toBe("Anon");
  });

  test("forwarded from a group chat: prefers author_signature over chat title", () => {
    const r = msg({
      forward_origin: {
        type: "chat",
        date: 0,
        sender_chat: { id: -100, type: "supergroup", title: "Some Group" },
        author_signature: "Anonymous Admin",
      },
    });
    expect(resolveReplyAuthor(r)).toBe("Anonymous Admin");
  });

  test("forwarded from a group chat without signature: falls back to title", () => {
    const r = msg({
      forward_origin: {
        type: "chat",
        date: 0,
        sender_chat: { id: -100, type: "supergroup", title: "Some Group" },
      },
    });
    expect(resolveReplyAuthor(r)).toBe("Some Group");
  });

  test("forwarded from a channel: prefers author_signature over channel title", () => {
    const r = msg({
      forward_origin: {
        type: "channel",
        date: 0,
        chat: { id: -1001, type: "channel", title: "My Channel" },
        message_id: 42,
        author_signature: "Editor",
      },
    });
    expect(resolveReplyAuthor(r)).toBe("Editor");
  });

  test("forwarded from a channel without signature: uses channel title", () => {
    const r = msg({
      forward_origin: {
        type: "channel",
        date: 0,
        chat: { id: -1001, type: "channel", title: "My Channel" },
        message_id: 42,
      },
    });
    expect(resolveReplyAuthor(r)).toBe("My Channel");
  });
});
