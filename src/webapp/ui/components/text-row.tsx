// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef } from "react";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

// Autosaving text fields commit when left, and when the screen goes away with
// text still pending (Telegram's back button fires no blur).
function useCommitOnLeave(onCommit: () => void) {
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
  return {
    typed: () => {
      pending.current = true;
    },
    left: () => {
      pending.current = false;
      onCommit();
    },
  };
}

// A labelled row with a right-aligned text field that reports `onCommit` when
// it is left or Enter is pressed, not on every keystroke.
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
  const { typed, left } = useCommitOnLeave(onCommit);
  return (
    <label className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <input
        className={INPUT_CLS}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(e) => {
          typed();
          onChange(e.target.value);
        }}
        onBlur={left}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}

// A multi-line text field as a row of a card (a prompt, a list of words),
// committing like `TextRow` when it is left. `label` names it for screen
// readers; it is only shown (`showLabel`) where several areas share a card, so
// otherwise the card's other rows give the context.
export function AreaRow({
  label,
  placeholder,
  value,
  onChange,
  onCommit,
  minHeight = "min-h-[110px]",
  showLabel,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  // A Tailwind min-height class.
  minHeight?: string;
  // Also show the label, as a small caption, when several areas share a card.
  showLabel?: boolean;
}) {
  const { typed, left } = useCommitOnLeave(onCommit);
  return (
    <div className="row relative">
      {showLabel && (
        <div className="px-4 pt-3 text-[13px] leading-[18px] text-tg-hint">
          {label}
        </div>
      )}
      <textarea
        aria-label={label}
        className={`block w-full box-border resize-none border-0 bg-transparent px-4 ${showLabel ? "pb-3 pt-1" : "py-3"} text-base text-tg-text ${minHeight}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          typed();
          onChange(e.target.value);
        }}
        onBlur={left}
      />
    </div>
  );
}
