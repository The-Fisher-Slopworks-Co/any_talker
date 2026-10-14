// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { LogFields } from "../log";

// Telegram shows a chat action for about five seconds or until the bot's next
// message, so it is re-sent a little more often than that while the model runs.
const TYPING_REFRESH_MS = 4000;

export type TypingIndicator = {
  start: () => void;
  stop: () => void;
};

export type TypingIndicatorInput = {
  // One `sendChatAction("typing")` call.
  send: () => Promise<unknown>;
  // When the ask reached the dispatcher, to tell "sent late" from "not shown".
  receivedAt: number;
  // Carried on every log line (chat and bot ids).
  fields: LogFields;
  // A failed send. Called for the first failure only: the refresh would
  // otherwise repeat the same error every few seconds of a long answer.
  warn: (msg: string, fields: LogFields) => void;
  debug: (msg: string, fields: LogFields) => void;
  now?: () => number;
  intervalMs?: number;
};

export function createTypingIndicator(
  input: TypingIndicatorInput,
): TypingIndicator {
  const now = input.now ?? Date.now;
  const intervalMs = input.intervalMs ?? TYPING_REFRESH_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let startedAt: number | null = null;
  let firstAckMs: number | null = null;
  let sent = 0;
  let failed = 0;

  const send = () => {
    const at = now();
    input.send().then(
      () => {
        sent++;
        if (firstAckMs === null && startedAt !== null) {
          firstAckMs = now() - startedAt;
        }
      },
      (err: unknown) => {
        failed++;
        if (failed > 1) return;
        input.warn("typing_failed", {
          ...input.fields,
          since_start_ms: startedAt === null ? null : at - startedAt,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    );
  };

  return {
    start: () => {
      if (timer !== null) return;
      startedAt = now();
      input.debug("typing_started", {
        ...input.fields,
        since_received_ms: startedAt - input.receivedAt,
      });
      send();
      timer = setInterval(send, intervalMs);
    },
    stop: () => {
      if (timer === null || startedAt === null) return;
      clearInterval(timer);
      timer = null;
      input.debug("typing_stopped", {
        ...input.fields,
        duration_ms: now() - startedAt,
        first_ack_ms: firstAckMs,
        sent,
        failed,
      });
    },
  };
}
