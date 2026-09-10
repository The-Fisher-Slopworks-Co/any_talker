// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { ModelCatalog } from "../../ai/model-catalog";
import type { FetchProviderEndpoints } from "../openrouter-proxy";

export type ApiRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
  // The URL's query string, flattened (a repeated key keeps its last value).
  // `path` is the pathname alone, so this is the only place a filter or a
  // pagination cursor arrives. Absent means "no query string".
  query?: Record<string, string>;
};

export type ApiResponse = { status: number; body: unknown };

export type ApiActor = {
  userId: string;
  isOwner: boolean;
};

// The slice of the BotManager the API needs: enough to mutate a running bot's
// live state (avatar, name), tear it down, and surface creation prerequisites.
// Narrowed so the routes stay decoupled from grammY and testable with a stub.
export type ManagedBotController = {
  isRunning(botId: string): boolean;
  setAvatar(botId: string, bytes: Uint8Array): Promise<boolean>;
  deleteBot(botId: string): Promise<void>;
  syncProfileName(botId: string): Promise<void>;
  managerInfo(): Promise<{ username: string | null; canManageBots: boolean }>;
};

export type ApiDeps = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ownerId: string;
  modelCatalog?: ModelCatalog | undefined;
  managedBots?: ManagedBotController | undefined;
  // Always wired in `main.ts`; an absent fetcher only happens on a DI mistake,
  // which the route answers with 503.
  fetchProviderEndpoints?: FetchProviderEndpoints | undefined;
};

// What a handler receives: the request, the injected dependencies, the
// authenticated actor, and the capture groups of the pattern that selected the
// route (empty for a literal path).
type RouteContext = {
  req: ApiRequest;
  deps: ApiDeps;
  actor: ApiActor;
  params: string[];
};

// Every verb, for a route whose path-level checks answer before the verb is
// looked at (see `Route.handle`).
export const ANY_METHOD = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// A route matches on method *and* path; a mismatch on either falls through to
// the next route — a path hit with the wrong method is not a 405, it keeps
// looking and ends at the shared 404.
export type Route = {
  method: ApiRequest["method"] | readonly ApiRequest["method"][];
  // A string is compared with `===`; a RegExp is matched and its capture groups
  // become `RouteContext.params`.
  path: string | RegExp;
  // `null` means "declined after all, keep matching". Only the two
  // `/api/me/facts` routes need it: their path-level checks (unknown character
  // scope, malformed key) answer for *every* verb, so those routes are entered
  // on ANY_METHOD and pick the verb themselves — anything else would either
  // turn those 404s into a fall-through or resolve the scope twice.
  handle: (ctx: RouteContext) => Promise<ApiResponse | null>;
};
