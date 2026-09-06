// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Api } from "grammy";
import type { Storage } from "../storage/types";
import type { BudgetDenyReason, ChatType } from "../shared/types";
import { t } from "../shared/i18n";
import { utcDateKey } from "../spending/window";
import { ALERT_TTL_SECONDS } from "../observability/scheduler";

export function createAlerts(args: { storage: Storage; ownerId: string }): {
  globalCapBreach: (api: Api, reason: BudgetDenyReason) => Promise<void>;
  newGroup: (
    api: Api,
    chat: { id: string; type: ChatType; title: string | null },
  ) => Promise<void>;
} {
  // Fire-and-forget owner DM when a GLOBAL budget cap first trips today. Deduped
  // via `observability.claimAlert` so the owner gets one DM per period per UTC
  // day, not one per denied request. Only the global caps are alarms — the
  // per-chat and new-user caps are routine guardrails and stay silent (they
  // still show on the dashboard/metrics). Fires identically for the main bot and
  // every managed bot.
  const globalCapBreach = async (
    api: Api,
    reason: BudgetDenyReason,
  ): Promise<void> => {
    if (reason !== "globalMonthly" && reason !== "globalDaily") return;
    const period: "day" | "month" =
      reason === "globalMonthly" ? "month" : "day";
    try {
      const now = Date.now();
      const claimed = await args.storage.observability.claimAlert(
        `global_cap:${period}:${utcDateKey(now)}`,
        ALERT_TTL_SECONDS,
      );
      if (!claimed) return;
      const [global, ownerLang] = await Promise.all([
        args.storage.spend.getGlobal(now),
        args.storage.profile.getLang(args.ownerId),
      ]);
      const spent = period === "month" ? global.month : global.day;
      await api.sendMessage(
        args.ownerId,
        t(ownerLang ?? "en").bot_owner_budget_cap(period, spent.toFixed(2)),
      );
    } catch (err) {
      console.error("global cap breach alert failed:", err);
    }
  };

  // Fire-and-forget owner DM the first time the bot is seen in a new non-private
  // chat — i.e. it was just added to a group. Deduped via
  // `observability.claimAlert` so a rare concurrent double-`isNew` (the
  // read-merge upsert isn't atomic) sends once.
  const newGroup = async (
    api: Api,
    chat: { id: string; type: ChatType; title: string | null },
  ): Promise<void> => {
    if (chat.type === "private") return;
    try {
      const claimed = await args.storage.observability.claimAlert(
        `new_chat:${chat.id}`,
        7 * 24 * 60 * 60,
      );
      if (!claimed) return;
      const ownerLang = await args.storage.profile.getLang(args.ownerId);
      await api.sendMessage(
        args.ownerId,
        t(ownerLang ?? "en").bot_owner_new_group(
          chat.title ?? chat.id,
          chat.id,
        ),
      );
    } catch (err) {
      console.error("new group alert failed:", err);
    }
  };

  return { globalCapBreach, newGroup };
}
