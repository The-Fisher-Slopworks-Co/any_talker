import { API_CONSTANTS } from "grammy";
import { loadConfig } from "./config";
import { KeyDBStorage } from "./storage/keydb";
import { TokenBucketLimiter } from "./ratelimit/token-bucket";
import { OpenRouterAIClient } from "./ai/openrouter";
import { registerTool } from "./ai/tools/registry";
import { randomNumberTool } from "./ai/tools/random-number";
import { createReminderTools } from "./ai/tools/reminders";
import { startScheduler } from "./reminders/scheduler";
import { createBot } from "./bot";
import { startServer } from "./webapp/server";

const ALLOWED_UPDATES = [
  ...API_CONSTANTS.DEFAULT_UPDATE_TYPES,
  "guest_message",
] as const;

async function main() {
  const config = loadConfig();

  const storage = await KeyDBStorage.connect(config.keydbUrl);
  const rateLimiter = new TokenBucketLimiter(storage);
  const ai = new OpenRouterAIClient(config.openrouterApiKey);

  registerTool(randomNumberTool);
  for (const t of createReminderTools({ storage })) registerTool(t);

  const bot = createBot({
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    webappUrl: config.webappUrl,
    storage,
    rateLimiter,
    ai,
    logFormat: config.logFormat,
    logIncomingUpdates: config.logIncomingUpdates,
  });

  if (config.webhookUrl) {
    await bot.api.setWebhook(`${config.webhookUrl}/telegram-webhook`, {
      allowed_updates: [...ALLOWED_UPDATES],
    });
    console.log("Webhook set:", config.webhookUrl);
  } else {
    await bot.api.deleteWebhook();
    bot.start({
      drop_pending_updates: true,
      allowed_updates: [...ALLOWED_UPDATES],
    });
    console.log("Bot started in long-polling mode");
  }

  const server = startServer({
    port: config.port,
    bot,
    botToken: config.botToken,
    ownerId: config.botOwnerId,
    webhookUrl: config.webhookUrl,
    storage,
    rateLimiter,
  });
  console.log(`HTTP server listening on :${server.port}`);

  const scheduler = startScheduler({ storage, api: bot.api });
  console.log("Reminder scheduler started");

  return { bot, server, scheduler };
}

const handles = await main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    handles.scheduler.stop();
    handles.server.stop();
    await handles.bot.stop().catch((err) => {
      console.error("bot.stop failed during hot-reload:", err);
    });
  });
}
