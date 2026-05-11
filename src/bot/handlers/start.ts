// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { BotContext } from "../middleware/lang";

export type StartHandlerDeps = {
  ownerId: string;
  webappUrl: string;
};

export function makeStartHandler(deps: StartHandlerDeps) {
  return async (ctx: BotContext): Promise<void> => {
    const userId = String(ctx.from?.id ?? "");
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    if (userId !== deps.ownerId) {
      await ctx.reply(ctx.t.bot_private);
      return;
    }

    await ctx.api.setChatMenuButton({
      chat_id: chatId,
      menu_button: {
        type: "web_app",
        text: ctx.t.bot_admin_menu_label,
        web_app: { url: deps.webappUrl },
      },
    });
    await ctx.reply(ctx.t.bot_admin_installed);
  };
}
