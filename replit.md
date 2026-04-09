# DOG: THE HOTDOG WARS

A full-stack first-person shooter (FPS) browser game built with React, Three.js, and Express.

## Architecture

- **Frontend**: React + Three.js via @react-three/fiber, Zustand state management, TailwindCSS
- **Backend**: Express.js server with session-based authentication
- **Database**: Replit PostgreSQL (single DB for all data)
- **Build**: Vite (frontend), esbuild (backend)

## Project Structure

```
client/          - React frontend
  src/
    SimpleFPS.tsx      - Core game engine (10k+ lines)
    App.tsx            - Routing
    api/components/fps/ - 3D game components
    lib/stores/        - Zustand stores
server/          - Express backend
  index.ts       - Server entry point
  routes.ts      - API routes
  storage.ts     - PostgreSQL data layer (migrated from MySQL)
  pg-augments.ts - Augments/run state PostgreSQL storage
shared/          - Shared TypeScript types/schemas
```

## Database

Uses Replit's built-in PostgreSQL database (`DATABASE_URL` env var).

Tables (created automatically on startup):
- `accounts` - User authentication and profiles
- `items` - Shop items
- `inventory_items` - User inventory and gold currency
- `user_settings` - Per-user game settings (keybindings, sensitivity)
- `leaderboard_2` - Game leaderboard
- `transactions_v2` - Currency purchase transactions
- `player_stats` - Shots, hits, deaths, playtime
- `player_run_state` - Story/endless mode progress
- `player_augments` - Player upgrade tiers
- `player_loadout` - Weapon loadout and equipped skins

## Environment Variables / Secrets

- `SESSION_SECRET` - Express session secret (set as Replit secret)
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

## Migration Notes

- Originally used MySQL for main storage; migrated to Replit PostgreSQL for Replit compatibility
- pg-augments.ts uses the same PostgreSQL database for augment/run state data
- Session uses in-memory store (MemoryStore) - suitable for single-instance deployment
