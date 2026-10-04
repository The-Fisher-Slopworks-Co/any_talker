// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ACTION_WIDTH,
  dragOffset,
  lockDirection,
  settle,
  type Lock,
} from "../lib/swipe";

// How long a deleted row takes to slide out before it is removed.
const SLIDE_MS = 200;

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  start: number;
  width: number;
  lock: Lock;
  lastX: number;
  lastT: number;
  velocity: number;
  // Where the row is now; React state can be a render behind the finger.
  offset: number;
};

// A drag that starts on one of these is the user editing, not swiping.
const EDITABLE = "input, textarea, select, [contenteditable]";
// A finger that has rested this long (ms) before lifting is not a flick.
const FLICK_MS = 80;

// A list row that slides left under the finger (or a mouse) to reveal a red
// action: let go past half of it and the row snaps open, drag most of the way
// across and it is deleted. Tapping the red action deletes too; tapping the
// row while it is open only closes it. Rows are meant to be the children of a
// `Card`, each with its own detail screen as the keyboard path. If `onDelete`
// rejects the row slides back; telling the user is up to the caller.
export function SwipeToDelete({
  label,
  onDelete,
  children,
}: {
  // The action's text, e.g. "Remove".
  label: string;
  onDelete: () => Promise<void> | void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);
  const removing = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  // An open row closes when anything else is touched or the page scrolls.
  const open = offset !== 0;
  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (!removing.current) setOffset(0);
    };
    const closeOutside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("scroll", close, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const remove = async () => {
    if (removing.current) return;
    removing.current = true;
    setOffset(-(rootRef.current?.offsetWidth ?? ACTION_WIDTH));
    await new Promise((resolve) => setTimeout(resolve, SLIDE_MS));
    try {
      await onDelete();
      setOffset(0);
    } catch {
      setOffset(0);
    } finally {
      removing.current = false;
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0 || removing.current) return;
    if ((e.target as Element).closest(EDITABLE)) return;
    swallowClick.current = false;
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: offset,
      width: e.currentTarget.offsetWidth,
      lock: "pending",
      lastX: e.clientX,
      lastT: e.timeStamp,
      velocity: 0,
      offset,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.lock === "pending") {
      g.lock = lockDirection(e.clientX - g.x, e.clientY - g.y);
      if (g.lock === "vertical") gesture.current = null;
      if (g.lock !== "horizontal") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.velocity = (e.clientX - g.lastX) / dt;
    g.lastX = e.clientX;
    g.lastT = e.timeStamp;
    g.offset = dragOffset(g.start, e.clientX - g.x, g.width);
    setOffset(g.offset);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (g.lock !== "horizontal") return;
    setDragging(false);
    swallowClick.current = true;
    // A cancelled touch (the browser took over to scroll) must not delete.
    const cancelled = e.type === "pointercancel";
    const flicking = !cancelled && e.timeStamp - g.lastT <= FLICK_MS;
    const to = settle(g.offset, flicking ? g.velocity : 0, g.width);
    if (to === "delete" && !cancelled) void remove();
    else setOffset(to === "closed" ? 0 : -ACTION_WIDTH);
  };

  // Runs before the row's own click handler: a drag that ends over the row, or
  // a tap on a row that is open, must not navigate.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const afterDrag = swallowClick.current;
    swallowClick.current = false;
    if (!afterDrag && offset === 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!afterDrag && !removing.current) setOffset(0);
  };

  return (
    <div
      ref={rootRef}
      className="swipe-row relative overflow-hidden"
      data-active={open || dragging ? "" : undefined}
    >
      {/* Stays until the row has slid back over it (the delayed hide), so no
          blank strip trails a closing row; hidden, it is also out of the tab
          order and the accessibility tree. */}
      <div
        className={`absolute inset-0 flex justify-end bg-tg-destructive transition-[visibility] duration-0 ${open ? "visible" : "invisible delay-200"}`}
      >
        <button
          type="button"
          className="h-full shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent px-2 text-base text-white"
          style={{ width: Math.max(ACTION_WIDTH, -offset) }}
          onClick={() => void remove()}
        >
          {label}
        </button>
      </div>
      <div
        className={`relative touch-pan-y bg-tg-section ${dragging ? "select-none" : "transition-transform duration-200 ease-out motion-reduce:transition-none"}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
