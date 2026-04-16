import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required for augment storage");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function initAugmentTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_run_state (
      user_id       INTEGER PRIMARY KEY,
      story_mode_level   INTEGER NOT NULL DEFAULT 1,
      endless_mode_level INTEGER NOT NULL DEFAULT 1,
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE player_run_state ADD COLUMN IF NOT EXISTS story_difficulty VARCHAR(16)`);
  await pool.query(`ALTER TABLE player_run_state ADD COLUMN IF NOT EXISTS saved_health INTEGER`);
  await pool.query(`ALTER TABLE player_run_state ADD COLUMN IF NOT EXISTS saved_coins INTEGER`);
  await pool.query(`ALTER TABLE player_run_state ADD COLUMN IF NOT EXISTS saved_weapons JSONB`);
  await pool.query(`ALTER TABLE player_run_state ADD COLUMN IF NOT EXISTS saved_game_mode VARCHAR(16)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_augments (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      augment_type VARCHAR(64) NOT NULL,
      tier         INTEGER NOT NULL DEFAULT 0,
      updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, augment_type)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_loadout (
      user_id        INTEGER PRIMARY KEY,
      loadout        JSONB NOT NULL DEFAULT '{"1":1,"2":2,"3":3,"4":4}',
      equipped_skins JSONB NOT NULL DEFAULT '{}',
      updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log("[pg-augments] Tables ready");
}

export type AugmentType =
  | "weaponDamage"
  | "weaponFireRate"
  | "weaponReloadSpeed"
  | "weaponSpreadControl"
  | "userMaxHealth"
  | "userMoveSpeed"
  | "userRegen"
  | "userDamageResist";

export interface SavedWeapons {
  currentWeapon: number;
  ammo: number;
  reserveAmmo: number;
  unlockedWeapons: number[];
}

export interface RunState {
  storyModeLevel: number;
  endlessModeLevel: number;
  augments: Record<AugmentType, number>;
  storyDifficulty: string | null;
  savedHealth: number | null;
  savedCoins: number | null;
  savedWeapons: SavedWeapons | null;
  savedGameMode: string | null;
}

const DEFAULT_AUGMENTS: Record<AugmentType, number> = {
  weaponDamage: 0,
  weaponFireRate: 0,
  weaponReloadSpeed: 0,
  weaponSpreadControl: 0,
  userMaxHealth: 0,
  userMoveSpeed: 0,
  userRegen: 0,
  userDamageResist: 0,
};

export async function getRunState(userId: number): Promise<RunState> {
  const stateRes = await pool.query<{
    story_mode_level: number;
    endless_mode_level: number;
    story_difficulty: string | null;
    saved_health: number | null;
    saved_coins: number | null;
    saved_weapons: SavedWeapons | null;
    saved_game_mode: string | null;
  }>(
    "SELECT story_mode_level, endless_mode_level, story_difficulty, saved_health, saved_coins, saved_weapons, saved_game_mode FROM player_run_state WHERE user_id = $1",
    [userId]
  );

  const augRes = await pool.query<{ augment_type: string; tier: number }>(
    "SELECT augment_type, tier FROM player_augments WHERE user_id = $1",
    [userId]
  );

  const augments: Record<AugmentType, number> = { ...DEFAULT_AUGMENTS };
  for (const row of augRes.rows) {
    augments[row.augment_type as AugmentType] = row.tier;
  }

  if (stateRes.rows.length === 0) {
    return {
      storyModeLevel: 1,
      endlessModeLevel: 1,
      augments,
      storyDifficulty: null,
      savedHealth: null,
      savedCoins: null,
      savedWeapons: null,
      savedGameMode: null,
    };
  }

  const row = stateRes.rows[0];
  return {
    storyModeLevel: row.story_mode_level,
    endlessModeLevel: row.endless_mode_level,
    augments,
    storyDifficulty: row.story_difficulty ?? null,
    savedHealth: row.saved_health ?? null,
    savedCoins: row.saved_coins ?? null,
    savedWeapons: row.saved_weapons ?? null,
    savedGameMode: row.saved_game_mode ?? null,
  };
}

export async function saveRunState(
  userId: number,
  storyModeLevel: number,
  endlessModeLevel: number,
  augments: Partial<Record<AugmentType, number>>,
  extra?: {
    storyDifficulty?: string | null;
    savedHealth?: number | null;
    savedCoins?: number | null;
    savedWeapons?: SavedWeapons | null;
    savedGameMode?: string | null;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO player_run_state (user_id, story_mode_level, endless_mode_level, story_difficulty, saved_health, saved_coins, saved_weapons, saved_game_mode, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET story_mode_level   = EXCLUDED.story_mode_level,
           endless_mode_level = EXCLUDED.endless_mode_level,
           story_difficulty   = EXCLUDED.story_difficulty,
           saved_health       = EXCLUDED.saved_health,
           saved_coins        = EXCLUDED.saved_coins,
           saved_weapons      = EXCLUDED.saved_weapons,
           saved_game_mode    = EXCLUDED.saved_game_mode,
           updated_at         = NOW()`,
    [
      userId,
      storyModeLevel,
      endlessModeLevel,
      extra?.storyDifficulty ?? null,
      extra?.savedHealth ?? null,
      extra?.savedCoins ?? null,
      extra?.savedWeapons ? JSON.stringify(extra.savedWeapons) : null,
      extra?.savedGameMode ?? null,
    ]
  );

  for (const [augType, tier] of Object.entries(augments)) {
    if (tier === undefined) continue;
    await pool.query(
      `INSERT INTO player_augments (user_id, augment_type, tier, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, augment_type) DO UPDATE
         SET tier       = EXCLUDED.tier,
             updated_at = NOW()`,
      [userId, augType, tier]
    );
  }
}

export async function resetRunState(userId: number): Promise<void> {
  await pool.query("DELETE FROM player_augments WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM player_run_state WHERE user_id = $1", [userId]);
}

// ── Loadout & Equipped Skins ─────────────────────────────────────────────────

export interface LoadoutData {
  loadout: Record<string, number>;        // slot "1"-"4" → weapon ID
  equippedSkins: Record<string, string>;  // weapon ID (as string) → skin name
}

const DEFAULT_LOADOUT: LoadoutData = {
  loadout: { "1": 1, "2": 2, "3": 3, "4": 4 },
  equippedSkins: {},
};

export async function getLoadout(userId: number): Promise<LoadoutData> {
  const res = await pool.query<{ loadout: any; equipped_skins: any }>(
    "SELECT loadout, equipped_skins FROM player_loadout WHERE user_id = $1",
    [userId]
  );

  if (res.rows.length === 0) {
    return { ...DEFAULT_LOADOUT };
  }

  return {
    loadout: res.rows[0].loadout ?? DEFAULT_LOADOUT.loadout,
    equippedSkins: res.rows[0].equipped_skins ?? {},
  };
}

export async function saveLoadout(
  userId: number,
  loadout: Record<string, number>,
  equippedSkins: Record<string, string>
): Promise<void> {
  await pool.query(
    `INSERT INTO player_loadout (user_id, loadout, equipped_skins, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET loadout        = EXCLUDED.loadout,
           equipped_skins = EXCLUDED.equipped_skins,
           updated_at     = NOW()`,
    [userId, JSON.stringify(loadout), JSON.stringify(equippedSkins)]
  );
}

