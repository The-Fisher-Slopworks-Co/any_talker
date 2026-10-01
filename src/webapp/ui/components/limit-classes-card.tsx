// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Fragment, useState } from "react";
import { useI18n } from "../i18n-context";
import { api } from "../api-client";
import {
  LIMIT_CLASSES,
  type LimitClassesConfig,
  type Settings,
} from "../../../shared/types";
import { Card, SectionFooter, SectionHeader } from "./layout";
import { NumberInput, SaveButton } from "./controls";
import { INPUT_CLS, ROW_CLS, ROW_LABEL_CLS } from "./row";

// What each limit class raises; who is in a class is set on the user's page.
export function LimitClassesCard({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [config, setConfig] = useState<LimitClassesConfig>(
    settings.limitClasses,
  );
  const [saving, setSaving] = useState(false);
  const dirty =
    JSON.stringify(config) !== JSON.stringify(settings.limitClasses);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await api.putSettings({ limitClasses: config }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {LIMIT_CLASSES.map((c) => (
        <Fragment key={c}>
          <SectionHeader>{s.ui_limit_class_name(c)}</SectionHeader>
          <Card>
            <label className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>
                {s.ui_limit_class_multiplier}
              </span>
              <NumberInput
                className={INPUT_CLS}
                step="0.1"
                min={1}
                value={config[c].limitMultiplier}
                onChange={(n) =>
                  setConfig({
                    ...config,
                    [c]: { ...config[c], limitMultiplier: n },
                  })
                }
              />
            </label>
            <label className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>
                {s.ui_limit_class_reminders}
              </span>
              <NumberInput
                className={INPUT_CLS}
                integer
                min={1}
                value={config[c].maxReminders}
                onChange={(n) =>
                  setConfig({
                    ...config,
                    [c]: { ...config[c], maxReminders: n },
                  })
                }
              />
            </label>
            <label className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>
                {s.ui_limit_class_allowance}
              </span>
              <NumberInput
                className={INPUT_CLS}
                step="0.01"
                min={0}
                value={config[c].monthlyAllowanceUsd}
                onChange={(n) =>
                  setConfig({
                    ...config,
                    [c]: { ...config[c], monthlyAllowanceUsd: n },
                  })
                }
              />
            </label>
          </Card>
        </Fragment>
      ))}
      <SectionFooter>{s.ui_limit_classes_footer}</SectionFooter>
      <SaveButton saving={saving} dirty={dirty} onClick={save} />
    </>
  );
}
