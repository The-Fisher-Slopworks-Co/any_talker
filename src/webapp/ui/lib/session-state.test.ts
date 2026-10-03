// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  parseString,
  readSessionValue,
  writeSessionValue,
} from "./session-state";
import { parseRoute, type Route } from "./routes";

function memoryStore() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  };
}

describe("session values", () => {
  test("a written value is read back after a reload", () => {
    const store = memoryStore();
    const route: Route = { kind: "user-edit", userId: "42", from: "users" };
    writeSessionValue(store, "route", route);
    expect(readSessionValue(store, "route", parseRoute)).toEqual(route);
  });

  test("a missing key reads as null", () => {
    expect(readSessionValue(memoryStore(), "route", parseRoute)).toBeNull();
  });

  test("malformed or stale values read as null", () => {
    const store = memoryStore();
    store.setItem("any-talker:route", "{not json");
    store.setItem("any-talker:scope", "7");
    expect(readSessionValue(store, "route", parseRoute)).toBeNull();
    expect(readSessionValue(store, "scope", parseString)).toBeNull();
  });

  test("no storage at all is not an error", () => {
    writeSessionValue(null, "route", { kind: "main" });
    expect(readSessionValue(null, "route", parseRoute)).toBeNull();
  });

  test("a failing store does not throw", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    writeSessionValue(broken, "route", { kind: "main" });
    expect(readSessionValue(broken, "route", parseRoute)).toBeNull();
  });
});
