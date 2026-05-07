import { webhookCallback, type Bot } from "grammy";
import { handleApi, type ApiRequest } from "./api";
import { verifyInitData } from "./auth";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import indexHtml from "./ui/index.html";

export type ServerDeps = {
  port: number;
  bot: Bot;
  botToken: string;
  ownerId: string;
  webhookUrl: string | undefined;
  storage: Storage;
  rateLimiter: RateLimiter;
};

export function startServer(deps: ServerDeps) {
  const apiDeps = {
    storage: deps.storage,
    rateLimiter: deps.rateLimiter,
    ownerId: deps.ownerId,
  };

  const grammyHandler = deps.webhookUrl
    ? webhookCallback(deps.bot, "std/http")
    : null;

  return Bun.serve({
    port: deps.port,
    routes: {
      "/": indexHtml,
      "/webapp": indexHtml,
      "/webapp/*": indexHtml,
    },
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/telegram-webhook" && grammyHandler) {
        return grammyHandler(req);
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
    },
  });
}
