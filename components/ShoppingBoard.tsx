"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShoppingEntry } from "@/lib/inventory";

async function api(method: string, body?: unknown, qs?: string): Promise<boolean> {
  const res = await fetch(`/api/shopping-list${qs ?? ""}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok;
}

export default function ShoppingBoard({ entries }: { entries: ShoppingEntry[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const todo = entries.filter((e) => !e.checked);
  const done = entries.filter((e) => e.checked);

  return (
    <div className="stack">
      <AddForm onDone={refresh} />

      {entries.length === 0 ? (
        <div className="empty">Your shopping list is empty. Add something above to get started.</div>
      ) : null}

      {todo.length > 0 && (
        <div className="group">
          <div className="group__head">To buy ({todo.length})</div>
          <ul className="group__rows">
            {todo.map((e) => (
              <ItemRow key={e.id} entry={e} onChange={refresh} />
            ))}
          </ul>
        </div>
      )}

      {done.length > 0 && (
        <section>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="muted">In the trolley ({done.length})</h2>
            <ClearChecked onChange={refresh} />
          </div>
          <div className="group">
            <ul className="group__rows">
              {done.map((e) => (
                <ItemRow key={e.id} entry={e} onChange={refresh} />
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function ItemRow({ entry, onChange }: { entry: ShoppingEntry; onChange: () => void }) {
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      await api("PATCH", { id: entry.id, checked: !entry.checked });
      onChange();
    });
  }
  function remove() {
    start(async () => {
      await api("DELETE", undefined, `?id=${encodeURIComponent(entry.id)}`);
      onChange();
    });
  }

  return (
    <li>
      <input
        type="checkbox"
        checked={entry.checked}
        onChange={toggle}
        disabled={pending}
        aria-label={entry.checked ? "Mark as not bought" : "Mark as bought"}
      />
      <div className={`item__main ${entry.checked ? "checked" : ""}`}>
        <div className="item__title">{entry.name}</div>
        <div className="item__meta">
          {entry.quantity}
          {entry.unit ? ` ${entry.unit}` : ""}
          {entry.note ? ` · ${entry.note}` : ""}
        </div>
      </div>
      <button
        type="button"
        className="link-btn link-muted link-danger"
        onClick={remove}
        disabled={pending}
        aria-label="Remove from list"
      >
        ✕
      </button>
    </li>
  );
}

function ClearChecked({ onChange }: { onChange: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="link-btn link-muted link-danger"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await api("DELETE", undefined, "?clearChecked=1");
          onChange();
        })
      }
    >
      Clear bought
    </button>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Type something to add");
      return;
    }
    setError(null);
    start(async () => {
      const ok = await api("POST", { name: name.trim(), quantity: Number(quantity) || 1 });
      if (ok) {
        setName("");
        setQuantity("1");
        onDone();
      } else {
        setError("Couldn't add item");
      }
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label className="field-label">Add item</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bananas"
          />
        </div>
        <div style={{ width: 80 }}>
          <label className="field-label">Qty</label>
          <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="error" style={{ marginTop: 8, marginBottom: 0 }}>{error}</p>}
    </form>
  );
}
