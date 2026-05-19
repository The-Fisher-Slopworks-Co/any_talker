// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { AIClient } from "../ai/types";
import {
  startIntervalScheduler,
  type IntervalScheduler,
} from "../shared/interval-scheduler";
import { deliverReminder, type ReminderApi } from "./delivery";
import { remindersDeliveredTotal } from "../metrics";

export type Scheduler = IntervalScheduler;

export type SchedulerDeps = {
  storage: Storage;
  api: ReminderApi;
  ai: AIClient;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 30_000;

export async function runReminderTick(deps: {
  storage: Storage;
  api: ReminderApi;
  ai: AIClient;
  nowMs: number;
}): Promise<void> {
  const due = await deps.storage.fetchDueReminders(deps.nowMs);
  if (due.length === 0) return;
  await Promise.allSettled(
    due.map(async (reminder) => {
      const outcome = await deliverReminder(
        { storage: deps.storage, api: deps.api, ai: deps.ai },
        reminder,
        deps.nowMs,
      );
      if (outcome === "transient") {
        remindersDeliveredTotal.inc({ outcome: "transient" });
        console.error(
          `[scheduler] transient delivery failure id=${reminder.id}, retrying next tick`,
        );
        return;
      }
      try {
        await deps.storage.deleteReminder(reminder.id, reminder.userId);
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
        storage: deps.storage,
        api: deps.api,
        ai: deps.ai,
        nowMs: Date.now(),
      }),
  });
}
