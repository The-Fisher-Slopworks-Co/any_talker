// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { parseStoredReminder, ReminderParseError } from "./parse";
import type { Reminder } from "./types";

const validRecord = {
  id: "r1",
  userId: "u1",
  chatId: "c1",
  lang: "en",
  fireAtMs: 1_700_000_000_000,
  text: "ping",
  target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 42 },
  createdAtMs: 1_699_000_000_000,
  contextMessages: [
    { role: "user", content: "hi" },
    {
      role: "user",
      content: [
        { type: "text", text: "see this" },
        { type: "image", image_base64: "AAA=", mediaType: "image/png" },
      ],
    },
    { role: "assistant", content: "noted" },
  ],
};

const stringify = (obj: unknown) => JSON.stringify(obj);

describe("parseStoredReminder — valid records", () => {
  test("round-trips a fully populated record", () => {
    const out = parseStoredReminder(stringify(validRecord));
    expect(out).toEqual(validRecord as Reminder);
  });

  test("round-trips a record with an audio content part", () => {
    const r = {
      ...validRecord,
      contextMessages: [
        {
          role: "user",
          content: [
            { type: "text", text: "transcribe" },
            { type: "audio", audio_base64: "T2dnUw==", mediaType: "audio/ogg" },
          ],
        },
        { role: "assistant", content: "done" },
      ],
    };
    expect(parseStoredReminder(stringify(r))).toEqual(r as Reminder);
  });

  test("guest_dm target round-trips", () => {
    const r = {
      ...validRecord,
      target: { kind: "guest_dm", userId: "u42" },
      chatId: "c1",
    };
    expect(parseStoredReminder(stringify(r))).toEqual(r as Reminder);
  });

  test("legacy record without chatId derives it from ask_reply.chatId", () => {
    const { chatId: _drop, ...legacy } = validRecord;
    const out = parseStoredReminder(stringify(legacy));
    expect(out.chatId).toBe("c1");
  });

  test("legacy record without chatId derives it from guest_dm.userId", () => {
    const { chatId: _drop, ...legacy } = validRecord;
    const r = {
      ...legacy,
      target: { kind: "guest_dm", userId: "u99" },
    };
    const out = parseStoredReminder(stringify(r));
    expect(out.chatId).toBe("u99");
  });

  test("legacy record without lang defaults to DEFAULT_LANG", () => {
    const { lang: _drop, ...legacy } = validRecord;
    const out = parseStoredReminder(stringify(legacy));
    expect(out.lang).toBe("en");
  });

  test("unknown lang string falls back to DEFAULT_LANG (not rejected)", () => {
    const r = { ...validRecord, lang: "fr" };
    const out = parseStoredReminder(stringify(r));
    expect(out.lang).toBe("en");
  });

  test("legacy record without contextMessages defaults to []", () => {
    const { contextMessages: _drop, ...legacy } = validRecord;
    const out = parseStoredReminder(stringify(legacy));
    expect(out.contextMessages).toEqual([]);
  });
});

describe("parseStoredReminder — invalid JSON", () => {
  test("malformed JSON throws ReminderParseError with reason=invalid_json", () => {
    let caught: unknown = null;
    try {
      parseStoredReminder("{not json");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ReminderParseError);
    expect((caught as ReminderParseError).reason).toBe("invalid_json");
  });

  test("empty input throws invalid_json", () => {
    expect(() => parseStoredReminder("")).toThrow(ReminderParseError);
  });
});

describe("parseStoredReminder — schema violations", () => {
  const expectSchemaViolation = (raw: string) => {
    let caught: unknown = null;
    try {
      parseStoredReminder(raw);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ReminderParseError);
    expect((caught as ReminderParseError).reason).toBe("schema_violation");
  };

  test("rejects missing required field (id)", () => {
    const { id: _drop, ...r } = validRecord;
    expectSchemaViolation(stringify(r));
  });

  test("rejects missing required field (userId)", () => {
    const { userId: _drop, ...r } = validRecord;
    expectSchemaViolation(stringify(r));
  });

  test("rejects wrong type for fireAtMs", () => {
    expectSchemaViolation(stringify({ ...validRecord, fireAtMs: "soon" }));
  });

  test("rejects unknown target.kind", () => {
    expectSchemaViolation(
      stringify({ ...validRecord, target: { kind: "carrier_pigeon", id: "x" } }),
    );
  });

  test("rejects ask_reply target missing chatId", () => {
    expectSchemaViolation(
      stringify({
        ...validRecord,
        target: { kind: "ask_reply", replyToMessageId: 1 },
      }),
    );
  });

  test("rejects guest_dm target missing userId", () => {
    expectSchemaViolation(
      stringify({ ...validRecord, target: { kind: "guest_dm" } }),
    );
  });

  test("rejects contextMessages with unknown role (no silent fallback to [])", () => {
    expectSchemaViolation(
      stringify({
        ...validRecord,
        contextMessages: [{ role: "system", content: "hi" }],
      }),
    );
  });

  test("rejects contextMessages with bad content-part type", () => {
    expectSchemaViolation(
      stringify({
        ...validRecord,
        contextMessages: [
          {
            role: "user",
            content: [{ type: "audio", url: "..." }],
          },
        ],
      }),
    );
  });

  test("rejects image part missing image_base64", () => {
    expectSchemaViolation(
      stringify({
        ...validRecord,
        contextMessages: [
          {
            role: "user",
            content: [{ type: "image", mediaType: "image/png" }],
          },
        ],
      }),
    );
  });

  test("rejects assistant content that is not a string", () => {
    expectSchemaViolation(
      stringify({
        ...validRecord,
        contextMessages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "no arrays for assistant" }],
          },
        ],
      }),
    );
  });

  test("rejects contextMessages with one bad element among good ones", () => {
    expectSchemaViolation(
      stringify({
        ...validRecord,
        contextMessages: [
          { role: "user", content: "ok" },
          { role: "user", content: 7 },
          { role: "assistant", content: "ok" },
        ],
      }),
    );
  });

  test("rejects contextMessages that is not an array", () => {
    expectSchemaViolation(
      stringify({ ...validRecord, contextMessages: "garbage" }),
    );
  });

  test("rejects top-level non-object payload", () => {
    expectSchemaViolation(stringify("just a string"));
  });
});
