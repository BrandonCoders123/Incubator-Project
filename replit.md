# SimpleFPS - 3D Browser First-Person Shooter

## Overview
A full-stack 3D browser-based FPS game built with React Three Fiber, Three.js, and an Express.js backend. Features multiple levels, weapons, enemy types, a shop system, leaderboard, and admin panel.

## Architecture

### Frontend (`client/`)
- **Framework**: React 18 with TypeScript
- **3D Engine**: React Three Fiber + Three.js + @react-three/drei
- **State Management**: Zustand
- **Routing**: Wouter + React Router DOM
- **Styling**: Tailwind CSS + Radix UI components
- **Build**: Vite

### Backend (`server/`)
- **Framework**: Express.js with TypeScript
- **Runtime**: `tsx` (TypeScript execution via `./node_modules/.bin/tsx`)
- **Session**: `express-session` with `memorystore`
- **Auth**: Passport.js (local strategy) + bcrypt

### Database
- **Provider**: Replit PostgreSQL (via `DATABASE_URL`)
- **Driver**: `pg` (node-postgres)
- **Schema**: Custom tables created automatically on startup (see `server/storage.ts`)
- **Tables**: `accounts`, `items`, `inventory_items`, `user_settings`, `leaderboard_2`, `transactions_v2`, `player_stats`

### Shared (`shared/`)
- TypeScript types and Drizzle ORM schema definitions

## Key Files
- `server/index.ts` — Express server entry point, session setup, port binding (5000)
- `server/routes.ts` — All API routes (auth, shop, admin, leaderboard, etc.)
- `server/storage.ts` — PostgreSQL data layer (rewritten from MySQL during Replit migration)
- `server/vite.ts` — Vite dev middleware integration
- `vite.config.ts` — Vite configuration with GLSL shader support
- `client/src/SimpleFPS.tsx` — Main game engine component

## Environment Variables / Secrets Required
- `SESSION_SECRET` — Secret key for session signing (already configured)
- `DATABASE_URL` — PostgreSQL connection string (Replit-managed)
- `PGDATABASE`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` — Replit-managed PostgreSQL vars

## Running the App
```bash
npm run dev       # Development (tsx + Vite HMR) on port 5000
npm run build     # Production build
npm run start     # Production server
```

## Migration Notes
- Originally used MySQL; migrated to PostgreSQL for Replit compatibility
- Storage layer (`server/storage.ts`) rewritten to use `pg` (node-postgres) with `$1, $2` placeholders
- MySQL-specific syntax (`SHOW COLUMNS`, `ON DUPLICATE KEY`, `DATE_SUB`, `NOW()` in MySQL style) replaced with PostgreSQL equivalents
- All database tables are auto-created on server startup via `initTables()`
- Dev script uses `./node_modules/.bin/tsx` instead of global `tsx` for Replit compatibility
