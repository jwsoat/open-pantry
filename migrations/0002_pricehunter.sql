-- 0002_pricehunter.sql
-- Phase 0: link columns + cache + settings for Pricehunter integration.
ALTER TABLE pantry_items        ADD COLUMN ph_product_id TEXT;
ALTER TABLE shopping_list_items ADD COLUMN ph_product_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pantry_ph_id        ON pantry_items(ph_product_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_ph_id ON shopping_list_items(ph_product_id);

CREATE TABLE IF NOT EXISTS ph_cache (
  id           TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
