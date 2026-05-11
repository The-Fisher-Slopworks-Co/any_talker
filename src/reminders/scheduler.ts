import type { Storage } from "../storage/types";
import { deliverReminder, type ReminderApi } from "./delivery";

export type Scheduler = { stop(): void };

export type SchedulerDeps = {
  storage: Storage;
  api: ReminderApi;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 30_000;

export async function runReminderTick(deps: {
  storage: Storage;
  api: ReminderApi;
  nowMs: number;
}): Promise<void> {
  const due = await deps.storage.fetchDueReminders(deps.nowMs);
  if (due.length === 0) return;
  await Promise.allSettled(
    due.map(async (reminder) => {
      const outcome = await deliverReminder(deps.api, reminder);
      if (outcome === "transient") {
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
        console.error(
          `[scheduler] permanent delivery failure id=${reminder.id} kind=${reminder.target.kind}, dropped`,
        );
      } else {
        console.log(
          `[scheduler] delivered id=${reminder.id} kind=${reminder.target.kind}`,
        );
      }
    }),
  );
}

export function startScheduler(deps: SchedulerDeps): Scheduler {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const safeTick = async () => {
    if (stopped) return;
    try {
      await runReminderTick({
        storage: deps.storage,
        api: deps.api,
        nowMs: Date.now(),
      });
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
  };

  const tick = () => {
    if (inFlight || stopped) return;
    inFlight = safeTick().finally(() => {
      inFlight = null;
    });
  };

  tick();
  const handle = setInterval(tick, intervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(handle);
    },
  };
}
