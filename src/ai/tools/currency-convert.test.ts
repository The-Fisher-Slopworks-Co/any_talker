// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { currencyConvertTool } from "./currency-convert";
import type { ToolCallContext } from "./registry";

const ctx: ToolCallContext = {
  source: "ask",
  chatId: "c",
  userId: "u",
  replyToMessageId: null,
  timezone: "UTC",
  lang: "en",
  now: 0,
};

const mockFetch = mock(
  (_input: string | URL | Request, _init?: BunFetchRequestInit) =>
    Promise.resolve(new Response("", { status: 200 })),
);
const originalFetch = globalThis.fetch;
const originalDnsLookup = Bun.dns.lookup;

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  // Stub Bun.dns.lookup so safeFetch's IP-pinning resolves to a deterministic
  // public address without hitting real DNS in tests.
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = (async () =>
    [{ address: "203.0.113.10", family: 4, ttl: 60 }]) as typeof Bun.dns.lookup;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (Bun.dns as { lookup: typeof Bun.dns.lookup }).lookup = originalDnsLookup;
});

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("currency_convert tool", () => {
  describe("schema validation", () => {
    test("accepts a valid input", () => {
      expect(
        currencyConvertTool.parameters.safeParse({ amount: 1, from: "usd", to: "eur" }).success,
      ).toBe(true);
    });

    test("rejects non-positive amount", () => {
      expect(
        currencyConvertTool.parameters.safeParse({ amount: 0, from: "usd", to: "eur" }).success,
      ).toBe(false);
      expect(
        currencyConvertTool.parameters.safeParse({ amount: -1, from: "usd", to: "eur" }).success,
      ).toBe(false);
    });

    test("rejects too-short currency codes", () => {
      expect(
        currencyConvertTool.parameters.safeParse({ amount: 1, from: "us", to: "eur" }).success,
      ).toBe(false);
      expect(
        currencyConvertTool.parameters.safeParse({ amount: 1, from: "usd", to: "eu" }).success,
      ).toBe(false);
    });

    test("accepts common crypto codes", () => {
      for (const code of ["btc", "eth", "usdt"]) {
        expect(
          currencyConvertTool.parameters.safeParse({ amount: 1, from: "usd", to: code }).success,
        ).toBe(true);
      }
    });

    test("rejects codes with URL-corrupting characters", () => {
      for (const code of ["usd?x=y", "usd/../eur", "usd.eur", "us d", "eur "]) {
        expect(
          currencyConvertTool.parameters.safeParse({ amount: 1, from: code, to: "eur" }).success,
        ).toBe(false);
        expect(
          currencyConvertTool.parameters.safeParse({ amount: 1, from: "usd", to: code }).success,
        ).toBe(false);
      }
    });

    test("rejects an absurdly large amount", () => {
      expect(
        currencyConvertTool.parameters.safeParse({ amount: 1e308, from: "usd", to: "eur" }).success,
      ).toBe(false);
    });
  });

  describe("happy path", () => {
    test("returns the exact formatted string from the spec example", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: 0.9123, gbp: 0.78 } })),
      );
      const result = await currencyConvertTool.execute(
        { amount: 100, from: "usd", to: "eur" },
        ctx,
      );
      expect(result).toBe("100 USD = 91.23 EUR (rate 0.9123, as of 2026-05-23)");
    });

    test("lowercases inputs when hitting the API and uppercases them in the output", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", eur: { jpy: 162.5 } })),
      );
      const result = await currencyConvertTool.execute(
        { amount: 2, from: "EUR", to: "Jpy" },
        ctx,
      );
      expect(result).toContain("2 EUR = 325 JPY");
      // Primary CDN called with the lowercased base
      const [calledUrl] = mockFetch.mock.calls[0]!;
      expect(String(calledUrl)).toContain("/eur.min.json");
    });

    test("hits the primary CDN first", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: 0.9 } })),
      );
      await currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx);
      // safeFetch IP-pins the URL, so the original hostname lands in the Host
      // header rather than the URL.
      const [, init] = mockFetch.mock.calls[0]!;
      expect(new Headers(init?.headers).get("host")).toBe("cdn.jsdelivr.net");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("fallback behaviour", () => {
    test("falls back to the secondary CDN on non-2xx from primary", async () => {
      let call = 0;
      mockFetch.mockImplementation(() => {
        call++;
        if (call === 1) {
          return Promise.resolve(new Response("oops", { status: 500, statusText: "Server Error" }));
        }
        return Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: 0.91 } }));
      });
      const result = await currencyConvertTool.execute(
        { amount: 10, from: "usd", to: "eur" },
        ctx,
      );
      expect(result).toBe("10 USD = 9.1 EUR (rate 0.91, as of 2026-05-23)");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, secondInit] = mockFetch.mock.calls[1]!;
      expect(new Headers(secondInit?.headers).get("host")).toBe("latest.currency-api.pages.dev");
    });

    test("falls back to the secondary CDN when primary throws", async () => {
      let call = 0;
      mockFetch.mockImplementation(() => {
        call++;
        if (call === 1) {
          return Promise.reject(new Error("network boom"));
        }
        return Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: 0.9 } }));
      });
      const result = await currencyConvertTool.execute(
        { amount: 1, from: "usd", to: "eur" },
        ctx,
      );
      expect(result).toContain("1 USD = 0.9 EUR");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("throws a clear error when both CDNs fail", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("nope", { status: 503, statusText: "Unavailable" })),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("Currency API request failed");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("response validation", () => {
    test("throws when the base key is missing from the response", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23" })),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("missing rates");
    });

    test("throws when the target rate is missing", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { gbp: 0.78 } })),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("No exchange rate available");
    });

    test("throws when the target rate is not a number", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: "0.91" } })),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("No exchange rate available");
    });

    test("throws when the target rate is not finite", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: null } })),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("No exchange rate available");
    });

    test("throws on a non-JSON body from both CDNs", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("oops, not json", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
        ),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("Currency API request failed");
    });

    test("rejects an oversized response body", async () => {
      const big = new Uint8Array(1_000_002);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(big);
          controller.close();
        },
      });
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(stream, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("Currency API request failed");
    });
  });

  describe("output formatting", () => {
    test("handles amount=1 without double-printing", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: 0.9123 } })),
      );
      const result = await currencyConvertTool.execute(
        { amount: 1, from: "usd", to: "eur" },
        ctx,
      );
      expect(result).toBe("1 USD = 0.91 EUR (rate 0.9123, as of 2026-05-23)");
    });

    test("falls back to 'unknown date' when the response omits a date", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ usd: { eur: 0.5 } })),
      );
      const result = await currencyConvertTool.execute(
        { amount: 4, from: "usd", to: "eur" },
        ctx,
      );
      expect(result).toContain("as of unknown date");
    });

    test("keeps non-zero digits for a tiny rate and converted amount", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { btc: 0.00001304 } })),
      );
      const result = await currencyConvertTool.execute(
        { amount: 100, from: "usd", to: "btc" },
        ctx,
      );
      // Neither the converted amount nor the rate should collapse to "0".
      expect(result).not.toContain("= 0 BTC");
      expect(result).not.toContain("rate 0,");
      expect(result).toContain("0.001304");
      expect(result).toContain("rate 0.00001304");
    });

    test("does not crash on an extremely small rate (toFixed argument clamped to 100)", async () => {
      // sigDecimals for a value ~1e-120 exceeds 100; toFixed throws RangeError
      // above 100, so the digit count must be clamped rather than passed raw.
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { shib: 1e-120 } })),
      );
      const result = await currencyConvertTool.execute(
        { amount: 1, from: "usd", to: "shib" },
        ctx,
      );
      // The rate is unrepresentable in 100 decimals, so it renders as "0";
      // the point is that it returns a string instead of throwing.
      expect(result).toContain("rate 0");
    });

    test("throws instead of leaking a non-finite/exponential converted amount", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: 1e300 } })),
      );
      await expect(
        currencyConvertTool.execute({ amount: 1e15, from: "usd", to: "eur" }, ctx),
      ).rejects.toThrow("non-finite");
    });

    test("renders a very large finite converted amount in full digits, not exponential", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(jsonResponse({ date: "2026-05-23", usd: { eur: 1e9 } })),
      );
      const result = await currencyConvertTool.execute(
        { amount: 1e15, from: "usd", to: "eur" },
        ctx,
      );
      // converted = 1e24 — must render in full digits, not exponent form
      // like "1e+24" (exact trailing digits vary with float representation).
      expect(result).not.toContain("e+");
      expect(result).toMatch(/= \d{20,} EUR/);
    });
  });
});
