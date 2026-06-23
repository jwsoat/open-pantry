# 🥫 Open Pantry

A **free, self-hostable home grocery inventory** with **expiry tracking** and a **shopping list**. Run it on your own machine — your data lives in a single local SQLite file and **never leaves your computer**. No accounts, no cloud, no tracking.

> Open Pantry is the free, local-first edition. A planned **Pro upgrade** will optionally connect to [PriceHunter](https://pricehunter.co.nz) to show the cheapest NZ price for items on your shopping list and sync across devices — entirely opt-in. The free edition has **zero external connections**.

## Features

- **Pantry** — track what's in your cupboard, fridge and freezer with quantity, unit and location.
- **Expiry management** — items are sorted soonest-expiry-first, with a dashboard counting what's **expired**, **use within 3 days**, and **use this week**, plus colour-coded badges so nothing rots forgotten.
- **Shopping list** — add what you need and tick it off as you shop; one click clears everything you've bought.
- **Restock in one tap** — send a running-low pantry item straight to the shopping list.
- **Truly local** — one SQLite file on disk. Back it up by copying it; wipe it by deleting it.

## Quick start (Node)

Requires **Node.js 20+**.

```bash
git clone https://github.com/jwsoat/open-pantry.git
cd open-pantry
npm install        # compiles the SQLite native module
npm run build
npm start          # → http://localhost:3000
```

For development with hot reload:

```bash
npm run dev
```

Your data is written to `./data/open-pantry.db` (created on first run). Set `OPEN_PANTRY_DB_PATH` to store it elsewhere.

## Quick start (Docker)

```bash
docker compose up -d --build   # → http://localhost:3000
```

The database is persisted to `./data` on the host via a volume, so it survives container rebuilds.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `OPEN_PANTRY_DB_PATH` | `./data/open-pantry.db` | Path to the SQLite database file. |

## Backups

Everything is in one file. To back up, stop the app and copy it:

```bash
cp data/open-pantry.db ~/backups/open-pantry-$(date +%F).db
```

## Tech

Next.js (App Router) · React · SQLite via `better-sqlite3`. No external services. ~4 runtime dependencies.

## Roadmap

- [ ] **Pro:** optional PriceHunter link — cheapest-store pricing for shopping-list items, grouped by retailer.
- [ ] **Pro:** multi-device sync.
- [ ] Barcode scanning to add items.
- [ ] Expiry reminders (email / push).
- [ ] CSV import/export.

## License

[MIT](./LICENSE) © 2026 Dylan Wech
