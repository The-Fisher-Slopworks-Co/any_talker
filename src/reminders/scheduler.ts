// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { AIClient } from "../ai/types";
import type { RateLimiter } from "../ratelimit/types";
import {
  startIntervalScheduler,
  type IntervalScheduler,
} from "../shared/interval-scheduler";
import { deliverReminder, type ReminderApi } from "./delivery";
import type { PersonaResolver } from "../managed-bots/persona";
import { remindersDeliveredTotal } from "../metrics";

export type Scheduler = IntervalScheduler;

// One bot's reminder context: its scoped storage (so it only ever sees its own
// reminders), its Telegram API (so deliveries come from the right identity),
// its persona resolver, and its scope id. The main bot is `botId: null` with
// the unscoped base storage.
export type ReminderRuntime = {
  botId: string | null;
  storage: Storage;
  api: ReminderApi;
  resolver: PersonaResolver;
};

export type SchedulerDeps = {
  // Resolved fresh each tick (a thunk) so newly-created managed bots join the
  // loop and deleted ones drop out without restarting the scheduler.
  runtimes: () => ReminderRuntime[];
  ai: AIClient;
  // The per-user token limiter and owner id — reminder delivery re-runs the LLM,
  // so it charges tokens/records spend the same as an /ask (family-global, like
  // `ai`, so they live here rather than per-runtime).
  rateLimiter: RateLimiter;
  ownerId: string;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 30_000;

export async function runReminderTick(deps: {
  runtimes: ReminderRuntime[];
  ai: AIClient;
  rateLimiter: RateLimiter;
  ownerId: string;
  nowMs: number;
}): Promise<void> {
  await Promise.allSettled(
    deps.runtimes.map((runtime) =>
      runRuntimeTick(runtime, deps.ai, deps.rateLimiter, deps.ownerId, deps.nowMs),
    ),
  );
}

async function runRuntimeTick(
  runtime: ReminderRuntime,
  ai: AIClient,
  rateLimiter: RateLimiter,
  ownerId: string,
  nowMs: number,
): Promise<void> {
  const due = await runtime.storage.fetchDueReminders(nowMs);
  if (due.length === 0) return;
  await Promise.allSettled(
    due.map(async (reminder) => {
      const outcome = await deliverReminder(
        {
          storage: runtime.storage,
          api: runtime.api,
          ai,
          rateLimiter,
          ownerId,
          resolver: runtime.resolver,
          botId: runtime.botId,
        },
        reminder,
        nowMs,
      );
      if (outcome === "transient") {
        remindersDeliveredTotal.inc({ outcome: "transient" });
        console.error(
          `[scheduler] transient delivery failure id=${reminder.id}, retrying next tick`,
        );
        return;
      }
      try {
        await runtime.storage.deleteReminder(reminder.id, reminder.userId);
      } catch (err) {
        console.error(
          `[scheduler] deleteReminder failed id=${reminder.id}:`,
          err,
        );
      }
      if (outcome === "permanent") {
        remindersDeliveredTotal.inc({ outcome: "permanent" });
        console.error(
          `[scheduler] permanent delivery failure id=${reminder.id} kind=${reminder.target.kind}, dropped`,
        );
      } else {
        remindersDeliveredTotal.inc({ outcome: "delivered" });
        console.log(
          `[scheduler] delivered id=${reminder.id} kind=${reminder.target.kind}`,
        );
      }
    }),
  );
}

export function startScheduler(deps: SchedulerDeps): Scheduler {
  return startIntervalScheduler({
    intervalMs: deps.intervalMs ?? DEFAULT_INTERVAL_MS,
    logPrefix: "[scheduler]",
    tick: () =>
      runReminderTick({
        runtimes: deps.runtimes(),
        ai: deps.ai,
        rateLimiter: deps.rateLimiter,
        ownerId: deps.ownerId,
        nowMs: Date.now(),
      }),
  });
}
