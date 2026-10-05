// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useI18n } from "../i18n-context";
import { ValueSelectRow } from "./value-select-row";

// What a chat's override of one global setting looks like: no override at all,
// or its own value (which may itself be null, e.g. "no provider sort").
export type Override<T> = { own: false } | { own: true; value: T | null };

// `<select>` values are strings, so the two non-value choices get names no
// real value can have (slugs and enum words never start with an underscore).
const GLOBAL = "_global";
const NONE = "_none";

// A chat-level setting as a pop-up row whose first choice is "Global (…)",
// meaning the chat does not override it. The choices after it are the chat's
// own values; one of them may be `null`.
export function OverrideSelectRow<T extends string>({
  label,
  globalLabel,
  options,
  override,
  onChange,
}: {
  label: string;
  // What the setting is globally, shown in the first choice: "Auto" gives
  // "Global (Auto)".
  globalLabel: string;
  options: { value: T | null; label: string }[];
  override: Override<T>;
  onChange: (next: Override<T>) => void;
}) {
  const { t: s } = useI18n();
  const encode = (v: T | null) => v ?? NONE;
  const selected = !override.own ? GLOBAL : encode(override.value);
  return (
    <ValueSelectRow
      label={label}
      value={selected}
      onChange={(v) => {
        if (v === GLOBAL) return onChange({ own: false });
        const chosen = options.find((o) => encode(o.value) === v);
        if (chosen) onChange({ own: true, value: chosen.value });
      }}
    >
      <option value={GLOBAL}>{s.ui_chat_global_option(globalLabel)}</option>
      {options.map((o) => (
        <option key={encode(o.value)} value={encode(o.value)}>
          {o.label}
        </option>
      ))}
    </ValueSelectRow>
  );
}
