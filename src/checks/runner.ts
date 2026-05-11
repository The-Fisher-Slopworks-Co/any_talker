// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import {
  startIntervalScheduler,
  type IntervalScheduler,
} from "../shared/interval-scheduler";
import type { RecurringCheck } from "./types";
import { lastScheduledFireMs } from "./schedule";
import { formatQuestion } from "./format";
import { buildCheckCallback } from "./callback-data";
import { resolveCheck, type CheckApi } from "./resolve";
import { checksProcessedTotal } from "../metrics";

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
      checksProcessedTotal.inc({ outcome: "timeout" });
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
  const text = formatQuestion(check.question, {
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
            {
              text: check.yesButton,
              callback_data: buildCheckCallback(check.id, "yes"),
            },
            {
              text: check.noButton,
              callback_data: buildCheckCallback(check.id, "no"),
            },
          ],
        ],
      },
    });
    messageId = sent.message_id;
  } catch (err) {
    checksProcessedTotal.inc({ outcome: "fire_failed" });
    console.error(`[checks] fire failed id=${check.id}:`, err);
    return;
  }

  await storage.saveCheck({
    ...check,
    lastFiredAtMs: nowMs,
    pendingMessageId: messageId,
    pendingFiredAtMs: nowMs,
  });
  checksProcessedTotal.inc({ outcome: "fired" });
}

export type ChecksScheduler = IntervalScheduler;

const DEFAULT_INTERVAL_MS = 30_000;

export function startChecksScheduler(deps: {
  storage: Storage;
  api: CheckApi;
  intervalMs?: number;
}): ChecksScheduler {
  return startIntervalScheduler({
    intervalMs: deps.intervalMs ?? DEFAULT_INTERVAL_MS,
    logPrefix: "[checks]",
    tick: () =>
      runChecksTick({
        storage: deps.storage,
        api: deps.api,
        nowMs: Date.now(),
      }),
  });
}
