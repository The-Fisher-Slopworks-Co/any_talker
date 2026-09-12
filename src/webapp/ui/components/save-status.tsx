// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import type { SaveStatus as Status } from "../lib/use-autosave";

// A small toast pinned to the top of the viewport, below Telegram's own
// header in fullscreen, so it is seen wherever the form is scrolled. It stays
// mounted while idle and only fades out, keeping the last message so the text
// does not blank out mid-fade.
export function SaveStatus({ status }: { status: Status }) {
  const { t: s } = useI18n();
  const [shown, setShown] = useState<Exclude<Status, "idle">>("saving");
  if (status !== "idle" && status !== shown) setShown(status);
  const visible = status !== "idle";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={`fixed left-1/2 z-50 -translate-x-1/2 top-[calc(var(--tg-safe-area-inset-top,0px)+var(--tg-content-safe-area-inset-top,0px)+8px)] rounded-full bg-tg-section px-4 py-2 text-[14px] font-medium shadow-[0_2px_12px_rgb(0_0_0/0.18)] transition-[opacity,translate] duration-200 ${visible ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0"} ${shown === "failed" ? "text-tg-destructive" : "text-tg-text"}`}
    >
      {shown === "saving"
        ? s.ui_saving
        : shown === "saved"
          ? s.ui_saved
          : s.ui_main_save_failed}
    </div>
  );
}
