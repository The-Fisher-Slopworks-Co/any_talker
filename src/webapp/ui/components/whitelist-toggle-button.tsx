import { useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import type { WhitelistKind } from "../../../shared/types";
import { RowButton } from "./controls";

export function WhitelistToggleButton({
  kind,
  id,
  label,
  initial,
}: {
  kind: WhitelistKind;
  id: string;
  label: string;
  initial: boolean;
}) {
  const { t: s } = useI18n();
  const [whitelisted, setWhitelisted] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (whitelisted) {
        await api.removeWhitelist(kind, id);
        setWhitelisted(false);
      } else {
        await api.addWhitelist(kind, { id, label });
        setWhitelisted(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <RowButton onClick={toggle} disabled={busy}>
      {busy
        ? s.ui_updating
        : whitelisted
          ? s.ui_whitelist_remove
          : s.ui_whitelist_add}
    </RowButton>
  );
}
