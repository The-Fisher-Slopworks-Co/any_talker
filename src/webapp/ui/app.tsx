/// <reference lib="dom" />
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  api,
  type MeResponse,
  type RemindersResponse,
  type UserSettingsResponse,
} from "./api-client";
import {
  fetchOpenRouterModels,
  fetchOpenRouterEndpoints,
  lookupOpenRouterModel,
  pickEndpointBySort,
  formatPricePerMillion,
  supportsCaching,
  supportsTools,
  type OpenRouterModel,
  type OpenRouterEndpoint,
} from "./openrouter-models";
import {
  composeFullName,
  type Settings,
  type WhitelistEntry,
  type WhitelistKind,
  type BucketState,
  type User,
  type Chat,
  type ChatSettings,
  type RateLimitConfig,
  type ProviderSort,
  type Gender,
} from "../../shared/types";
import { SUPPORTED_LANGS, resolveLang, t, type Lang } from "../../shared/i18n";
import { I18nProvider, useI18n } from "./i18n-context";
import type { Reminder } from "../../reminders/types";
import {
  getTimezoneAreas,
  getTimezoneLocations,
  splitTimezone,
} from "./timezones";

type Strings = ReturnType<typeof t>;

type AdminSection =
  | "prompt"
  | "ratelimit"
  | "whitelist"
  | "users"
  | "chats"
  | "reminders";
type Route =
  | { kind: "main" }
  | { kind: "admin" }
  | { kind: "admin-section"; section: AdminSection }
  | { kind: "user-edit"; userId: string; from: AdminSection }
  | { kind: "chat-edit"; chatId: string; from: AdminSection }
  | { kind: "my-reminders" };

const ADMIN_SECTION_IDS: readonly AdminSection[] = [
  "prompt",
  "ratelimit",
  "whitelist",
  "users",
  "chats",
  "reminders",
];

const LANG_LABEL_KEY = {
  en: "ui_main_lang_english",
  ru: "ui_main_lang_russian",
} as const satisfies Record<Lang, keyof Strings>;

function adminSection(s: Strings, id: AdminSection): {
  label: string;
  description: string;
} {
  switch (id) {
    case "prompt":
      return { label: s.ui_admin_prompt, description: s.ui_admin_prompt_desc };
    case "ratelimit":
      return { label: s.ui_admin_limits, description: s.ui_admin_limits_desc };
    case "whitelist":
      return {
        label: s.ui_admin_whitelist,
        description: s.ui_admin_whitelist_desc,
      };
    case "users":
      return { label: s.ui_admin_users, description: s.ui_admin_users_desc };
    case "chats":
      return { label: s.ui_admin_chats, description: s.ui_admin_chats_desc };
    case "reminders":
      return {
        label: s.ui_admin_reminders,
        description: s.ui_admin_reminders_desc,
      };
  }
}

function chatTitle(s: Strings, c: Chat): string {
  if (c.title && c.title.length > 0) return c.title;
  if (c.username) return `@${c.username}`;
  if (c.type === "private") return s.ui_chat_private;
  return `id:${c.id}`;
}

function chatSubtitle(c: Chat): string {
  return c.username && c.title ? `${c.type} · @${c.username}` : c.type;
}

function userDisplayName(u: User): string {
  return composeFullName(u.firstName, u.lastName) || `id:${u.id}`;
}

function reminderTargetLabel(
  s: Strings,
  r: Reminder,
  chats: Record<string, Chat>,
): string {
  if (r.target.kind === "guest_dm") return s.ui_reminders_dm;
  const chat = chats[r.target.chatId];
  if (chat) return chatTitle(s, chat);
  return s.ui_reminders_chat_fallback(r.target.chatId);
}

function openTelegramProfile(u: User): void {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  if (u.username) {
    tg.openTelegramLink?.(`https://t.me/${u.username}`);
    return;
  }
  tg.openLink?.(`tg://user?id=${u.id}`);
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="section-header px-4 pb-1.5 text-[14px] font-medium text-tg-section-header">
      {children}
    </div>
  );
}

function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-1.5 text-[13px] leading-[1.35] text-tg-hint">
      {children}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="card bg-tg-section rounded-xl overflow-hidden">{children}</div>;
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

const ROW_CLS = "row relative flex items-center gap-3 px-4 py-[11px]";
const ROW_LABEL_CLS = "shrink-0 text-base";
const ROW_VALUE_CLS = "flex-1 text-right text-tg-hint text-[15px]";
const INPUT_BASE_CLS =
  "flex-1 min-w-0 bg-transparent border-0 p-0 text-base text-tg-text";
const INPUT_CLS = `${INPUT_BASE_CLS} text-right`;
const INPUT_LEFT_CLS = `${INPUT_BASE_CLS} text-left`;

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    />
  );
}

function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="action mt-4">
      <button
        className="w-full bg-tg-button text-tg-button-text rounded-xl py-[14px] text-base font-semibold cursor-pointer transition-opacity active:not-disabled:opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    </div>
  );
}

function SaveButton({
  saving,
  dirty,
  disabled,
  onClick,
}: {
  saving: boolean;
  dirty: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t: s } = useI18n();
  return (
    <PrimaryButton disabled={disabled ?? (saving || !dirty)} onClick={onClick}>
      {saving ? s.ui_saving : dirty ? s.ui_save : s.ui_saved}
    </PrimaryButton>
  );
}

function RowButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="action-row relative block w-full bg-tg-section text-tg-link border-0 text-center px-4 py-[13px] text-base font-medium cursor-pointer active:not-disabled:bg-[var(--tg-separator)] disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WhitelistToggleButton({
  kind,
  id,
  label,
  initial,
}: {
  kind: WhitelistKind;
  id: string;
  label: string;
  initial: boolean;
}) {
  const { t: s } = useI18n();
  const [whitelisted, setWhitelisted] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (whitelisted) {
        await api.removeWhitelist(kind, id);
        setWhitelisted(false);
      } else {
        await api.addWhitelist(kind, { id, label });
        setWhitelisted(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <RowButton onClick={toggle} disabled={busy}>
      {busy
        ? s.ui_updating
        : whitelisted
          ? s.ui_whitelist_remove
          : s.ui_whitelist_add}
    </RowButton>
  );
}

function reminderUserLabel(
  r: Reminder,
  users: Record<string, User> | undefined,
): { primary: string; secondary: string | null } {
  const u = users?.[r.userId];
  if (!u) return { primary: `id ${r.userId}`, secondary: null };
  return {
    primary: userDisplayName(u),
    secondary: u.username ? `@${u.username}` : `id ${u.id}`,
  };
}

function ReminderCard({
  reminders,
  chats,
  users,
  showUserId,
  onUserClick,
  emptyText,
}: {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User>;
  showUserId: boolean;
  onUserClick?: (userId: string) => void;
  emptyText: string;
}) {
  const { t: s } = useI18n();
  return (
    <Card>
      {reminders.length === 0 ? (
        <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
          {emptyText}
        </div>
      ) : reminders.map((r) => {
        const userLabel = showUserId ? reminderUserLabel(r, users) : null;
        const userText = userLabel
          ? `${userLabel.primary}${userLabel.secondary ? ` · ${userLabel.secondary}` : ""}`
          : null;
        return (
          <div key={r.id} className="row relative flex flex-col gap-1 px-4 py-[11px]">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-base font-medium">
                {new Date(r.fireAtMs).toLocaleString()}
              </span>
              <span className="text-[13px] text-tg-hint truncate">
                {reminderTargetLabel(s, r, chats)}
              </span>
            </div>
            <div className="text-[15px] whitespace-pre-wrap break-words">
              {r.text}
            </div>
            {userText &&
              (onUserClick ? (
                <button
                  className="self-start bg-transparent border-0 p-0 text-left text-[13px] text-tg-link cursor-pointer"
                  onClick={() => onUserClick(r.userId)}
                >
                  {userText}
                </button>
              ) : (
                <div className="text-[13px] text-tg-hint">{userText}</div>
              ))}
          </div>
        );
      })}
    </Card>
  );
}

function RemindersList({
  fetchReminders,
  header,
  emptyText,
  footer,
  showUserId,
  onUserClick,
}: {
  fetchReminders: () => Promise<RemindersResponse>;
  header: string;
  emptyText: string;
  footer: ReactNode;
  showUserId: boolean;
  onUserClick?: (userId: string) => void;
}) {
  const { t: s } = useI18n();
  const [data, setData] = useState<RemindersResponse | null>(null);

  useEffect(() => {
    fetchReminders().then(setData);
  }, [fetchReminders]);

  if (data === null)
    return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;

  return (
    <Stack>
      <SectionHeader>{header}</SectionHeader>
      <ReminderCard
        reminders={data.reminders}
        chats={data.chats}
        users={data.users}
        showUserId={showUserId}
        onUserClick={onUserClick}
        emptyText={emptyText}
      />
      <SectionFooter>{footer}</SectionFooter>
    </Stack>
  );
}

function MainView({
  me,
  onMe,
  onOpenAdmin,
  onOpenMyReminders,
}: {
  me: MeResponse;
  onMe: (m: MeResponse) => void;
  onOpenAdmin: () => void;
  onOpenMyReminders: () => void;
}) {
  const { t: s, lang: resolvedLang } = useI18n();
  const [name, setName] = useState(me.displayName ?? "");
  const [tzOverride, setTzOverride] = useState(me.timezone !== null);
  const [tzValue, setTzValue] = useState(me.timezone ?? "UTC");
  const [genderOn, setGenderOn] = useState(me.gender !== null);
  const [genderValue, setGenderValue] = useState<Gender>(me.gender ?? "male");
  const [langValue, setLangValue] = useState<Lang>(resolvedLang);
  const [saving, setSaving] = useState(false);

  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;
  const tgName = tgUser ? composeFullName(tgUser.first_name, tgUser.last_name) : "";

  const desiredTz = tzOverride ? tzValue : null;
  const desiredGender: Gender | null = genderOn ? genderValue : null;
  const dirty =
    name.trim() !== (me.displayName ?? "") ||
    desiredTz !== me.timezone ||
    desiredGender !== me.gender ||
    langValue !== resolvedLang;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putMe({
        displayName: name.trim() || null,
        timezone: desiredTz,
        gender: desiredGender,
        language: langValue,
      });
      onMe(next);
      setName(next.displayName ?? "");
      setTzOverride(next.timezone !== null);
      setTzValue(next.timezone ?? "UTC");
      setGenderOn(next.gender !== null);
      setGenderValue(next.gender ?? "male");
      setLangValue(next.language ?? resolvedLang);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_main_display_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_main_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={tgName || s.ui_main_your_name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_main_name_footer}</SectionFooter>

      <SectionHeader>{s.ui_main_gender}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_main_tell_ai}</span>
          <span className="flex-1" />
          <Toggle value={genderOn} onChange={setGenderOn} />
        </div>
      </Card>
      {genderOn ? (
        <Card>
          <button
            type="button"
            className={`${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`}
            onClick={() => setGenderValue("male")}
          >
            <span className={ROW_LABEL_CLS}>{s.ui_main_male}</span>
            <span className="flex-1" />
            {genderValue === "male" ? <span className="text-tg-link">✓</span> : null}
          </button>
          <button
            type="button"
            className={`${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`}
            onClick={() => setGenderValue("female")}
          >
            <span className={ROW_LABEL_CLS}>{s.ui_main_female}</span>
            <span className="flex-1" />
            {genderValue === "female" ? <span className="text-tg-link">✓</span> : null}
          </button>
        </Card>
      ) : null}
      <SectionFooter>{s.ui_main_gender_footer}</SectionFooter>

      <SectionHeader>{s.ui_main_timezone}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_main_use_my_tz}</span>
          <span className="flex-1" />
          <Toggle value={tzOverride} onChange={setTzOverride} />
        </div>
      </Card>
      {tzOverride ? (
        <TimezoneSelect value={tzValue} onChange={setTzValue} />
      ) : null}
      <SectionFooter>{s.ui_main_tz_footer}</SectionFooter>

      <SectionHeader>{s.ui_main_language}</SectionHeader>
      <Card>
        {SUPPORTED_LANGS.map((code) => (
          <button
            key={code}
            type="button"
            className={`${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`}
            onClick={() => setLangValue(code)}
          >
            <span className={ROW_LABEL_CLS}>{s[LANG_LABEL_KEY[code]]}</span>
            <span className="flex-1" />
            {langValue === code ? <span className="text-tg-link">✓</span> : null}
          </button>
        ))}
      </Card>
      <SectionFooter>{s.ui_main_language_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />

      <SectionHeader>{s.ui_main_reminders}</SectionHeader>
      <Card>
        <RowButton onClick={onOpenMyReminders}>{s.ui_main_my_reminders}</RowButton>
      </Card>

      {me.isOwner && (
        <>
          <SectionHeader>{s.ui_main_bot_config}</SectionHeader>
          <Card>
            <RowButton onClick={onOpenAdmin}>{s.ui_main_admin_panel}</RowButton>
          </Card>
        </>
      )}
    </Stack>
  );
}

function ModelInfo({
  model,
  providerSort,
}: {
  model: OpenRouterModel | null | undefined;
  providerSort: ProviderSort | null;
}) {
  const { t: s } = useI18n();
  const [endpoint, setEndpoint] = useState<
    OpenRouterEndpoint | null | undefined
  >(undefined);

  useEffect(() => {
    if (!model || !providerSort) {
      setEndpoint(null);
      return;
    }
    let cancelled = false;
    setEndpoint(undefined);
    fetchOpenRouterEndpoints(model.id)
      .then((eps) => {
        if (cancelled) return;
        setEndpoint(pickEndpointBySort(eps, providerSort));
      })
      .catch(() => {
        if (!cancelled) setEndpoint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [model?.id, providerSort]);

  if (model === undefined)
    return <span className="text-tg-hint">{s.ui_modelinfo_loading}</span>;
  if (model === null)
    return <span className="text-tg-hint">{s.ui_modelinfo_unknown}</span>;

  const useEndpoint = providerSort !== null && endpoint !== null && endpoint !== undefined;
  const inputPrice = formatPricePerMillion(
    useEndpoint ? endpoint.pricing.prompt : model.pricing.prompt,
  );
  const outputPrice = formatPricePerMillion(
    useEndpoint ? endpoint.pricing.completion : model.pricing.completion,
  );
  const imagePrice = formatPricePerMillion(
    useEndpoint ? endpoint.pricing.image : model.pricing.image,
  );
  const modalities = model.architecture?.input_modalities ?? [];
  const tools = supportsTools(model);
  const caching = supportsCaching(model);

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-tg-text">{model.name}</div>
      {providerSort !== null && (
        <div className="text-tg-hint">
          {endpoint === undefined
            ? s.ui_modelinfo_resolving_provider
            : endpoint === null
              ? s.ui_modelinfo_no_provider_data(providerSort)
              : `${s.ui_modelinfo_provider_prefix}${endpoint.provider_name}`}
          {endpoint && providerSort === "throughput" && endpoint.throughput !== null && (
            <> · {Math.round(endpoint.throughput)} {s.ui_modelinfo_tokps}</>
          )}
          {endpoint && providerSort === "latency" && endpoint.latency !== null && (
            <> · {Math.round(endpoint.latency)} {s.ui_modelinfo_ms}</>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {inputPrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_input}</span> {inputPrice}
          </span>
        )}
        {outputPrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_output}</span> {outputPrice}
          </span>
        )}
        {imagePrice && (
          <span>
            <span className="text-tg-hint">{s.ui_modelinfo_image}</span> {imagePrice}
          </span>
        )}
      </div>
      {modalities.length > 0 && (
        <div>
          <span className="text-tg-hint">{s.ui_modelinfo_modalities}</span> {modalities.join(", ")}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3">
        <span>
          <span className="text-tg-hint">{s.ui_modelinfo_tools}</span> {tools ? s.ui_yes : s.ui_no}
        </span>
        <span>
          <span className="text-tg-hint">{s.ui_modelinfo_caching}</span> {caching ? s.ui_yes : s.ui_no}
        </span>
      </div>
    </div>
  );
}

function ModelsCard({
  models,
  onChange,
  providerSort,
}: {
  models: string[];
  onChange: (next: string[]) => void;
  providerSort: ProviderSort | null;
}) {
  const { t: s } = useI18n();
  const [catalog, setCatalog] = useState<Map<string, OpenRouterModel> | null>(null);

  useEffect(() => {
    fetchOpenRouterModels()
      .then(setCatalog)
      .catch(() => setCatalog(new Map()));
  }, []);

  const lookupModel = (id: string): OpenRouterModel | null | undefined => {
    const trimmed = id.trim();
    if (trimmed.length === 0) return null;
    if (catalog === null) return undefined;
    return lookupOpenRouterModel(catalog, trimmed);
  };

  const updateAt = (idx: number, value: string) =>
    onChange(models.map((m, i) => (i === idx ? value : m)));
  const removeAt = (idx: number) => onChange(models.filter((_, i) => i !== idx));
  const addFallback = () => onChange([...models, ""]);

  return (
    <Card>
      {models.map((m, idx) => {
        const info = m.trim().length > 0 ? lookupModel(m) : null;
        return (
          <div
            key={idx}
            className="row relative flex flex-col gap-2 px-4 py-[11px]"
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-tg-hint text-[15px] w-14">
                {idx === 0
                  ? s.ui_models_primary
                  : s.ui_models_fallback_n(idx + 1)}
              </span>
              <input
                className={INPUT_LEFT_CLS}
                value={m}
                onChange={(e) => updateAt(idx, e.target.value)}
                placeholder={s.ui_models_model_id}
              />
              {idx > 0 && (
                <button
                  className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                  onClick={() => removeAt(idx)}
                  aria-label={s.ui_models_remove_fallback}
                >
                  {s.ui_remove}
                </button>
              )}
            </div>
            {m.trim().length > 0 && (
              <div className="pl-[68px] text-[13px] leading-[1.45]">
                <ModelInfo model={info} providerSort={providerSort} />
              </div>
            )}
          </div>
        );
      })}
      <RowButton onClick={addFallback}>{s.ui_models_add_fallback}</RowButton>
    </Card>
  );
}

function ProviderSortField({
  value,
  onChange,
}: {
  value: ProviderSort | null;
  onChange: (next: ProviderSort | null) => void;
}) {
  const { t: s } = useI18n();
  const options: { value: ProviderSort | null; label: string }[] = [
    { value: null, label: s.ui_sort_default },
    { value: "price", label: s.ui_sort_price },
    { value: "throughput", label: s.ui_sort_throughput },
    { value: "latency", label: s.ui_sort_latency },
  ];
  const activeIdx = options.findIndex((o) => o.value === value);
  return (
    <div
      className="relative flex bg-tg-section rounded-[10px] p-[3px] shadow-[0_0_0_1px_var(--tg-separator)]"
      role="radiogroup"
    >
      <div
        className="absolute top-[3px] bottom-[3px] left-[3px] z-0 pointer-events-none bg-tg-button rounded-lg transition-transform duration-[180ms] ease-tg-spring"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${activeIdx * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.label}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="relative z-10 flex-1 border-0 bg-transparent px-1.5 py-2 rounded-lg text-tg-text text-[13px] font-medium cursor-pointer transition-colors aria-checked:text-tg-button-text"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RateLimitFields({
  value,
  onChange,
}: {
  value: RateLimitConfig;
  onChange: (next: RateLimitConfig) => void;
}) {
  const { t: s } = useI18n();
  const intervalMin = Math.round(value.refillIntervalMs / 60000);
  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_capacity}</span>
        <input
          type="number"
          className={INPUT_CLS}
          value={value.capacity}
          onChange={(e) =>
            onChange({ ...value, capacity: Number(e.target.value) })
          }
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_refill_amount}</span>
        <input
          type="number"
          className={INPUT_CLS}
          value={value.refillAmount}
          onChange={(e) =>
            onChange({ ...value, refillAmount: Number(e.target.value) })
          }
        />
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_refill_every}</span>
        <input
          type="number"
          className={INPUT_CLS}
          value={intervalMin}
          onChange={(e) =>
            onChange({
              ...value,
              refillIntervalMs: Number(e.target.value) * 60_000,
            })
          }
        />
        <span className="shrink-0 text-tg-hint text-[15px]">{s.ui_ratelimit_min_unit}</span>
      </label>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_owner_exempt}</span>
        <span className="flex-1" />
        <Toggle
          value={value.ownerExempt}
          onChange={(v) => onChange({ ...value, ownerExempt: v })}
        />
      </div>
    </Card>
  );
}

function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const { t: s } = useI18n();
  const areas = getTimezoneAreas();
  const { area, location } = splitTimezone(value);
  const locations = getTimezoneLocations(area);

  const areaOptions = areas.includes(area) ? areas : [area, ...areas];
  const locationOptions =
    location && !locations.includes(location)
      ? [location, ...locations]
      : locations;

  const onAreaChange = (next: string) => {
    const list = getTimezoneLocations(next);
    if (list.length > 0) onChange(`${next}/${list[0]}`);
  };

  const onLocationChange = (next: string) => {
    onChange(`${area}/${next}`);
  };

  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_tz_area}</span>
        <select
          className={INPUT_CLS}
          value={area}
          onChange={(e) => onAreaChange(e.target.value)}
        >
          {areaOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>{s.ui_tz_location}</span>
        <select
          className={INPUT_CLS}
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          disabled={locationOptions.length === 0}
        >
          {locationOptions.map((l) => (
            <option key={l} value={l}>
              {l.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
    </Card>
  );
}

function PromptTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [models, setModels] = useState<string[]>(settings.models);
  const [prompt, setPrompt] = useState(settings.systemPrompt);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [providerSort, setProviderSort] = useState<ProviderSort | null>(
    settings.providerSort,
  );
  const [saving, setSaving] = useState(false);

  const trimmed = models.map((m) => m.trim()).filter((m) => m.length > 0);
  const modelsDirty =
    trimmed.length !== settings.models.length ||
    trimmed.some((m, i) => m !== settings.models[i]);
  const dirty =
    modelsDirty ||
    prompt !== settings.systemPrompt ||
    timezone !== settings.timezone ||
    providerSort !== settings.providerSort;
  const canSave = dirty && trimmed.length > 0;

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({
      models: trimmed,
      systemPrompt: prompt,
      timezone,
      providerSort,
    });
    onSaved(next);
    setModels(next.models);
    setTimezone(next.timezone);
    setProviderSort(next.providerSort);
    setSaving(false);
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_prompt_models}</SectionHeader>
      <ModelsCard
        models={models}
        onChange={setModels}
        providerSort={providerSort}
      />
      <SectionFooter>{s.ui_prompt_models_footer}</SectionFooter>

      <SectionHeader>{s.ui_prompt_provider_routing}</SectionHeader>
      <ProviderSortField value={providerSort} onChange={setProviderSort} />
      <SectionFooter>{s.ui_prompt_provider_routing_footer}</SectionFooter>

      <SectionHeader>{s.ui_prompt_system_prompt}</SectionHeader>
      <Card>
        <textarea
          className="block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={s.ui_prompt_placeholder}
        />
      </Card>
      <SectionFooter>{s.ui_prompt_system_prompt_footer}</SectionFooter>

      <SectionHeader>{s.ui_prompt_timezone}</SectionHeader>
      <TimezoneSelect value={timezone} onChange={setTimezone} />
      <SectionFooter>{s.ui_prompt_timezone_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} disabled={saving || !canSave} onClick={save} />
    </Stack>
  );
}

function RateLimitTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { t: s } = useI18n();
  const [config, setConfig] = useState<RateLimitConfig>(settings.rateLimit);
  const [bucket, setBucket] = useState<BucketState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyBucket().then((r) => setBucket(r.bucket));
  }, []);

  const dirty =
    config.capacity !== settings.rateLimit.capacity ||
    config.refillAmount !== settings.rateLimit.refillAmount ||
    config.refillIntervalMs !== settings.rateLimit.refillIntervalMs ||
    config.ownerExempt !== settings.rateLimit.ownerExempt;

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ rateLimit: config });
    onSaved(next);
    setSaving(false);
  };

  const reset = async () => {
    const r = await api.resetMyBucket();
    setBucket(r.bucket);
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_ratelimit_limits}</SectionHeader>
      <RateLimitFields value={config} onChange={setConfig} />
      <SectionFooter>{s.ui_ratelimit_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />

      <SectionHeader>{s.ui_ratelimit_my_bucket}</SectionHeader>
      <Card>
        {bucket ? (
          <>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_tokens}</span>
              <span className={ROW_VALUE_CLS}>
                {bucket.tokens.toLocaleString()} / {config.capacity.toLocaleString()}
              </span>
            </div>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>{s.ui_ratelimit_last_refill}</span>
              <span className={ROW_VALUE_CLS}>
                {new Date(bucket.lastRefillTs).toLocaleString()}
              </span>
            </div>
            <RowButton onClick={reset}>{s.ui_ratelimit_reset}</RowButton>
          </>
        ) : (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
            {s.ui_ratelimit_no_bucket}
          </div>
        )}
      </Card>
    </Stack>
  );
}

function WhitelistList({
  kind,
  entries,
  onOpen,
  onRemove,
}: {
  kind: WhitelistKind;
  entries: WhitelistEntry[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>
        {kind === "users"
          ? s.ui_whitelist_allowed_users
          : s.ui_whitelist_allowed_chats}
      </SectionHeader>
      <Card>
        {entries.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
            {s.ui_whitelist_no_entries}
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className={ROW_CLS}>
              <div className="flex-1 min-w-0">
                <div className="truncate">{e.label || `id:${e.id}`}</div>
                <div className="text-[13px] text-tg-hint truncate">id {e.id}</div>
              </div>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-link cursor-pointer"
                onClick={() => onOpen(e.id)}
              >
                {s.ui_open}
              </button>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                onClick={() => onRemove(e.id)}
              >
                {s.ui_remove}
              </button>
            </div>
          ))
        )}
      </Card>
      <SectionFooter>
        {kind === "users"
          ? s.ui_whitelist_footer_users
          : s.ui_whitelist_footer_chats}
      </SectionFooter>
    </>
  );
}

function WhitelistTab({
  onOpenUser,
  onOpenChat,
}: {
  onOpenUser: (id: string) => void;
  onOpenChat: (id: string) => void;
}) {
  const { t: s } = useI18n();
  const [users, setUsers] = useState<WhitelistEntry[]>([]);
  const [chats, setChats] = useState<WhitelistEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getWhitelist().then((d) => {
      setUsers(d.users);
      setChats(d.chats);
      setLoaded(true);
    });
  }, []);

  if (!loaded)
    return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;

  return (
    <Stack>
      <WhitelistList
        kind="users"
        entries={users}
        onOpen={onOpenUser}
        onRemove={async (id) => setUsers(await api.removeWhitelist("users", id))}
      />
      <WhitelistList
        kind="chats"
        entries={chats}
        onOpen={onOpenChat}
        onRemove={async (id) => setChats(await api.removeWhitelist("chats", id))}
      />
    </Stack>
  );
}

function UsersTab({ onEdit }: { onEdit: (id: string) => void }) {
  const { t: s } = useI18n();
  const [users, setUsers] = useState<User[] | null>(null);

  useEffect(() => {
    api.listAdminUsers().then((r) => setUsers(r.users));
  }, []);

  if (users === null)
    return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;

  return (
    <Stack>
      <SectionHeader>{s.ui_users_all}</SectionHeader>
      <Card>
        {users.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
            {s.ui_users_empty}
          </div>
        ) : (
          users.map((u) => (
            <div key={u.id} className={ROW_CLS}>
              <div className="flex-1 min-w-0">
                <div className="truncate">{userDisplayName(u)}</div>
                <div className="text-[13px] text-tg-hint truncate">
                  {u.username ? `@${u.username}` : `id ${u.id}`}
                </div>
              </div>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-link cursor-pointer"
                onClick={() => openTelegramProfile(u)}
              >
                {s.ui_open}
              </button>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-link cursor-pointer"
                onClick={() => onEdit(u.id)}
              >
                {s.ui_edit}
              </button>
            </div>
          ))
        )}
      </Card>
      <SectionFooter>{s.ui_users_footer}</SectionFooter>
    </Stack>
  );
}

function UserEditView({ userId }: { userId: string }) {
  const { t: s } = useI18n();
  const [data, setData] = useState<UserSettingsResponse | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .getAdminUser(userId)
      .then((d) => {
        setData(d);
        setName(d.displayName ?? "");
      })
      .catch(() => setNotFound(true));
  }, [userId]);

  if (notFound)
    return <div className="text-center text-tg-hint py-20">{s.ui_user_not_found}</div>;
  if (!data)
    return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;

  const { user } = data;
  const fallbackName = userDisplayName(user);
  const dirty = name.trim() !== (data.displayName ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putAdminUser(userId, name.trim() || null);
      setData((prev) => (prev ? { ...prev, ...next } : null));
      setName(next.displayName ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_user_profile}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <span className={ROW_VALUE_CLS}>{fallbackName}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_username}</span>
          <span className={ROW_VALUE_CLS}>
            {user.username ? `@${user.username}` : s.ui_dash}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_id}</span>
          <span className={ROW_VALUE_CLS}>{user.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_last_seen}</span>
          <span className={ROW_VALUE_CLS}>
            {new Date(user.lastSeenAt).toLocaleString()}
          </span>
        </div>
        <RowButton onClick={() => openTelegramProfile(user)}>
          {s.ui_user_open_in_tg}
        </RowButton>
        <WhitelistToggleButton
          kind="users"
          id={user.id}
          label={fallbackName}
          initial={data.whitelisted}
        />
      </Card>

      <SectionHeader>{s.ui_main_display_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={fallbackName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_user_display_name_footer}</SectionFooter>

      <SaveButton saving={saving} dirty={dirty} onClick={save} />
    </Stack>
  );
}

function ChatsTab({ onEdit }: { onEdit: (id: string) => void }) {
  const { t: s } = useI18n();
  const [chats, setChats] = useState<Chat[] | null>(null);

  useEffect(() => {
    api.listAdminChats().then((r) => setChats(r.chats));
  }, []);

  if (chats === null)
    return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;

  return (
    <Stack>
      <SectionHeader>{s.ui_chats_all}</SectionHeader>
      <Card>
        {chats.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
            {s.ui_chats_empty}
          </div>
        ) : (
          chats.map((c) => (
            <button
              key={c.id}
              onClick={() => onEdit(c.id)}
              className={`${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{chatTitle(s, c)}</div>
                <div className="text-[13px] text-tg-hint truncate">
                  {chatSubtitle(c)}
                </div>
              </div>
              <span className="text-tg-hint text-[15px]">›</span>
            </button>
          ))
        )}
      </Card>
      <SectionFooter>{s.ui_chats_footer}</SectionFooter>
    </Stack>
  );
}

function OverrideSection({
  title,
  footer,
  override,
  onToggle,
  children,
}: {
  title: string;
  footer?: ReactNode;
  override: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  const { t: s } = useI18n();
  return (
    <>
      <SectionHeader>{title}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_override_global}</span>
          <span className="flex-1" />
          <Toggle value={override} onChange={onToggle} />
        </div>
      </Card>
      {override ? children : null}
      {footer ? <SectionFooter>{footer}</SectionFooter> : null}
    </>
  );
}

function ChatEditView({ chatId }: { chatId: string }) {
  const { t: s } = useI18n();
  const [chat, setChat] = useState<Chat | null>(null);
  const [global, setGlobal] = useState<Settings | null>(null);
  const [original, setOriginal] = useState<ChatSettings | null>(null);

  const [promptOverride, setPromptOverride] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const [modelsOverride, setModelsOverride] = useState(false);
  const [modelsValue, setModelsValue] = useState<string[]>([]);
  const [rlOverride, setRlOverride] = useState(false);
  const [rlValue, setRlValue] = useState<RateLimitConfig | null>(null);
  const [botNameValue, setBotNameValue] = useState("");
  const [tzOverride, setTzOverride] = useState(false);
  const [tzValue, setTzValue] = useState("UTC");
  const [psOverride, setPsOverride] = useState(false);
  const [psValue, setPsValue] = useState<ProviderSort | null>(null);

  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAdminChat(chatId)])
      .then(([g, d]) => {
        setGlobal(g);
        setChat(d.chat);
        setOriginal(d.settings);
        setWhitelisted(d.whitelisted);
        setPromptOverride(d.settings.systemPrompt !== undefined);
        setPromptValue(d.settings.systemPrompt ?? g.systemPrompt);
        setModelsOverride(d.settings.models !== undefined);
        setModelsValue(d.settings.models ?? g.models);
        setRlOverride(d.settings.rateLimit !== undefined);
        setRlValue(d.settings.rateLimit ?? g.rateLimit);
        setBotNameValue(d.settings.botName ?? "");
        setTzOverride(d.settings.timezone !== undefined);
        setTzValue(d.settings.timezone ?? g.timezone);
        setPsOverride(d.settings.providerSort !== undefined);
        setPsValue(
          d.settings.providerSort !== undefined
            ? d.settings.providerSort
            : g.providerSort,
        );
      })
      .catch(() => setNotFound(true));
  }, [chatId]);

  if (notFound)
    return <div className="text-center text-tg-hint py-20">{s.ui_chat_not_found}</div>;
  if (!chat || !global || !original || !rlValue)
    return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;

  const trimmedModels = modelsValue.map((m) => m.trim()).filter((m) => m.length > 0);

  const trimmedBotName = botNameValue.trim();

  const buildPayload = (): ChatSettings => {
    const next: ChatSettings = {};
    if (promptOverride) next.systemPrompt = promptValue;
    if (modelsOverride && trimmedModels.length > 0) next.models = trimmedModels;
    if (rlOverride) next.rateLimit = rlValue;
    if (trimmedBotName.length > 0) next.botName = trimmedBotName;
    if (tzOverride) next.timezone = tzValue;
    if (psOverride) next.providerSort = psValue;
    return next;
  };

  const payload = buildPayload();
  const wasOverridden = (key: keyof ChatSettings) => original[key] !== undefined;
  const dirty =
    promptOverride !== wasOverridden("systemPrompt") ||
    modelsOverride !== wasOverridden("models") ||
    rlOverride !== wasOverridden("rateLimit") ||
    tzOverride !== wasOverridden("timezone") ||
    psOverride !== wasOverridden("providerSort") ||
    (promptOverride && payload.systemPrompt !== original.systemPrompt) ||
    (modelsOverride &&
      JSON.stringify(payload.models) !== JSON.stringify(original.models)) ||
    (rlOverride &&
      JSON.stringify(payload.rateLimit) !== JSON.stringify(original.rateLimit)) ||
    (tzOverride && payload.timezone !== original.timezone) ||
    (psOverride && payload.providerSort !== original.providerSort) ||
    trimmedBotName !== (original.botName ?? "");

  const canSave = dirty && (!modelsOverride || trimmedModels.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.putAdminChat(chatId, buildPayload());
      setOriginal(result.settings);
      setPromptOverride(result.settings.systemPrompt !== undefined);
      setPromptValue(result.settings.systemPrompt ?? global.systemPrompt);
      setModelsOverride(result.settings.models !== undefined);
      setModelsValue(result.settings.models ?? global.models);
      setRlOverride(result.settings.rateLimit !== undefined);
      setRlValue(result.settings.rateLimit ?? global.rateLimit);
      setBotNameValue(result.settings.botName ?? "");
      setTzOverride(result.settings.timezone !== undefined);
      setTzValue(result.settings.timezone ?? global.timezone);
      setPsOverride(result.settings.providerSort !== undefined);
      setPsValue(
        result.settings.providerSort !== undefined
          ? result.settings.providerSort
          : global.providerSort,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>{s.ui_chat_chat}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_title}</span>
          <span className={ROW_VALUE_CLS}>{chatTitle(s, chat)}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_type}</span>
          <span className={ROW_VALUE_CLS}>{chat.type}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_username}</span>
          <span className={ROW_VALUE_CLS}>
            {chat.username ? `@${chat.username}` : s.ui_dash}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_id}</span>
          <span className={ROW_VALUE_CLS}>{chat.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_chat_last_seen}</span>
          <span className={ROW_VALUE_CLS}>
            {new Date(chat.lastSeenAt).toLocaleString()}
          </span>
        </div>
        <WhitelistToggleButton
          kind="chats"
          id={chat.id}
          label={chatTitle(s, chat)}
          initial={whitelisted}
        />
      </Card>

      <SectionHeader>{s.ui_chat_bot_name}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>{s.ui_user_name}</span>
          <input
            className={INPUT_CLS}
            placeholder={s.ui_chat_bot_name_placeholder}
            value={botNameValue}
            onChange={(e) => setBotNameValue(e.target.value)}
            maxLength={64}
          />
        </label>
      </Card>
      <SectionFooter>{s.ui_chat_bot_name_footer}</SectionFooter>

      <OverrideSection
        title={s.ui_chat_system_prompt}
        override={promptOverride}
        onToggle={setPromptOverride}
        footer={
          promptOverride
            ? s.ui_chat_system_prompt_on_footer
            : s.ui_chat_system_prompt_off_footer(global.systemPrompt.length)
        }
      >
        <Card>
          <textarea
            className="block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            placeholder={s.ui_chat_prompt_placeholder}
          />
        </Card>
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_models}
        override={modelsOverride}
        onToggle={setModelsOverride}
        footer={
          modelsOverride
            ? s.ui_chat_models_on_footer
            : s.ui_chat_models_off_footer(global.models.join(", "))
        }
      >
        <ModelsCard
          models={modelsValue}
          onChange={setModelsValue}
          providerSort={psOverride ? psValue : global.providerSort}
        />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_rate_limit}
        override={rlOverride}
        onToggle={setRlOverride}
        footer={
          rlOverride
            ? s.ui_chat_rate_limit_on_footer
            : s.ui_chat_rate_limit_off_footer
        }
      >
        <RateLimitFields value={rlValue} onChange={setRlValue} />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_tz}
        override={tzOverride}
        onToggle={setTzOverride}
        footer={
          tzOverride
            ? s.ui_chat_tz_on_footer
            : s.ui_chat_tz_off_footer(global.timezone)
        }
      >
        <TimezoneSelect value={tzValue} onChange={setTzValue} />
      </OverrideSection>

      <OverrideSection
        title={s.ui_chat_provider_routing}
        override={psOverride}
        onToggle={setPsOverride}
        footer={
          psOverride
            ? s.ui_chat_provider_routing_on_footer
            : s.ui_chat_provider_routing_off_footer(
                global.providerSort ?? s.ui_sort_default,
              )
        }
      >
        <ProviderSortField value={psValue} onChange={setPsValue} />
      </OverrideSection>

      <SaveButton saving={saving} dirty={dirty} disabled={saving || !canSave} onClick={save} />
    </Stack>
  );
}

function AdminView({
  onOpenSection,
}: {
  onOpenSection: (section: AdminSection) => void;
}) {
  const { t: s } = useI18n();
  return (
    <Stack>
      <Card>
        {ADMIN_SECTION_IDS.map((id) => {
          const { label, description } = adminSection(s, id);
          return (
            <button
              key={id}
              onClick={() => onOpenSection(id)}
              className={`${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{label}</div>
                <div className="text-[13px] text-tg-hint truncate">
                  {description}
                </div>
              </div>
              <span className="text-tg-hint text-[15px]">›</span>
            </button>
          );
        })}
      </Card>
    </Stack>
  );
}

function AdminSectionView({
  section,
  onEditUser,
  onEditChat,
}: {
  section: AdminSection;
  onEditUser: (id: string, from: AdminSection) => void;
  onEditChat: (id: string, from: AdminSection) => void;
}) {
  const { t: s } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const needsSettings = section === "prompt" || section === "ratelimit";
  const goUser = (id: string) => onEditUser(id, section);
  const goChat = (id: string) => onEditChat(id, section);

  useEffect(() => {
    if (needsSettings) api.getSettings().then(setSettings);
  }, [needsSettings]);

  if (section === "whitelist")
    return <WhitelistTab onOpenUser={goUser} onOpenChat={goChat} />;
  if (section === "users") return <UsersTab onEdit={goUser} />;
  if (section === "chats") return <ChatsTab onEdit={goChat} />;
  if (section === "reminders")
    return (
      <RemindersList
        fetchReminders={api.listAdminReminders}
        header={s.ui_reminders_admin_header}
        emptyText={s.ui_reminders_admin_empty}
        footer={s.ui_reminders_admin_footer}
        showUserId={true}
        onUserClick={goUser}
      />
    );
  if (!settings)
    return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;
  if (section === "prompt")
    return <PromptTab settings={settings} onSaved={setSettings} />;
  return <RateLimitTab settings={settings} onSaved={setSettings} />;
}

function AppShell({
  me,
  onMe,
}: {
  me: MeResponse | null;
  onMe: (m: MeResponse) => void;
}) {
  const { t: s } = useI18n();
  const [route, setRoute] = useState<Route>({ kind: "main" });

  useEffect(() => {
    const btn = window.Telegram?.WebApp?.BackButton;
    if (!btn) return;
    if (route.kind === "main") {
      btn.hide();
      return;
    }
    const handler = () => {
      setRoute((r) => {
        switch (r.kind) {
          case "user-edit":
          case "chat-edit":
            return { kind: "admin-section", section: r.from };
          case "admin-section":
            return { kind: "admin" };
          case "admin":
          case "my-reminders":
          case "main":
            return { kind: "main" };
        }
      });
    };
    btn.show();
    btn.onClick(handler);
    return () => {
      btn.offClick(handler);
      btn.hide();
    };
  }, [route.kind]);

  const title = (() => {
    switch (route.kind) {
      case "main":
        return s.ui_route_settings;
      case "admin":
        return s.ui_route_admin;
      case "admin-section":
        return adminSection(s, route.section).label;
      case "user-edit":
        return s.ui_route_user_settings;
      case "chat-edit":
        return s.ui_route_chat_settings;
      case "my-reminders":
        return s.ui_route_my_reminders;
    }
  })();

  const renderRoute = () => {
    if (!me)
      return <div className="text-center text-tg-hint py-20">{s.ui_loading}</div>;
    switch (route.kind) {
      case "main":
        return (
          <MainView
            me={me}
            onMe={onMe}
            onOpenAdmin={() => setRoute({ kind: "admin" })}
            onOpenMyReminders={() => setRoute({ kind: "my-reminders" })}
          />
        );
      case "admin":
        return (
          <AdminView
            onOpenSection={(section) =>
              setRoute({ kind: "admin-section", section })
            }
          />
        );
      case "admin-section":
        return (
          <AdminSectionView
            section={route.section}
            onEditUser={(id, from) =>
              setRoute({ kind: "user-edit", userId: id, from })
            }
            onEditChat={(id, from) =>
              setRoute({ kind: "chat-edit", chatId: id, from })
            }
          />
        );
      case "user-edit":
        return <UserEditView userId={route.userId} />;
      case "chat-edit":
        return <ChatEditView chatId={route.chatId} />;
      case "my-reminders":
        return (
          <RemindersList
            fetchReminders={api.listMyReminders}
            header={s.ui_reminders_upcoming}
            emptyText={s.ui_reminders_empty_my}
            footer={s.ui_reminders_footer_my}
            showUserId={false}
          />
        );
    }
  };

  return (
    <div className="mx-auto max-w-[640px] px-3 pt-4 pb-8">
      <div className="px-1 pt-2 pb-4 text-xl font-semibold">{title}</div>
      {renderRoute()}
    </div>
  );
}

function App() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    api.getMe().then(setMe);
  }, []);

  const tg = window.Telegram?.WebApp;
  const tgCode = tg?.initDataUnsafe?.user?.language_code;
  const lang: Lang = resolveLang(me?.language ?? null, tgCode);

  return (
    <I18nProvider lang={lang}>
      <AppShell me={me} onMe={setMe} />
    </I18nProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
