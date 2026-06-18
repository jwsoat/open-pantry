"use client";

import { useState } from "react";

const DEFAULT_BASE = "https://api.pricehunter.nz/v1";

interface Status {
  ok: boolean;
  msg: string;
}

interface TestSuccessBody {
  ok: true;
  sample: { id: string; title: string } | null;
}

interface TestFailureBody {
  ok: false;
  error: string;
  status: number | null;
}

type TestBody = TestSuccessBody | TestFailureBody;

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      setStatus(
        res.ok
          ? { ok: true, msg: "Saved." }
          : { ok: false, msg: "Save failed — check the values and try again." },
      );
    } catch {
      setStatus({ ok: false, msg: "Save failed — could not reach the server." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/test-connection", { method: "POST" });
      const body = (await res.json().catch(() => null)) as TestBody | null;
      if (!body) {
        setStatus({ ok: false, msg: "Connection test failed (no response)." });
        return;
      }
      if (body.ok) {
        const sampleTitle = body.sample?.title;
        setStatus({
          ok: true,
          msg: sampleTitle
            ? `Connected to Pricehunter ✓  (sample: ${sampleTitle})`
            : "Connected to Pricehunter ✓",
        });
      } else {
        setStatus({
          ok: false,
          msg: body.status != null ? `${body.error} (${body.status})` : body.error,
        });
      }
    } catch {
      setStatus({ ok: false, msg: "Connection test failed — could not reach the server." });
    } finally {
      setTesting(false);
    }
  }

  const busy = saving || testing;

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "2rem auto",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
        color: "#1f2937",
      }}
    >
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      <p style={{ color: "#4b5563" }}>
        Connect Open Pantry to Pricehunter to enrich shopping list items with
        cheapest-store prices and product photos. Leave blank to stay fully
        local — Open Pantry will make no external calls.
      </p>

      <label style={{ display: "block", marginTop: "1.5rem", fontWeight: 600 }}>
        Pricehunter API URL
        <input
          style={{
            display: "block",
            width: "100%",
            marginTop: "0.25rem",
            padding: "0.5rem",
            fontSize: "1rem",
            fontFamily: "inherit",
            border: "1px solid #d1d5db",
            borderRadius: 6,
          }}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>

      <label style={{ display: "block", marginTop: "1rem", fontWeight: 600 }}>
        API key
        <input
          style={{
            display: "block",
            width: "100%",
            marginTop: "0.25rem",
            padding: "0.5rem",
            fontSize: "1rem",
            fontFamily: "inherit",
            border: "1px solid #d1d5db",
            borderRadius: 6,
          }}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="ph_…"
        />
        <span style={{ display: "block", marginTop: "0.25rem", fontWeight: 400, fontSize: "0.85rem", color: "#6b7280" }}>
          Get a free key from{" "}
          <a
            href="https://jwsoat.com/settings/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            jwsoat.com
          </a>
          .
        </span>
      </label>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={handleSave}
          disabled={busy}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            borderRadius: 6,
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "white",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={handleTest}
          disabled={busy}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: "white",
            color: "#1f2937",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>

      {status && (
        <p
          role="status"
          style={{
            marginTop: "1.5rem",
            padding: "0.75rem",
            borderRadius: 6,
            background: status.ok ? "#ecfdf5" : "#fef2f2",
            color: status.ok ? "#065f46" : "#991b1b",
            border: `1px solid ${status.ok ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {status.msg}
        </p>
      )}
    </main>
  );
}
