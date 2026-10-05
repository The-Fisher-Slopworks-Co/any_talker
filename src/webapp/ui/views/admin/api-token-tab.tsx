// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useState } from "react";
import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { api } from "../../api-client";
import { ActionRow } from "../../components/controls";
import { Card, SectionFooter, Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";
import { useLoadable } from "../../lib/use-loadable";

const apiTokenLoad = {
  key: "admin-api-token",
  load: () => api.getApiToken(),
};

// The admin API token: create, rotate, delete. The server hands the token out
// once, in the create answer, so it lives in this component's state only until
// the tab is left.
export function ApiTokenTab() {
  const { t: s } = useI18n();
  const { short } = useDateFmt();
  const token = useLoadable(apiTokenLoad);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (token.data === null)
    return token.error ? (
      <LoadingState text={s.ui_api_token_error} />
    ) : (
      <LoadingState />
    );
  // null when no token exists.
  const { createdAt } = token.data;
  const setCreatedAt = (at: number | null) => token.setData({ createdAt: at });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (createdAt !== null && !confirm(s.ui_api_token_recreate_confirm)) return;
    void run(async () => {
      const r = await api.createApiToken();
      setCreatedAt(r.createdAt);
      setFresh(r.token);
      setCopied(false);
    });
  };

  const remove = () => {
    if (!confirm(s.ui_api_token_delete_confirm)) return;
    void run(async () => {
      await api.deleteApiToken();
      setCreatedAt(null);
      setFresh(null);
    });
  };

  const copy = () => {
    if (fresh === null) return;
    void navigator.clipboard
      ?.writeText(fresh)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <Stack>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>
            {createdAt === null
              ? s.ui_api_token_status
              : s.ui_api_token_created}
          </span>
          <span className={ROW_VALUE_CLS}>
            {createdAt === null ? s.ui_api_token_none : short(createdAt)}
          </span>
        </div>
        {fresh !== null && (
          <>
            <div className={ROW_CLS}>
              <span className="min-w-0 font-mono text-[14px] break-all select-all">
                {fresh}
              </span>
            </div>
            <ActionRow onClick={copy}>
              {copied ? s.ui_api_token_copied : s.ui_api_token_copy}
            </ActionRow>
          </>
        )}
      </Card>
      <SectionFooter>
        {failed
          ? s.ui_api_token_error
          : fresh !== null
            ? `${s.ui_api_token_new_footer} ${s.ui_api_token_footer}`
            : s.ui_api_token_footer}
      </SectionFooter>

      <div className="section-gap">
        <Card>
          <ActionRow bold={createdAt === null} disabled={busy} onClick={create}>
            {createdAt === null
              ? s.ui_api_token_create
              : s.ui_api_token_recreate}
          </ActionRow>
        </Card>
      </div>
      {createdAt !== null && (
        <div className="section-gap">
          <Card>
            <ActionRow destructive disabled={busy} onClick={remove}>
              {s.ui_api_token_delete}
            </ActionRow>
          </Card>
        </div>
      )}
    </Stack>
  );
}
