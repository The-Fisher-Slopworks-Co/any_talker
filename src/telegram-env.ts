// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram runs a second, throwaway copy of itself — the test environment —
// with its own users, bots and files (https://core.telegram.org/bots/webapps).
// Everything the bot addresses has to agree on which one it talks to: grammY
// takes the choice as `client.environment`, while the two file endpoints below
// are built by hand, so they need the same segment inserted themselves.

export type TelegramEnv = "prod" | "test";

const API_ROOT = "https://api.telegram.org";

function segment(env: TelegramEnv): string {
  return env === "test" ? "test/" : "";
}

// `…/bot<token>/test/<method>`, matching grammY's own default `buildUrl`.
export function telegramApiUrl(
  botToken: string,
  method: string,
  env: TelegramEnv,
): string {
  return `${API_ROOT}/bot${botToken}/${segment(env)}${method}`;
}

// The download root takes the same segment, in the same place after the token:
// `…/file/bot<token>/test/<file_path>`.
export function telegramFileUrl(
  botToken: string,
  filePath: string,
  env: TelegramEnv,
): string {
  return `${API_ROOT}/file/bot${botToken}/${segment(env)}${filePath}`;
}

export function resolveTelegramEnv(
  env: Record<string, string | undefined>,
): TelegramEnv {
  const explicit = env.TELEGRAM_ENV;
  if (explicit === undefined) return "prod";
  if (explicit !== "prod" && explicit !== "test") {
    throw new Error(`TELEGRAM_ENV must be "prod" or "test", got: ${explicit}`);
  }
  return explicit;
}
