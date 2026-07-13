// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { GrammyError } from "grammy";
import { migratedChatId } from "./chat-migration";

describe("migratedChatId", () => {
  test("extracts the new chat id from a GrammyError", () => {
    const err = new GrammyError(
      "Call to 'sendMessage' failed!",
      {
        ok: false,
        error_code: 400,
        description:
          "Bad Request: group chat was upgraded to a supergroup chat",
        parameters: { migrate_to_chat_id: -1003965869359 },
      },
      "sendMessage",
      {},
    );
    expect(migratedChatId(err)).toBe("-1003965869359");
  });

  test("null for errors without migration parameters", () => {
    expect(migratedChatId(new Error("boom"))).toBeNull();
    expect(migratedChatId(null)).toBeNull();
    expect(migratedChatId(undefined)).toBeNull();
    expect(migratedChatId("string error")).toBeNull();
    expect(
      migratedChatId(
        new GrammyError(
          "Call to 'sendMessage' failed!",
          { ok: false, error_code: 429, description: "Too Many Requests" },
          "sendMessage",
          {},
        ),
      ),
    ).toBeNull();
  });

  test("null when migrate_to_chat_id is not a number", () => {
    expect(
      migratedChatId({ parameters: { migrate_to_chat_id: "-100" } }),
    ).toBeNull();
  });
});
