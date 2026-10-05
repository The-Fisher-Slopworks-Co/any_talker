// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef } from "react";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

// A labelled row with a right-aligned text field that reports `onCommit` when
// it is left or Enter is pressed, not on every keystroke. Leaving the screen
// with the field still focused (Telegram's back button fires no blur) counts
// as leaving the field.
export function TextRow({
  label,
  placeholder,
  value,
  onChange,
  onCommit,
  maxLength,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  maxLength?: number | undefined;
}) {
  // Whether text was typed since the last commit.
  const pending = useRef(false);
  const latest = useRef(onCommit);
  useEffect(() => {
    latest.current = onCommit;
  });
  useEffect(
    () => () => {
      if (pending.current) latest.current();
    },
    [],
  );

  return (
    <label className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <input
        className={INPUT_CLS}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => {
          pending.current = true;
          onChange(e.target.value);
        }}
        onBlur={() => {
          pending.current = false;
          onCommit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
