// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

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
import { calculatorTool } from "./ai/tools/calculator";
import { fetchPageTool } from "./ai/tools/fetch-page";
import { createYoutubeTranscriptTool } from "./ai/tools/youtube-transcript";
import { createSearchWebTool } from "./ai/tools/search-web";
import { createReminderTools } from "./ai/tools/reminders";
import { createUserFactsTools } from "./ai/tools/user-facts";
import { startScheduler } from "./reminders/scheduler";
import { startChecksScheduler } from "./checks/runner";
import { createBot } from "./bot";
import { syncBotCommands } from "./bot/commands";
import { ALLOWED_UPDATES } from "./bot/allowed-updates";
import { startServer } from "./webapp/server";
import { BotManager } from "./managed-bots/manager";
import { createMainPersonaResolver } from "./managed-bots/persona";
import type { ReminderRuntime } from "./reminders/scheduler";

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
  registerTool(logged(calculatorTool));
  registerTool(logged(fetchPageTool));
  if (config.firecrawlApiKey) {
    registerTool(logged(createSearchWebTool(config.firecrawlApiKey, config.firecrawlConcurrency)));
    registerTool(logged(createYoutubeTranscriptTool(config.firecrawlApiKey)));
  } else {
    console.warn("FIRECRAWL_API_KEY not set, search_web and youtube_transcript tools disabled");
  }
  for (const t of createReminderTools({ storage })) registerTool(logged(t));
  for (const t of createUserFactsTools({ storage })) registerTool(logged(t));

  const mainResolver = createMainPersonaResolver(storage);
  const bot = createBot({
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    storage,
    rateLimiter,
    ai,
    resolver: mainResolver,
    logFormat: config.logFormat,
    logIncomingUpdates: config.logIncomingUpdates,
    logDebug: config.logDebug,
  });

  // Resolve the main bot's id up front (deterministic, no startup race): managed
  // bots treat it as a sibling for the bare-`/ask` alone-check.
  const mainMe = await bot.api.getMe();
  const botManager = new BotManager({
    storage,
    rateLimiter,
    ai,
    ownerId: config.botOwnerId,
    mainApi: bot.api,
    mainBotId: String(mainMe.id),
    logFormat: config.logFormat,
    logIncomingUpdates: config.logIncomingUpdates,
    logDebug: config.logDebug,
  });

  // The owner created a managed bot via the native Bot API 9.6 flow: broker its
  // token, persist it, and start its polling loop. Owner-gated inside the
  // manager; non-owner creations are ignored.
  bot.on("managed_bot", async (ctx) => {
    const upd = ctx.update.managed_bot;
    if (!upd) return;
    const created = await botManager.handleManagedBotCreated(
      String(upd.user.id),
      {
        id: upd.bot.id,
        username: upd.bot.username,
        first_name: upd.bot.first_name,
      },
    );
    if (created) {
      await ctx.api
        .sendMessage(upd.user.id, ctx.t.bot_managed_bot_created(created.username))
        .catch((err) =>
          console.error("[managed-bots] owner notify failed:", err),
        );
    }
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

  await botManager.loadAndStartAll();
  console.log("Managed bots loaded");

  const server = startServer({
    port: config.port,
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    storage,
    rateLimiter,
    botManager,
  });
  console.log(`HTTP server listening on :${server.port}`);

  const mainReminderRuntime: ReminderRuntime = {
    botId: null,
    storage,
    api: bot.api,
    resolver: mainResolver,
  };
  const scheduler = startScheduler({
    runtimes: () => [mainReminderRuntime, ...botManager.reminderRuntimes()],
    ai,
  });
  console.log("Reminder scheduler started");

  const checksScheduler = startChecksScheduler({ storage, api: bot.api });
  console.log("Checks scheduler started");

  return { bot, server, scheduler, checksScheduler, botManager };
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
    await handles.botManager.stopAll();
    await handles.bot.stop().catch((err) => {
      console.error("bot.stop failed during hot-reload:", err);
    });
  });
}
