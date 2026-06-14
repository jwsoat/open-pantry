import { getShoppingList } from "@/lib/inventory";
import InventoryTabs from "@/components/InventoryTabs";
import ShoppingBoard from "@/components/ShoppingBoard";

export const dynamic = "force-dynamic";

export default function ShoppingListPage() {
  const entries = getShoppingList();

  return (
    <main className="container">
      <h1>My Shopping List</h1>
      <p className="lead">
        Jot down what you need and tick it off as you shop. Add items here directly, or send them
        over from your pantry when you&apos;re running low.
      </p>

      <InventoryTabs active="list" />

      <ShoppingBoard entries={entries} />
    </main>
  );
}
