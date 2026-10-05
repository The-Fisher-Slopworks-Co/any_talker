// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { ACTION_ROW_CLS } from "./controls";

// The last row of a list card that adds an entry: iOS's green plus circle and
// a link-coloured label ("New Check"). `underAvatars`: the rows above lead with
// a 36px avatar, so the plus sits in their column and the label lines up with
// their text.
export function AddRow({
  label,
  onClick,
  disabled,
  underAvatars,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  underAvatars?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${ACTION_ROW_CLS} text-tg-link ${underAvatars ? "add-row-avatar" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        aria-hidden
        className={`grid size-[22px] shrink-0 place-items-center rounded-full bg-[#34c759] ${underAvatars ? "mx-[7px]" : ""}`}
      >
        <svg viewBox="0 0 12 12" className="size-3 text-white">
          <path
            d="M6 1.5v9M1.5 6h9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {label}
    </button>
  );
}
