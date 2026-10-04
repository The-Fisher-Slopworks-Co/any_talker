// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";
import { ROW_LABEL_CLS, SELECTABLE_ROW_CLS } from "./row";

// The SF Symbol `chevron.right` that marks a row as leading to another screen.
function DisclosureChevron() {
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
  avatar,
  value,
  badge,
  badgeLabel,
  wrapTitle,
  onClick,
}: {
  title: string;
  subtitle?: string;
  // A `SettingsIcon`; rows with one indent their separator past it.
  icon?: ReactNode;
  // An `Avatar`; its rows indent their separator past it too.
  avatar?: ReactNode;
  // The row's current state in the hint colour, before the chevron.
  value?: string | undefined;
  // A red count pill, like an app-icon badge; for what wants attention.
  // Hidden at 0.
  badge?: number;
  // What a screen reader says for the badge: a bare number means nothing.
  badgeLabel?: string;
  // Let a long title run to two lines instead of cutting it at one.
  wrapTitle?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${SELECTABLE_ROW_CLS} ${icon ? "row-icon" : ""} ${avatar ? "row-avatar" : ""}`}
      onClick={onClick}
    >
      {icon}
      {avatar}
      <div className="flex-1 min-w-0">
        <div className={wrapTitle ? "line-clamp-2 break-words" : "truncate"}>
          {title}
        </div>
        {subtitle ? (
          <div className="text-[13px] text-tg-hint truncate">{subtitle}</div>
        ) : null}
      </div>
      {value ? (
        <span className="shrink-0 text-base text-tg-hint tabular-nums">
          {value}
        </span>
      ) : null}
      {badge ? (
        <span
          aria-label={badgeLabel}
          className="shrink-0 min-w-[22px] rounded-full bg-tg-destructive px-[7px] text-center text-[15px] leading-[22px] text-white"
        >
          {badge}
        </span>
      ) : null}
      <DisclosureChevron />
    </button>
  );
}
