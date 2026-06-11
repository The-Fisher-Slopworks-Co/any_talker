// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Api } from "grammy";
import type { RichApiMethods } from "../types/telegram-rich";

// grammY's RawApi is a Proxy that forwards any method name straight to
// Telegram, so Bot API 10.1's sendRichMessage is callable through `api.raw`
// even though the installed @grammyjs/types predates it. This mirrors how guest
// mode's answerGuestQuery is reached in bot/index.ts.
export function richApi(api: Api): RichApiMethods {
  return api.raw as unknown as RichApiMethods;
}
