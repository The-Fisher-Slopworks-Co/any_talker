// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The admin API token: a bearer that the HTTP API accepts as the owner, for a
// script or an agent that has no Telegram initData. Only its SHA-256 is kept —
// the token itself is shown once, when it is created.
export type ApiTokenRecord = {
  hash: string;
  createdAt: number;
};

// At most one token (global, not affected by `forBot`). `save` replaces the
// previous one, so creating a token again rotates it.
export interface ApiTokenStore {
  get(): Promise<ApiTokenRecord | null>;
  save(record: ApiTokenRecord): Promise<void>;
  clear(): Promise<void>;
}
