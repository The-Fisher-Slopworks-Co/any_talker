// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Whatever a run has to keep for the next one lives here: the account's session
// string, and later the token of the bot under test. Both are earned by talking
// to a flood-limited test DC, so a suite that re-creates them every time stops
// working when it runs twice in a row. The directory is gitignored — a session
// string is a live login.

const CACHE_DIR = ".e2e-cache";

export async function readCached(name: string): Promise<string | undefined> {
  const file = Bun.file(`${CACHE_DIR}/${name}`);
  if (!(await file.exists())) return undefined;
  // An empty (or whitespace-only) file is a half-written cache from a run that
  // died mid-write; treat it as absent rather than feeding "" to Telegram.
  return (await file.text()).trim() || undefined;
}

export async function writeCached(name: string, value: string): Promise<void> {
  await Bun.write(`${CACHE_DIR}/${name}`, `${value}\n`);
}
