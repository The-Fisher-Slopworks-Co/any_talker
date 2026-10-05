// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef, useState } from "react";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

export type NumberRules = {
  min?: number | undefined;
  max?: number | undefined;
  integer?: boolean | undefined;
};

// The number a typed text stands for, or null when it is not an acceptable
// value (blank, not a number, fractional where whole is required, out of range).
export function parseNumber(text: string, rules: NumberRules): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (rules.integer && !Number.isInteger(n)) return null;
  if (rules.min !== undefined && n < rules.min) return null;
  if (rules.max !== undefined && n > rules.max) return null;
  return n;
}

// What a blur or Enter should save: the new value, or null to leave things as
// they are (nothing was changed, or what was typed is not acceptable).
export function numberToCommit(
  text: string,
  current: number,
  rules: NumberRules,
): number | null {
  const n = parseNumber(text, rules);
  return n === null || n === current ? null : n;
}

// `$` and `/day` hug the number; a unit that is a word is set off by a space.
const WORD_UNIT = /^\p{L}/u;

// An editable number as a settings row: label left, value right with an
// optional unit before (`prefix`) or after (`suffix`) in the secondary colour.
// `value` is the saved value; the typed text is committed with `onCommit` on
// blur or Enter (or when the row unmounts while still being edited), and only
// when it is valid and different — otherwise the field snaps back. `decimals` pads the shown value (`18` -> `18.00`) when that
// loses nothing.
export function NumberRow({
  label,
  value,
  onCommit,
  prefix,
  suffix,
  decimals,
  step,
  ...rules
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  step?: number | string;
} & NumberRules) {
  const show = (n: number) => {
    const padded = decimals === undefined ? String(n) : n.toFixed(decimals);
    return Number(padded) === n ? padded : String(n);
  };
  const [text, setText] = useState(() => show(value));
  const [seen, setSeen] = useState(value);
  // A new saved value (a revert after a failed save, say) replaces the text.
  if (seen !== value) {
    setSeen(value);
    setText(show(value));
  }

  // The text typed since the last commit. A Telegram back-navigation unmounts
  // the row without a blur, so what is still pending is committed on unmount.
  const pending = useRef(false);
  const latest = useRef({ text, value, rules, onCommit });
  useEffect(() => {
    latest.current = { text, value, rules, onCommit };
  });
  useEffect(
    () => () => {
      if (!pending.current) return;
      const l = latest.current;
      const n = numberToCommit(l.text, l.value, l.rules);
      if (n !== null) l.onCommit(n);
    },
    [],
  );

  const commit = () => {
    pending.current = false;
    const n = numberToCommit(text, value, rules);
    if (n === null) setText(show(value));
    else {
      setText(show(n));
      onCommit(n);
    }
  };

  const unit = "text-tg-hint whitespace-pre";
  return (
    <label className={ROW_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="flex flex-1 min-w-0 items-baseline justify-end">
        {prefix && <span className={unit}>{prefix}</span>}
        {/* The hidden copy sizes the box to the text, so the unit sits right
            against the number whatever is typed. */}
        <span className="relative inline-block min-w-[1ch] pr-px">
          <span aria-hidden className="invisible whitespace-pre text-base">
            {text}
          </span>
          <input
            type="number"
            className={`${INPUT_CLS} absolute inset-0 w-full`}
            value={text}
            step={step}
            min={rules.min}
            max={rules.max}
            onChange={(e) => {
              pending.current = true;
              setText(e.target.value);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </span>
        {suffix && (
          <span className={`${unit} ${WORD_UNIT.test(suffix) ? "ml-1" : ""}`}>
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}
