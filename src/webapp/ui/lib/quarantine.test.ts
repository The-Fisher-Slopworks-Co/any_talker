// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { peekQuarantinedPayload, quarantineTimeLeftMs } from "./quarantine";
import { QUARANTINE_TTL_MS } from "../../../storage/types/reminders";

describe("peekQuarantinedPayload", () => {
  test("pretty-prints a JSON payload", () => {
    const peek = peekQuarantinedPayload('{"userId":"u1","text":"call mum"}');
    expect(peek.isJson).toBe(true);
    expect(peek.body).toBe('{\n  "userId": "u1",\n  "text": "call mum"\n}');
  });

  // The reason quarantine exists: a payload that isn't JSON is exactly the one
  // worth reading, so it must come through verbatim rather than be swallowed.
  test("passes a non-JSON payload through untouched", () => {
    const peek = peekQuarantinedPayload("{not json at all");
    expect(peek.isJson).toBe(false);
    expect(peek.body).toBe("{not json at all");
    expect(peek.userId).toBeNull();
    expect(peek.text).toBeNull();
  });

  test("recovers userId and text when the blob still carries them", () => {
    const peek = peekQuarantinedPayload(
      // Schema-invalid — no `fireAtMs`, no `target` — but the two fields that
      // identify the record survived.
      JSON.stringify({ id: "r1", userId: "u42", text: "buy milk" }),
    );
    expect(peek.userId).toBe("u42");
    expect(peek.text).toBe("buy milk");
  });

  test("accepts an unquoted userId but not a non-string text", () => {
    const peek = peekQuarantinedPayload(
      JSON.stringify({ userId: 42, text: { ru: "нет" } }),
    );
    expect(peek.userId).toBe("42");
    expect(peek.text).toBeNull();
  });

  test("surfaces nothing from a JSON payload that is not an object", () => {
    const peek = peekQuarantinedPayload('"just a string"');
    expect(peek.isJson).toBe(true);
    expect(peek.body).toBe('"just a string"');
    expect(peek.userId).toBeNull();
    expect(peek.text).toBeNull();
  });

  test("treats empty scalars as absent", () => {
    const peek = peekQuarantinedPayload(
      JSON.stringify({ userId: "", text: "" }),
    );
    expect(peek.userId).toBeNull();
    expect(peek.text).toBeNull();
  });
});

describe("quarantineTimeLeftMs", () => {
  test("counts down from the retention window", () => {
    expect(quarantineTimeLeftMs(1_000, 1_000)).toBe(QUARANTINE_TTL_MS);
    expect(quarantineTimeLeftMs(1_000, 1_000 + 60_000)).toBe(
      QUARANTINE_TTL_MS - 60_000,
    );
  });

  test("clamps at zero once the window has run out", () => {
    expect(quarantineTimeLeftMs(0, QUARANTINE_TTL_MS + 1)).toBe(0);
  });
});
