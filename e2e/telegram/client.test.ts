// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The first spec that talks to Telegram. It proves the account exists and that
// the run left a session behind for the next one — everything after this step
// assumes both.

import { expect, test } from "bun:test";
import { readCached } from "../cache";
import { startTestAccount } from "./client";

// A cold sign-in is a code round trip against a test DC; a cached one is a
// single `getMe`. The budget covers the slow path.
const SIGN_IN_TIMEOUT_MS = 60_000;

test(
  "the test account signs in and resolves its own user id",
  async () => {
    const account = await startTestAccount();
    try {
      expect(account.self.isBot).toBe(false);
      // The id the sign-in reported is the id the account answers to over the
      // wire — a session that merely parses would not survive this.
      const me = await account.client.getMe();
      expect(me.id).toBe(account.self.id);

      // Without this the next run signs up a new number, and the test DC's
      // flood limits end the suite a few runs later.
      expect(await readCached("session")).toBeTruthy();
    } finally {
      await account.stop();
    }
  },
  SIGN_IN_TIMEOUT_MS,
);
