// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The account that drives the bot from the outside: a real Telegram user on the
// test environment (https://core.telegram.org/api/auth#test-accounts), where a
// `99966XYYYY` phone number signs in with the DC number repeated as the code.
// That is what lets the suite create its own user instead of carrying a
// hand-made session around as a secret.

import { MemoryStorage, TelegramClient, tl, type User } from "@mtcute/bun";
import { readCached, writeCached } from "../cache";

const SESSION_CACHE = "session";

// Every `startTest()` picks a fresh random test number, so a number the DC has
// grown tired of is retried on another one. Test DCs are wiped and rate-limited
// far more aggressively than production, and this is the difference between a
// suite that runs twice in a row and one that does not.
const SIGN_IN_ATTEMPTS = 3;

export type TestAccount = {
  client: TelegramClient;
  // The signed-in user, as the sign-in itself reported it.
  self: User;
  stop(): Promise<void>;
};

export async function startTestAccount(): Promise<TestAccount> {
  const { apiId, apiHash } = credentials();
  const client = new TelegramClient({
    apiId,
    apiHash,
    testMode: true,
    // The one thing worth keeping between runs is the session string, and it is
    // cached by hand below, so the client gets no file storage of its own.
    storage: new MemoryStorage(),
  });

  const cached = await readCached(SESSION_CACHE);
  // `startTest()` tries the imported session first and only falls through to
  // the phone flow when Telegram rejects it — which is exactly what a wiped
  // test DC looks like from here, so no cache invalidation of our own.
  if (cached) await client.importSession(cached);

  const self = await signIn(client);
  await writeCached(SESSION_CACHE, await client.exportSession());

  return {
    client,
    self,
    async stop() {
      await client.destroy();
    },
  };
}

async function signIn(client: TelegramClient): Promise<User> {
  let lastFlood: unknown;
  for (let attempt = 0; attempt < SIGN_IN_ATTEMPTS; attempt++) {
    try {
      return await client.startTest();
    } catch (err) {
      // Anything else — bad credentials, a DC that is down — is not going to
      // get better by asking again with a different number.
      if (!isFlood(err)) throw err;
      lastFlood = err;
    }
  }
  throw lastFlood;
}

// The two ways a test DC says "not this number, not now". Waiting out a
// `FLOOD_WAIT` is pointless here: the next attempt uses a different number, so
// the wait it names does not apply to it.
function isFlood(err: unknown): boolean {
  return (
    tl.RpcError.is(err, "FLOOD_WAIT_%d") ||
    tl.RpcError.is(err, "PHONE_NUMBER_FLOOD")
  );
}

function credentials(): { apiId: number; apiHash: string } {
  const apiId = Number(process.env.E2E_TG_API_ID);
  const apiHash = process.env.E2E_TG_API_HASH;
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error(
      "E2E_TG_API_ID / E2E_TG_API_HASH are unset or malformed. They come from " +
        "https://my.telegram.org by hand — see .env.e2e.example.",
    );
  }
  return { apiId, apiHash };
}
