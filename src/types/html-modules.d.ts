// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

declare module "*.html" {
  const content: import("bun").HTMLBundle;
  export default content;
}

declare module "*.css";
