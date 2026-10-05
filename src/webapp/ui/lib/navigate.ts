// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// How long a tap leaves the current screen up while the next one's data loads.
// A quicker answer opens the next screen whole; a slower one opens it anyway
// at this point, with its own loader, so a tap never feels ignored.
const OPEN_WAIT_MS = 300;

const afterWait = (fn: () => void) => {
  const timer = setTimeout(fn, OPEN_WAIT_MS);
  return () => clearTimeout(timer);
};

// Opens routes once their screen can show its first full frame, or once the
// wait runs out. A later navigation (or `cancel`, for one that does not wait)
// replaces one still waiting: the latest tap wins.
export function createNavigator<R>({
  ready,
  show,
  hold = () => () => {},
  wait = afterWait,
}: {
  // Settles when `route`'s data is in, failed or not.
  ready: (route: R) => Promise<unknown>;
  show: (route: R) => void;
  // Keeps what was tapped looking pressed; returns what ends that.
  hold?: () => () => void;
  // Calls `fn` when the wait is over; returns what stops it.
  wait?: (fn: () => void) => () => void;
}): { navigate: (route: R) => void; cancel: () => void } {
  let dropWaiting = () => {};
  const cancel = () => dropWaiting();
  const navigate = (route: R) => {
    cancel();
    let waiting = true;
    const release = hold();
    const drop = () => {
      if (!waiting) return;
      waiting = false;
      stop();
      release();
    };
    const open = () => {
      if (!waiting) return;
      drop();
      show(route);
    };
    const stop = wait(open);
    dropWaiting = drop;
    ready(route).then(open, open);
  };
  return { navigate, cancel };
}

// The button last tapped, noted before any handler runs, so a navigation it
// starts can keep it looking pressed: `:active` ends as the finger lifts.
let tapped: Element | null = null;

export function trackTaps(doc: Document): void {
  doc.addEventListener(
    "click",
    (e) => {
      tapped = (e.target as Element | null)?.closest?.("button") ?? null;
    },
    true,
  );
}

export function holdTapped(): () => void {
  const el = tapped;
  el?.setAttribute("data-pressed", "");
  return () => el?.removeAttribute("data-pressed");
}
