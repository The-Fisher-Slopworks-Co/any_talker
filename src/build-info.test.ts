// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { buildInfoFromEnv, shortenCommit } from "./build-info";

describe("shortenCommit", () => {
  test("returns null for empty or missing input", () => {
    expect(shortenCommit(null)).toBeNull();
    expect(shortenCommit(undefined)).toBeNull();
    expect(shortenCommit("")).toBeNull();
    expect(shortenCommit("   ")).toBeNull();
  });

  test("returns the first 7 characters", () => {
    expect(shortenCommit("abcdef1234567890")).toBe("abcdef1");
  });

  test("trims surrounding whitespace before slicing", () => {
    expect(shortenCommit("  abcdef1234567890\n")).toBe("abcdef1");
  });
});

describe("buildInfoFromEnv", () => {
  test("returns null when GIT_COMMIT is not set", () => {
    expect(buildInfoFromEnv({})).toBeNull();
    expect(buildInfoFromEnv({ GIT_COMMIT: "" })).toBeNull();
    expect(buildInfoFromEnv({ GIT_COMMIT: "   " })).toBeNull();
  });

  test("returns commit and short commit when GIT_COMMIT is set", () => {
    expect(buildInfoFromEnv({ GIT_COMMIT: "abcdef1234567890" })).toEqual({
      commit: "abcdef1234567890",
      shortCommit: "abcdef1",
    });
  });

  test("trims whitespace from GIT_COMMIT", () => {
    expect(buildInfoFromEnv({ GIT_COMMIT: "  abcdef1234567890\n" })).toEqual({
      commit: "abcdef1234567890",
      shortCommit: "abcdef1",
    });
  });
});
