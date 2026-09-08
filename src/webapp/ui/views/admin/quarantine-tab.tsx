// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { useMemo } from "react";
import { useI18n } from "../../i18n-context";
import { api } from "../../api-client";
import { SectionFooter, SectionHeader, Stack } from "../../components/layout";
import { LoadingState } from "../../components/states";
import { QuarantinedReminderCard } from "../../components/quarantined-reminder-card";
import { TimeNote } from "../../components/time-note";
import { useLoadable } from "../../lib/use-loadable";

export function QuarantineTab() {
  const { t: s } = useI18n();
  const { data } = useLoadable(api.listQuarantinedReminders, []);
  // One instant for the whole listing, so the remaining-TTL readings agree with
  // each other and do not drift row by row as React re-renders.
  const nowMs = useMemo(() => Date.now(), [data]);

  if (data === null) return <LoadingState />;

  return (
    <Stack>
      <SectionHeader>{s.ui_quarantine_header}</SectionHeader>
      <QuarantinedReminderCard
        quarantined={data.quarantined}
        nowMs={nowMs}
        emptyText={s.ui_quarantine_empty}
      />
      <SectionFooter>
        {s.ui_quarantine_footer} <TimeNote />
      </SectionFooter>
    </Stack>
  );
}
