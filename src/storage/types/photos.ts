// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Photo storage with deliberately mixed scoping — this is the current
// behaviour, not an oversight: the file-bytes cache is keyed by Telegram's
// global `fileId` and therefore shared across every bot view, while the album
// buffers are per-character and scoped by `forBot`.
export interface PhotosStore {
  getBytes(fileId: string): Promise<Uint8Array | null>;
  saveBytes(fileId: string, bytes: Uint8Array): Promise<void>;

  appendAlbum(
    chatId: string,
    mediaGroupId: string,
    photo: { messageId: number; fileId: string },
  ): Promise<void>;
  listAlbum(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>>;
}
