// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { parseRememberFactReply } from "./keydb";

describe("parseRememberFactReply", () => {
  test("treats '1' / 1 as success", () => {
    expect(parseRememberFactReply("1")).toEqual({ ok: true });
    expect(parseRememberFactReply(1)).toEqual({ ok: true });
  });

  test("treats '0' / 0 as limit_reached", () => {
    expect(parseRememberFactReply("0")).toEqual({
      ok: false,
      reason: "limit_reached",
    });
    expect(parseRememberFactReply(0)).toEqual({
      ok: false,
      reason: "limit_reached",
    });
  });

  test("throws on an unexpected reply shape instead of faking limit_reached", () => {
    for (const bad of [null, undefined, "", "2", 2, {}, [], Buffer.from("1")]) {
      expect(() => parseRememberFactReply(bad)).toThrow(
        /Unexpected EVAL reply for rememberUserFact/,
      );
    }
  });
});
