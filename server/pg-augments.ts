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
