// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { AIClient } from "../ai/types";
import type { RateLimiter } from "../ratelimit/types";
import {
  startIntervalScheduler,
  type IntervalScheduler,
} from "../shared/interval-scheduler";
import {
  deliverReminder,
  notifyDeliveryFailure,
  notifyQuarantine,
  type ReminderApi,
} from "./delivery";
import { salvageQuarantinedRecipient } from "./parse";
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
      runRuntimeTick(
        runtime,
        deps.ai,
        deps.rateLimiter,
        deps.ownerId,
        deps.nowMs,
      ),
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
  // A quarantined record will never fire; the user who set it would otherwise
  // never learn that. The recipient is read best-effort from the rejected
  // payload — when even that fails, the operator's log line is all there is.
  const due = await runtime.storage.reminders.fetchDue(
    nowMs,
    async (record) => {
      const recipient = salvageQuarantinedRecipient(record.raw);
      if (recipient === null) {
        console.error(
          `[scheduler] quarantined id=${record.id}: no recipient to notify`,
        );
        return;
      }
      await notifyQuarantine(runtime.api, record.id, recipient);
    },
  );
  if (due.length === 0) return;
  await Promise.allSettled(
    due.map(async (reminder) => {
      // A blacklisted user's (or chat's) reminder is dropped without delivery:
      // delivery re-runs the LLM (it spends money), and the blacklist means
      // "this user/chat may not use the bot" — including asks queued before the
      // block.
      const blockedUser = await runtime.storage.access.isBlacklisted(
        "users",
        reminder.userId,
      );
      const blockedChat = await runtime.storage.access.isBlacklisted(
        "chats",
        reminder.chatId,
      );
      if (blockedUser || blockedChat) {
        await runtime.storage.reminders.delete(reminder.id, reminder.userId);
        remindersDeliveredTotal.inc({ outcome: "blocked" });
        console.log(
          blockedUser
            ? `[scheduler] dropped id=${reminder.id}: user ${reminder.userId} is blacklisted`
            : `[scheduler] dropped id=${reminder.id}: chat ${reminder.chatId} is blacklisted`,
        );
        return;
      }
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
        await runtime.storage.reminders.delete(reminder.id, reminder.userId);
      } catch (err) {
        console.error(
          `[scheduler] reminders.delete failed id=${reminder.id}:`,
          err,
        );
      }
      if (outcome === "permanent" || outcome === "unreachable") {
        remindersDeliveredTotal.inc({ outcome });
        console.error(
          `[scheduler] ${outcome} delivery failure id=${reminder.id} kind=${reminder.target.kind}, dropped`,
        );
        // The user asked for a message at a time and would otherwise get
        // silence, indistinguishable from the bot having forgotten. Skipped
        // for "unreachable": there is nowhere to send the notice to.
        if (outcome === "permanent") {
          await notifyDeliveryFailure(runtime.api, reminder);
        }
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
