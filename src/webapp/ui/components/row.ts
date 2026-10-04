// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export const ROW_CLS = "row relative flex items-center gap-3 px-4 py-[11px]";
export const ROW_LABEL_CLS = "shrink-0 text-base";
export const ROW_VALUE_CLS = "flex-1 text-right text-tg-hint text-base";

const INPUT_BASE_CLS =
  "flex-1 min-w-0 bg-transparent border-0 p-0 text-base text-tg-text";
export const INPUT_CLS = `${INPUT_BASE_CLS} text-right`;
// A picked value, as opposed to typed text: iOS shows it in the secondary
// colour so the label stays the row's subject.
export const VALUE_INPUT_CLS = `${INPUT_CLS} text-tg-hint`;
export const INPUT_LEFT_CLS = `${INPUT_BASE_CLS} text-left`;

export const SELECTABLE_ROW_CLS = `${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`;
