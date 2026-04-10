# DOG: THE HOTDOG WARS

A full-stack first-person shooter (FPS) browser game built with React, Three.js, and Express.

## Architecture

- **Frontend**: React + Three.js via @react-three/fiber, Zustand state management, TailwindCSS
- **Backend**: Express.js server with session-based authentication
- **Primary Database**: MySQL (phpMyAdmin) — all permanent game data
- **Secondary Database**: Replit PostgreSQL — temporary/session run data only
- **Build**: Vite (frontend), esbuild (backend)

## Project Structure

```
client/          - React frontend
  src/
    SimpleFPS.tsx        - Core game engine (10k+ lines)
    App.tsx              - Routing
    api/components/fps/  - 3D game components
    lib/stores/          - Zustand stores
server/          - Express backend
  index.ts       - Server entry point
  routes.ts      - API routes
  storage.ts     - MySQL data layer (accounts, items, inventory, leaderboard, etc.)
  pg-augments.ts - PostgreSQL storage for temporary run/augment data
shared/          - Shared TypeScript types/schemas
```

## Databases

### MySQL (permanent data)
Requires secrets: `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`

Tables (managed externally via phpMyAdmin):
- `accounts` - User authentication and profiles
- `items` - Shop items
- `inventory_items` - User inventory and gold currency
- `user_settings` - Per-user game settings (keybindings, sensitivity)
- `leaderboard` - Game leaderboard (total_kills updated after every level; fastest_run_time only on full campaign completion)
- `transactions_v2` - Currency purchase transactions
- `player_stats` - Shots, hits, deaths, playtime

### PostgreSQL (temporary data only)
Uses Replit's built-in PostgreSQL (`DATABASE_URL` env var). Tables created automatically on startup.

- `player_run_state` - Story/endless mode level progress (reset per run)
- `player_augments` - Player upgrade tiers (reset per run)
- `player_loadout` - Weapon loadout and equipped skins

## Environment Variables / Secrets

- `SESSION_SECRET` - Express session secret
- `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` - MySQL connection
- `DATABASE_URL` / `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` - Managed by Replit PostgreSQL

## Running

- **Development**: `npm run dev` (starts on port 5000)
- **Build**: `npm run build`
- **Production**: `npm start`

## Key Features

- 3D FPS gameplay with custom AABB collision
- User authentication (register/login)
- Shop system with in-game currency
- Leaderboard
- Admin panel
- Player augments/upgrades
- Weapon loadout system
- Profile picture upload
