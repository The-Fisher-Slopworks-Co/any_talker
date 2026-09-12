// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { SaveStatus as Status } from "../lib/use-autosave";

// The quiet line an autosaving form shows in place of a save button: nothing
// while idle, then how the last burst of changes went.
export function SaveStatus({ status }: { status: Status }) {
  const { t: s } = useI18n();
  if (status === "idle") return null;
  return (
    <div
      role="status"
      className={`px-4 text-center text-[13px] ${status === "failed" ? "text-tg-destructive" : "text-tg-hint"}`}
    >
      {status === "saving"
        ? s.ui_saving
        : status === "saved"
          ? s.ui_saved
          : s.ui_main_save_failed}
    </div>
  );
}
