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
  indigo: "#5856d6",
  green: "#34c759",
  teal: "#30b0c7",
  blue: "#007aff",
  red: "#ff3b30",
  pink: "#ff2d55",
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
  sliders: (
    <Glyph>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2.2" fill="#fff" />
      <circle cx="15" cy="12" r="2.2" fill="#fff" />
      <circle cx="8" cy="17" r="2.2" fill="#fff" />
    </Glyph>
  ),
  person: (
    <Glyph>
      <circle cx="12" cy="8" r="3.5" fill="#fff" />
      <path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5z" fill="#fff" />
    </Glyph>
  ),
  people: (
    <Glyph>
      <circle cx="9" cy="8.5" r="3" fill="#fff" />
      <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8z" fill="#fff" />
      <circle cx="16.5" cy="9" r="2.4" fill="#fff" stroke="none" />
      <path d="M16 14.3c2.4 0 4.1 1.6 4.6 4.2h-4" />
    </Glyph>
  ),
  gauge: (
    <Glyph>
      <path d="M4.5 17a8 8 0 1 1 15 0" />
      <path d="M12 13l3.5-4" />
      <circle cx="12" cy="13.5" r="1.6" fill="#fff" />
    </Glyph>
  ),
  shieldDollar: (
    <Glyph>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M12 7.5v9M14.3 9.5c-.4-.8-1.2-1.2-2.3-1.2-1.4 0-2.3.7-2.3 1.7 0 2.3 4.8 1.2 4.8 3.6 0 1-1 1.8-2.5 1.8-1.2 0-2.1-.5-2.5-1.3" />
    </Glyph>
  ),
  chart: (
    <Glyph>
      <path d="M6 19V13M12 19V6M18 19v-9" strokeWidth="2.4" />
    </Glyph>
  ),
  shieldCheck: (
    <Glyph>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill="#fff" />
      <path d="M8.8 12l2.3 2.3 4.3-4.6" stroke="#007aff" strokeWidth="2.2" />
    </Glyph>
  ),
  bubbles: (
    <Glyph>
      <path
        d="M4 5.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z"
        fill="#fff"
      />
      <path d="M18.5 9H20a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18h-1v2.5L16 18h-4.5" />
    </Glyph>
  ),
  warning: (
    <Glyph>
      <path d="M12 3.5L21 19H3z" fill="#fff" />
      <path d="M12 9.5v4" stroke="#ff3b30" strokeWidth="2.2" />
      <circle cx="12" cy="16.3" r=".6" fill="#ff3b30" stroke="#ff3b30" />
    </Glyph>
  ),
  checkmark: (
    <Glyph>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="2.4" />
    </Glyph>
  ),
  envelope: (
    <Glyph>
      <rect
        x="3"
        y="5.5"
        width="18"
        height="13"
        rx="2"
        fill="#fff"
        stroke="none"
      />
      <path d="M4 7l8 6 8-6" stroke="#ff2d55" />
    </Glyph>
  ),
  key: (
    <Glyph>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M21 12v2.5" />
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
