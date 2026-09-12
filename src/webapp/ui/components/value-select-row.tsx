// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { SelectChevron } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

// A settings row with the current value on the right; tapping it opens the
// platform's native picker over the `<option>`s passed as children.
export function ValueSelectRow({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="relative flex flex-1 min-w-0 items-center">
        <select
          className={`${INPUT_CLS} w-full pr-5`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {children}
        </select>
        <SelectChevron />
      </span>
    </label>
  );
}
