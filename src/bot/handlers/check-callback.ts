// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { CheckApi } from "../../checks/resolve";
import { resolveCheck } from "../../checks/resolve";

export type CheckCallbackInput = {
  storage: Storage;
  api: CheckApi;
  checkId: string;
  answer: "yes" | "no";
  fromUserId: string;
  callbackMessageId: number;
};

export type CheckCallbackOutcome =
  | { kind: "resolved" }
  | { kind: "not_found" }
  | { kind: "stale" }
  | { kind: "wrong_user" };

export async function handleCheckCallback(
  input: CheckCallbackInput,
): Promise<CheckCallbackOutcome> {
  const check = await input.storage.getCheck(input.checkId);
  if (!check) return { kind: "not_found" };
  if (check.pendingMessageId !== input.callbackMessageId) {
    return { kind: "stale" };
  }
  const result = await resolveCheck({
    storage: input.storage,
    api: input.api,
    check,
    answer: input.answer,
    fromUserId: input.fromUserId,
  });
  switch (result.kind) {
    case "resolved":
      return { kind: "resolved" };
    case "wrong_user":
      return { kind: "wrong_user" };
    case "not_pending":
      return { kind: "stale" };
  }
}
