// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import { readTextCapped, safeFetch } from "./http";
import type { Tool } from "./registry";

const PRIMARY_CDN = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies";
const FALLBACK_CDN = "https://latest.currency-api.pages.dev/v1/currencies";
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1_000_000;

const CODE_RE = /^[a-z]{3,10}$/i;

const Schema = z.object({
  amount: z
    .number()
    .positive()
    .lte(1e15)
    .describe("Amount to convert (must be positive)."),
  from: z
    .string()
    .regex(CODE_RE)
    .describe("Source currency code (ISO 4217, e.g. 'USD'). Case-insensitive."),
  to: z
    .string()
    .regex(CODE_RE)
    .describe("Target currency code (ISO 4217, e.g. 'EUR'). Case-insensitive."),
});

type Input = z.infer<typeof Schema>;

type CurrencyResponse = {
  date?: unknown;
  [key: string]: unknown;
};

async function fetchRates(base: string): Promise<CurrencyResponse> {
  const urls = [`${PRIMARY_CDN}/${base}.min.json`, `${FALLBACK_CDN}/${base}.min.json`];
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const response = await safeFetch(url, {
        init: {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; AnyTalkerBot/1.0)",
          },
        },
        timeoutMs: TIMEOUT_MS,
        timeoutLabel: `Currency lookup (${base})`,
      });
      if (!response.ok) {
        lastErr = new Error(`HTTP ${response.status}: ${response.statusText}`);
        // Drain so Bun can release the connection before trying the next CDN.
        await response.body?.cancel().catch(() => {});
        continue;
      }
      const body = await readTextCapped(response, MAX_BODY_BYTES);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        lastErr = new Error("Currency API returned a non-JSON response");
        continue;
      }
      if (!parsed || typeof parsed !== "object") {
        lastErr = new Error("Currency API returned an unexpected shape");
        continue;
      }
      return parsed as CurrencyResponse;
    } catch (err) {
      lastErr = err;
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown error");
  throw new Error(`Currency API request failed: ${message}`);
}

function trimZeros(fixed: string): string {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Currency conversion produced a non-finite result");
  }
  // toFixed switches to exponential form at >=1e21; for such large magnitudes
  // the fractional part is insignificant, so render the rounded integer in full.
  if (Math.abs(value) >= 1e21) {
    return BigInt(Math.round(value)).toString();
  }
  // toFixed with trailing-zero trim, so "100.00" -> "100" and "91.230" -> "91.23",
  // but precise rates like "0.9123" stay intact.
  const trimmed = trimZeros(value.toFixed(decimals));
  if (value !== 0 && Number(trimmed) === 0) {
    // Tiny magnitudes round to "0" at the requested decimals; widen the decimal
    // count to keep ~4 significant figures without resorting to exponent form.
    // Clamp to 100: toFixed throws RangeError above that, and a value smaller
    // than ~1e-100 (e.g. a defunct/hyperinflated token rate) is "0" to us anyway.
    const sigDecimals = -Math.floor(Math.log10(Math.abs(value))) + 3;
    const digits = Math.min(100, Math.max(decimals, sigDecimals));
    return trimZeros(value.toFixed(digits));
  }
  return trimmed;
}

export const currencyConvertTool: Tool<Input, string> = {
  name: "currency_convert",
  description:
    "Convert an amount from one currency to another using daily exchange rates. Accepts ISO 4217 codes (e.g. USD, EUR, JPY) and many crypto codes (e.g. btc, eth). Returns a short human-readable string with the converted amount, the rate, and the rate's date.",
  parameters: Schema,
  execute: async ({ amount, from, to }, _ctx) => {
    const base = from.toLowerCase();
    const target = to.toLowerCase();

    const data = await fetchRates(base);
    const rates = data[base];
    if (!rates || typeof rates !== "object") {
      throw new Error(`Currency API response missing rates for base '${base}'`);
    }
    const rateValue = (rates as Record<string, unknown>)[target];
    if (typeof rateValue !== "number" || !Number.isFinite(rateValue)) {
      throw new Error(`No exchange rate available from '${base}' to '${target}'`);
    }

    const converted = amount * rateValue;
    const date = typeof data.date === "string" ? data.date : "unknown date";

    return `${formatNumber(amount, 2)} ${from.toUpperCase()} = ${formatNumber(converted, 2)} ${to.toUpperCase()} (rate ${formatNumber(rateValue, 4)}, as of ${date})`;
  },
};
