// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ReactNode } from "react";

// The white glyphs on a tinted rounded square that lead iOS Settings rows.
// Colours are the iOS system palette, which keeps them readable on both the
// light and the dark Telegram theme.
const TINTS = {
  orange: "#ff9500",
  purple: "#af52de",
  gray: "#8e8e93",
} as const;

export type IconTint = keyof typeof TINTS;

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="#fff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const GLYPHS = {
  bell: (
    <Glyph>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" fill="#fff" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Glyph>
  ),
  memory: (
    <Glyph>
      <path
        d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"
        fill="#fff"
      />
      <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#fff" />
    </Glyph>
  ),
  gear: (
    <Glyph>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </Glyph>
  ),
} satisfies Record<string, ReactNode>;

export function SettingsIcon({
  tint,
  glyph,
}: {
  tint: IconTint;
  glyph: keyof typeof GLYPHS;
}) {
  return (
    <span
      className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px]"
      style={{ background: TINTS[tint] }}
    >
      {GLYPHS[glyph]}
    </span>
  );
}
