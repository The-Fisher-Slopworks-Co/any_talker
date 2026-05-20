// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { resolveLogFormat, type LogFormat } from "./log";

export type Config = {
  botToken: string;
  openrouterApiKey: string;
  openrouterAppUrl: string | undefined;
  openrouterAppTitle: string | undefined;
  firecrawlApiKey: string | undefined;
  firecrawlConcurrency: number;
  botOwnerId: string;
  keydbUrl: string;
  port: number;
  logFormat: LogFormat;
  logIncomingUpdates: boolean;
  logDebug: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const required = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  const port = env.PORT ? Number(env.PORT) : 8080;
  if (Number.isNaN(port)) throw new Error(`PORT must be a number, got: ${env.PORT}`);

  return {
    botToken: required("BOT_TOKEN"),
    openrouterApiKey: required("OPENROUTER_API_KEY"),
    openrouterAppUrl: env.OPENROUTER_APP_URL || undefined,
    openrouterAppTitle: env.OPENROUTER_APP_TITLE || undefined,
    firecrawlApiKey: env.FIRECRAWL_API_KEY || undefined,
    firecrawlConcurrency: parsePositiveInt("FIRECRAWL_CONCURRENCY", env.FIRECRAWL_CONCURRENCY, 2),
    botOwnerId: required("BOT_OWNER_ID"),
    keydbUrl: env.KEYDB_URL ?? "redis://localhost:6379",
    port,
    logFormat: resolveLogFormat(env),
    logIncomingUpdates: parseBool("LOG_INCOMING_UPDATES", env.LOG_INCOMING_UPDATES, true),
    logDebug: parseBool("LOG_DEBUG", env.LOG_DEBUG, false),
  };
}

function parsePositiveInt(name: string, raw: string | undefined, defaultValue: number): number {
  if (raw === undefined || raw === "") return defaultValue;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1) throw new Error(`${name} must be a positive integer, got: ${raw}`);
  return v;
}

function parseBool(name: string, raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  const v = raw.toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  throw new Error(`${name} must be true/false/1/0, got: ${raw}`);
}
