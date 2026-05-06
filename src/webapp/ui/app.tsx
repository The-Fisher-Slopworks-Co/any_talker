/// <reference lib="dom" />
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Tab = "prompt" | "model" | "ratelimit" | "whitelist";

function App() {
  const [tab, setTab] = useState<Tab>("prompt");
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
        {tab === "prompt" && <div>Prompt editor coming up.</div>}
        {tab === "model" && <div>Model editor coming up.</div>}
        {tab === "ratelimit" && <div>Rate-limit editor coming up.</div>}
        {tab === "whitelist" && <div>Whitelist editor coming up.</div>}
      </section>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
