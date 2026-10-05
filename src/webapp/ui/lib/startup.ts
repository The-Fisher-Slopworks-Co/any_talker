// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { resolveLang, type Lang } from "../../../shared/i18n";
import type { MeResponse } from "../api-client";

// The Web App renders nothing until `/api/me` settles: the viewer's saved
// language and date format live there, and a first frame in any other
// language would visibly switch a moment later.
export type Startup =
  { kind: "loading" } | { kind: "ready"; me: MeResponse } | { kind: "failed" };

// Never rejects: a failed `/me` becomes a state the UI can show instead of a
// blank screen that never goes away.
export function settleStartup(me: Promise<MeResponse>): Promise<Startup> {
  return me.then(
    (m): Startup => ({ kind: "ready", me: m }),
    (): Startup => ({ kind: "failed" }),
  );
}

// The saved preference wins; without one — or when `/me` failed — Telegram's
// client language is the best guess.
export function startupLang(
  startup: Startup,
  telegramCode: string | null | undefined,
): Lang {
  const saved = startup.kind === "ready" ? startup.me.language : null;
  return resolveLang(saved, telegramCode);
}
