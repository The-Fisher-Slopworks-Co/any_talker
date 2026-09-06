// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Telegram file_id payloads decoded into bytes are cached for this many
// seconds. 7 days covers typical conversation reuse without keeping
// every photo the bot has ever seen pinned in storage indefinitely.
export const PHOTO_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
