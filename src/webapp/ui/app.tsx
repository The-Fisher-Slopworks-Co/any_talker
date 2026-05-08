/// <reference lib="dom" />
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, type MeResponse } from "./api-client";
import {
  fetchOpenRouterModels,
  lookupOpenRouterModel,
  formatPricePerMillion,
  supportsCaching,
  supportsTools,
  type OpenRouterModel,
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
} from "../../shared/types";
import {
  getTimezoneAreas,
  getTimezoneLocations,
  splitTimezone,
} from "./timezones";

type Tab = "prompt" | "ratelimit" | "whitelist" | "users" | "chats";
type Route =
  | { kind: "main" }
  | { kind: "admin" }
  | { kind: "user-edit"; userId: string }
  | { kind: "chat-edit"; chatId: string };

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

function MainView({
  me,
  onMe,
  onOpenAdmin,
}: {
  me: MeResponse;
  onMe: (m: MeResponse) => void;
  onOpenAdmin: () => void;
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

function ModelInfo({ model }: { model: OpenRouterModel | null | undefined }) {
  if (model === undefined)
    return <span className="text-tg-hint">Loading model info…</span>;
  if (model === null)
    return <span className="text-tg-hint">Unknown model ID.</span>;

  const inputPrice = formatPricePerMillion(model.pricing.prompt);
  const outputPrice = formatPricePerMillion(model.pricing.completion);
  const imagePrice = formatPricePerMillion(model.pricing.image);
  const modalities = model.architecture?.input_modalities ?? [];
  const tools = supportsTools(model);
  const caching = supportsCaching(model);

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-tg-text">{model.name}</div>
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
}: {
  models: string[];
  onChange: (next: string[]) => void;
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
                <ModelInfo model={info} />
              </div>
            )}
          </div>
        );
      })}
      <RowButton onClick={addFallback}>Add fallback</RowButton>
    </Card>
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
  const [saving, setSaving] = useState(false);

  const trimmed = models.map((m) => m.trim()).filter((m) => m.length > 0);
  const modelsDirty =
    trimmed.length !== settings.models.length ||
    trimmed.some((m, i) => m !== settings.models[i]);
  const dirty =
    modelsDirty ||
    prompt !== settings.systemPrompt ||
    timezone !== settings.timezone;
  const canSave = dirty && trimmed.length > 0;

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({
      models: trimmed,
      systemPrompt: prompt,
      timezone,
    });
    onSaved(next);
    setModels(next.models);
    setTimezone(next.timezone);
    setSaving(false);
  };

  return (
    <Stack>
      <SectionHeader>Models</SectionHeader>
      <ModelsCard models={models} onChange={setModels} />
      <SectionFooter>
        Primary OpenRouter model first; fallbacks are tried in order if it fails.
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
  onAdd,
  onRemove,
}: {
  kind: "users" | "chats";
  entries: WhitelistEntry[];
  onAdd: (e: WhitelistEntry) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!id.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd({ id: id.trim(), label: label.trim() || undefined });
      setId("");
      setLabel("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeader>{kind === "users" ? "Allowed Users" : "Allowed Chats"}</SectionHeader>
      <Card>
        {entries.length === 0 ? (
          <div className="px-4 py-3.5 text-center text-tg-hint text-[15px]">No entries</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className={ROW_CLS}>
              <span className="shrink-0 font-mono text-sm">{e.id}</span>
              <span className={ROW_VALUE_CLS}>{e.label ?? ""}</span>
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

      <SectionHeader>Add {kind === "users" ? "User" : "Chat"}</SectionHeader>
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>ID</span>
          <input
            className={INPUT_CLS}
            placeholder={kind === "users" ? "123456789" : "-1001234567890"}
            value={id}
            onChange={(e) => setId(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Name</span>
          <input
            className={INPUT_CLS}
            placeholder="Optional"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <RowButton onClick={submit} disabled={!id.trim() || busy}>
          {busy ? "Adding…" : `Add ${kind === "users" ? "User" : "Chat"}`}
        </RowButton>
      </Card>
    </>
  );
}

function WhitelistTab() {
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
        onAdd={async (e) => setUsers(await api.addWhitelist("users", e))}
        onRemove={async (id) => setUsers(await api.removeWhitelist("users", id))}
      />
      <WhitelistList
        kind="chats"
        entries={chats}
        onAdd={async (e) => setChats(await api.addWhitelist("chats", e))}
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
  const [data, setData] = useState<{ user: User; displayName: string | null } | null>(
    null,
  );
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

  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAdminChat(chatId)])
      .then(([g, d]) => {
        setGlobal(g);
        setChat(d.chat);
        setOriginal(d.settings);
        setPromptOverride(d.settings.systemPrompt !== undefined);
        setPromptValue(d.settings.systemPrompt ?? g.systemPrompt);
        setModelsOverride(d.settings.models !== undefined);
        setModelsValue(d.settings.models ?? g.models);
        setRlOverride(d.settings.rateLimit !== undefined);
        setRlValue(d.settings.rateLimit ?? g.rateLimit);
        setBotNameValue(d.settings.botName ?? "");
        setTzOverride(d.settings.timezone !== undefined);
        setTzValue(d.settings.timezone ?? g.timezone);
      })
      .catch(() => setNotFound(true));
  }, [chatId]);

  if (notFound)
    return <div className="text-center text-tg-hint py-20">Chat not found.</div>;
  if (!chat || !global || !original || !rlValue)
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
    return next;
  };

  const payload = buildPayload();
  const wasOverridden = (key: keyof ChatSettings) => original[key] !== undefined;
  const dirty =
    promptOverride !== wasOverridden("systemPrompt") ||
    modelsOverride !== wasOverridden("models") ||
    rlOverride !== wasOverridden("rateLimit") ||
    tzOverride !== wasOverridden("timezone") ||
    (promptOverride && payload.systemPrompt !== original.systemPrompt) ||
    (modelsOverride &&
      JSON.stringify(payload.models) !== JSON.stringify(original.models)) ||
    (rlOverride &&
      JSON.stringify(payload.rateLimit) !== JSON.stringify(original.rateLimit)) ||
    (tzOverride && payload.timezone !== original.timezone) ||
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
        <ModelsCard models={modelsValue} onChange={setModelsValue} />
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

      <PrimaryButton disabled={saving || !canSave} onClick={save}>
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </PrimaryButton>
    </Stack>
  );
}

function AdminView({
  onEditUser,
  onEditChat,
}: {
  onEditUser: (id: string) => void;
  onEditChat: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("prompt");
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "ratelimit", label: "Limits" },
    { id: "whitelist", label: "Whitelist" },
    { id: "users", label: "Users" },
    { id: "chats", label: "Chats" },
  ];
  const activeIdx = tabs.findIndex((t) => t.id === tab);

  const renderTab = () => {
    if (tab === "whitelist") return <WhitelistTab />;
    if (tab === "users") return <UsersTab onEdit={onEditUser} />;
    if (tab === "chats") return <ChatsTab onEdit={onEditChat} />;
    if (!settings)
      return <div className="text-center text-tg-hint py-20">Loading…</div>;
    if (tab === "prompt")
      return <PromptTab settings={settings} onSaved={setSettings} />;
    return <RateLimitTab settings={settings} onSaved={setSettings} />;
  };

  return (
    <>
      <div
        className="relative flex bg-tg-section rounded-[10px] p-[3px] mb-5 shadow-[0_0_0_1px_var(--tg-separator)]"
        role="tablist"
      >
        <div
          className="absolute top-[3px] bottom-[3px] left-[3px] z-0 pointer-events-none bg-tg-button rounded-lg transition-transform duration-[180ms] ease-tg-spring"
          style={{
            width: `calc((100% - 6px) / ${tabs.length})`,
            transform: `translateX(${activeIdx * 100}%)`,
          }}
        />
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="relative z-10 flex-1 border-0 bg-transparent px-1.5 py-2 rounded-lg text-tg-text text-[13px] font-medium cursor-pointer transition-colors aria-selected:text-tg-button-text"
          >
            {t.label}
          </button>
        ))}
      </div>

      {renderTab()}
    </>
  );
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
      setRoute((r) =>
        r.kind === "user-edit" || r.kind === "chat-edit"
          ? { kind: "admin" }
          : { kind: "main" },
      );
    };
    btn.show();
    btn.onClick(handler);
    return () => {
      btn.offClick(handler);
      btn.hide();
    };
  }, [route.kind]);

  const ROUTE_TITLE: Record<Route["kind"], string> = {
    main: "Settings",
    admin: "Bot Admin",
    "user-edit": "User Settings",
    "chat-edit": "Chat Settings",
  };
  const title = ROUTE_TITLE[route.kind];

  const renderRoute = () => {
    if (!me) return <div className="text-center text-tg-hint py-20">Loading…</div>;
    switch (route.kind) {
      case "main":
        return (
          <MainView
            me={me}
            onMe={setMe}
            onOpenAdmin={() => setRoute({ kind: "admin" })}
          />
        );
      case "admin":
        return (
          <AdminView
            onEditUser={(id) => setRoute({ kind: "user-edit", userId: id })}
            onEditChat={(id) => setRoute({ kind: "chat-edit", chatId: id })}
          />
        );
      case "user-edit":
        return <UserEditView userId={route.userId} />;
      case "chat-edit":
        return <ChatEditView chatId={route.chatId} />;
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
