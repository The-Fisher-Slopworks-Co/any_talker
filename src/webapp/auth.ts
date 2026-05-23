// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  username?: string;
  language_code?: string;
};

export type VerifyResult =
  | { ok: true; user: TelegramUser }
  | { ok: false; reason: string };

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function verifyInitData(
  initData: string,
  botToken: string,
  nowMs: number,
): Promise<VerifyResult> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(botToken));
  const signKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", signKey, enc.encode(dataCheckString));
  const computed = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!hexDigestsEqual(computed, hash)) return { ok: false, reason: "bad hash" };

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!authDate || nowMs - authDate * 1000 > MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "missing user" };
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return { ok: false, reason: "bad user json" };
  }
  if (typeof user.id !== "number") return { ok: false, reason: "bad user id" };

  return { ok: true, user };
}

// SHA-256 HMAC digests are always 32 bytes / 64 hex chars. Decode both into
// fixed-size buffers and compare in constant time without any length-based
// early return — the early return would leak one bit (length mismatch) and
// is the textbook anti-pattern for constant-time comparison.
const DIGEST_BYTES = 32;

function hexDigestsEqual(a: string, b: string): boolean {
  const ab = Buffer.alloc(DIGEST_BYTES);
  const bb = Buffer.alloc(DIGEST_BYTES);
  const aDecoded = Buffer.from(a, "hex");
  const bDecoded = Buffer.from(b, "hex");
  aDecoded.copy(ab, 0, 0, Math.min(aDecoded.length, DIGEST_BYTES));
  bDecoded.copy(bb, 0, 0, Math.min(bDecoded.length, DIGEST_BYTES));
  const lengthsMatch =
    aDecoded.length === DIGEST_BYTES && bDecoded.length === DIGEST_BYTES;
  return timingSafeEqual(ab, bb) && lengthsMatch;
}
