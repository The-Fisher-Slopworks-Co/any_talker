// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Serves the admin Web App to a plain browser, outside Telegram, on throwaway
// in-memory storage — for local UI work and screenshots in pull requests. No
// bot, no KeyDB, no secrets: every API call is answered as the demo user.
//
//   bun run webapp:demo [--port 3000] [--as owner|user] [--lang en|ru]

import { parseArgs } from "node:util";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import { createModelCatalog } from "../ai/model-catalog";
import { isValidLang } from "../shared/i18n";
import { fetchOpenRouterEndpoints } from "./openrouter-proxy";
import { startServer } from "./server";
import type { ManagedBotController } from "./api";

const DEMO_OWNER_ID = "1000001";
const DEMO_USER_ID = "1000002";

// No managed bot ever runs here; creation reads as available so the bots
// section renders its full form.
const idleBotManager: ManagedBotController = {
  isRunning: () => false,
  setAvatar: async () => false,
  deleteBot: async () => {},
  syncProfileName: async () => {},
  managerInfo: async () => ({ username: "demo_bot", canManageBots: true }),
};

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string", default: "3000" },
    as: { type: "string", default: "owner" },
    lang: { type: "string", default: "en" },
  },
});

if (values.as !== "owner" && values.as !== "user") {
  throw new Error(`--as must be "owner" or "user", got "${values.as}"`);
}
if (!isValidLang(values.lang)) {
  throw new Error(`--lang must be "en" or "ru", got "${values.lang}"`);
}

const storage = new MemoryStorage();
const demoUserId = values.as === "owner" ? DEMO_OWNER_ID : DEMO_USER_ID;
await storage.profile.setLang(demoUserId, values.lang);

const server = startServer({
  port: Number(values.port),
  botToken: "",
  ownerId: DEMO_OWNER_ID,
  storage,
  rateLimiter: new DualWindowLimiter(storage),
  botManager: idleBotManager,
  // The public catalogue needs no key; offline, the model picker shows its
  // error state and everything else still renders.
  modelCatalog: createModelCatalog({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "",
  }),
  fetchProviderEndpoints: fetchOpenRouterEndpoints,
  demoUserId,
});

console.log(
  `Demo Web App (as ${values.as}, ${values.lang}): http://localhost:${server.port}/webapp`,
);
