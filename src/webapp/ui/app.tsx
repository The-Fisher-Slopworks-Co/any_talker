/// <reference lib="dom" />
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api } from "./api-client";
import type { Settings, WhitelistEntry, BucketState } from "../../shared/types";

type Tab = "prompt" | "ratelimit" | "whitelist";

function SectionHeader({ children }: { children: ReactNode }) {
  return <div className="tg-section-header">{children}</div>;
}

function SectionFooter({ children }: { children: ReactNode }) {
  return <div className="tg-section-footer">{children}</div>;
}

function Card({ children }: { children: ReactNode }) {
  return <div className="tg-card">{children}</div>;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`tg-toggle ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    />
  );
}

function PromptTab({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const [model, setModel] = useState(settings.model);
  const [prompt, setPrompt] = useState(settings.systemPrompt);
  const [saving, setSaving] = useState(false);

  const dirty = model !== settings.model || prompt !== settings.systemPrompt;

  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ model, systemPrompt: prompt });
    onSaved(next);
    setSaving(false);
  };

  return (
    <div className="tg-stack">
      <SectionHeader>Model</SectionHeader>
      <Card>
        <div className="tg-row">
          <input
            className="tg-input left tg-mono"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="anthropic/claude-sonnet-4-5"
          />
        </div>
      </Card>
      <SectionFooter>OpenRouter model ID.</SectionFooter>

      <SectionHeader>System Prompt</SectionHeader>
      <Card>
        <textarea
          className="tg-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="You are a helpful assistant…"
        />
      </Card>
      <SectionFooter>Sent as the system message on every /ask request.</SectionFooter>

      <div style={{ marginTop: 16 }}>
        <button className="tg-button" disabled={saving || !dirty} onClick={save}>
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>
    </div>
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
    <div className="tg-stack">
      <SectionHeader>Limits</SectionHeader>
      <Card>
        <label className="tg-row">
          <span className="tg-row-label">Capacity</span>
          <input
            type="number"
            className="tg-input"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label className="tg-row">
          <span className="tg-row-label">Refill amount</span>
          <input
            type="number"
            className="tg-input"
            value={refillAmount}
            onChange={(e) => setRefillAmount(Number(e.target.value))}
          />
        </label>
        <label className="tg-row">
          <span className="tg-row-label">Refill every</span>
          <input
            type="number"
            className="tg-input"
            value={refillIntervalMin}
            onChange={(e) => setRefillIntervalMin(Number(e.target.value))}
          />
          <span className="tg-row-value" style={{ flex: "0 0 auto" }}>
            min
          </span>
        </label>
        <div className="tg-row">
          <span className="tg-row-label">Owner exempt</span>
          <span className="tg-row-value" style={{ flex: 1 }} />
          <Toggle value={ownerExempt} onChange={setOwnerExempt} />
        </div>
      </Card>
      <SectionFooter>
        Tokens are deducted from each user's bucket per /ask. The bucket lazily refills based on
        the interval.
      </SectionFooter>

      <div style={{ marginTop: 16 }}>
        <button className="tg-button" disabled={saving || !dirty} onClick={save}>
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      <SectionHeader>My Bucket</SectionHeader>
      <Card>
        {bucket ? (
          <>
            <div className="tg-row">
              <span className="tg-row-label">Tokens</span>
              <span className="tg-row-value">
                {bucket.tokens.toLocaleString()} / {capacity.toLocaleString()}
              </span>
            </div>
            <div className="tg-row">
              <span className="tg-row-label">Last refill</span>
              <span className="tg-row-value">
                {new Date(bucket.lastRefillTs).toLocaleString()}
              </span>
            </div>
            <button className="tg-button-row" onClick={reset}>
              Reset to capacity
            </button>
          </>
        ) : (
          <div className="tg-empty">No bucket yet — will be seeded on first /ask.</div>
        )}
      </Card>
    </div>
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
          <div className="tg-empty">No entries</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="tg-row">
              <span className="tg-row-label tg-mono">{e.id}</span>
              <span className="tg-row-value">{e.label ?? ""}</span>
              <button
                className="tg-button-destructive"
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
        <div className="tg-row">
          <input
            className="tg-input left tg-mono"
            placeholder={kind === "users" ? "User ID" : "Chat ID (e.g. -100…)"}
            value={id}
            onChange={(e) => setId(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="tg-row">
          <input
            className="tg-input left"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <button
          className="tg-button-row"
          onClick={submit}
          disabled={!id.trim() || busy}
          style={!id.trim() || busy ? { opacity: 0.5 } : undefined}
        >
          {busy ? "Adding…" : "Add"}
        </button>
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

  if (!loaded) return <div className="tg-loading">Loading…</div>;

  return (
    <div className="tg-stack">
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
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("prompt");
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    api.getSettings().then(setSettings);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "ratelimit", label: "Limits" },
    { id: "whitelist", label: "Whitelist" },
  ];

  return (
    <div className="tg-page">
      <div className="tg-title">Bot Admin</div>
      <div className="tg-tabs" role="tablist">
        <div
          className="tg-tab-indicator"
          style={{
            width: `calc((100% - 6px) / ${tabs.length})`,
            transform: `translateX(${tabs.findIndex((t) => t.id === tab) * 100}%)`,
          }}
        />
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`tg-tab ${tab === t.id ? "active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!settings ? (
        <div className="tg-loading">Loading…</div>
      ) : tab === "prompt" ? (
        <PromptTab settings={settings} onSaved={setSettings} />
      ) : tab === "ratelimit" ? (
        <RateLimitTab settings={settings} onSaved={setSettings} />
      ) : (
        <WhitelistTab />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
