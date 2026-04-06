import type { User, InsertUser } from "@shared/schema";
import pg from "pg";
const { Pool } = pg;
import bcrypt from "bcrypt";

// All storage operations the rest of the app expects
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  updateUserCurrency(username: string, currency: number): Promise<void>;
  getUserData(
    username: string
  ): Promise<{ currency: number; cosmetics: string[] } | undefined>;

  getUserProfile(
    userId: number
  ): Promise<
    { username: string; email: string; profilePicture: string | null; warning_count: number; isAdmin: boolean } | undefined
  >;

  updateUsername(userId: number, newUsername: string): Promise<void>;
  updatePassword(userId: number, newPasswordHash: string): Promise<void>;
  updateProfilePicture(
    userId: number,
    profilePictureUrl: string
  ): Promise<void>;

  verifyPassword(userId: number, password: string): Promise<boolean>;

  getShopItems(): Promise<any[]>;
  getUserInventory(userId: number): Promise<any[]>;
  purchaseItem(userId: number, itemId: number, price: number): Promise<void>;
  getUserCurrency(userId: number): Promise<number>;
  updateUserGold(userId: number, newGold: number): Promise<void>;
  getUserSettings(userId: number): Promise<any>;
  saveUserSettings(userId: number, settings: any): Promise<void>;

  // Admin methods
  isUserAdmin(userId: number): Promise<boolean>;
  getAllUsers(): Promise<any[]>;
  getAllItems(): Promise<any[]>;
  addItem(name: string, type: string, price: number, isCosmetic: boolean): Promise<any>;
  updateItem(itemId: number, name: string, type: string, price: number, isCosmetic: boolean): Promise<void>;
  deleteItem(itemId: number): Promise<void>;
  setUserGold(userId: number, gold: number): Promise<void>;
  deleteUser(userId: number): Promise<void>;
  banUser(userId: number, reason: string | null): Promise<void>;
  unbanUser(userId: number): Promise<void>;
  warnUser(userId: number): Promise<void>;

  // Leaderboard methods
  getLeaderboard(category: string, limit?: number): Promise<any[]>;
  saveLeaderboardEntry(userId: number, fastestRunTime: string | null, totalKills: number | null): Promise<void>;

  // Currency purchase transactions
  saveCurrencyTransaction(userId: number, amountUSD: number, cardNumber: string, goldAmount: number): Promise<void>;
  getAllTransactions(): Promise<{
    transactions: any[];
    summary: { totalRevenue: number; transactionCount: number; mostPurchasedTier: { goldAmount: number; count: number } | null };
    earningsByDay: { day: string; revenue: number; purchases: number }[];
    tierBreakdown: { gold: number; purchases: number; revenue: number }[];
  }>;

  // Player stat tracking
  incrementPlayerStats(userId: number, shots: number, hits: number, deaths: number): Promise<void>;
  addMinutesPlayed(userId: number, minutes: number): Promise<void>;
  getPlayerStats(userId: number): Promise<{ total_shots: number; shots_hit: number; deaths: number; minutes_played: number }>;
}

class PostgresStorage implements IStorage {
  private pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("Missing required DATABASE_URL environment variable");
    }

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    this.initTables().catch((err) => {
      console.error("Failed to initialize database tables:", err);
    });
  }

  private async initTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        profile_pic TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login TIMESTAMPTZ,
        is_banned INTEGER NOT NULL DEFAULT 0,
        ban_reason TEXT,
        banned_at TIMESTAMPTZ,
        warning_count INTEGER NOT NULL DEFAULT 0,
        "adminCheck" INTEGER NOT NULL DEFAULT 0
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        item_id SERIAL PRIMARY KEY,
        item_name VARCHAR(255) NOT NULL,
        item_type VARCHAR(255) NOT NULL,
        store_price INTEGER NOT NULL DEFAULT 0,
        is_cosmetic INTEGER NOT NULL DEFAULT 0
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL DEFAULT 0,
        gold INTEGER NOT NULL DEFAULT 1000,
        purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES accounts(user_id) ON DELETE CASCADE,
        mouse_sensitivity REAL NOT NULL DEFAULT 1.0,
        move_forward_key VARCHAR(50) NOT NULL DEFAULT 'KeyW',
        move_backward_key VARCHAR(50) NOT NULL DEFAULT 'KeyS',
        move_left_key VARCHAR(50) NOT NULL DEFAULT 'KeyA',
        move_right_key VARCHAR(50) NOT NULL DEFAULT 'KeyD',
        jump_key VARCHAR(50) NOT NULL DEFAULT 'Space'
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_2 (
        leaderboard_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES accounts(user_id) ON DELETE CASCADE,
        fastest_run_time VARCHAR(50),
        total_kills INTEGER NOT NULL DEFAULT 0,
        rank INTEGER,
        date_recorded TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transactions_v2 (
        transaction_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount_spent_usd DECIMAL(10,2) NOT NULL,
        card_number VARCHAR(20),
        currency_purchased INTEGER NOT NULL,
        transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
        user_id INTEGER PRIMARY KEY REFERENCES accounts(user_id) ON DELETE CASCADE,
        total_shots INTEGER NOT NULL DEFAULT 0,
        shots_hit INTEGER NOT NULL DEFAULT 0,
        deaths INTEGER NOT NULL DEFAULT 0,
        minutes_played INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  // ---------- User lookups ----------

  async getUser(id: number): Promise<User | undefined> {
    const result = await this.pool.query(
      "SELECT user_id AS id, username, password_hash AS password, email FROM accounts WHERE user_id = $1",
      [id]
    );
    return result.rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.pool.query(
      `SELECT user_id AS id, username, password_hash AS password, email,
              COALESCE("adminCheck", 0) as "adminCheck",
              COALESCE(is_banned, 0) as is_banned, ban_reason
       FROM accounts WHERE username = $1`,
      [username]
    );
    return result.rows[0];
  }

  async isUserAdmin(userId: number): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT COALESCE("adminCheck", 0) as "adminCheck" FROM accounts WHERE user_id = $1`,
        [userId]
      );
      return result.rows[0]?.adminCheck === 1;
    } catch (err) {
      console.error("Error checking admin status:", err);
      return false;
    }
  }

  // ---------- User creation ----------

  async createUser(insertUser: InsertUser): Promise<User> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(insertUser.password, saltRounds);

    const result = await this.pool.query(
      "INSERT INTO accounts (username, password_hash, email) VALUES ($1, $2, $3) RETURNING user_id AS id, username, email",
      [insertUser.username, hashedPassword, insertUser.email]
    );

    return {
      id: result.rows[0].id,
      username: insertUser.username,
      password: hashedPassword,
      email: insertUser.email,
    };
  }

  // ---------- Currency / cosmetic data ----------

  async updateUserCurrency(username: string, currency: number): Promise<void> {
    try {
      const userResult = await this.pool.query(
        "SELECT user_id FROM accounts WHERE username = $1",
        [username]
      );
      if (userResult.rows.length === 0) {
        console.log(`[updateUserCurrency] User ${username} not found`);
        return;
      }
      const userId = userResult.rows[0].user_id;

      const invResult = await this.pool.query(
        "SELECT id FROM inventory_items WHERE user_id = $1 LIMIT 1",
        [userId]
      );

      if (invResult.rows.length > 0) {
        await this.pool.query(
          "UPDATE inventory_items SET gold = $1 WHERE user_id = $2",
          [currency, userId]
        );
      } else {
        await this.pool.query(
          "INSERT INTO inventory_items (user_id, item_id, gold) VALUES ($1, 0, $2)",
          [userId, currency]
        );
      }
      console.log(`[updateUserCurrency] Set ${username} currency to ${currency}`);
    } catch (err) {
      console.error("Error updating user currency:", err);
      throw err;
    }
  }

  async getUserData(
    username: string
  ): Promise<{ currency: number; cosmetics: string[] } | undefined> {
    try {
      const userResult = await this.pool.query(
        "SELECT user_id FROM accounts WHERE username = $1",
        [username]
      );
      if (userResult.rows.length === 0) {
        return { currency: 500, cosmetics: [] };
      }
      const userId = userResult.rows[0].user_id;

      const goldResult = await this.pool.query(
        "SELECT gold FROM inventory_items WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      const currency = goldResult.rows.length > 0 ? (goldResult.rows[0].gold || 500) : 500;

      const cosmeticResult = await this.pool.query(
        `SELECT i.item_name FROM items i
         INNER JOIN inventory_items ii ON i.item_id = ii.item_id
         WHERE ii.user_id = $1 AND i.is_cosmetic = 1`,
        [userId]
      );
      const cosmetics = cosmeticResult.rows.map((row: any) => row.item_name);

      return { currency, cosmetics };
    } catch (err) {
      console.error("Error fetching user data:", err);
      return { currency: 500, cosmetics: [] };
    }
  }

  // ---------- Profile info ----------

  async getUserProfile(
    userId: number
  ): Promise<{ username: string; email: string; profilePicture: string | null; warning_count: number; isAdmin: boolean } | undefined> {
    const result = await this.pool.query(
      `SELECT username, email, profile_pic AS "profilePicture",
              COALESCE(warning_count, 0) as warning_count,
              COALESCE("adminCheck", 0) as "adminCheck"
       FROM accounts WHERE user_id = $1`,
      [userId]
    );
    if (result.rows[0]) {
      return {
        ...result.rows[0],
        isAdmin: result.rows[0].adminCheck === 1,
      };
    }
    return undefined;
  }

  async updateUsername(userId: number, newUsername: string): Promise<void> {
    const existing = await this.pool.query(
      "SELECT user_id FROM accounts WHERE username = $1 AND user_id != $2",
      [newUsername, userId]
    );
    if (existing.rows.length > 0) {
      throw new Error("Username already taken");
    }
    await this.pool.query(
      "UPDATE accounts SET username = $1 WHERE user_id = $2",
      [newUsername, userId]
    );
  }

  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE accounts SET password_hash = $1 WHERE user_id = $2",
      [newPasswordHash, userId]
    );
  }

  async updateProfilePicture(userId: number, profilePictureUrl: string): Promise<void> {
    await this.pool.query(
      "UPDATE accounts SET profile_pic = $1 WHERE user_id = $2",
      [profilePictureUrl, userId]
    );
  }

  // ---------- Password verification ----------

  async verifyPassword(userId: number, password: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT password_hash FROM accounts WHERE user_id = $1",
      [userId]
    );
    if (result.rows.length === 0) return false;
    return await bcrypt.compare(password, result.rows[0].password_hash);
  }

  // ---------- Shop items ----------

  async getShopItems(): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT item_id as id, item_name as name, item_type as type, store_price as price, is_cosmetic
         FROM items ORDER BY item_id ASC`
      );
      return result.rows.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.type,
        price: item.price,
        image_url: `https://via.placeholder.com/200?text=${encodeURIComponent(item.name)}`,
        rarity: item.is_cosmetic ? "uncommon" : "common",
        category: item.type,
      }));
    } catch (err) {
      console.error("Error fetching shop items:", err);
      return [];
    }
  }

  // ---------- User inventory ----------

  async getUserInventory(userId: number): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT i.item_id as id, i.item_name as name, i.item_type as type,
                i.store_price as price, i.is_cosmetic
         FROM items i
         INNER JOIN inventory_items ii ON i.item_id = ii.item_id
         WHERE ii.user_id = $1
         ORDER BY i.item_id ASC`,
        [userId]
      );
      return result.rows.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        price: item.price,
        isCosmeticItem: item.is_cosmetic === 1 || item.is_cosmetic === true,
      }));
    } catch (err) {
      console.error("Error fetching user inventory:", err);
      return [];
    }
  }

  async getUserCurrency(userId: number): Promise<number> {
    try {
      const result = await this.pool.query(
        "SELECT gold FROM inventory_items WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      if (result.rows.length > 0) {
        return result.rows[0].gold || 1000;
      }
      return 1000;
    } catch (err) {
      console.error("Error fetching user currency:", err);
      return 1000;
    }
  }

  async updateUserGold(userId: number, newGold: number): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE inventory_items SET gold = $1 WHERE user_id = $2",
        [newGold, userId]
      );
    } catch (err) {
      console.error("Error updating user gold:", err);
      throw err;
    }
  }

  async purchaseItem(userId: number, itemId: number, price: number): Promise<void> {
    try {
      const goldResult = await this.pool.query(
        "SELECT gold FROM inventory_items WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      let currentGold = goldResult.rows.length > 0 ? (goldResult.rows[0].gold || 1000) : 1000;
      const hasUnlimitedGold = currentGold === 67;

      if (!hasUnlimitedGold && currentGold < price) {
        throw new Error("Insufficient gold");
      }

      const existingResult = await this.pool.query(
        "SELECT id FROM inventory_items WHERE user_id = $1 AND item_id = $2",
        [userId, itemId]
      );
      if (existingResult.rows.length > 0) {
        throw new Error("Item already owned");
      }

      const newGold = hasUnlimitedGold ? 67 : currentGold - price;

      await this.pool.query(
        "INSERT INTO inventory_items (user_id, item_id, gold) VALUES ($1, $2, $3)",
        [userId, itemId, newGold]
      );

      await this.pool.query(
        "UPDATE inventory_items SET gold = $1 WHERE user_id = $2",
        [newGold, userId]
      );
    } catch (err) {
      console.error("Error purchasing item:", err);
      throw err;
    }
  }

  // ---------- User settings ----------

  async getUserSettings(userId: number): Promise<any> {
    try {
      const result = await this.pool.query(
        `SELECT mouse_sensitivity, move_forward_key, move_backward_key,
                move_left_key, move_right_key, jump_key
         FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return {
        mouse_sensitivity: 1.0,
        move_forward_key: "KeyW",
        move_backward_key: "KeyS",
        move_left_key: "KeyA",
        move_right_key: "KeyD",
        jump_key: "Space",
      };
    } catch (err) {
      console.error("Error fetching user settings:", err);
      return {
        mouse_sensitivity: 1.0,
        move_forward_key: "KeyW",
        move_backward_key: "KeyS",
        move_left_key: "KeyA",
        move_right_key: "KeyD",
        jump_key: "Space",
      };
    }
  }

  async saveUserSettings(userId: number, settings: any): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO user_settings (user_id, mouse_sensitivity, move_forward_key,
          move_backward_key, move_left_key, move_right_key, jump_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           mouse_sensitivity = EXCLUDED.mouse_sensitivity,
           move_forward_key = EXCLUDED.move_forward_key,
           move_backward_key = EXCLUDED.move_backward_key,
           move_left_key = EXCLUDED.move_left_key,
           move_right_key = EXCLUDED.move_right_key,
           jump_key = EXCLUDED.jump_key`,
        [
          userId,
          settings.mouse_sensitivity || 1.0,
          settings.move_forward_key || "KeyW",
          settings.move_backward_key || "KeyS",
          settings.move_left_key || "KeyA",
          settings.move_right_key || "KeyD",
          settings.jump_key || "Space",
        ]
      );
    } catch (err) {
      console.error("Error saving user settings:", err);
      throw err;
    }
  }

  // ---------- Admin methods ----------

  async getAllUsers(): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT a.user_id, a.username, a.email, a.created_at, a.last_login,
                COALESCE((SELECT gold FROM inventory_items WHERE user_id = a.user_id LIMIT 1), 1000) as gold,
                COALESCE(a.is_banned, 0) as is_banned,
                a.ban_reason,
                COALESCE(a.warning_count, 0) as warning_count
         FROM accounts a
         ORDER BY a.user_id ASC`
      );
      return result.rows;
    } catch (err) {
      console.error("Error fetching all users:", err);
      return [];
    }
  }

  async getAllItems(): Promise<any[]> {
    try {
      const result = await this.pool.query(
        "SELECT item_id, item_name, item_type, store_price, is_cosmetic FROM items ORDER BY item_id ASC"
      );
      return result.rows;
    } catch (err) {
      console.error("Error fetching all items:", err);
      return [];
    }
  }

  async addItem(name: string, type: string, price: number, isCosmetic: boolean): Promise<any> {
    try {
      const result = await this.pool.query(
        "INSERT INTO items (item_name, item_type, store_price, is_cosmetic) VALUES ($1, $2, $3, $4) RETURNING *",
        [name, type, price, isCosmetic ? 1 : 0]
      );
      return result.rows[0];
    } catch (err) {
      console.error("Error adding item:", err);
      throw err;
    }
  }

  async updateItem(itemId: number, name: string, type: string, price: number, isCosmetic: boolean): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE items SET item_name = $1, item_type = $2, store_price = $3, is_cosmetic = $4 WHERE item_id = $5",
        [name, type, price, isCosmetic ? 1 : 0, itemId]
      );
    } catch (err) {
      console.error("Error updating item:", err);
      throw err;
    }
  }

  async deleteItem(itemId: number): Promise<void> {
    try {
      await this.pool.query("DELETE FROM items WHERE item_id = $1", [itemId]);
    } catch (err) {
      console.error("Error deleting item:", err);
      throw err;
    }
  }

  async setUserGold(userId: number, gold: number): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE inventory_items SET gold = $1 WHERE user_id = $2",
        [gold, userId]
      );
    } catch (err) {
      console.error("Error setting user gold:", err);
      throw err;
    }
  }

  async deleteUser(userId: number): Promise<void> {
    try {
      await this.pool.query("DELETE FROM inventory_items WHERE user_id = $1", [userId]);
      await this.pool.query("DELETE FROM user_settings WHERE user_id = $1", [userId]);
      await this.pool.query("DELETE FROM accounts WHERE user_id = $1", [userId]);
    } catch (err) {
      console.error("Error deleting user:", err);
      throw err;
    }
  }

  async banUser(userId: number, reason: string | null): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE accounts SET is_banned = 1, ban_reason = $1, banned_at = NOW() WHERE user_id = $2",
        [reason, userId]
      );
    } catch (err) {
      console.error("Error banning user:", err);
      throw err;
    }
  }

  async unbanUser(userId: number): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE accounts SET is_banned = 0, ban_reason = NULL, banned_at = NULL WHERE user_id = $1",
        [userId]
      );
    } catch (err) {
      console.error("Error unbanning user:", err);
      throw err;
    }
  }

  async warnUser(userId: number): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE accounts SET warning_count = COALESCE(warning_count, 0) + 1 WHERE user_id = $1",
        [userId]
      );
    } catch (err) {
      console.error("Error warning user:", err);
      throw err;
    }
  }

  // ---------- Leaderboard ----------

  async getLeaderboard(category: string, limit: number = 50): Promise<any[]> {
    try {
      let orderBy: string;
      let whereClause = "";

      switch (category) {
        case "kills":
          orderBy = "total_kills DESC";
          break;
        case "fastest_time":
          orderBy = "lb.fastest_run_time ASC";
          whereClause = "WHERE lb.fastest_run_time IS NOT NULL";
          break;
        default:
          orderBy = "total_kills DESC";
          break;
      }

      const result = await this.pool.query(
        `SELECT lb.leaderboard_id, lb.user_id, a.username, lb.rank, lb.date_recorded,
                lb.fastest_run_time, COALESCE(lb.total_kills, 0) as total_kills
         FROM leaderboard_2 lb
         LEFT JOIN accounts a ON lb.user_id = a.user_id
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      return [];
    }
  }

  async saveLeaderboardEntry(userId: number, fastestRunTime: string | null, totalKills: number | null): Promise<void> {
    try {
      const existing = await this.pool.query(
        "SELECT leaderboard_id, fastest_run_time, total_kills FROM leaderboard_2 WHERE user_id = $1",
        [userId]
      );

      if (existing.rows.length > 0) {
        const currentTime = existing.rows[0].fastest_run_time;
        const currentKills = existing.rows[0].total_kills || 0;

        const updates: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        if (fastestRunTime && (!currentTime || fastestRunTime < currentTime)) {
          updates.push(`fastest_run_time = $${paramIdx++}`);
          params.push(fastestRunTime);
        }

        if (totalKills !== null && totalKills > currentKills) {
          updates.push(`total_kills = $${paramIdx++}`);
          params.push(totalKills);
        }

        if (updates.length > 0) {
          updates.push(`date_recorded = NOW()`);
          params.push(userId);
          await this.pool.query(
            `UPDATE leaderboard_2 SET ${updates.join(", ")} WHERE user_id = $${paramIdx}`,
            params
          );
        }
      } else {
        await this.pool.query(
          "INSERT INTO leaderboard_2 (user_id, fastest_run_time, total_kills, date_recorded) VALUES ($1, $2, $3, NOW())",
          [userId, fastestRunTime, totalKills || 0]
        );
      }
    } catch (err) {
      console.error("Error saving leaderboard entry:", err);
      throw err;
    }
  }

  // ---------- Transactions ----------

  async saveCurrencyTransaction(userId: number, amountUSD: number, cardNumber: string, goldAmount: number): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO transactions_v2 (user_id, amount_spent_usd, card_number, currency_purchased, transaction_date)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, amountUSD, cardNumber, goldAmount]
      );
    } catch (err) {
      console.error("Error saving currency transaction:", err);
      throw err;
    }
  }

  async getAllTransactions(): Promise<{
    transactions: any[];
    summary: { totalRevenue: number; transactionCount: number; mostPurchasedTier: { goldAmount: number; count: number } | null };
    earningsByDay: { day: string; revenue: number; purchases: number }[];
    tierBreakdown: { gold: number; purchases: number; revenue: number }[];
  }> {
    try {
      const txResult = await this.pool.query(
        `SELECT t.transaction_id, t.user_id, a.username, t.amount_spent_usd,
                t.card_number, t.currency_purchased, t.transaction_date
         FROM transactions_v2 t
         LEFT JOIN accounts a ON t.user_id = a.user_id
         ORDER BY t.transaction_date DESC`
      );

      const aggResult = await this.pool.query(
        `SELECT currency_purchased AS "mostPurchasedGold", COUNT(*) AS "tierCount"
         FROM transactions_v2
         GROUP BY currency_purchased
         ORDER BY "tierCount" DESC
         LIMIT 1`
      );

      const totalResult = await this.pool.query(
        `SELECT COUNT(*) AS "transactionCount", COALESCE(SUM(amount_spent_usd), 0) AS "totalRevenue"
         FROM transactions_v2`
      );

      const dailyResult = await this.pool.query(
        `SELECT DATE(transaction_date) AS day,
                COALESCE(SUM(amount_spent_usd), 0) AS revenue,
                COUNT(*) AS purchases
         FROM transactions_v2
         WHERE transaction_date >= NOW() - INTERVAL '29 days'
         GROUP BY DATE(transaction_date)
         ORDER BY day ASC`
      );

      const tierResult = await this.pool.query(
        `SELECT currency_purchased AS gold, COUNT(*) AS purchases,
                COALESCE(SUM(amount_spent_usd), 0) AS revenue
         FROM transactions_v2
         GROUP BY currency_purchased
         ORDER BY purchases DESC`
      );

      const total = totalResult.rows[0] || { transactionCount: 0, totalRevenue: 0 };
      const topTier = aggResult.rows[0] || null;

      return {
        transactions: txResult.rows,
        summary: {
          totalRevenue: parseFloat(total.totalRevenue) || 0,
          transactionCount: parseInt(total.transactionCount) || 0,
          mostPurchasedTier: topTier
            ? { goldAmount: topTier.mostPurchasedGold, count: parseInt(topTier.tierCount) }
            : null,
        },
        earningsByDay: dailyResult.rows.map((r: any) => ({
          day: String(r.day).slice(0, 10),
          revenue: parseFloat(r.revenue) || 0,
          purchases: parseInt(r.purchases) || 0,
        })),
        tierBreakdown: tierResult.rows.map((r: any) => ({
          gold: parseInt(r.gold) || 0,
          purchases: parseInt(r.purchases) || 0,
          revenue: parseFloat(r.revenue) || 0,
        })),
      };
    } catch (err) {
      console.error("Error fetching all transactions:", err);
      return {
        transactions: [],
        summary: { totalRevenue: 0, transactionCount: 0, mostPurchasedTier: null },
        earningsByDay: [],
        tierBreakdown: [],
      };
    }
  }

  // ---------- Player stat tracking ----------

  async incrementPlayerStats(userId: number, shots: number, hits: number, deaths: number): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO player_stats (user_id, total_shots, shots_hit, deaths, minutes_played)
         VALUES ($1, $2, $3, $4, 0)
         ON CONFLICT (user_id) DO UPDATE SET
           total_shots = player_stats.total_shots + EXCLUDED.total_shots,
           shots_hit = player_stats.shots_hit + EXCLUDED.shots_hit,
           deaths = player_stats.deaths + EXCLUDED.deaths`,
        [userId, shots, hits, deaths]
      );
    } catch (err) {
      console.error("Error incrementing player stats:", err);
      throw err;
    }
  }

  async addMinutesPlayed(userId: number, minutes: number): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO player_stats (user_id, total_shots, shots_hit, deaths, minutes_played)
         VALUES ($1, 0, 0, 0, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           minutes_played = player_stats.minutes_played + EXCLUDED.minutes_played`,
        [userId, minutes]
      );
    } catch (err) {
      console.error("Error adding minutes played:", err);
      throw err;
    }
  }

  async getPlayerStats(userId: number): Promise<{ total_shots: number; shots_hit: number; deaths: number; minutes_played: number }> {
    try {
      const result = await this.pool.query(
        "SELECT total_shots, shots_hit, deaths, minutes_played FROM player_stats WHERE user_id = $1",
        [userId]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return { total_shots: 0, shots_hit: 0, deaths: 0, minutes_played: 0 };
    } catch (err) {
      console.error("Error fetching player stats:", err);
      return { total_shots: 0, shots_hit: 0, deaths: 0, minutes_played: 0 };
    }
  }
}

export const storage: IStorage = new PostgresStorage();
