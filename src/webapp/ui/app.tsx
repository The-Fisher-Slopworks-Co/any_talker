/// <reference lib="dom" />
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, type MeResponse } from "./api-client";
import {
  fetchOpenRouterModels,
  formatPricePerMillion,
  supportsCaching,
  supportsTools,
  type OpenRouterModel,
} from "./openrouter-models";
import type { Settings, WhitelistEntry, BucketState } from "../../shared/types";

type Tab = "prompt" | "ratelimit" | "whitelist";
type View = "main" | "admin";

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
  const [saving, setSaving] = useState(false);

  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;
  const tgName = tgUser
    ? [tgUser.first_name, tgUser.last_name]
        .filter((s): s is string => Boolean(s && s.trim().length > 0))
        .join(" ")
    : "";

  const dirty = name.trim() !== (me.displayName ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.putMe(name.trim() || null);
      onMe(next);
      setName(next.displayName ?? "");
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

function PromptTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const [models, setModels] = useState<string[]>(settings.models);
  const [prompt, setPrompt] = useState(settings.systemPrompt);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<Map<string, OpenRouterModel> | null>(null);

  useEffect(() => {
    fetchOpenRouterModels()
      .then(setCatalog)
      .catch(() => setCatalog(new Map()));
  }, []);

  const trimmed = models.map((m) => m.trim()).filter((m) => m.length > 0);
  const modelsDirty =
    trimmed.length !== settings.models.length ||
    trimmed.some((m, i) => m !== settings.models[i]);
  const dirty = modelsDirty || prompt !== settings.systemPrompt;
  const canSave = dirty && trimmed.length > 0;

  const updateAt = (idx: number, value: string) => {
    setModels((prev) => prev.map((m, i) => (i === idx ? value : m)));
  };
  const removeAt = (idx: number) => {
    setModels((prev) => prev.filter((_, i) => i !== idx));
  };
  const addFallback = () => {
    setModels((prev) => [...prev, ""]);
  };

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ models: trimmed, systemPrompt: prompt });
    onSaved(next);
    setModels(next.models);
    setSaving(false);
  };

  const lookupModel = (id: string): OpenRouterModel | null | undefined => {
    const trimmedId = id.trim();
    if (trimmedId.length === 0) return null;
    if (catalog === null) return undefined;
    return catalog.get(trimmedId) ?? null;
  };

  return (
    <Stack>
      <SectionHeader>Models</SectionHeader>
      <Card>
        {models.map((m, idx) => {
          const info = m.trim().length > 0 ? lookupModel(m) : null;
          return (
            <div
              key={idx}
              className={`row relative flex flex-col gap-2 px-4 py-[11px]`}
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
      <SectionFooter>Sent as the system message on every /ask request.</SectionFooter>

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
  const [capacity, setCapacity] = useState(settings.rateLimit.capacity);
  const [refillAmount, setRefillAmount] = useState(settings.rateLimit.refillAmount);
  const [refillIntervalMin, setRefillIntervalMin] = useState(
    Math.round(settings.rateLimit.refillIntervalMs / 60000),
  );
  const [ownerExempt, setOwnerExempt] = useState(settings.rateLimit.ownerExempt);
  const [bucket, setBucket] = useState<BucketState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyBucket().then((r) => setBucket(r.bucket));
  }, []);

  const dirty =
    capacity !== settings.rateLimit.capacity ||
    refillAmount !== settings.rateLimit.refillAmount ||
    refillIntervalMin !== Math.round(settings.rateLimit.refillIntervalMs / 60000) ||
    ownerExempt !== settings.rateLimit.ownerExempt;

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({
      rateLimit: {
        capacity,
        refillAmount,
        refillIntervalMs: refillIntervalMin * 60_000,
        ownerExempt,
      },
    });
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
      <Card>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Capacity</span>
          <input
            type="number"
            className={INPUT_CLS}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Refill amount</span>
          <input
            type="number"
            className={INPUT_CLS}
            value={refillAmount}
            onChange={(e) => setRefillAmount(Number(e.target.value))}
          />
        </label>
        <label className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Refill every</span>
          <input
            type="number"
            className={INPUT_CLS}
            value={refillIntervalMin}
            onChange={(e) => setRefillIntervalMin(Number(e.target.value))}
          />
          <span className="shrink-0 text-tg-hint text-[15px]">min</span>
        </label>
        <div className={ROW_CLS}>
          <span className={ROW_LABEL_CLS}>Owner exempt</span>
          <span className="flex-1" />
          <Toggle value={ownerExempt} onChange={setOwnerExempt} />
        </div>
      </Card>
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
                {bucket.tokens.toLocaleString()} / {capacity.toLocaleString()}
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

function AdminView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("prompt");
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton;
    if (!back) return;
    back.show();
    back.onClick(onBack);
    return () => {
      back.offClick(onBack);
      back.hide();
    };
  }, [onBack]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "ratelimit", label: "Limits" },
    { id: "whitelist", label: "Whitelist" },
  ];
  const activeIdx = tabs.findIndex((t) => t.id === tab);

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

      {!settings ? (
        <div className="text-center text-tg-hint py-20">Loading…</div>
      ) : tab === "prompt" ? (
        <PromptTab settings={settings} onSaved={setSettings} />
      ) : tab === "ratelimit" ? (
        <RateLimitTab settings={settings} onSaved={setSettings} />
      ) : (
        <WhitelistTab />
      )}
    </>
  );
}

function App() {
  const [view, setView] = useState<View>("main");
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    api.getMe().then(setMe);
  }, []);

  return (
    <div className="mx-auto max-w-[640px] px-3 pt-4 pb-8">
      <div className="px-1 pt-2 pb-4 text-xl font-semibold">
        {view === "admin" ? "Bot Admin" : "Settings"}
      </div>
      {!me ? (
        <div className="text-center text-tg-hint py-20">Loading…</div>
      ) : view === "main" ? (
        <MainView me={me} onMe={setMe} onOpenAdmin={() => setView("admin")} />
      ) : (
        <AdminView onBack={() => setView("main")} />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
