import { getPantry } from "@/lib/inventory";
import { expiryStatus } from "@/lib/inventory-format";
import InventoryTabs from "@/components/InventoryTabs";
import PantryBoard from "@/components/PantryBoard";

export const dynamic = "force-dynamic";

export default function PantryPage() {
  const entries = getPantry();

  let expired = 0;
  let soon = 0;
  let week = 0;
  for (const e of entries) {
    const s = expiryStatus(e.expiryDate);
    if (s.kind === "expired") expired++;
    else if (s.kind === "today" || s.kind === "soon") soon++;
    else if (s.kind === "week") week++;
  }

  return (
    <main className="container">
      <h1>My Pantry</h1>
      <p className="lead">
        Keep track of what you have at home and when it expires — cut food waste and never buy
        something you already have. Everything is stored locally on your machine.
      </p>

      <InventoryTabs active="pantry" />

      {(expired > 0 || soon > 0 || week > 0) && (
        <div className="stats">
          <Stat label="Expired" value={expired} tone="red" />
          <Stat label="Use within 3 days" value={soon} tone="amber" />
          <Stat label="Use this week" value={week} tone="yellow" />
        </div>
      )}

      <PantryBoard entries={entries} />
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" | "yellow" }) {
  return (
    <div className={`stat stat--${tone}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}
