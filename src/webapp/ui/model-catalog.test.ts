// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, spyOn } from "bun:test";
import {
  fetchModelCatalog,
  formatPricePerMillion,
  loadedModelCatalog,
} from "./model-catalog";

describe("loadedModelCatalog", () => {
  test("holds the catalogue once it has arrived, for a later first frame", async () => {
    Object.assign(globalThis, { window: globalThis.window ?? {} });
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ models: [{ id: "a/b", name: "B" }] }),
    );
    try {
      expect(loadedModelCatalog()).toBeNull();
      const pending = fetchModelCatalog();
      expect(loadedModelCatalog()).toBeNull();
      const map = await pending;
      expect(loadedModelCatalog()).toBe(map);
      expect(map.has("a/b")).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("formatPricePerMillion", () => {
  test("drops trailing zeros: whole dollars stay whole", () => {
    expect(formatPricePerMillion(0.000003)).toBe("$3/M");
    expect(formatPricePerMillion(0.000015)).toBe("$15/M");
    expect(formatPricePerMillion(0.00000025)).toBe("$0.25/M");
  });

  test("keeps more places the cheaper a price gets", () => {
    expect(formatPricePerMillion(0.000000075)).toBe("$0.075/M");
    expect(formatPricePerMillion(0.00000001)).toBe("$0.01/M");
    expect(formatPricePerMillion(0.000000005)).toBe("$0.005/M");
  });

  test("free and unpriced models", () => {
    expect(formatPricePerMillion(0)).toBe("Free");
    expect(formatPricePerMillion(undefined)).toBeNull();
  });
});
