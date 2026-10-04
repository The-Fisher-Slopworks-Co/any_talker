// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Fragment } from "react";
import { useI18n } from "../i18n-context";
import { LIMIT_CLASSES, type LimitClassesConfig } from "../../../shared/types";
import type { SettingsPatch } from "../api-client/settings";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { NumberRow } from "./number-row";

// What each limit class raises; who is in a class is set on the user's page.
export function LimitClassesCard({
  classes,
  save,
}: {
  classes: LimitClassesConfig;
  save: (patch: SettingsPatch) => void;
}) {
  const { t: s } = useI18n();
  return (
    <>
      {LIMIT_CLASSES.map((c) => (
        <Fragment key={c}>
          <SectionHeader>{s.ui_limit_class_name(c)}</SectionHeader>
          <Card>
            <NumberRow
              label={s.ui_limit_class_multiplier}
              prefix="×"
              step="0.1"
              min={1}
              value={classes[c].limitMultiplier}
              onCommit={(limitMultiplier) =>
                save({ limitClasses: { [c]: { limitMultiplier } } })
              }
            />
            <NumberRow
              label={s.ui_limit_class_reminders}
              integer
              min={1}
              value={classes[c].maxReminders}
              onCommit={(maxReminders) =>
                save({ limitClasses: { [c]: { maxReminders } } })
              }
            />
            <NumberRow
              label={s.ui_limit_class_allowance}
              prefix="$"
              decimals={2}
              step="0.01"
              min={0}
              value={classes[c].monthlyAllowanceUsd}
              onCommit={(monthlyAllowanceUsd) =>
                save({ limitClasses: { [c]: { monthlyAllowanceUsd } } })
              }
            />
          </Card>
        </Fragment>
      ))}
      <SectionFooter>{s.ui_limit_classes_footer}</SectionFooter>
    </>
  );
}
