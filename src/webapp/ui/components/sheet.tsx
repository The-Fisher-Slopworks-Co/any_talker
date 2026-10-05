// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useBackButton } from "../lib/back-button";

const SHEET_BTN_CLS =
  "bg-transparent border-0 p-0 text-[17px] text-tg-link cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
// How long the sheet takes to slide in or out; the close waits this long
// before unmounting it.
const SHEET_MS = 400;

// Motion of the sheet: it rises from the bottom edge over a fading-in dim and
// sinks back the same way when closing. With "reduce motion" on it only fades.
export function sheetMotion(closing: boolean): {
  backdrop: string;
  panel: string;
} {
  const base = "transition-[opacity,translate] duration-[400ms] ease-tg-spring";
  return {
    backdrop: `${base} starting:opacity-0 ${closing ? "opacity-0" : ""}`,
    panel: `${base} motion-safe:starting:translate-y-full motion-reduce:starting:opacity-0 ${
      closing ? "motion-safe:translate-y-full motion-reduce:opacity-0" : ""
    }`,
  };
}

// Whether letting go of a pulled-down sheet closes it rather than snapping it
// back: pulled past a third of its height, or flicked down (px/ms).
export function dragDismisses(
  dy: number,
  velocity: number,
  height: number,
): boolean {
  return dy > height / 3 || (dy > 10 && velocity > 0.5);
}

// Pulling the sheet down by its grabber: how far it has moved, the sheet's
// height, and whether the finger is still down.
type Drag = { dy: number; height: number; live: boolean };

// Closing is the owner's state, because a sheet also closes itself after its
// own work (a save) and has to hand control on only once it has slid away.
// `dismiss(then)` starts the slide-out and runs `then` when it is over (once:
// a second dismiss while sliding away is ignored); `cancel` dismisses into
// `onClose`.
export function useSheet(onClose: () => void): {
  closing: boolean;
  dismiss: (then: () => void) => void;
  cancel: () => void;
} {
  const [closing, setClosing] = useState(false);
  const started = useRef(false);
  const dismiss = useCallback((then: () => void) => {
    if (started.current) return;
    started.current = true;
    setClosing(true);
    setTimeout(then, SHEET_MS);
  }, []);
  const cancel = useCallback(() => dismiss(onClose), [dismiss, onClose]);
  return { closing, dismiss, cancel };
}

const NOOP = () => {};

// What backdrop, Escape, back and pull-down may call: nothing while a save is
// in flight (it would close the sheet mid-request) or while it slides away.
export function sheetCancel(
  onCancel: () => void,
  busy: boolean,
  closing: boolean,
): () => void {
  return busy || closing ? NOOP : onCancel;
}

// A text button for a sheet's header corners ("Cancel", "Save", "Done").
export function SheetButton({
  bold,
  disabled,
  onClick,
  children,
}: {
  bold?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${SHEET_BTN_CLS} ${bold ? "font-semibold" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// An iOS modal sheet: slides up over a dim, a grabber and a header with a
// `leading` and a `trailing` button around the title. Backdrop tap, Escape,
// Telegram's back button and pulling the grabber down all call `onCancel`,
// which the owner answers with `dismiss`. While `busy` (a save in flight) or
// `closing`, none of them do anything.
export function Sheet({
  title,
  leading,
  trailing,
  closing,
  busy = false,
  onCancel,
  children,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  closing: boolean;
  busy?: boolean;
  onCancel: () => void;
  children: ReactNode;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ startY: number; y: number; t: number; v: number }>(
    null,
  );

  const cancel = sheetCancel(onCancel, busy, closing);
  useBackButton(cancel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll along with the sheet.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [cancel]);

  // Telegram would take a downward swipe as "minimize the app", so the
  // sheet's own pull-down needs it off while the sheet is open.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.isVerticalSwipesEnabled) return;
    tg.disableVerticalSwipes?.();
    return () => tg.enableVerticalSwipes?.();
  }, []);

  const grab = (e: PointerEvent<HTMLDivElement>) => {
    if (busy || closing || (e.target as Element).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = { startY: e.clientY, y: e.clientY, t: e.timeStamp, v: 0 };
    setDrag({
      dy: 0,
      height: panelRef.current?.offsetHeight ?? window.innerHeight,
      live: true,
    });
  };

  const pull = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (!p) return;
    const dt = e.timeStamp - p.t;
    if (dt > 0) p.v = (e.clientY - p.y) / dt;
    p.y = e.clientY;
    p.t = e.timeStamp;
    const dy = Math.max(0, p.y - p.startY);
    setDrag((d) => (d ? { ...d, dy } : d));
  };

  // On release the sheet either goes on down from where the finger left it
  // or slides back up.
  const release = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (!p) return;
    pointer.current = null;
    const dy = Math.max(0, p.y - p.startY);
    const height = drag?.height ?? window.innerHeight;
    if (e.type === "pointerup" && dragDismisses(dy, p.v, height)) {
      setDrag({ dy, height, live: false });
      cancel();
    } else {
      setDrag(null);
    }
  };

  const motion = sheetMotion(closing);
  // While pulled, the sheet follows the finger and the dim thins out with it.
  const panelStyle = drag
    ? ({
        "--sheet-drag": `${drag.dy}px`,
        ...(drag.live ? { transitionDuration: "0s" } : {}),
      } as CSSProperties)
    : undefined;
  const backdropStyle = drag?.live
    ? { opacity: 1 - drag.dy / drag.height, transitionDuration: "0s" }
    : undefined;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${closing ? "pointer-events-none" : ""}`}
    >
      <div
        className={`absolute inset-0 bg-black/40 ${motion.backdrop}`}
        style={backdropStyle}
        onClick={cancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        className={`relative mt-12 flex-1 overflow-y-auto rounded-t-[14px] bg-tg-secondary px-3 pb-8 ${drag ? "translate-y-(--sheet-drag)" : ""} ${motion.panel}`}
        style={panelStyle}
      >
        <div
          className="-mx-3 touch-none px-3 pt-2 pb-4 cursor-grab active:cursor-grabbing"
          onPointerDown={grab}
          onPointerMove={pull}
          onPointerUp={release}
          onPointerCancel={release}
        >
          <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-tg-hint/40" />
          <div className="flex items-center px-1">
            <div className="flex-1 text-left">{leading}</div>
            <span className="text-center text-[17px] font-semibold">
              {title}
            </span>
            <div className="flex-1 text-right">{trailing}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
