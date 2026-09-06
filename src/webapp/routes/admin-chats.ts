// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ChatSettings } from "../../shared/types";
import {
  isValidTimezone,
  isValidProviderSlug,
  isValidProviderSort,
  isValidServiceTier,
} from "../../shared/types";
import type { ApiResponse, Route } from "./types";
import { unknownModelsError } from "./models";

const CHAT_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "chat not found" },
};

function normalizeChatSettings(raw: unknown): ChatSettings {
  const body = (raw ?? {}) as {
    systemPrompt?: unknown;
    models?: unknown;
    botName?: unknown;
    timezone?: unknown;
    providerSort?: unknown;
    provider?: unknown;
    serviceTier?: unknown;
    keywordFilter?: unknown;
  };
  const out: ChatSettings = {};
  if (typeof body.systemPrompt === "string") {
    out.systemPrompt = body.systemPrompt;
  }
  if (
    Array.isArray(body.models) &&
    body.models.every((m) => typeof m === "string") &&
    body.models.length > 0
  ) {
    out.models = body.models as string[];
  }
  if (typeof body.botName === "string") {
    const trimmed = body.botName.trim();
    if (trimmed.length > 0) out.botName = trimmed;
  }
  if (typeof body.timezone === "string") {
    const trimmed = body.timezone.trim();
    if (trimmed.length > 0 && isValidTimezone(trimmed)) {
      out.timezone = trimmed;
    }
  }
  // An explicit null is a real override ("ignore the global setting here"), so
  // it is stored; a malformed value is dropped and the chat keeps inheriting.
  if (body.providerSort === null) out.providerSort = null;
  else if (isValidProviderSort(body.providerSort)) {
    out.providerSort = body.providerSort;
  }
  if (body.provider === null) out.provider = null;
  else if (isValidProviderSlug(body.provider)) out.provider = body.provider;
  if (body.serviceTier === null) out.serviceTier = null;
  else if (isValidServiceTier(body.serviceTier)) {
    out.serviceTier = body.serviceTier;
  }
  if (
    body.keywordFilter &&
    typeof body.keywordFilter === "object" &&
    !Array.isArray(body.keywordFilter)
  ) {
    const f = body.keywordFilter as {
      enabled?: unknown;
      keywords?: unknown;
    };
    const keywords = Array.isArray(f.keywords)
      ? f.keywords
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      : [];
    const enabled = typeof f.enabled === "boolean" ? f.enabled : false;
    if (enabled || keywords.length > 0) {
      out.keywordFilter = { enabled, keywords };
    }
  }
  return out;
}

// ORDER-SENSITIVE: the collection route is a literal string and the item route
// a greedy `(.+)`, so the collection must be tried first.
export const adminChatRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/chats",
    handle: async ({ deps }) => {
      const chats = await deps.storage.chats.list();
      return { status: 200, body: { chats } };
    },
  },
  {
    method: "GET",
    path: /^\/api\/admin\/chats\/(.+)$/,
    handle: async ({ deps, params }) => {
      const id = params[0]!;
      const [chat, settings, whitelisted, blacklisted] = await Promise.all([
        deps.storage.chats.get(id),
        deps.storage.chats.getSettings(id),
        deps.storage.access.isWhitelisted("chats", id),
        deps.storage.access.isBlacklisted("chats", id),
      ]);
      if (!chat) return CHAT_NOT_FOUND;
      return {
        status: 200,
        body: { chat, settings: settings ?? {}, whitelisted, blacklisted },
      };
    },
  },
  {
    method: "PUT",
    path: /^\/api\/admin\/chats\/(.+)$/,
    handle: async ({ req, deps, params }) => {
      const id = params[0]!;
      const chat = await deps.storage.chats.get(id);
      if (!chat) return CHAT_NOT_FOUND;
      const next = normalizeChatSettings(req.body);
      if (next.models) {
        const bad = await unknownModelsError(deps.modelCatalog, next.models);
        if (bad) return bad;
      }
      await deps.storage.chats.saveSettings(id, next);
      return { status: 200, body: { chat, settings: next } };
    },
  },
];
