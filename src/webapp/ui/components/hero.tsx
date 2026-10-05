// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Avatar } from "./avatar";

// The head of a person's, chat's or bot's page, the way iOS shows a contact:
// a big avatar, the name, a quiet line under it and an optional link-coloured
// action. It stands in for the page's large title: the name is the page's heading.
export function Hero({
  id,
  name,
  subtitle,
  note,
  action,
  actionUnderAvatar,
}: {
  // Picks the avatar colour.
  id: string;
  name: string;
  subtitle?: string | undefined;
  note?: string | undefined;
  action?: { label: string; onClick: () => void } | undefined;
  // Puts the action under the avatar, like "Edit" under a contact's photo.
  actionUnderAvatar?: boolean | undefined;
}) {
  return (
    <div className="flex flex-col items-center px-4 pb-2 pt-1 text-center">
      <Avatar id={id} name={name} size="hero" />
      {action ? (
        <button
          type="button"
          className={`mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-[15px] text-tg-link ${actionUnderAvatar ? "" : "order-last"}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
      <h1 className="m-0 mt-2.5 max-w-full break-words text-[28px] leading-[34px] font-bold">
        {name}
      </h1>
      {subtitle ? (
        <div className="mt-0.5 max-w-full break-words text-[15px] text-tg-hint">
          {subtitle}
        </div>
      ) : null}
      {note ? (
        <div className="max-w-full break-words text-[15px] text-tg-hint">
          {note}
        </div>
      ) : null}
    </div>
  );
}
