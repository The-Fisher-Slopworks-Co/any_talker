import type { Context } from "grammy";

export type StartHandlerDeps = {
  ownerId: string;
  webappUrl: string;
};

export function makeStartHandler(deps: StartHandlerDeps) {
  return async (ctx: Context): Promise<void> => {
    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    if (userId !== deps.ownerId) {
      await ctx.reply("Hi! This bot is private.");
      return;
    }

    await ctx.api.setChatMenuButton({
      chat_id: chatId,
      menu_button: {
        type: "web_app",
        text: "Admin",
        web_app: { url: deps.webappUrl },
      },
    });
    await ctx.reply(
      "Admin panel installed. Tap the menu button to the left of the message input.",
    );
  };
}
