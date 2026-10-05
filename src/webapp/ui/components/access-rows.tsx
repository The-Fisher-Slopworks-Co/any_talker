// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import type { WhitelistKind } from "../../../shared/types";
import { useAutosave } from "../lib/use-autosave";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { SaveStatus } from "./save-status";
import { SwitchRow } from "./switch-row";

type Change = { list: "whitelist" | "blacklist"; on: boolean };

// A user's or chat's access: Allowed (on the whitelist) and Blocked (on the
// blacklist) as two switches, each saved the moment it flips and put back if
// the server refuses.
export function AccessRows({
  kind,
  id,
  label,
  whitelisted,
  blacklisted,
  footer,
}: {
  kind: WhitelistKind;
  id: string;
  // What the entry is called in the lists.
  label: string;
  whitelisted: boolean;
  blacklisted: boolean;
  footer: string;
}) {
  const { t: s } = useI18n();
  const [flags, setFlags] = useState({
    whitelist: whitelisted,
    blacklist: blacklisted,
  });
  const { save, status } = useAutosave<Change, unknown>({
    send: ({ list, on }) => {
      const entry = { id, label };
      if (list === "whitelist")
        return on
          ? api.addWhitelist(kind, entry)
          : api.removeWhitelist(kind, id);
      return on ? api.addBlacklist(kind, entry) : api.removeBlacklist(kind, id);
    },
    onSaved: () => {},
    onFailed: ({ list, on }) => setFlags((f) => ({ ...f, [list]: !on })),
  });

  const set = (list: Change["list"]) => (on: boolean) => {
    setFlags((f) => ({ ...f, [list]: on }));
    save({ list, on });
  };

  return (
    <>
      <SectionHeader>{s.ui_access_header}</SectionHeader>
      <Card>
        <SwitchRow
          label={s.ui_access_allowed}
          value={flags.whitelist}
          onChange={set("whitelist")}
        />
        <SwitchRow
          label={s.ui_access_blocked}
          value={flags.blacklist}
          onChange={set("blacklist")}
        />
      </Card>
      <SectionFooter>{footer}</SectionFooter>
      <SaveStatus status={status} />
    </>
  );
}
