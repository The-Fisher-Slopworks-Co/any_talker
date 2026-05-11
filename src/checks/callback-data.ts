// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export const CHECK_CALLBACK_RE = /^check:([^:]+):(yes|no)$/;

export function buildCheckCallback(
  id: string,
  answer: "yes" | "no",
): string {
  return `check:${id}:${answer}`;
}
