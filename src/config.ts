// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { resolveLogFormat, type LogFormat } from "./log";

// OpenRouter's public API root. The base URL is optional precisely because
// there is only one right answer for it; naming it explicitly is for a proxy
// or a self-hosted gateway that fronts OpenRouter.
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type Config = {
  botToken: string;
  openrouterApiKey: string;
  openrouterBaseUrl: string;
  // App attribution headers, credited by OpenRouter. Optional everywhere:
  // unset simply means the traffic is anonymous.
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

  // One release of grace for deployments still on the pre-OpenRouter names.
  // Those names would actively lie about what this build talks to, but a hard
  // boot failure on every existing deployment is a worse trade than a warning.
  const legacy: string[] = [];
  const withLegacyFallback = (
    name: string,
    legacyName: string,
  ): string | undefined => {
    const v = nonEmptyOrUndefined(env[name]);
    if (v !== undefined) return v;
    const old = nonEmptyOrUndefined(env[legacyName]);
    if (old !== undefined) legacy.push(`${legacyName} → ${name}`);
    return old;
  };

  const openrouterApiKey = withLegacyFallback(
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
  );
  if (!openrouterApiKey) {
    throw new Error("Missing required env var: OPENROUTER_API_KEY");
  }
  // Optional: there is only one right answer for it, so the default is it.
  const openrouterBaseUrl =
    withLegacyFallback("OPENROUTER_BASE_URL", "OPENAI_BASE_URL") ??
    DEFAULT_OPENROUTER_BASE_URL;
  if (legacy.length > 0) {
    console.warn(`Deprecated env var names in use, rename: ${legacy.join(", ")}`);
  }

  return {
    botToken: required("BOT_TOKEN"),
    openrouterApiKey,
    openrouterBaseUrl,
    openrouterAppUrl: nonEmptyOrUndefined(env.OPENROUTER_APP_URL),
    openrouterAppTitle: nonEmptyOrUndefined(env.OPENROUTER_APP_TITLE),
    firecrawlApiKey: nonEmptyOrUndefined(env.FIRECRAWL_API_KEY),
    firecrawlConcurrency: parsePositiveInt("FIRECRAWL_CONCURRENCY", env.FIRECRAWL_CONCURRENCY, 2),
    botOwnerId: required("BOT_OWNER_ID"),
    keydbUrl: env.KEYDB_URL ?? "redis://localhost:6379",
    port,
    logFormat: resolveLogFormat(env),
    logIncomingUpdates: parseBool("LOG_INCOMING_UPDATES", env.LOG_INCOMING_UPDATES, true),
    logDebug: parseBool("LOG_DEBUG", env.LOG_DEBUG, false),
  };
}

// Treat empty env strings as "unset". Spelled out as a helper so the intent
// reads at the call site instead of relying on the `|| undefined` falsy-coerce
// idiom (which would also collapse "0" / "false" if those were valid values).
function nonEmptyOrUndefined(v: string | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
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
  throw new Error(`${name} must be one of true/false/1/0/yes/no/on/off, got: ${raw}`);
}
