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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS multiplayer_games (
      game_id         VARCHAR(16) PRIMARY KEY,
      owner_user_id   INTEGER NOT NULL,
      slot_index      INTEGER NOT NULL DEFAULT 1,
      difficulty      VARCHAR(16) NOT NULL,
      current_level   INTEGER NOT NULL DEFAULT 1,
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (owner_user_id, slot_index)
    );
  `);

  await pool.query(`
    ALTER TABLE multiplayer_games
    ADD COLUMN IF NOT EXISTS slot_index INTEGER NOT NULL DEFAULT 1;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS multiplayer_games_owner_slot_idx
    ON multiplayer_games (owner_user_id, slot_index);
  `);

  console.log("[pg-augments] Tables ready");
}

export type MultiplayerDifficulty = "normal" | "hard" | "extreme";

export interface MultiplayerGameRecord {
  gameId: string;
  ownerUserId: number;
  slotIndex: number;
  difficulty: MultiplayerDifficulty;
  currentLevel: number;
}

export async function saveMultiplayerGame(record: MultiplayerGameRecord): Promise<void> {
  await pool.query(
    `INSERT INTO multiplayer_games (game_id, owner_user_id, slot_index, difficulty, current_level, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (owner_user_id, slot_index) DO UPDATE
       SET game_id        = EXCLUDED.game_id,
           difficulty     = EXCLUDED.difficulty,
           current_level  = EXCLUDED.current_level,
           updated_at    = NOW()`,
    [
      record.gameId,
      record.ownerUserId,
      record.slotIndex,
      record.difficulty,
      record.currentLevel,
    ]
  );
}

export async function getMultiplayerGameById(gameId: string): Promise<MultiplayerGameRecord | null> {
  const res = await pool.query<{
    game_id: string;
    owner_user_id: number;
    slot_index: number;
    difficulty: MultiplayerDifficulty;
    current_level: number;
  }>(
    "SELECT game_id, owner_user_id, slot_index, difficulty, current_level FROM multiplayer_games WHERE game_id = $1",
    [gameId]
  );

  if (res.rows.length === 0) return null;

  return {
    gameId: res.rows[0].game_id,
    ownerUserId: res.rows[0].owner_user_id,
    slotIndex: res.rows[0].slot_index,
    difficulty: res.rows[0].difficulty,
    currentLevel: res.rows[0].current_level,
  };
}

export async function getMultiplayerGamesByOwner(ownerUserId: number): Promise<MultiplayerGameRecord[]> {
  const res = await pool.query<{
    game_id: string;
    owner_user_id: number;
    slot_index: number;
    difficulty: MultiplayerDifficulty;
    current_level: number;
  }>(
    `SELECT game_id, owner_user_id, slot_index, difficulty, current_level
     FROM multiplayer_games
     WHERE owner_user_id = $1
     ORDER BY slot_index ASC`,
    [ownerUserId]
  );

  return res.rows.map((row) => ({
    gameId: row.game_id,
    ownerUserId: row.owner_user_id,
    slotIndex: row.slot_index,
    difficulty: row.difficulty,
    currentLevel: row.current_level,
  }));
}

export async function deleteMultiplayerGameByOwnerSlot(
  ownerUserId: number,
  slotIndex: number
): Promise<void> {
  await pool.query(
    "DELETE FROM multiplayer_games WHERE owner_user_id = $1 AND slot_index = $2",
    [ownerUserId, slotIndex]
  );
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

export interface RunState {
  storyModeLevel: number;
  endlessModeLevel: number;
  augments: Record<AugmentType, number>;
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
  }>(
    "SELECT story_mode_level, endless_mode_level FROM player_run_state WHERE user_id = $1",
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
    return { storyModeLevel: 1, endlessModeLevel: 1, augments };
  }

  return {
    storyModeLevel: stateRes.rows[0].story_mode_level,
    endlessModeLevel: stateRes.rows[0].endless_mode_level,
    augments,
  };
}

export async function saveRunState(
  userId: number,
  storyModeLevel: number,
  endlessModeLevel: number,
  augments: Partial<Record<AugmentType, number>>
): Promise<void> {
  await pool.query(
    `INSERT INTO player_run_state (user_id, story_mode_level, endless_mode_level, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET story_mode_level   = EXCLUDED.story_mode_level,
           endless_mode_level = EXCLUDED.endless_mode_level,
           updated_at         = NOW()`,
    [userId, storyModeLevel, endlessModeLevel]
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
