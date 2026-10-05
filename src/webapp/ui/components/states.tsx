// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../i18n-context";
import { useDelayedFlag } from "../lib/use-delayed-flag";

// A `text` (not found, failed) shows at once; plain "Loading…" only once the
// wait is noticeable. Until then the block keeps its height, blank, so the
// label appearing moves nothing.
export function LoadingState({ text }: { text?: string } = {}) {
  const { t: s } = useI18n();
  const noticeable = useDelayedFlag(true);
  return (
    <div className="text-center text-tg-hint py-20">
      {text ?? (noticeable ? s.ui_loading : " ")}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
      {children}
    </div>
  );
}
