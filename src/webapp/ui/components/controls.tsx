// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../i18n-context";

// The SF Symbol `chevron.up.chevron.down` iOS puts after a pop-up value.
export function SelectChevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 16"
      className="pointer-events-none absolute right-0 top-1/2 h-[14px] w-[9px] -translate-y-1/2 text-tg-hint"
    >
      <path
        d="M1.5 6 5 2.5 8.5 6M1.5 10 5 13.5 8.5 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Toggle({
  value,
  onChange,
  label,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  // What VoiceOver reads; the visible label sits outside the button.
  label?: string;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      role="switch"
      className={`toggle ${value ? "on" : ""} disabled:opacity-50 disabled:cursor-not-allowed`}
      onClick={() => onChange(!value)}
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
    />
  );
}

function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="action mt-4">
      <button
        className="w-full bg-tg-button text-tg-button-text rounded-xl py-[14px] text-base font-semibold cursor-pointer transition-opacity active:not-disabled:opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    </div>
  );
}

export function SaveButton({
  saving,
  dirty,
  disabled,
  onClick,
}: {
  saving: boolean;
  dirty: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t: s } = useI18n();
  return (
    <PrimaryButton disabled={disabled ?? (saving || !dirty)} onClick={onClick}>
      {saving ? s.ui_saving : dirty ? s.ui_save : s.ui_saved}
    </PrimaryButton>
  );
}

// What every action row of a card shares: it follows a `.row` or another action
// with the hairline separator, and presses to the separator colour.
export const ACTION_ROW_CLS =
  "action-row relative flex w-full items-center gap-3 bg-tg-section border-0 px-4 py-[11px] min-h-11 text-left text-base cursor-pointer active:not-disabled:bg-[var(--tg-separator)] disabled:opacity-50 disabled:cursor-not-allowed";

// An iOS action row: a left-aligned link-coloured label that runs something
// rather than opening a screen. `bold` marks the primary one of a form (Create),
// `destructive` the one that deletes or revokes, `centered` one that stands
// alone at the bottom of a sheet. Sits in a card of its own or as the last row
// of the card it acts on.
export function ActionRow({
  onClick,
  disabled,
  bold,
  destructive,
  centered,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  bold?: boolean;
  destructive?: boolean;
  centered?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${ACTION_ROW_CLS} ${destructive ? "text-tg-destructive" : "text-tg-link"} ${bold ? "font-semibold" : ""} ${centered ? "justify-center" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
