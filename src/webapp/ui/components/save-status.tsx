// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { SaveStatus as Status } from "../lib/use-autosave";

// Centered at the top of the viewport; the Telegram safe-area insets push it
// below the client's own header in fullscreen.
const TOAST_POSITION =
  "fixed left-1/2 z-50 -translate-x-1/2 " +
  "top-[calc(var(--tg-safe-area-inset-top,0px)+var(--tg-content-safe-area-inset-top,0px)+8px)]";

const TOAST_LOOK =
  "rounded-full bg-tg-section px-4 py-2 text-[14px] font-medium " +
  "text-tg-destructive " +
  "shadow-[0_2px_12px_rgb(0_0_0/0.18)]";

// Shown: fully opaque in place. Hidden: faded out and nudged up, and not
// catching taps meant for the form underneath.
function toastMotion(visible: boolean): string {
  const base = "transition-[opacity,translate] duration-200";
  return visible
    ? `${base} opacity-100`
    : `${base} opacity-0 -translate-y-2 pointer-events-none`;
}

// A toast for a failed autosave, seen wherever the form is scrolled. Saving
// and success stay silent, as in iOS Settings: a change simply sticks. It
// stays mounted while hidden and only fades out.
export function SaveStatus({
  status,
  message,
}: {
  status: Status;
  message?: string;
}) {
  const { t: s } = useI18n();
  const visible = status === "failed";
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={[TOAST_POSITION, TOAST_LOOK, toastMotion(visible)].join(" ")}
    >
      {message ?? s.ui_main_save_failed}
    </div>
  );
}
