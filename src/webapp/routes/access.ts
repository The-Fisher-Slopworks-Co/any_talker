// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { WhitelistEntry, WhitelistKind } from "../../shared/types";
import type { ApiDeps, ApiResponse, Route } from "./types";

const KINDS = ["users", "chats"] as const;

// Whitelist and blacklist POSTs are the same route: validate the id, optionally
// refuse it, add the entry, answer with the fresh list. `reject` carries the
// blacklist's owner guard; the whitelist passes none.
async function handleListMutation(
  kind: WhitelistKind,
  rawBody: unknown,
  add: (kind: WhitelistKind, entry: WhitelistEntry) => Promise<void>,
  list: (kind: WhitelistKind) => Promise<WhitelistEntry[]>,
  reject?: (id: string) => ApiResponse | null,
): Promise<ApiResponse> {
  const body = (rawBody ?? {}) as Partial<WhitelistEntry>;
  if (typeof body.id !== "string" || body.id.length === 0) {
    return { status: 400, body: { error: "id required" } };
  }
  const rejection = reject?.(body.id);
  if (rejection) return rejection;
  await add(kind, {
    id: body.id,
    ...(body.label !== undefined && { label: body.label }),
  });
  return { status: 200, body: await list(kind) };
}

// The whitelist and the blacklist are the same three routes over a different
// pair of storage methods, so one builder produces both.
type AccessList = {
  base: string;
  add: (
    deps: ApiDeps,
    kind: WhitelistKind,
    entry: WhitelistEntry,
  ) => Promise<void>;
  remove: (deps: ApiDeps, kind: WhitelistKind, id: string) => Promise<void>;
  list: (deps: ApiDeps, kind: WhitelistKind) => Promise<WhitelistEntry[]>;
  reject?: (deps: ApiDeps, id: string) => ApiResponse | null;
};

function accessListRoutes(spec: AccessList): Route[] {
  const { reject } = spec;
  return [
    {
      method: "GET",
      path: `/api/${spec.base}`,
      handle: async ({ deps }) => {
        const [users, chats] = await Promise.all([
          spec.list(deps, "users"),
          spec.list(deps, "chats"),
        ]);
        return { status: 200, body: { users, chats } };
      },
    },
    // Per kind: add to the collection, remove one entry. The item pattern needs
    // a trailing segment, so it can never shadow the collection POST.
    ...KINDS.flatMap((kind): Route[] => [
      {
        method: "POST",
        path: `/api/${spec.base}/${kind}`,
        handle: ({ req, deps }) =>
          handleListMutation(
            kind,
            req.body,
            (k, entry) => spec.add(deps, k, entry),
            (k) => spec.list(deps, k),
            reject && ((id: string) => reject(deps, id)),
          ),
      },
      {
        method: "DELETE",
        path: new RegExp(`^/api/${spec.base}/${kind}/(.+)$`),
        handle: async ({ deps, params }) => {
          await spec.remove(deps, kind, params[0]!);
          return { status: 200, body: await spec.list(deps, kind) };
        },
      },
    ]),
  ];
}

export const accessRoutes: Route[] = [
  ...accessListRoutes({
    base: "whitelist",
    add: (deps, kind, entry) => deps.storage.access.addWhitelist(kind, entry),
    remove: (deps, kind, id) => deps.storage.access.removeWhitelist(kind, id),
    list: (deps, kind) => deps.storage.access.listWhitelist(kind),
  }),
  ...accessListRoutes({
    base: "blacklist",
    add: (deps, kind, entry) => deps.storage.access.addBlacklist(kind, entry),
    remove: (deps, kind, id) => deps.storage.access.removeBlacklist(kind, id),
    list: (deps, kind) => deps.storage.access.listBlacklist(kind),
    // Blacklisting the owner would be a silent no-op (the access gates check
    // ownership first), so reject it loudly instead of storing a dead entry.
    // Holds for chats too: the owner's private chat id *is* their user id, and
    // nobody else can speak there.
    reject: (deps, entryId) =>
      entryId === deps.ownerId
        ? { status: 400, body: { error: "cannot blacklist the owner" } }
        : null,
  }),
];
