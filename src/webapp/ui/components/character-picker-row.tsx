// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import type { FactBot } from "../api-client";
import { botLabel } from "../lib/labels";
import { ValueSelectRow } from "./value-select-row";

// The vault a fact list shows — the main bot or one of the character bots —
// as a pop-up row. `scope` is the chosen bot's id, "main" for the main bot.
export function CharacterPickerRow({
  bots,
  scope,
  onChange,
}: {
  bots: FactBot[];
  scope: string;
  onChange: (scope: string) => void;
}) {
  const { t: s } = useI18n();
  return (
    <ValueSelectRow
      label={s.ui_facts_character}
      value={scope}
      onChange={onChange}
    >
      {bots.map((b) => (
        <option key={b.botId ?? "main"} value={b.botId ?? "main"}>
          {botLabel(s, b)}
        </option>
      ))}
    </ValueSelectRow>
  );
}
