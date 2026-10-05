// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The arithmetic of an iOS-style swipe-to-delete row, kept free of the DOM so
// it can be tested. Offsets are in px, negative = the row slid to the left.

// Width of the red action once the row has snapped open.
export const ACTION_WIDTH = 80;
// Movement before the gesture decides whether it is a swipe or a scroll.
const LOCK_DISTANCE = 8;
// A swipe past this share of the row's width deletes it.
const DELETE_RATIO = 0.6;
// How far ahead (ms) a flick's speed carries the row when it is let go.
const PROJECTION_MS = 120;

export type Lock = "pending" | "horizontal" | "vertical";
export type Settled = "closed" | "open" | "delete";

export function lockDirection(dx: number, dy: number): Lock {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_DISTANCE) return "pending";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

// The row follows the finger, but never past the left edge or to the right of
// its resting place.
export function dragOffset(start: number, dx: number, width: number): number {
  return Math.min(0, Math.max(-width, start + dx));
}

// Where a released row goes. Deleting needs a long drag; a flick can only open
// or close, judged by where its speed (px/ms) would carry it.
export function settle(
  offset: number,
  velocity: number,
  width: number,
): Settled {
  if (offset <= -width * DELETE_RATIO) return "delete";
  const projected = offset + velocity * PROJECTION_MS;
  return projected <= -ACTION_WIDTH / 2 ? "open" : "closed";
}
