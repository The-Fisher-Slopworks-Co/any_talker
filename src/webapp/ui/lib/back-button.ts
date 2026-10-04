// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useRef } from "react";

type TelegramBackButton = {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
};

// Telegram's BackButton fires every registered callback, and on Android the
// system back gesture fires it too. Handlers are kept as a stack instead and
// only the newest one runs, so a sheet open over a screen closes itself
// rather than the screen going back underneath it. The button shows while
// anything is on the stack.
export function createBackStack(button: TelegramBackButton | null) {
  const stack: { run: () => void }[] = [];
  let wired = false;

  const sync = () => {
    if (!button) return;
    if (stack.length === 0) {
      button.hide();
      return;
    }
    if (!wired) {
      button.onClick(() => stack.at(-1)?.run());
      wired = true;
    }
    button.show();
  };

  return {
    // Puts `run` on top; the returned function takes it off again.
    push(run: () => void): () => void {
      const entry = { run };
      stack.push(entry);
      sync();
      return () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
        sync();
      };
    },
  };
}

let shared: ReturnType<typeof createBackStack> | null = null;

function backStack() {
  shared ??= createBackStack(window.Telegram?.WebApp?.BackButton ?? null);
  return shared;
}

// Handles Telegram's back button (and Android's back gesture) while mounted
// and `onBack` is not null. Whatever mounted last wins. The handler may change
// between renders without losing its place on the stack.
export function useBackButton(onBack: (() => void) | null): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  const active = onBack !== null;
  useEffect(() => {
    if (!active) return;
    return backStack().push(() => latest.current?.());
  }, [active]);
}
