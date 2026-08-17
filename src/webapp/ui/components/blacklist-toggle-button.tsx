// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import { RowButton } from "./controls";

export function BlacklistToggleButton({
  id,
  label,
  initial,
}: {
  id: string;
  label: string;
  initial: boolean;
}) {
  const { t: s } = useI18n();
  const [blacklisted, setBlacklisted] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (blacklisted) {
        await api.removeBlacklist(id);
        setBlacklisted(false);
      } else {
        await api.addBlacklist({ id, label });
        setBlacklisted(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <RowButton onClick={toggle} disabled={busy}>
      {busy
        ? s.ui_updating
        : blacklisted
          ? s.ui_blacklist_remove
          : s.ui_blacklist_add}
    </RowButton>
  );
}
