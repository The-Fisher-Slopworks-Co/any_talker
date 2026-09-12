// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import type { SaveStatus as Status } from "../lib/use-autosave";

type Outcome = Exclude<Status, "idle">;

// Centered at the top of the viewport; the Telegram safe-area insets push it
// below the client's own header in fullscreen.
const TOAST_POSITION =
  "fixed left-1/2 z-50 -translate-x-1/2 " +
  "top-[calc(var(--tg-safe-area-inset-top,0px)+var(--tg-content-safe-area-inset-top,0px)+8px)]";

const TOAST_LOOK =
  "rounded-full bg-tg-section px-4 py-2 text-[14px] font-medium " +
  "shadow-[0_2px_12px_rgb(0_0_0/0.18)]";

// Shown: fully opaque in place. Hidden: faded out and nudged up, and not
// catching taps meant for the form underneath.
function toastMotion(visible: boolean): string {
  const base = "transition-[opacity,translate] duration-200";
  return visible
    ? `${base} opacity-100`
    : `${base} opacity-0 -translate-y-2 pointer-events-none`;
}

function toastTone(outcome: Outcome): string {
  return outcome === "failed" ? "text-tg-destructive" : "text-tg-text";
}

// A small toast that reports the autosave, seen wherever the form is scrolled.
// It stays mounted while idle and only fades out, keeping the last message so
// the text does not blank out mid-fade.
export function SaveStatus({ status }: { status: Status }) {
  const { t: s } = useI18n();
  const [shown, setShown] = useState<Outcome>("saving");
  if (status !== "idle" && status !== shown) setShown(status);
  const visible = status !== "idle";

  const message = {
    saving: s.ui_saving,
    saved: s.ui_saved,
    failed: s.ui_main_save_failed,
  }[shown];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={[
        TOAST_POSITION,
        TOAST_LOOK,
        toastMotion(visible),
        toastTone(shown),
      ].join(" ")}
    >
      {message}
    </div>
  );
}
