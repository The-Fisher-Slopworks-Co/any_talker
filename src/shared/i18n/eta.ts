// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// "Time until the limit resets", rounded up and coarse — shared by the /usage
// command and the Web App's usage bars.
export function etaEn(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 90) return `${min} min`;
  const hours = Math.ceil(min / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.ceil(hours / 24)} d`;
}

export function etaRu(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 90) return `${min} мин`;
  const hours = Math.ceil(min / 60);
  if (hours < 48) return `${hours} ч`;
  return `${Math.ceil(hours / 24)} дн`;
}
