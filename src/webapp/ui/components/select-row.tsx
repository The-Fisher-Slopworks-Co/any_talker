// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { ROW_LABEL_CLS, SELECTABLE_ROW_CLS } from "./row";

// The SF Symbol `chevron.right` that marks a row as leading to another screen.
export function DisclosureChevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 14"
      className="h-[13px] w-[8px] shrink-0 text-tg-hint opacity-60"
    >
      <path
        d="M1.5 1.5 6.5 7l-5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SelectRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={SELECTABLE_ROW_CLS} onClick={onSelect}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <span className="flex-1" />
      {selected ? <span className="text-tg-link">✓</span> : null}
    </button>
  );
}

export function NavRow({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle?: string;
  // A `SettingsIcon`; rows with one indent their separator past it.
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${SELECTABLE_ROW_CLS} ${icon ? "row-icon" : ""}`}
      onClick={onClick}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="truncate">{title}</div>
        {subtitle ? (
          <div className="text-[13px] text-tg-hint truncate">{subtitle}</div>
        ) : null}
      </div>
      <DisclosureChevron />
    </button>
  );
}
