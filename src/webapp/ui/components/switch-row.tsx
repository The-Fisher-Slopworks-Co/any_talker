// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Toggle } from "./controls";
import { ROW_CLS, ROW_LABEL_CLS } from "./row";

// A labelled iOS switch as one row of a card; it saves as soon as it flips, so
// there is nothing to confirm.
export function SwitchRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="flex-1" />
      <Toggle
        value={value}
        onChange={onChange}
        label={label}
        disabled={disabled}
      />
    </div>
  );
}
