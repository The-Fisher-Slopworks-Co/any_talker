// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ModelCatalog } from "../../ai/model-catalog";
import { isValidPermaslug } from "../openrouter-proxy";
import type { ApiResponse, Route } from "./types";

// Rejects models absent from the configured `/v1/models` catalogue. Returns null
// (allow) when no catalogue is configured or when every id is known; the
// catalogue itself returns "all allowed" when its list is empty/unavailable, so
// saves never get trapped just because the endpoint exposes no model list.
export async function unknownModelsError(
  catalog: ModelCatalog | undefined,
  models: string[],
): Promise<ApiResponse | null> {
  if (!catalog) return null;
  const unknown = await catalog.unknownModels(models);
  if (unknown.length === 0) return null;
  return { status: 400, body: { error: "unknown model", models: unknown } };
}

export const modelRoutes: Route[] = [
  // Per-provider price/throughput/latency for one model, proxied server-side.
  {
    method: "GET",
    path: /^\/api\/openrouter\/endpoints\/(.+)$/,
    handle: async ({ deps, params }) => {
      // A malformed percent-escape makes decoding throw; that is a bad request,
      // not a server fault, so it joins the same 400 as any other bad slug.
      let permaslug: string;
      try {
        permaslug = decodeURIComponent(params[0]!);
      } catch {
        return { status: 400, body: { error: "invalid permaslug" } };
      }
      if (!isValidPermaslug(permaslug)) {
        return { status: 400, body: { error: "invalid permaslug" } };
      }
      if (!deps.fetchProviderEndpoints) {
        return { status: 503, body: { error: "endpoint stats not supported" } };
      }
      try {
        const data = await deps.fetchProviderEndpoints(permaslug);
        return { status: 200, body: data };
      } catch (err) {
        // Log the upstream error but return a generic code: the message can
        // carry internal paths / stack fragments that shouldn't cross the API
        // boundary.
        console.error("provider endpoint stats fetch failed:", err);
        return { status: 502, body: { error: "endpoint_stats_failed" } };
      }
    },
  },
  // The model catalogue feeds the admin model picker (global + per-chat).
  {
    method: "GET",
    path: "/api/models",
    handle: async ({ deps }) => {
      if (!deps.modelCatalog) {
        return {
          status: 503,
          body: { error: "model catalogue not configured" },
        };
      }
      try {
        const models = await deps.modelCatalog.list();
        return { status: 200, body: { models } };
      } catch (err) {
        console.error("model catalogue fetch failed:", err);
        return { status: 502, body: { error: "model_catalogue_failed" } };
      }
    },
  },
];
