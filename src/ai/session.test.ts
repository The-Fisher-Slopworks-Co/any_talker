// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { conversationSessionId } from "./session";

describe("conversationSessionId", () => {
  test("is stable for the same bot and chat", () => {
    expect(conversationSessionId(null, "-100123")).toBe(
      conversationSessionId(null, "-100123"),
    );
  });

  test("separates chats", () => {
    expect(conversationSessionId(null, "-100123")).not.toBe(
      conversationSessionId(null, "-100456"),
    );
  });

  // Family bots share a group's chat id (and its conversation graph) while
  // answering with different system prompts, and in a DM the chat id is the user
  // id — the same for every character's DM with that user. Different prompts are
  // different caches, so they must not share a sticky-routing key.
  test("separates characters answering in the same chat", () => {
    expect(conversationSessionId("777", "-100123")).not.toBe(
      conversationSessionId("888", "-100123"),
    );
    expect(conversationSessionId(null, "42")).not.toBe(
      conversationSessionId("777", "42"),
    );
  });

  test("stays far below the 256-char ceiling for real ids", () => {
    const id = conversationSessionId("1234567890", "-1001234567890");
    expect(id.length).toBeLessThan(64);
  });
});
