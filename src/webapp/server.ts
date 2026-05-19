// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { handleApi, type ApiRequest } from "./api";
import { verifyInitData } from "./auth";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import { fetchOpenRouterStats } from "./openrouter-proxy";
import indexHtml from "./ui/index.html";
import { getBuildInfo } from "../build-info";
import {
  CONTENT_TYPE as METRICS_CONTENT_TYPE,
  httpRequestDurationSeconds,
  httpRequestsTotal,
  registry,
} from "../metrics";

export type ServerDeps = {
  port: number;
  botToken: string;
  ownerId: string;
  storage: Storage;
  rateLimiter: RateLimiter;
};

export function startServer(deps: ServerDeps) {
  const apiDeps = {
    storage: deps.storage,
    rateLimiter: deps.rateLimiter,
    ownerId: deps.ownerId,
    fetchOpenRouterStats,
  };

  const handleDynamic = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === "/metrics") {
      return new Response(registry.render(), {
        headers: { "content-type": METRICS_CONTENT_TYPE },
      });
    }

    if (url.pathname === "/api/build-info" && req.method === "GET") {
      return Response.json(await getBuildInfo());
    }

    if (url.pathname.startsWith("/api/")) {
      const authHeader = req.headers.get("authorization") ?? "";
      const match = authHeader.match(/^tma (.+)$/);
      if (!match) {
        return Response.json({ error: "missing initData" }, { status: 401 });
      }
      const verify = await verifyInitData(match[1]!, deps.botToken, Date.now());
      if (!verify.ok) {
        return Response.json({ error: verify.reason }, { status: 401 });
      }
      const userId = String(verify.user.id);
      const actor = { userId, isOwner: userId === deps.ownerId };

      let body: unknown = null;
      if (req.method !== "GET" && req.method !== "DELETE") {
        try {
          body = await req.json();
        } catch {
          body = null;
        }
      }
      const apiReq: ApiRequest = {
        method: req.method as ApiRequest["method"],
        path: url.pathname,
        body,
      };
      const res = await handleApi(apiReq, apiDeps, actor);
      return Response.json(res.body, { status: res.status });
    }

    return new Response("Not Found", { status: 404 });
  };

  return Bun.serve({
    port: deps.port,
    routes: {
      "/": indexHtml,
      "/webapp": indexHtml,
      "/webapp/*": indexHtml,
    },
    async fetch(req) {
      const route = normalizeRoute(new URL(req.url).pathname);
      const start = performance.now();
      let status = 500;
      try {
        const res = await handleDynamic(req);
        status = res.status;
        return res;
      } finally {
        const seconds = (performance.now() - start) / 1000;
        httpRequestsTotal.inc({
          method: req.method,
          route,
          status: String(status),
        });
        httpRequestDurationSeconds.observe(
          { method: req.method, route },
          seconds,
        );
      }
    },
  });
}

function normalizeRoute(pathname: string): string {
  if (pathname === "/metrics") return "/metrics";
  if (pathname.startsWith("/api/")) {
    const rest = pathname.slice("/api/".length);
    const head = rest.split("/")[0] ?? "";
    return head ? `/api/${head}` : "/api";
  }
  return "/other";
}
