import type { Storage } from "../storage/types";
import type { RecurringCheck } from "./types";
import { lastScheduledFireMs } from "./schedule";
import { formatTemplate } from "./format";
import { resolveCheck, type CheckApi } from "./resolve";

export async function runChecksTick(deps: {
  storage: Storage;
  api: CheckApi;
  nowMs: number;
}): Promise<void> {
  const checks = await deps.storage.listChecks();
  await Promise.allSettled(
    checks.map(async (check) => {
      try {
        await processCheck(deps.storage, deps.api, check, deps.nowMs);
      } catch (err) {
        console.error(`[checks] processCheck failed id=${check.id}:`, err);
      }
    }),
  );
}

async function processCheck(
  storage: Storage,
  api: CheckApi,
  check: RecurringCheck,
  nowMs: number,
): Promise<void> {
  if (!check.enabled) return;

  if (check.pendingMessageId !== null) {
    const pendingFiredAt = check.pendingFiredAtMs ?? nowMs;
    const timeoutAt = pendingFiredAt + check.timeoutMinutes * 60_000;
    if (nowMs >= timeoutAt) {
      await resolveCheck({
        storage,
        api,
        check,
        answer: "timeout",
        fromUserId: null,
      });
    }
    return;
  }

  const fireMs = lastScheduledFireMs(
    nowMs,
    check.scheduleHour,
    check.scheduleMinute,
    check.timezone,
  );
  if (check.lastFiredAtMs >= fireMs) return;

  await fireCheck(storage, api, check, nowMs);
}

async function fireCheck(
  storage: Storage,
  api: CheckApi,
  check: RecurringCheck,
  nowMs: number,
): Promise<void> {
  const text = formatTemplate(check.question, {
    targetUserId: check.targetUserId,
    name: check.targetName,
    count: check.counter,
  });

  let messageId: number;
  try {
    const sent = await api.sendMessage(check.chatId, text, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: check.yesButton, callback_data: `check:${check.id}:yes` },
            { text: check.noButton, callback_data: `check:${check.id}:no` },
          ],
        ],
      },
    });
    messageId = sent.message_id;
  } catch (err) {
    console.error(`[checks] fire failed id=${check.id}:`, err);
    return;
  }

  await storage.saveCheck({
    ...check,
    lastFiredAtMs: nowMs,
    pendingMessageId: messageId,
    pendingFiredAtMs: nowMs,
  });
}

export type ChecksScheduler = { stop(): void };

const DEFAULT_INTERVAL_MS = 30_000;

export function startChecksScheduler(deps: {
  storage: Storage;
  api: CheckApi;
  intervalMs?: number;
}): ChecksScheduler {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const safeTick = async () => {
    if (stopped) return;
    try {
      await runChecksTick({
        storage: deps.storage,
        api: deps.api,
        nowMs: Date.now(),
      });
    } catch (err) {
      console.error("[checks] tick failed:", err);
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
