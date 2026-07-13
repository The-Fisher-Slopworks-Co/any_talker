// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { loadConfig } from "./config";
import { getEffectiveProxyForUrl, proxiedFetch } from "./proxy";
import { KeyDBStorage } from "./storage/keydb";
import { DualWindowLimiter } from "./ratelimit/dual-window";
import { SpendBudgetGuard } from "./budget/guard";
import { OpenAICompatClient } from "./ai/compat-client";
import { createModelCatalog } from "./ai/model-catalog";
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
import { createUserSettingsTools } from "./ai/tools/user-settings";
import { startScheduler } from "./reminders/scheduler";
import { reminderApiFromGrammy } from "./reminders/delivery";
import { startChecksScheduler } from "./checks/runner";
import { startObservabilityScheduler } from "./observability/scheduler";
import { notifyApiFromGrammy } from "./observability/types";
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
  const rateLimiter = new DualWindowLimiter(storage);
  // The hard USD budget safety net, shared across the whole bot family (its
  // ledgers are global, like the rate limiter's). Enforced alongside the token
  // limiter on every /ask and guest query.
  const budgetGuard = new SpendBudgetGuard(storage);
  // One catalogue object serves two roles: pricing source for cost computation
  // in the AI client, and the model list behind the Mini App's `/api/models`.
  const modelCatalog = createModelCatalog({
    baseURL: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
    fetch: proxiedFetch,
  });
  // Warm the cache so the first ask can price its tokens; best-effort, the
  // catalogue self-heals on the next `/api/models` hit if this fails.
  await modelCatalog
    .refresh()
    .catch((err) => console.warn("model catalogue prefetch failed:", err));
  const ai = new OpenAICompatClient(
    config.openaiBaseUrl,
    config.openaiApiKey,
    modelCatalog,
  );

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
  for (const t of createUserSettingsTools({ storage })) registerTool(logged(t));

  const mainResolver = createMainPersonaResolver(storage);
  // Forward-declared so the main bot's `siblingBotIds` can read the live set of
  // managed bot ids. The closure only runs per-update (long after the manager is
  // constructed below), and the bot does not start polling until later still.
  let botManager: BotManager;
  const bot = createBot({
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    storage,
    rateLimiter,
    budgetGuard,
    ai,
    resolver: mainResolver,
    // The main bot's family siblings are exactly the managed (character) bots. It
    // never needs the alone-check (it always owns a plain bare `/ask`), but it
    // uses this to recognize a bare `/ask` replying to a *present* character's
    // message and defer to that character instead of answering itself.
    siblingBotIds: () => botManager.managedBotIds(),
    logFormat: config.logFormat,
    logIncomingUpdates: config.logIncomingUpdates,
    logDebug: config.logDebug,
  });

  // Resolve the main bot's id up front (deterministic, no startup race): managed
  // bots treat it as a sibling for the bare-`/ask` alone-check.
  const mainMe = await bot.api.getMe();
  botManager = new BotManager({
    storage,
    rateLimiter,
    budgetGuard,
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
  // The main bot is the family hub (token brokering, owner notifications), so
  // its polling loop dying (revoked token / getUpdates conflict) is fatal — but
  // exit explicitly and loudly rather than via an unhandled rejection.
  bot
    .start({
      drop_pending_updates: true,
      allowed_updates: [...ALLOWED_UPDATES],
    })
    .catch((err) => {
      console.error("Fatal: main bot polling crashed:", err);
      process.exit(1);
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
    modelCatalog,
  });
  console.log(`HTTP server listening on :${server.port}`);

  const mainReminderRuntime: ReminderRuntime = {
    botId: null,
    storage,
    api: reminderApiFromGrammy(bot.api),
    resolver: mainResolver,
  };
  const scheduler = startScheduler({
    runtimes: () => [mainReminderRuntime, ...botManager.reminderRuntimes()],
    ai,
    rateLimiter,
    ownerId: config.botOwnerId,
  });
  console.log("Reminder scheduler started");

  const checksScheduler = startChecksScheduler({ storage, api: bot.api });
  console.log("Checks scheduler started");

  // Observability: scans for spend spikes and sends the periodic owner digest.
  // Uses the main bot's api to DM the owner (a family-global concern).
  const observabilityScheduler = startObservabilityScheduler({
    storage,
    api: notifyApiFromGrammy(bot.api),
    ownerId: config.botOwnerId,
  });
  console.log("Observability scheduler started");

  return {
    bot,
    server,
    scheduler,
    checksScheduler,
    observabilityScheduler,
    botManager,
  };
}

const handles = await main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    handles.scheduler.stop();
    handles.checksScheduler.stop();
    handles.observabilityScheduler.stop();
    handles.server.stop();
    await handles.botManager.stopAll();
    await handles.bot.stop().catch((err) => {
      console.error("bot.stop failed during hot-reload:", err);
    });
  });
}
