// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { API_CONSTANTS } from "grammy";
import { loadConfig } from "./config";
import { getEffectiveProxyForUrl } from "./proxy";
import { KeyDBStorage } from "./storage/keydb";
import { TokenBucketLimiter } from "./ratelimit/token-bucket";
import { OpenRouterAIClient } from "./ai/openrouter";
import { registerTool, type Tool } from "./ai/tools/registry";
import { withLogging } from "./ai/tools/logging";
import { randomNumberTool } from "./ai/tools/random-number";
import { randomChoiceTool } from "./ai/tools/random-choice";
import { currencyConvertTool } from "./ai/tools/currency-convert";
import { fetchPageTool } from "./ai/tools/fetch-page";
import { createSearchWebTool } from "./ai/tools/search-web";
import { createReminderTools } from "./ai/tools/reminders";
import { startScheduler } from "./reminders/scheduler";
import { startChecksScheduler } from "./checks/runner";
import { createBot } from "./bot";
import { syncBotCommands } from "./bot/commands";
import { startServer } from "./webapp/server";

const ALLOWED_UPDATES = [
  ...API_CONSTANTS.DEFAULT_UPDATE_TYPES,
  "guest_message",
] as const;

async function main() {
  const config = loadConfig();

  const tgProxy = getEffectiveProxyForUrl("https://api.telegram.org");
  if (tgProxy) {
    console.log(`HTTP proxy enabled: api.telegram.org → ${tgProxy}`);
  }

  const storage = await KeyDBStorage.connect(config.keydbUrl);
  const rateLimiter = new TokenBucketLimiter(storage);
  const ai = new OpenRouterAIClient(config.openrouterApiKey, {
    url: config.openrouterAppUrl,
    title: config.openrouterAppTitle,
  });

  const logged = <TIn, TOut>(t: Tool<TIn, TOut>) =>
    withLogging(t, config.logFormat);
  registerTool(logged(randomNumberTool));
  registerTool(logged(randomChoiceTool));
  registerTool(logged(currencyConvertTool));
  registerTool(logged(fetchPageTool));
  if (config.firecrawlApiKey) {
    registerTool(logged(createSearchWebTool(config.firecrawlApiKey, config.firecrawlConcurrency)));
  } else {
    console.warn("FIRECRAWL_API_KEY not set, search_web tool disabled");
  }
  for (const t of createReminderTools({ storage })) registerTool(logged(t));

  const bot = createBot({
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    storage,
    rateLimiter,
    ai,
    logFormat: config.logFormat,
    logIncomingUpdates: config.logIncomingUpdates,
    logDebug: config.logDebug,
  });

  await bot.api.deleteWebhook();
  await syncBotCommands(bot.api).catch((err) => {
    console.error("syncBotCommands failed:", err);
  });
  bot.start({
    drop_pending_updates: true,
    allowed_updates: [...ALLOWED_UPDATES],
  });
  console.log("Bot started in long-polling mode");

  const server = startServer({
    port: config.port,
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    storage,
    rateLimiter,
  });
  console.log(`HTTP server listening on :${server.port}`);

  const scheduler = startScheduler({ storage, api: bot.api, ai });
  console.log("Reminder scheduler started");

  const checksScheduler = startChecksScheduler({ storage, api: bot.api });
  console.log("Checks scheduler started");

  return { bot, server, scheduler, checksScheduler };
}

const handles = await main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    handles.scheduler.stop();
    handles.checksScheduler.stop();
    handles.server.stop();
    await handles.bot.stop().catch((err) => {
      console.error("bot.stop failed during hot-reload:", err);
    });
  });
}
