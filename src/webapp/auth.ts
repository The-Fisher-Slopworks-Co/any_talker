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

function hexDigestsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
