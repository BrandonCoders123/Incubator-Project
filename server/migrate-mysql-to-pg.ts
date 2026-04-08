import mysql from "mysql2/promise";
import pg from "pg";

const { Pool } = pg;

export async function migrateFromMySQL(): Promise<{
  accountsMigrated: number;
  inventoryMigrated: number;
  skipped: number;
  errors: string[];
}> {
  const required = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing MySQL env vars: ${missing.join(", ")}`);
  }

  // ── Connect to MySQL ──────────────────────────────────────────────────────
  const mysqlConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  // ── Connect to PostgreSQL ─────────────────────────────────────────────────
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  const stats = { accountsMigrated: 0, inventoryMigrated: 0, skipped: 0, errors: [] as string[] };

  try {
    // ── 1. Fetch all accounts from MySQL ────────────────────────────────────
    const [mysqlAccounts] = await mysqlConn.query<mysql.RowDataPacket[]>(
      `SELECT user_id, username, password_hash, email,
              COALESCE(profile_pic, NULL) AS profile_pic,
              COALESCE(is_banned, 0)     AS is_banned,
              COALESCE(ban_reason, NULL) AS ban_reason,
              COALESCE(warning_count, 0) AS warning_count,
              COALESCE(\`adminCheck\`, 0) AS adminCheck
       FROM accounts`
    );

    console.log(`[migrate] Found ${mysqlAccounts.length} MySQL account(s)`);

    for (const acc of mysqlAccounts) {
      try {
        // Insert preserving the original user_id
        const result = await pgPool.query(
          `INSERT INTO accounts
             (user_id, username, password_hash, email, profile_pic,
              is_banned, ban_reason, warning_count, "adminCheck")
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (username) DO NOTHING`,
          [
            acc.user_id,
            acc.username,
            acc.password_hash,
            acc.email,
            acc.profile_pic ?? null,
            acc.is_banned ?? 0,
            acc.ban_reason ?? null,
            acc.warning_count ?? 0,
            acc.adminCheck ?? 0,
          ]
        );

        if ((result.rowCount ?? 0) > 0) {
          stats.accountsMigrated++;
        } else {
          stats.skipped++;
          console.log(`[migrate] Skipped '${acc.username}' (username already exists in PostgreSQL)`);
        }
      } catch (err: any) {
        const msg = `Account '${acc.username}': ${err.message}`;
        stats.errors.push(msg);
        console.error(`[migrate] Error —`, msg);
      }
    }

    // ── 2. Advance the PostgreSQL sequence past the highest migrated user_id ─
    await pgPool.query(
      `SELECT setval(pg_get_serial_sequence('accounts', 'user_id'),
               GREATEST(COALESCE(MAX(user_id), 1), 1))
       FROM accounts`
    );

    // ── 3. Fetch inventory (gold) from MySQL ─────────────────────────────────
    let mysqlInventory: mysql.RowDataPacket[] = [];
    try {
      [mysqlInventory] = await mysqlConn.query<mysql.RowDataPacket[]>(
        `SELECT user_id, item_id, COALESCE(gold, 1000) AS gold FROM inventory_items`
      );
    } catch {
      console.log("[migrate] No inventory_items table found in MySQL — skipping gold migration");
    }

    for (const inv of mysqlInventory) {
      try {
        // Only insert if the account was successfully migrated
        const result = await pgPool.query(
          `INSERT INTO inventory_items (user_id, item_id, gold)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [inv.user_id, inv.item_id ?? 0, inv.gold ?? 1000]
        );
        if ((result.rowCount ?? 0) > 0) stats.inventoryMigrated++;
      } catch (err: any) {
        stats.errors.push(`Inventory user_id ${inv.user_id}: ${err.message}`);
      }
    }

    console.log(`[migrate] Done — accounts: ${stats.accountsMigrated}, inventory: ${stats.inventoryMigrated}, skipped: ${stats.skipped}, errors: ${stats.errors.length}`);
  } finally {
    await mysqlConn.end();
    await pgPool.end();
  }

  return stats;
}
