// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagedBot } from "../../managed-bots/types";
import { normalizeManagedBotInput } from "../../managed-bots/validate";
import type { ApiResponse, Route } from "./types";

const MANAGED_BOTS_UNAVAILABLE: ApiResponse = {
  status: 503,
  body: { error: "managed bots not available" },
};

const MANAGED_BOT_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "managed bot not found" },
};

// Avatars arrive as a base64 string (optionally a data URL) in the JSON body, so
// the server stays JSON-only with no multipart handling. Capped to bound memory.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function decodeBase64Image(input: unknown): Uint8Array | null {
  if (typeof input !== "string" || input.length === 0) return null;
  const comma = input.indexOf(",");
  const b64 =
    input.startsWith("data:") && comma >= 0 ? input.slice(comma + 1) : input;
  try {
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return null;
    return bytes;
  } catch {
    return null;
  }
}

// ORDER-SENSITIVE: `/managed-bots/new` is a literal path that the `/:id` pattern
// below would otherwise read as a bot id called "new", so it has to be tried
// first. Same for `/:id/avatar`, which `([^/]+)$` cannot match but which stays
// above `/:id` for the same reason the original chain did.
export const adminManagedBotRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/managed-bots",
    handle: async ({ deps }) => {
      const bots = await deps.storage.managedBots.list();
      const rows = bots.map((b) => ({
        ...b,
        running: deps.managedBots?.isRunning(b.botId) ?? false,
      }));
      return { status: 200, body: { bots: rows } };
    },
  },
  // Prerequisites for the native creation flow: the main bot's username (to
  // build the `t.me/newbot/{manager}/{suggested}` deep link) and whether bot
  // management is enabled for it in @BotFather.
  {
    method: "GET",
    path: "/api/admin/managed-bots/new",
    handle: async ({ deps }) => {
      if (!deps.managedBots) return MANAGED_BOTS_UNAVAILABLE;
      const info = await deps.managedBots.managerInfo();
      return { status: 200, body: info };
    },
  },
  {
    method: "PUT",
    path: /^\/api\/admin\/managed-bots\/([^/]+)\/avatar$/,
    handle: async ({ req, deps, params }) => {
      const id = params[0]!;
      if (!deps.managedBots) return MANAGED_BOTS_UNAVAILABLE;
      const bytes = decodeBase64Image(
        (req.body as { photoBase64?: unknown } | null)?.photoBase64,
      );
      if (!bytes) return { status: 400, body: { error: "invalid image" } };
      const ok = await deps.managedBots.setAvatar(id, bytes);
      if (!ok) {
        return { status: 502, body: { error: "set_avatar_failed" } };
      }
      return { status: 200, body: { ok: true } };
    },
  },
  {
    method: "GET",
    path: /^\/api\/admin\/managed-bots\/([^/]+)$/,
    handle: async ({ deps, params }) => {
      const id = params[0]!;
      const bot = await deps.storage.managedBots.get(id);
      if (!bot) return MANAGED_BOT_NOT_FOUND;
      return {
        status: 200,
        body: { bot, running: deps.managedBots?.isRunning(id) ?? false },
      };
    },
  },
  {
    method: "PUT",
    path: /^\/api\/admin\/managed-bots\/([^/]+)$/,
    handle: async ({ req, deps, params }) => {
      const id = params[0]!;
      const existing = await deps.storage.managedBots.get(id);
      if (!existing) return MANAGED_BOT_NOT_FOUND;
      const parsed = normalizeManagedBotInput(req.body);
      if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
      const next: ManagedBot = { ...existing, ...parsed.value };
      await deps.storage.managedBots.save(next);
      // Push the (possibly changed) display name to Telegram for the live bot.
      await deps.managedBots?.syncProfileName(id);
      return {
        status: 200,
        body: { bot: next, running: deps.managedBots?.isRunning(id) ?? false },
      };
    },
  },
  {
    method: "DELETE",
    path: /^\/api\/admin\/managed-bots\/([^/]+)$/,
    handle: async ({ deps, params }) => {
      const id = params[0]!;
      if (deps.managedBots) {
        await deps.managedBots.deleteBot(id);
      } else {
        await deps.storage.managedBots.delete(id);
        await deps.storage.managedBots.setToken(id, null);
      }
      return { status: 200, body: { ok: true } };
    },
  },
];
