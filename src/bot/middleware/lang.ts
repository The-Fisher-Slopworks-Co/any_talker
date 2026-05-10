import type { Context, MiddlewareFn } from "grammy";
import type { Storage } from "../../storage/types";
import { resolveLang, t, type Lang } from "../../shared/i18n";

export type LangFlavor = {
  lang: Lang;
  t: ReturnType<typeof t>;
};

export type BotContext = Context & LangFlavor;

export function makeLangMiddleware(storage: Storage): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const guestMsg = ctx.update.guest_message;
    const from = ctx.from ?? guestMsg?.from;
    const userId = from && !from.is_bot ? String(from.id) : null;

    const stored = userId
      ? await storage
          .getUserLang(userId)
          .catch((err) => {
            console.error("getUserLang failed:", err);
            return null;
          })
      : null;

    const lang = resolveLang(stored, from?.language_code);
    ctx.lang = lang;
    ctx.t = t(lang);
    await next();
  };
}
