import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { isPantryLocation, type PantryLocation } from "./inventory-format";

export { PANTRY_LOCATIONS, isPantryLocation, type PantryLocation } from "./inventory-format";

// ---------------------------------------------------------------------------
// Pantry
// ---------------------------------------------------------------------------

export interface PantryEntry {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  location: PantryLocation;
  expiryDate: string | null;
  note: string;
  createdAt: string;
}

interface PantryRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  location: string;
  expiry_date: string | null;
  note: string;
  created_at: string;
}

function mapPantry(r: PantryRow): PantryEntry {
  return {
    id: r.id,
    name: r.name,
    quantity: r.quantity,
    unit: r.unit,
    location: isPantryLocation(r.location) ? r.location : "other",
    expiryDate: r.expiry_date,
    note: r.note,
    createdAt: r.created_at,
  };
}

export interface NewPantryItem {
  name: string;
  quantity: number;
  unit: string;
  location: PantryLocation;
  expiryDate: string | null;
  note: string;
}

export function addPantryItem(item: NewPantryItem): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO pantry_items (id, name, quantity, unit, location, expiry_date, note)
       VALUES (@id, @name, @quantity, @unit, @location, @expiryDate, @note)`,
    )
    .run({ id, ...item });
  return id;
}

export interface PantryPatch {
  name?: string;
  quantity?: number;
  unit?: string;
  location?: PantryLocation;
  expiryDate?: string | null;
  note?: string;
}

const PANTRY_COLUMNS: Record<keyof PantryPatch, string> = {
  name: "name",
  quantity: "quantity",
  unit: "unit",
  location: "location",
  expiryDate: "expiry_date",
  note: "note",
};

export function updatePantryItem(id: string, patch: PantryPatch): boolean {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const key of Object.keys(patch) as (keyof PantryPatch)[]) {
    sets.push(`${PANTRY_COLUMNS[key]} = @${key}`);
    params[key] = patch[key];
  }
  if (sets.length === 0) return false;
  const info = getDb()
    .prepare(
      `UPDATE pantry_items SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = @id`,
    )
    .run(params);
  return info.changes > 0;
}

export function deletePantryItem(id: string): void {
  getDb().prepare(`DELETE FROM pantry_items WHERE id = ?`).run(id);
}

/** All pantry items, soonest-expiry-first with undated items last. */
export function getPantry(): PantryEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM pantry_items
       ORDER BY (expiry_date IS NULL), expiry_date ASC, created_at DESC`,
    )
    .all() as PantryRow[];
  return rows.map(mapPantry);
}

// ---------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------

export interface ShoppingEntry {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  note: string;
  createdAt: string;
}

interface ShoppingRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: number;
  note: string;
  created_at: string;
}

function mapShopping(r: ShoppingRow): ShoppingEntry {
  return {
    id: r.id,
    name: r.name,
    quantity: r.quantity,
    unit: r.unit,
    checked: r.checked === 1,
    note: r.note,
    createdAt: r.created_at,
  };
}

export interface NewShoppingItem {
  name: string;
  quantity: number;
  unit: string;
  note: string;
}

export function addShoppingItem(item: NewShoppingItem): string {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO shopping_list_items (id, name, quantity, unit, note)
       VALUES (@id, @name, @quantity, @unit, @note)`,
    )
    .run({ id, ...item });
  return id;
}

export interface ShoppingPatch {
  name?: string;
  quantity?: number;
  unit?: string;
  checked?: boolean;
  note?: string;
}

export function updateShoppingItem(id: string, patch: ShoppingPatch): boolean {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (patch.name !== undefined) {
    sets.push("name = @name");
    params.name = patch.name;
  }
  if (patch.quantity !== undefined) {
    sets.push("quantity = @quantity");
    params.quantity = patch.quantity;
  }
  if (patch.unit !== undefined) {
    sets.push("unit = @unit");
    params.unit = patch.unit;
  }
  if (patch.note !== undefined) {
    sets.push("note = @note");
    params.note = patch.note;
  }
  if (patch.checked !== undefined) {
    sets.push("checked = @checked");
    params.checked = patch.checked ? 1 : 0;
  }
  if (sets.length === 0) return false;
  const info = getDb()
    .prepare(
      `UPDATE shopping_list_items SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = @id`,
    )
    .run(params);
  return info.changes > 0;
}

export function deleteShoppingItem(id: string): void {
  getDb().prepare(`DELETE FROM shopping_list_items WHERE id = ?`).run(id);
}

export function clearCheckedShoppingItems(): void {
  getDb().prepare(`DELETE FROM shopping_list_items WHERE checked = 1`).run();
}

/** Full list, unchecked-first then newest-first. */
export function getShoppingList(): ShoppingEntry[] {
  const rows = getDb()
    .prepare(`SELECT * FROM shopping_list_items ORDER BY checked ASC, created_at DESC`)
    .all() as ShoppingRow[];
  return rows.map(mapShopping);
}
