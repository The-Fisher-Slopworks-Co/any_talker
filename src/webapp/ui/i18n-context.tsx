// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { t, type Lang } from "../../shared/i18n";

type I18nValue = { lang: Lang; t: ReturnType<typeof t> };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(() => ({ lang, t: t(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n used outside I18nProvider");
  return value;
}
