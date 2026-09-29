// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { parseValue } from "./command-menus";

test("a stored menu reads back its instant and version", () => {
  expect(parseValue('{"atMs":1000,"version":"abc"}')).toEqual({
    atMs: 1000,
    version: "abc",
  });
});

// Rows written before the version existed: a bare epoch ms.
test("a legacy row reads back without a version", () => {
  expect(parseValue("1000")).toEqual({ atMs: 1000 });
});

test("an unreadable row reads back without a version", () => {
  expect(parseValue("garbage")).toEqual({ atMs: 0 });
  expect(parseValue('{"atMs":"x","version":7}')).toEqual({ atMs: 0 });
});
