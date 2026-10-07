// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The part of Telegram's WebApp object that paints around the page.
type TelegramChrome = {
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};

// The page itself is painted with the theme's secondary background (see
// `html, body` in styles.css). Telegram's header and the webview behind the
// page default to its primary background, so without this a strip of another
// colour shows above the content and on overscroll. A theme key rather than a
// hex value keeps both following the user's theme when it changes.
const PAGE_BG_KEY = "secondary_bg_color";

export function matchTelegramChrome(tg: TelegramChrome | undefined): void {
  tg?.setHeaderColor?.(PAGE_BG_KEY);
  tg?.setBackgroundColor?.(PAGE_BG_KEY);
}
