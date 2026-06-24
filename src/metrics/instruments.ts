// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  DEFAULT_BUCKETS,
} from "./registry";

// One registry instance per process. The bot is single-process, so a module
// singleton is enough; tests can construct a fresh Registry directly.
export const registry = new Registry();

// --- Telegram update / handler metrics -------------------------------------

export const updatesTotal = registry.register(
  new Counter(
    "bot_updates_total",
    "Total Telegram updates received, by update type.",
    ["type"],
  ),
);

// Allowlisted to bound cardinality — only the commands the bot actually
// handles produce a label; everything else falls into "other".
const KNOWN_COMMANDS = new Set(["start", "ask"]);
export function normalizeCommandLabel(raw: string | undefined): string {
  if (!raw) return "";
  return KNOWN_COMMANDS.has(raw) ? raw : "other";
}

export const commandsTotal = registry.register(
  new Counter(
    "bot_commands_total",
    "Telegram bot_command entities seen on incoming messages (known commands only; everything else is bucketed as `other`).",
    ["command"],
  ),
);

export type AskSource = "ask" | "guest";
export type AskOutcomeLabel =
  | "answered"
  | "denied"
  | "usage"
  | "rate_limited"
  | "error";

export const askTotal = registry.register(
  new Counter(
    "bot_ask_total",
    "Total /ask (and guest-mode) requests, by source and final outcome.",
    ["source", "outcome"],
  ),
);

export const askDurationSeconds = registry.register(
  new Histogram(
    "bot_ask_duration_seconds",
    "End-to-end duration of /ask handling (rate-limit check through final reply).",
    ["source", "outcome"],
    DEFAULT_BUCKETS,
  ),
);

export const askTokensTotal = registry.register(
  new Counter(
    "bot_ask_tokens_total",
    "Total tokens consumed by completed AI replies (sum of totalTokens reported by the provider).",
    ["source"],
  ),
);

// --- AI client metrics -----------------------------------------------------

export const aiRequestsTotal = registry.register(
  new Counter(
    "bot_ai_requests_total",
    "AI provider requests by outcome (success / error).",
    ["outcome"],
  ),
);

export const aiRequestDurationSeconds = registry.register(
  new Histogram(
    "bot_ai_request_duration_seconds",
    "Latency of the AI provider call (single ask() invocation).",
    ["outcome"],
    [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120],
  ),
);

// --- Tool call metrics -----------------------------------------------------

export const toolCallsTotal = registry.register(
  new Counter(
    "bot_tool_calls_total",
    "Total tool invocations triggered by the model, by tool name and outcome.",
    ["tool", "outcome"],
  ),
);

export const toolCallDurationSeconds = registry.register(
  new Histogram(
    "bot_tool_call_duration_seconds",
    "Tool execution latency.",
    ["tool"],
    DEFAULT_BUCKETS,
  ),
);

// --- Rate limit metrics ----------------------------------------------------

export const rateLimitChecksTotal = registry.register(
  new Counter(
    "bot_rate_limit_checks_total",
    "Rate-limit checks, by result (allowed / denied).",
    ["result"],
  ),
);

export const rateLimitTokensDeductedTotal = registry.register(
  new Counter(
    "bot_rate_limit_tokens_deducted_total",
    "Sum of tokens charged to per-user rate-limit windows after AI replies.",
  ),
);

// --- Cache metrics ---------------------------------------------------------

export const photoCacheErrorsTotal = registry.register(
  new Counter(
    "bot_photo_cache_errors_total",
    "Telegram photo cache failures by operation (read / write / ttl).",
    ["op"],
  ),
);

// --- Self-instrumentation --------------------------------------------------

export const metricsCollectorErrorsTotal = registry.register(
  new Counter(
    "bot_metrics_collector_errors_total",
    "Times a registry.onCollect() callback threw during scrape (process gauges, etc.).",
  ),
);

// --- Scheduler metrics -----------------------------------------------------

export const remindersDeliveredTotal = registry.register(
  new Counter(
    "bot_reminders_delivered_total",
    "Reminders processed by the scheduler, by delivery outcome.",
    ["outcome"],
  ),
);

export const remindersParseFailuresTotal = registry.register(
  new Counter(
    "bot_reminders_parse_failures_total",
    "Stored reminders that failed JSON/schema validation and were quarantined or skipped, by reason.",
    ["reason"],
  ),
);

export const checksProcessedTotal = registry.register(
  new Counter(
    "bot_checks_processed_total",
    "Recurring checks ticked by the runner, by terminal outcome.",
    ["outcome"],
  ),
);

// --- HTTP server metrics ---------------------------------------------------

export const httpRequestsTotal = registry.register(
  new Counter(
    "http_requests_total",
    "Total HTTP requests served, by method, normalized route, and status code.",
    ["method", "route", "status"],
  ),
);

export const httpRequestDurationSeconds = registry.register(
  new Histogram(
    "http_request_duration_seconds",
    "HTTP request handler latency, by method and normalized route.",
    ["method", "route"],
    DEFAULT_BUCKETS,
  ),
);

// --- Process metrics -------------------------------------------------------

const processStartSeconds = registry.register(
  new Gauge(
    "process_start_time_seconds",
    "Process start time as a Unix timestamp (seconds).",
  ),
);
processStartSeconds.set(Date.now() / 1000 - process.uptime());

const processUptimeSeconds = registry.register(
  new Gauge("process_uptime_seconds", "Seconds since process start."),
);

const processResidentMemoryBytes = registry.register(
  new Gauge(
    "process_resident_memory_bytes",
    "Resident set size of the bot process in bytes.",
  ),
);

const processHeapUsedBytes = registry.register(
  new Gauge(
    "process_heap_used_bytes",
    "JS heap currently in use, in bytes.",
  ),
);

const buildInfo = registry.register(
  new Gauge(
    "bot_build_info",
    "Build metadata; value is always 1, labels carry the version/runtime info.",
    ["version", "bun"],
  ),
);
buildInfo.set(
  {
    version: process.env.BOT_VERSION ?? "dev",
    bun: typeof Bun !== "undefined" ? Bun.version : "unknown",
  },
  1,
);

registry.onCollect(() => {
  processUptimeSeconds.set(process.uptime());
  const mu = process.memoryUsage();
  processResidentMemoryBytes.set(mu.rss);
  processHeapUsedBytes.set(mu.heapUsed);
});

registry.setOnCollectorError(() => {
  metricsCollectorErrorsTotal.inc();
});
