/// <reference lib="dom" />
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api } from "./api-client";
import type { Settings } from "../../shared/types";

type Tab = "prompt" | "model" | "ratelimit" | "whitelist";

function PromptTab({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [value, setValue] = useState(settings.systemPrompt);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ systemPrompt: value });
    onSaved(next);
    setSaving(false);
  };
  return (
    <div className="space-y-3">
      <label className="block font-semibold">System Prompt</label>
      <textarea
        className="w-full h-48 border rounded p-2 font-mono text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function ModelTab({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [value, setValue] = useState(settings.model);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const next = await api.putSettings({ model: value });
    onSaved(next);
    setSaving(false);
  };
  return (
    <div className="space-y-3">
      <label className="block font-semibold">Model (OpenRouter ID)</label>
      <input
        className="w-full border rounded p-2 font-mono text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="anthropic/claude-sonnet-4-5"
      />
      <p className="text-sm text-gray-500">
        Examples: anthropic/claude-sonnet-4-5, openai/gpt-4o-mini, google/gemini-pro-1.5
      </p>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving..." : "Save"}
      </button>
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
  const [bucket, setBucket] = useState<{ tokens: number; lastRefillTs: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyBucket().then((r) => setBucket(r.bucket));
  }, []);

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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-semibold">Capacity</span>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="font-semibold">Refill amount</span>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={refillAmount}
            onChange={(e) => setRefillAmount(Number(e.target.value))}
          />
        </label>
        <label className="block col-span-2">
          <span className="font-semibold">Refill interval (minutes)</span>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={refillIntervalMin}
            onChange={(e) => setRefillIntervalMin(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 col-span-2">
          <input
            type="checkbox"
            checked={ownerExempt}
            onChange={(e) => setOwnerExempt(e.target.checked)}
          />
          <span>Owner exempt from rate limit</span>
        </label>
      </div>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving..." : "Save"}
      </button>

      <hr />
      <h2 className="font-semibold">My bucket</h2>
      {bucket ? (
        <p>
          Tokens: <b>{bucket.tokens}</b> / {capacity} — last refill{" "}
          {new Date(bucket.lastRefillTs).toLocaleString()}
        </p>
      ) : (
        <p className="text-gray-500">No bucket yet (will be seeded on first /ask).</p>
      )}
      <button
        className="px-4 py-2 bg-gray-200 rounded"
        onClick={reset}
      >
        Reset to capacity
      </button>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("prompt");
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    api.getSettings().then(setSettings);
  }, []);

  if (!settings) return <div className="p-4">Loading...</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "model", label: "Model" },
    { id: "ratelimit", label: "Rate Limit" },
    { id: "whitelist", label: "Whitelist" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Bot Admin</h1>
      <nav className="flex gap-2 mb-4 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 ${tab === t.id ? "border-b-2 border-blue-500 font-semibold" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <section>
        {tab === "prompt" && <PromptTab settings={settings} onSaved={setSettings} />}
        {tab === "model" && <ModelTab settings={settings} onSaved={setSettings} />}
        {tab === "ratelimit" && <RateLimitTab settings={settings} onSaved={setSettings} />}
        {tab === "whitelist" && <div>Whitelist editor coming up.</div>}
      </section>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
