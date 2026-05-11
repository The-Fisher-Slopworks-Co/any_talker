// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { useI18n } from "../i18n-context";

export function SelectChevron() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-tg-link text-[14px] leading-none"
    >
      ▼
    </span>
  );
}

export function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    />
  );
}

export function PrimaryButton({
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

export function RowButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="action-row relative block w-full bg-tg-section text-tg-link border-0 text-center px-4 py-[13px] text-base font-medium cursor-pointer active:not-disabled:bg-[var(--tg-separator)] disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
