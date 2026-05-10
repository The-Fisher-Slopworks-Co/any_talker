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
  type BucketState,
  type User,
  type Chat,
  type ChatSettings,
  type RateLimitConfig,
  type ProviderSort,
} from "../../shared/types";
import type { Reminder } from "../../reminders/types";
import {
  getTimezoneAreas,
  getTimezoneLocations,
  splitTimezone,
} from "./timezones";

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
  | { kind: "user-edit"; userId: string }
  | { kind: "chat-edit"; chatId: string }
  | { kind: "my-reminders" };

const ADMIN_SECTIONS: {
  id: AdminSection;
  label: string;
  description: string;
}[] = [
  {
    id: "prompt",
    label: "Prompt",
    description: "Models, character, timezone, provider routing",
  },
  {
    id: "ratelimit",
    label: "Limits",
    description: "Token-bucket capacity and refill",
  },
  {
    id: "whitelist",
    label: "Whitelist",
    description: "Allowed users and chats",
  },
  {
    id: "users",
    label: "Users",
    description: "All users the bot has seen",
  },
  {
    id: "chats",
    label: "Chats",
    description: "All chats and per-chat overrides",
  },
  {
    id: "reminders",
    label: "Reminders",
    description: "Pending reminders for everyone",
  },
];

function adminSectionTitle(section: AdminSection): string {
  return ADMIN_SECTIONS.find((s) => s.id === section)?.label ?? "";
}

function chatTitle(c: Chat): string {
  if (c.title && c.title.length > 0) return c.title;
  if (c.username) return `@${c.username}`;
  if (c.type === "private") return "Private chat";
  return `id:${c.id}`;
}

function chatSubtitle(c: Chat): string {
  return c.username && c.title ? `${c.type} · @${c.username}` : c.type;
}

function userDisplayName(u: User): string {
  return composeFullName(u.firstName, u.lastName) || `id:${u.id}`;
}

function reminderTargetLabel(
  r: Reminder,
  chats: Record<string, Chat>,
): string {
  if (r.target.kind === "guest_dm") return "DM";
  const chat = chats[r.target.chatId];
  if (chat) return chatTitle(chat);
  return `chat ${r.target.chatId}`;
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
  kind: "users" | "chats";
  id: string;
  label: string;
  initial: boolean;
}) {
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
      {busy ? "Updating…" : whitelisted ? "Remove from whitelist" : "Add to whitelist"}
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
                {reminderTargetLabel(r, chats)}
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
  const [data, setData] = useState<RemindersResponse | null>(null);

  useEffect(() => {
    fetchReminders().then(setData);
  }, [fetchReminders]);

  if (data === null)
    return <div className="text-center text-tg-hint py-20">Loading…</div>;

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
  const [name, setName] = useState(me.displayName ?? "");
  const [tzOverride, setTzOverride] = useState(me.timezone !== null);
  const [tzValue, setTzValue] = useState(me.timezone ?? "UTC");
  const [saving, setSaving] = useState(false);

  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;
  const tgName = tgUser ? composeFullName(tgUser.first_name, tgUser.last_name) : "";

  const desiredTz = tzOverride ? tzValue : null;
  const dirty =
    name.trim() !== (me.displayName ?? "") || desiredTz !== me.timezone;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putMe({
        displayName: name.trim() || null,
        timezone: desiredTz,
      });
      onMe(next);
      setName(next.displayName ?? "");
      setTzOverride(next.timezone !== null);
      setTzValue(next.timezone ?? "UTC");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>Display Name</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Name</span>
          <input
            className={INPUT_CLS}
            placeholder={tgName || "Your name"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>Name shown to the AI.</SectionFooter>

      <SectionHeader>Timezone</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Use my timezone</span>
          <span className="flex-1" />
          <Toggle value={tzOverride} onChange={setTzOverride} />
        </div>
      </Card>
      {tzOverride ? (
        <TimezoneSelect value={tzValue} onChange={setTzValue} />
      ) : null}
      <SectionFooter>
        Sent to the AI as the current date/time. Off uses the chat or global
        timezone.
      </SectionFooter>

      <PrimaryButton disabled={saving || !dirty} onClick={save}>
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </PrimaryButton>

      <SectionHeader>Reminders</SectionHeader>
      <Card>
        <RowButton onClick={onOpenMyReminders}>My reminders</RowButton>
      </Card>

      {me.isOwner && (
        <>
          <SectionHeader>Bot Configuration</SectionHeader>
          <Card>
            <RowButton onClick={onOpenAdmin}>Admin panel</RowButton>
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
    return <span className="text-tg-hint">Loading model info…</span>;
  if (model === null)
    return <span className="text-tg-hint">Unknown model ID.</span>;

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
            ? "Resolving provider…"
            : endpoint === null
              ? `No provider data for sort=${providerSort}; showing catalog values.`
              : `Provider: ${endpoint.provider_name}`}
          {endpoint && providerSort === "throughput" && endpoint.throughput !== null && (
            <> · {Math.round(endpoint.throughput)} tok/s</>
          )}
          {endpoint && providerSort === "latency" && endpoint.latency !== null && (
            <> · {Math.round(endpoint.latency)} ms</>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {inputPrice && (
          <span>
            <span className="text-tg-hint">Input</span> {inputPrice}
          </span>
        )}
        {outputPrice && (
          <span>
            <span className="text-tg-hint">Output</span> {outputPrice}
          </span>
        )}
        {imagePrice && (
          <span>
            <span className="text-tg-hint">Image</span> {imagePrice}
          </span>
        )}
      </div>
      {modalities.length > 0 && (
        <div>
          <span className="text-tg-hint">Modalities</span> {modalities.join(", ")}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3">
        <span>
          <span className="text-tg-hint">Tools</span> {tools ? "yes" : "no"}
        </span>
        <span>
          <span className="text-tg-hint">Caching</span> {caching ? "yes" : "no"}
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
  const [catalog, setCatalog] = useState<Map<string, OpenRouterModel> | null>(null);

  useEffect(() => {
    fetchOpenRouterModels()
      .then(setCatalog)
      .catch(() => setCatalog(new Map()));
  }, []);

  const lookupModel = (id: string): OpenRouterModel | null | undefined => {
    const t = id.trim();
    if (t.length === 0) return null;
    if (catalog === null) return undefined;
    return lookupOpenRouterModel(catalog, t);
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
                {idx === 0 ? "Primary" : `#${idx + 1}`}
              </span>
              <input
                className={INPUT_LEFT_CLS}
                value={m}
                onChange={(e) => updateAt(idx, e.target.value)}
                placeholder="Model ID"
              />
              {idx > 0 && (
                <button
                  className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                  onClick={() => removeAt(idx)}
                  aria-label="Remove fallback"
                >
                  Remove
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
      <RowButton onClick={addFallback}>Add fallback</RowButton>
    </Card>
  );
}

const PROVIDER_SORT_OPTIONS: {
  value: ProviderSort | null;
  label: string;
}[] = [
  { value: null, label: "Default" },
  { value: "price", label: "Price" },
  { value: "throughput", label: "Throughput" },
  { value: "latency", label: "Latency" },
];

function ProviderSortField({
  value,
  onChange,
}: {
  value: ProviderSort | null;
  onChange: (next: ProviderSort | null) => void;
}) {
  const activeIdx = PROVIDER_SORT_OPTIONS.findIndex((o) => o.value === value);
  return (
    <div
      className="relative flex bg-tg-section rounded-[10px] p-[3px] shadow-[0_0_0_1px_var(--tg-separator)]"
      role="radiogroup"
    >
      <div
        className="absolute top-[3px] bottom-[3px] left-[3px] z-0 pointer-events-none bg-tg-button rounded-lg transition-transform duration-[180ms] ease-tg-spring"
        style={{
          width: `calc((100% - 6px) / ${PROVIDER_SORT_OPTIONS.length})`,
          transform: `translateX(${activeIdx * 100}%)`,
        }}
      />
      {PROVIDER_SORT_OPTIONS.map((o) => (
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
  const intervalMin = Math.round(value.refillIntervalMs / 60000);
  return (
    <Card>
      <label className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>Capacity</span>
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
        <span className={ROW_LABEL_CLS}>Refill amount</span>
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
        <span className={ROW_LABEL_CLS}>Refill every</span>
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
        <span className="shrink-0 text-tg-hint text-[15px]">min</span>
      </label>
      <div className={ROW_CLS}>
        <span className={ROW_LABEL_CLS}>Owner exempt</span>
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
        <span className={ROW_LABEL_CLS}>Area</span>
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
        <span className={ROW_LABEL_CLS}>Location</span>
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
      <SectionHeader>Models</SectionHeader>
      <ModelsCard
        models={models}
        onChange={setModels}
        providerSort={providerSort}
      />
      <SectionFooter>
        Primary OpenRouter model first; fallbacks are tried in order if it fails.
      </SectionFooter>

      <SectionHeader>Provider Routing</SectionHeader>
      <ProviderSortField value={providerSort} onChange={setProviderSort} />
      <SectionFooter>
        How OpenRouter picks a provider for the model.
        Default lets OpenRouter decide; the others sort by price, throughput, or latency.
      </SectionFooter>

      <SectionHeader>System Prompt</SectionHeader>
      <Card>
        <textarea
          className="block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe how the bot should behave"
        />
      </Card>
      <SectionFooter>
        Character description embedded into the system instruction.
      </SectionFooter>

      <SectionHeader>Timezone</SectionHeader>
      <TimezoneSelect value={timezone} onChange={setTimezone} />
      <SectionFooter>
        Default timezone used when the chat or user has no override.
      </SectionFooter>

      <PrimaryButton disabled={saving || !canSave} onClick={save}>
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </PrimaryButton>
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
      <SectionHeader>Limits</SectionHeader>
      <RateLimitFields value={config} onChange={setConfig} />
      <SectionFooter>
        Tokens are deducted from each user's bucket per /ask. The bucket lazily refills based on
        the interval.
      </SectionFooter>

      <PrimaryButton disabled={saving || !dirty} onClick={save}>
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </PrimaryButton>

      <SectionHeader>My Bucket</SectionHeader>
      <Card>
        {bucket ? (
          <>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>Tokens</span>
              <span className={ROW_VALUE_CLS}>
                {bucket.tokens.toLocaleString()} / {config.capacity.toLocaleString()}
              </span>
            </div>
            <div className={ROW_CLS}>
              <span className={ROW_LABEL_CLS}>Last refill</span>
              <span className={ROW_VALUE_CLS}>
                {new Date(bucket.lastRefillTs).toLocaleString()}
              </span>
            </div>
            <RowButton onClick={reset}>Reset to capacity</RowButton>
          </>
        ) : (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
            No bucket yet — will be seeded on first /ask.
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
  kind: "users" | "chats";
  entries: WhitelistEntry[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <>
      <SectionHeader>{kind === "users" ? "Allowed Users" : "Allowed Chats"}</SectionHeader>
      <Card>
        {entries.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">No entries</div>
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
                Open
              </button>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-destructive cursor-pointer"
                onClick={() => onRemove(e.id)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </Card>
      <SectionFooter>
        Add entries from a {kind === "users" ? "user" : "chat"}'s page via "Add to whitelist".
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

  if (!loaded) return <div className="text-center text-tg-hint py-20">Loading…</div>;

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
  const [users, setUsers] = useState<User[] | null>(null);

  useEffect(() => {
    api.listAdminUsers().then((r) => setUsers(r.users));
  }, []);

  if (users === null)
    return <div className="text-center text-tg-hint py-20">Loading…</div>;

  return (
    <Stack>
      <SectionHeader>All Users</SectionHeader>
      <Card>
        {users.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
            No users yet — they appear after their first message.
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
                Open
              </button>
              <button
                className="bg-transparent border-0 px-2 py-1.5 text-[15px] text-tg-link cursor-pointer"
                onClick={() => onEdit(u.id)}
              >
                Edit
              </button>
            </div>
          ))
        )}
      </Card>
      <SectionFooter>
        Users are recorded automatically the first time they message the bot.
      </SectionFooter>
    </Stack>
  );
}

function UserEditView({ userId }: { userId: string }) {
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
    return <div className="text-center text-tg-hint py-20">User not found.</div>;
  if (!data) return <div className="text-center text-tg-hint py-20">Loading…</div>;

  const { user } = data;
  const fallbackName = userDisplayName(user);
  const dirty = name.trim() !== (data.displayName ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putAdminUser(userId, name.trim() || null);
      setData(next);
      setName(next.displayName ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <SectionHeader>Profile</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Name</span>
          <span className={ROW_VALUE_CLS}>{fallbackName}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Username</span>
          <span className={ROW_VALUE_CLS}>
            {user.username ? `@${user.username}` : "—"}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>ID</span>
          <span className={ROW_VALUE_CLS}>{user.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Last seen</span>
          <span className={ROW_VALUE_CLS}>
            {new Date(user.lastSeenAt).toLocaleString()}
          </span>
        </div>
        <RowButton onClick={() => openTelegramProfile(user)}>
          Open in Telegram
        </RowButton>
        <WhitelistToggleButton
          kind="users"
          id={user.id}
          label={fallbackName}
          initial={data.whitelisted}
        />
      </Card>

      <SectionHeader>Display Name</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Name</span>
          <input
            className={INPUT_CLS}
            placeholder={fallbackName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <SectionFooter>Override the name shown to the AI for this user.</SectionFooter>

      <PrimaryButton disabled={saving || !dirty} onClick={save}>
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </PrimaryButton>
    </Stack>
  );
}

function ChatsTab({ onEdit }: { onEdit: (id: string) => void }) {
  const [chats, setChats] = useState<Chat[] | null>(null);

  useEffect(() => {
    api.listAdminChats().then((r) => setChats(r.chats));
  }, []);

  if (chats === null)
    return <div className="text-center text-tg-hint py-20">Loading…</div>;

  return (
    <Stack>
      <SectionHeader>All Chats</SectionHeader>
      <Card>
        {chats.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">
            No chats yet — they appear after the first message.
          </div>
        ) : (
          chats.map((c) => (
            <button
              key={c.id}
              onClick={() => onEdit(c.id)}
              className={`${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{chatTitle(c)}</div>
                <div className="text-[13px] text-tg-hint truncate">
                  {chatSubtitle(c)}
                </div>
              </div>
              <span className="text-tg-hint text-[15px]">›</span>
            </button>
          ))
        )}
      </Card>
      <SectionFooter>
        Per-chat overrides apply on top of the global Prompt / Limits / Models.
      </SectionFooter>
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
  return (
    <>
      <SectionHeader>{title}</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Override global</span>
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
  const [whitelisted, setWhitelisted] = useState<boolean | null>(null);

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
    return <div className="text-center text-tg-hint py-20">Chat not found.</div>;
  if (!chat || !global || !original || !rlValue || whitelisted === null)
    return <div className="text-center text-tg-hint py-20">Loading…</div>;

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
      <SectionHeader>Chat</SectionHeader>
      <Card>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Title</span>
          <span className={ROW_VALUE_CLS}>{chatTitle(chat)}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Type</span>
          <span className={ROW_VALUE_CLS}>{chat.type}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Username</span>
          <span className={ROW_VALUE_CLS}>
            {chat.username ? `@${chat.username}` : "—"}
          </span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>ID</span>
          <span className={ROW_VALUE_CLS}>{chat.id}</span>
        </div>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Last seen</span>
          <span className={ROW_VALUE_CLS}>
            {new Date(chat.lastSeenAt).toLocaleString()}
          </span>
        </div>
        <WhitelistToggleButton
          kind="chats"
          id={chat.id}
          label={chatTitle(chat)}
          initial={whitelisted}
        />
      </Card>

      <SectionHeader>Bot Name</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Name</span>
          <input
            className={INPUT_CLS}
            placeholder="Leave empty to disable"
            value={botNameValue}
            onChange={(e) => setBotNameValue(e.target.value)}
            maxLength={64}
          />
        </label>
      </Card>
      <SectionFooter>
        When set, every AI reply in this chat starts with the name in bold.
      </SectionFooter>

      <OverrideSection
        title="System Prompt"
        override={promptOverride}
        onToggle={setPromptOverride}
        footer={
          promptOverride
            ? "Character description for this chat."
            : `Using global character (${global.systemPrompt.length} chars).`
        }
      >
        <Card>
          <textarea
            className="block w-full box-border bg-transparent border-0 px-4 py-3 text-base min-h-[180px]"
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            placeholder="Describe how the bot should behave in this chat"
          />
        </Card>
      </OverrideSection>

      <OverrideSection
        title="Models"
        override={modelsOverride}
        onToggle={setModelsOverride}
        footer={
          modelsOverride
            ? "Primary first; fallbacks used in order if it fails."
            : `Using global: ${global.models.join(", ")}`
        }
      >
        <ModelsCard
          models={modelsValue}
          onChange={setModelsValue}
          providerSort={psOverride ? psValue : global.providerSort}
        />
      </OverrideSection>

      <OverrideSection
        title="Rate Limit"
        override={rlOverride}
        onToggle={setRlOverride}
        footer={
          rlOverride
            ? "These limits apply to this chat instead of the global config."
            : "Using global limits."
        }
      >
        <RateLimitFields value={rlValue} onChange={setRlValue} />
      </OverrideSection>

      <OverrideSection
        title="Timezone"
        override={tzOverride}
        onToggle={setTzOverride}
        footer={
          tzOverride
            ? "Used unless a user has set their own timezone."
            : `Using global timezone (${global.timezone}).`
        }
      >
        <TimezoneSelect value={tzValue} onChange={setTzValue} />
      </OverrideSection>

      <OverrideSection
        title="Provider Routing"
        override={psOverride}
        onToggle={setPsOverride}
        footer={
          psOverride
            ? "How OpenRouter picks a provider for the model in this chat."
            : `Using global routing (${global.providerSort ?? "default"}).`
        }
      >
        <ProviderSortField value={psValue} onChange={setPsValue} />
      </OverrideSection>

      <PrimaryButton disabled={saving || !canSave} onClick={save}>
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </PrimaryButton>
    </Stack>
  );
}

function AdminView({
  onOpenSection,
}: {
  onOpenSection: (section: AdminSection) => void;
}) {
  return (
    <Stack>
      <Card>
        {ADMIN_SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpenSection(s.id)}
            className={`${ROW_CLS} text-left bg-transparent border-0 cursor-pointer w-full active:bg-[var(--tg-separator)]`}
          >
            <div className="flex-1 min-w-0">
              <div className="truncate">{s.label}</div>
              <div className="text-[13px] text-tg-hint truncate">
                {s.description}
              </div>
            </div>
            <span className="text-tg-hint text-[15px]">›</span>
          </button>
        ))}
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
  onEditUser: (id: string) => void;
  onEditChat: (id: string) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const needsSettings = section === "prompt" || section === "ratelimit";

  useEffect(() => {
    if (needsSettings) api.getSettings().then(setSettings);
  }, [needsSettings]);

  if (section === "whitelist")
    return <WhitelistTab onOpenUser={onEditUser} onOpenChat={onEditChat} />;
  if (section === "users") return <UsersTab onEdit={onEditUser} />;
  if (section === "chats") return <ChatsTab onEdit={onEditChat} />;
  if (section === "reminders")
    return (
      <RemindersList
        fetchReminders={api.listAdminReminders}
        header="All Reminders"
        emptyText="No reminders scheduled by anyone."
        footer="Pending reminders across all users. Failed deliveries that hit a transient error stay until they succeed or hit a permanent failure."
        showUserId={true}
        onUserClick={onEditUser}
      />
    );
  if (!settings)
    return <div className="text-center text-tg-hint py-20">Loading…</div>;
  if (section === "prompt")
    return <PromptTab settings={settings} onSaved={setSettings} />;
  return <RateLimitTab settings={settings} onSaved={setSettings} />;
}

function App() {
  const [route, setRoute] = useState<Route>({ kind: "main" });
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    api.getMe().then(setMe);
  }, []);

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
            return { kind: "admin-section", section: "users" };
          case "chat-edit":
            return { kind: "admin-section", section: "chats" };
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
        return "Settings";
      case "admin":
        return "Bot Admin";
      case "admin-section":
        return adminSectionTitle(route.section);
      case "user-edit":
        return "User Settings";
      case "chat-edit":
        return "Chat Settings";
      case "my-reminders":
        return "My Reminders";
    }
  })();

  const renderRoute = () => {
    if (!me) return <div className="text-center text-tg-hint py-20">Loading…</div>;
    switch (route.kind) {
      case "main":
        return (
          <MainView
            me={me}
            onMe={setMe}
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
            onEditUser={(id) => setRoute({ kind: "user-edit", userId: id })}
            onEditChat={(id) => setRoute({ kind: "chat-edit", chatId: id })}
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
            header="Upcoming"
            emptyText="No reminders scheduled."
            footer="Ask the bot in chat to schedule a reminder."
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

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
