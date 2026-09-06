// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { PhotosStore } from "../types/photos";
import type { Backing, Scope } from "../memory";

// Mixed scoping, as the interface documents: the file-bytes cache is keyed by
// Telegram's global `fileId` and shared across every view, while the album
// buffers below go through `sk` and are per-character.
export class MemoryPhotosStore implements PhotosStore {
  constructor(
    private readonly b: Backing,
    private readonly scope: Scope,
  ) {}

  async getBytes(fileId: string): Promise<Uint8Array | null> {
    const b = this.b.photoCache.get(fileId);
    return b ? new Uint8Array(b) : null;
  }

  async saveBytes(fileId: string, bytes: Uint8Array): Promise<void> {
    this.b.photoCache.set(fileId, new Uint8Array(bytes));
  }

  private albumKey(chatId: string, mediaGroupId: string): string {
    return this.scope.sk(`${chatId}:${mediaGroupId}`);
  }

  async appendAlbum(
    chatId: string,
    mediaGroupId: string,
    photo: { messageId: number; fileId: string },
  ): Promise<void> {
    const key = this.albumKey(chatId, mediaGroupId);
    let m = this.b.albums.get(key);
    if (!m) {
      m = new Map();
      this.b.albums.set(key, m);
    }
    m.set(photo.messageId, photo.fileId);
  }

  async listAlbum(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>> {
    const m = this.b.albums.get(this.albumKey(chatId, mediaGroupId));
    if (!m) return [];
    return [...m.entries()].map(([messageId, fileId]) => ({
      messageId,
      fileId,
    }));
  }
}
