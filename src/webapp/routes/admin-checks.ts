// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RecurringCheck } from "../../checks/types";
import { normalizeCheckInput } from "../../checks/validate";
import type { ApiResponse, Route } from "./types";

const CHECK_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "check not found" },
};

// ORDER-SENSITIVE: the collection routes are literal strings and the item
// routes a greedy `(.+)`, so the collection must be tried first.
export const adminCheckRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/checks",
    handle: async ({ deps }) => {
      const checks = await deps.storage.checks.list();
      return { status: 200, body: { checks } };
    },
  },
  {
    method: "POST",
    path: "/api/admin/checks",
    handle: async ({ req, deps }) => {
      const parsed = normalizeCheckInput(req.body);
      if (!parsed.ok) {
        return { status: 400, body: { error: parsed.error } };
      }
      const now = Date.now();
      const check: RecurringCheck = {
        id: crypto.randomUUID(),
        ...parsed.value,
        lastFiredAtMs: 0,
        pendingMessageId: null,
        pendingFiredAtMs: null,
        createdAtMs: now,
      };
      await deps.storage.checks.save(check);
      return { status: 200, body: { check } };
    },
  },
  {
    method: "GET",
    path: /^\/api\/admin\/checks\/(.+)$/,
    handle: async ({ deps, params }) => {
      const check = await deps.storage.checks.get(params[0]!);
      if (!check) return CHECK_NOT_FOUND;
      return { status: 200, body: { check } };
    },
  },
  {
    method: "PUT",
    path: /^\/api\/admin\/checks\/(.+)$/,
    handle: async ({ req, deps, params }) => {
      const existing = await deps.storage.checks.get(params[0]!);
      if (!existing) return CHECK_NOT_FOUND;
      const parsed = normalizeCheckInput(req.body);
      if (!parsed.ok) {
        return { status: 400, body: { error: parsed.error } };
      }
      const next: RecurringCheck = {
        ...existing,
        ...parsed.value,
      };
      await deps.storage.checks.save(next);
      return { status: 200, body: { check: next } };
    },
  },
  {
    method: "DELETE",
    path: /^\/api\/admin\/checks\/(.+)$/,
    handle: async ({ deps, params }) => {
      await deps.storage.checks.delete(params[0]!);
      return { status: 200, body: { ok: true } };
    },
  },
];
