// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// "N somethings", declined. The forms are arguments rather than a dictionary of
// their own: the words belong next to the message that counts them, the way
// `etaEn`/`etaRu` keep their units.

// English declines on 1 alone — 0 takes the plural like everything else.
export function pluralEn(n: number, one: string, other: string): string {
  return `${n} ${Math.abs(n) === 1 ? one : other}`;
}

// Russian picks one of three forms by the last digits: ...1 takes the nominative
// singular (1 диалог), ...2–...4 the genitive singular (2 диалога), and the rest
// the genitive plural (0, 5, 100 диалогов). The teens are the exception — 11–14
// go to the genitive plural whatever their last digit says.
export function pluralRu(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const lastTwo = Math.abs(n) % 100;
  const lastDigit = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} ${many}`;
  if (lastDigit === 1) return `${n} ${one}`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}
