// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Message } from "grammy/types";
import type { Storage } from "../storage/types";
import { pickPhotoSize } from "./photo";

export type ResolveReplyImagesArgs = {
  chatId: string;
  replyToMessage: Message;
  storage: Storage;
  fetchPhoto: (fileId: string) => Promise<Uint8Array>;
};

export type ResolveReplyImagesResult = {
  images: Uint8Array[];
  source: "album" | "single" | "none";
  albumIndexSize: number;
};

export async function resolveReplyImages(
  args: ResolveReplyImagesArgs,
): Promise<ResolveReplyImagesResult> {
  const mediaGroupId = args.replyToMessage.media_group_id;
  let albumIndexSize = 0;
  if (mediaGroupId !== undefined) {
    const album = await args.storage
      .getAlbumPhotos(args.chatId, mediaGroupId)
      .catch((err) => {
        console.error("getAlbumPhotos failed:", err);
        return [];
      });
    albumIndexSize = album.length;
    if (album.length > 0) {
      const sorted = [...album].sort((a, b) => a.messageId - b.messageId);
      try {
        const images = await Promise.all(
          sorted.map((a) => args.fetchPhoto(a.fileId)),
        );
        return { images, source: "album", albumIndexSize };
      } catch (err) {
        console.error("reply album photo download failed:", err);
        return { images: [], source: "album", albumIndexSize };
      }
    }
  }

  const photo = args.replyToMessage.photo;
  if (photo && photo.length > 0) {
    const picked = pickPhotoSize(photo);
    if (picked) {
      try {
        const image = await args.fetchPhoto(picked.file_id);
        return { images: [image], source: "single", albumIndexSize };
      } catch (err) {
        console.error("reply photo download failed:", err);
        return { images: [], source: "single", albumIndexSize };
      }
    }
  }

  return { images: [], source: "none", albumIndexSize };
}
