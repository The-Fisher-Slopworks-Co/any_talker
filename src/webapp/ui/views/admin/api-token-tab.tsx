// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n-context";
import { useDateFmt } from "../../datetime-context";
import { api } from "../../api-client";
import { DeleteButton, RowButton } from "../../components/controls";
import {
  Card,
  SectionFooter,
  SectionHeader,
  Stack,
} from "../../components/layout";
import { LoadingState } from "../../components/states";
import { ROW_CLS, ROW_LABEL_CLS, ROW_VALUE_CLS } from "../../components/row";

// The admin API token: create, rotate, delete. The server hands the token out
// once, in the create answer, so it lives in this component's state only until
// the tab is left.
export function ApiTokenTab() {
  const { t: s } = useI18n();
  const { format } = useDateFmt();
  // undefined while loading; null when no token exists.
  const [createdAt, setCreatedAt] = useState<number | null | undefined>();
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .getApiToken()
      .then((r) => setCreatedAt(r.createdAt))
      .catch(() => setFailed(true));
  }, []);

  if (createdAt === undefined)
    return failed ? (
      <LoadingState text={s.ui_api_token_error} />
    ) : (
      <LoadingState />
    );

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
      <SectionHeader>{s.ui_admin_api_token}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_api_token_status}</span>
          <span className={ROW_VALUE_CLS}>
            {createdAt === null
              ? s.ui_api_token_none
              : s.ui_api_token_created(format(createdAt))}
          </span>
        </div>
      </Card>
      <SectionFooter>
        {failed ? s.ui_api_token_error : s.ui_api_token_footer}
      </SectionFooter>

      {fresh !== null && (
        <>
          <SectionHeader>{s.ui_api_token_new_header}</SectionHeader>
          <Card>
            <div className="px-4 py-[11px] font-mono text-[14px] break-all select-all">
              {fresh}
            </div>
            <RowButton onClick={copy}>
              {copied ? s.ui_api_token_copied : s.ui_api_token_copy}
            </RowButton>
          </Card>
          <SectionFooter>{s.ui_api_token_new_footer}</SectionFooter>
        </>
      )}

      <Card>
        <RowButton disabled={busy} onClick={create}>
          {createdAt === null ? s.ui_api_token_create : s.ui_api_token_recreate}
        </RowButton>
      </Card>
      {createdAt !== null && (
        <Card>
          <DeleteButton disabled={busy} onClick={remove}>
            {s.ui_api_token_delete}
          </DeleteButton>
        </Card>
      )}
    </Stack>
  );
}
