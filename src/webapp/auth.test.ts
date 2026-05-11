// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { verifyInitData } from "./auth";

const BOT_TOKEN = "12345:test-token";

async function makeInitData(params: Record<string, string>): Promise<string> {
  const dataCheckString = Object.keys(params)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", secretKey, enc.encode(BOT_TOKEN));

  const signKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", signKey, enc.encode(dataCheckString));
  const hash = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");

  const all = { ...params, hash };
  return new URLSearchParams(all).toString();
}

describe("verifyInitData", () => {
  test("accepts valid initData and returns user", async () => {
    const userJson = JSON.stringify({ id: 999, first_name: "Alice" });
    const init = await makeInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: userJson,
      query_id: "q1",
    });
    const r = await verifyInitData(init, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe(999);
  });

  test("rejects tampered hash", async () => {
    const userJson = JSON.stringify({ id: 999, first_name: "Alice" });
    const init = await makeInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: userJson,
    });
    const tampered = init.replace(/hash=[^&]+/, "hash=deadbeef");
    const r = await verifyInitData(tampered, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(false);
  });

  test("rejects expired auth_date", async () => {
    const userJson = JSON.stringify({ id: 999, first_name: "Alice" });
    const old = Math.floor(Date.now() / 1000) - 25 * 3600;
    const init = await makeInitData({ auth_date: String(old), user: userJson });
    const r = await verifyInitData(init, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(false);
  });

  test("rejects when missing user field", async () => {
    const init = await makeInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
    });
    const r = await verifyInitData(init, BOT_TOKEN, Date.now());
    expect(r.ok).toBe(false);
  });
});
