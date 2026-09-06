// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Every message is declared once, with both locales side by side. `NoInfer`
// makes the English text the source of truth: its shape is what `ru` is
// checked against, so a missing key or a drifted signature is a type error.
export const m = <T>(v: { en: T; ru: NoInfer<T> }) => v;
