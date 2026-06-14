"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PantryEntry } from "@/lib/inventory";
import {
  PANTRY_LOCATIONS,
  LOCATION_LABEL,
  type PantryLocation,
  expiryStatus,
  formatDate,
  EXPIRY_BADGE_CLASS,
} from "@/lib/inventory-format";

async function api(method: string, body?: unknown, qs?: string): Promise<boolean> {
  const res = await fetch(`/api/pantry${qs ?? ""}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok;
}

export default function PantryBoard({ entries }: { entries: PantryEntry[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        {adding ? (
          <AddForm
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add item
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="empty">
          Your pantry is empty. Add what&apos;s in your cupboard, fridge and freezer to start
          tracking expiry dates.
        </div>
      ) : (
        <ul className="item-list spaced">
          {entries.map((e) => (
            <PantryRow key={e.id} entry={e} onChange={() => router.refresh()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<PantryLocation>("pantry");
  const [expiryDate, setExpiryDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the item a name");
      return;
    }
    setError(null);
    start(async () => {
      const ok = await api("POST", {
        name: name.trim(),
        quantity: Number(quantity) || 1,
        unit: unit.trim(),
        location,
        expiryDate: expiryDate || null,
      });
      if (ok) onDone();
      else setError("Couldn't add item");
    });
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div>
        <label className="field-label">Item</label>
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Milk 2L"
        />
      </div>
      <div className="grid-4">
        <div>
          <label className="field-label">Qty</label>
          <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Unit</label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pack, kg…" />
        </div>
        <div>
          <label className="field-label">Location</label>
          <select value={location} onChange={(e) => setLocation(e.target.value as PantryLocation)}>
            {PANTRY_LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Expiry</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add to pantry"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PantryRow({ entry, onChange }: { entry: PantryEntry; onChange: () => void }) {
  const [pending, start] = useTransition();
  const [restocked, setRestocked] = useState(false);
  const status = expiryStatus(entry.expiryDate);

  function remove() {
    start(async () => {
      await api("DELETE", undefined, `?id=${encodeURIComponent(entry.id)}`);
      onChange();
    });
  }

  function restock() {
    start(async () => {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: entry.name, quantity: 1, unit: entry.unit }),
      });
      if (res.ok) setRestocked(true);
    });
  }

  return (
    <li className="item">
      <div className="item__main">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="item__title">{entry.name}</div>
            <div className="item__meta">
              {entry.quantity}
              {entry.unit ? ` ${entry.unit}` : ""} · {LOCATION_LABEL[entry.location]}
            </div>
          </div>
          <span className={EXPIRY_BADGE_CLASS[status.kind]}>{status.label}</span>
        </div>
        <div className="item__actions">
          {entry.expiryDate && <span className="muted">Best before {formatDate(entry.expiryDate)}</span>}
          <span className="spacer" />
          <button type="button" className="link-btn link-accent" onClick={restock} disabled={pending || restocked}>
            {restocked ? "✓ On list" : "+ Add to list"}
          </button>
          <button type="button" className="link-btn link-muted link-danger" onClick={remove} disabled={pending}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
