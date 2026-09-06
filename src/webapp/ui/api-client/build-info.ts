// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />

export type BuildInfoResponse = {
  commit: string | null;
  shortCommit: string | null;
};

// Served by `webapp/server.ts` itself, ahead of the API: unauthenticated, and a
// failure is not worth an exception — the footer just shows no commit.
export const buildInfoApi = {
  getBuildInfo: async (): Promise<BuildInfoResponse> => {
    const res = await fetch("/api/build-info", { method: "GET" });
    if (!res.ok) return { commit: null, shortCommit: null };
    return (await res.json()) as BuildInfoResponse;
  },
};
