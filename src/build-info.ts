// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { $ } from "bun";

export type BuildInfo = {
  commit: string | null;
  shortCommit: string | null;
};

const SHORT_LEN = 7;

export function shortenCommit(commit: string | null | undefined): string | null {
  if (!commit) return null;
  const trimmed = commit.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, SHORT_LEN);
}

export function buildInfoFromEnv(
  env: Record<string, string | undefined>,
): BuildInfo | null {
  const raw = env.GIT_COMMIT?.trim();
  if (!raw) return null;
  return { commit: raw, shortCommit: shortenCommit(raw) };
}

async function readCommitFromGit(): Promise<string | null> {
  try {
    const out = await $`git rev-parse HEAD`.quiet().text();
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

let cached: Promise<BuildInfo> | null = null;

export async function getBuildInfo(
  env: Record<string, string | undefined> = process.env,
): Promise<BuildInfo> {
  if (cached) return cached;
  cached = (async () => {
    const fromEnv = buildInfoFromEnv(env);
    if (fromEnv) return fromEnv;
    const commit = await readCommitFromGit();
    return { commit, shortCommit: shortenCommit(commit) };
  })();
  return cached;
}

export function resetBuildInfoCacheForTests(): void {
  cached = null;
}
