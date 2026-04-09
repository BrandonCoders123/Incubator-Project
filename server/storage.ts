import type { User, InsertUser } from "@shared/schema";
import mysql from "mysql2/promise";
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

class MySQLStorage implements IStorage {
  private pool: mysql.Pool;

  constructor() {
    const required = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
    const missing = required.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`Missing required MySQL environment variables: ${missing.join(", ")}`);
    }

    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  // ---------- User lookups ----------

  async getUser(id: number): Promise<User | undefined> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      "SELECT user_id AS id, username, password_hash AS password, email FROM accounts WHERE user_id = ?",
      [id]
    );
    return rows[0] as User | undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT user_id AS id, username, password_hash AS password, email,
              COALESCE(\`adminCheck\`, 0) AS adminCheck,
              COALESCE(is_banned, 0) AS is_banned, ban_reason
       FROM accounts WHERE username = ?`,
      [username]
    );
    return rows[0] as User | undefined;
  }

  async isUserAdmin(userId: number): Promise<boolean> {
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT COALESCE(`adminCheck`, 0) AS adminCheck FROM accounts WHERE user_id = ?",
        [userId]
      );
      return rows[0]?.adminCheck === 1;
    } catch (err) {
      console.error("Error checking admin status:", err);
      return false;
    }
  }

  // ---------- User creation ----------

  async createUser(insertUser: InsertUser): Promise<User> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(insertUser.password, saltRounds);

    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      "INSERT INTO accounts (username, password_hash, email) VALUES (?, ?, ?)",
      [insertUser.username, hashedPassword, insertUser.email]
    );

    return {
      id: result.insertId,
      username: insertUser.username,
      password: hashedPassword,
      email: insertUser.email,
    };
  }

  // ---------- Currency / cosmetic data ----------

  async updateUserCurrency(username: string, currency: number): Promise<void> {
    try {
      const [userRows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT user_id FROM accounts WHERE username = ?",
        [username]
      );
      if (userRows.length === 0) {
        console.log(`[updateUserCurrency] User ${username} not found`);
        return;
      }
      const userId = userRows[0].user_id;

      const [invRows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT id FROM inventory_items WHERE user_id = ? LIMIT 1",
        [userId]
      );

      if (invRows.length > 0) {
        await this.pool.query(
          "UPDATE inventory_items SET gold = ? WHERE user_id = ?",
          [currency, userId]
        );
      } else {
        await this.pool.query(
          "INSERT INTO inventory_items (user_id, item_id, gold) VALUES (?, 0, ?)",
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
      const [userRows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT user_id FROM accounts WHERE username = ?",
        [username]
      );
      if (userRows.length === 0) return { currency: 500, cosmetics: [] };
      const userId = userRows[0].user_id;

      const [goldRows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT gold FROM inventory_items WHERE user_id = ? LIMIT 1",
        [userId]
      );
      const currency = goldRows.length > 0 ? (goldRows[0].gold || 500) : 500;

      const [cosmeticRows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT i.item_name FROM items i
         INNER JOIN inventory_items ii ON i.item_id = ii.item_id
         WHERE ii.user_id = ? AND i.is_cosmetic = 1`,
        [userId]
      );
      const cosmetics = cosmeticRows.map((row: any) => row.item_name);

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
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT username, email, profile_pic AS profilePicture,
              COALESCE(warning_count, 0) AS warning_count,
              COALESCE(\`adminCheck\`, 0) AS adminCheck
       FROM accounts WHERE user_id = ?`,
      [userId]
    );
    if (rows[0]) {
      return {
        ...rows[0],
        profilePicture: rows[0].profilePicture ?? null,
        isAdmin: rows[0].adminCheck === 1,
      } as any;
    }
    return undefined;
  }

  async updateUsername(userId: number, newUsername: string): Promise<void> {
    const [existing] = await this.pool.query<mysql.RowDataPacket[]>(
      "SELECT user_id FROM accounts WHERE username = ? AND user_id != ?",
      [newUsername, userId]
    );
    if (existing.length > 0) throw new Error("Username already taken");
    await this.pool.query(
      "UPDATE accounts SET username = ? WHERE user_id = ?",
      [newUsername, userId]
    );
  }

  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE accounts SET password_hash = ? WHERE user_id = ?",
      [newPasswordHash, userId]
    );
  }

  async updateProfilePicture(userId: number, profilePictureUrl: string): Promise<void> {
    await this.pool.query(
      "UPDATE accounts SET profile_pic = ? WHERE user_id = ?",
      [profilePictureUrl, userId]
    );
  }

  // ---------- Password verification ----------

  async verifyPassword(userId: number, password: string): Promise<boolean> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      "SELECT password_hash FROM accounts WHERE user_id = ?",
      [userId]
    );
    if (rows.length === 0) return false;
    return await bcrypt.compare(password, rows[0].password_hash);
  }

  // ---------- Shop items ----------

  async getShopItems(): Promise<any[]> {
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT item_id AS id, item_name AS name, item_type AS type, store_price AS price, is_cosmetic FROM items ORDER BY item_id ASC"
      );
      return rows.map((item: any) => ({
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
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT DISTINCT i.item_id AS id, i.item_name AS name, i.item_type AS type,
                i.store_price AS price, i.is_cosmetic
         FROM items i
         INNER JOIN inventory_items ii ON i.item_id = ii.item_id
         WHERE ii.user_id = ?
         ORDER BY i.item_id ASC`,
        [userId]
      );
      return rows.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        price: item.price,
        isCosmeticItem: item.is_cosmetic === 1,
      }));
    } catch (err) {
      console.error("Error fetching user inventory:", err);
      return [];
    }
  }

  async getUserCurrency(userId: number): Promise<number> {
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT gold FROM inventory_items WHERE user_id = ? LIMIT 1",
        [userId]
      );
      return rows.length > 0 ? (rows[0].gold || 1000) : 1000;
    } catch (err) {
      console.error("Error fetching user currency:", err);
      return 1000;
    }
  }

  async updateUserGold(userId: number, newGold: number): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE inventory_items SET gold = ? WHERE user_id = ?",
        [newGold, userId]
      );
    } catch (err) {
      console.error("Error updating user gold:", err);
      throw err;
    }
  }

  async purchaseItem(userId: number, itemId: number, price: number): Promise<void> {
    try {
      const [goldRows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT gold FROM inventory_items WHERE user_id = ? LIMIT 1",
        [userId]
      );
      let currentGold = goldRows.length > 0 ? (goldRows[0].gold || 1000) : 1000;
      const hasUnlimitedGold = currentGold === 67;

      if (!hasUnlimitedGold && currentGold < price) throw new Error("Insufficient gold");

      const [existingRows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT id FROM inventory_items WHERE user_id = ? AND item_id = ?",
        [userId, itemId]
      );
      if (existingRows.length > 0) throw new Error("Item already owned");

      const newGold = hasUnlimitedGold ? 67 : currentGold - price;

      await this.pool.query(
        "INSERT INTO inventory_items (user_id, item_id, gold) VALUES (?, ?, ?)",
        [userId, itemId, newGold]
      );
      await this.pool.query(
        "UPDATE inventory_items SET gold = ? WHERE user_id = ?",
        [newGold, userId]
      );
    } catch (err) {
      console.error("Error purchasing item:", err);
      throw err;
    }
  }

  // ---------- User settings ----------

  async getUserSettings(userId: number): Promise<any> {
    const defaults = {
      mouse_sensitivity: 1.0,
      move_forward_key: "KeyW",
      move_backward_key: "KeyS",
      move_left_key: "KeyA",
      move_right_key: "KeyD",
      jump_key: "Space",
      grenade_key: "KeyQ",
    };
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT mouse_sensitivity, move_forward_key, move_backward_key,
                move_left_key, move_right_key, jump_key, grenade_key
         FROM user_settings WHERE user_id = ?`,
        [userId]
      );
      return rows.length > 0 ? rows[0] : defaults;
    } catch (err) {
      console.error("Error fetching user settings:", err);
      return defaults;
    }
  }

  async saveUserSettings(userId: number, settings: any): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO user_settings
           (user_id, mouse_sensitivity, move_forward_key, move_backward_key,
            move_left_key, move_right_key, jump_key, grenade_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           mouse_sensitivity   = VALUES(mouse_sensitivity),
           move_forward_key    = VALUES(move_forward_key),
           move_backward_key   = VALUES(move_backward_key),
           move_left_key       = VALUES(move_left_key),
           move_right_key      = VALUES(move_right_key),
           jump_key            = VALUES(jump_key),
           grenade_key         = VALUES(grenade_key)`,
        [
          userId,
          settings.mouse_sensitivity ?? 1.0,
          settings.move_forward_key ?? "KeyW",
          settings.move_backward_key ?? "KeyS",
          settings.move_left_key ?? "KeyA",
          settings.move_right_key ?? "KeyD",
          settings.jump_key ?? "Space",
          settings.grenade_key ?? "KeyQ",
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
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT a.user_id, a.username, a.email, a.created_at, a.last_login,
                COALESCE((SELECT gold FROM inventory_items WHERE user_id = a.user_id LIMIT 1), 1000) AS gold,
                COALESCE(a.is_banned, 0) AS is_banned,
                a.ban_reason,
                COALESCE(a.warning_count, 0) AS warning_count
         FROM accounts a
         ORDER BY a.user_id ASC`
      );
      return rows;
    } catch (err) {
      console.error("Error fetching all users:", err);
      return [];
    }
  }

  async getAllItems(): Promise<any[]> {
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT item_id, item_name, item_type, store_price, is_cosmetic FROM items ORDER BY item_id ASC"
      );
      return rows;
    } catch (err) {
      console.error("Error fetching all items:", err);
      return [];
    }
  }

  async addItem(name: string, type: string, price: number, isCosmetic: boolean): Promise<any> {
    try {
      const [result] = await this.pool.query<mysql.ResultSetHeader>(
        "INSERT INTO items (item_name, item_type, store_price, is_cosmetic) VALUES (?, ?, ?, ?)",
        [name, type, price, isCosmetic ? 1 : 0]
      );
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM items WHERE item_id = ?",
        [result.insertId]
      );
      return rows[0];
    } catch (err) {
      console.error("Error adding item:", err);
      throw err;
    }
  }

  async updateItem(itemId: number, name: string, type: string, price: number, isCosmetic: boolean): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE items SET item_name = ?, item_type = ?, store_price = ?, is_cosmetic = ? WHERE item_id = ?",
        [name, type, price, isCosmetic ? 1 : 0, itemId]
      );
    } catch (err) {
      console.error("Error updating item:", err);
      throw err;
    }
  }

  async deleteItem(itemId: number): Promise<void> {
    try {
      await this.pool.query("DELETE FROM items WHERE item_id = ?", [itemId]);
    } catch (err) {
      console.error("Error deleting item:", err);
      throw err;
    }
  }

  async setUserGold(userId: number, gold: number): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE inventory_items SET gold = ? WHERE user_id = ?",
        [gold, userId]
      );
    } catch (err) {
      console.error("Error setting user gold:", err);
      throw err;
    }
  }

  async deleteUser(userId: number): Promise<void> {
    try {
      await this.pool.query("DELETE FROM inventory_items WHERE user_id = ?", [userId]);
      await this.pool.query("DELETE FROM user_settings WHERE user_id = ?", [userId]);
      await this.pool.query("DELETE FROM accounts WHERE user_id = ?", [userId]);
    } catch (err) {
      console.error("Error deleting user:", err);
      throw err;
    }
  }

  async banUser(userId: number, reason: string | null): Promise<void> {
    try {
      await this.pool.query(
        "UPDATE accounts SET is_banned = 1, ban_reason = ?, banned_at = NOW() WHERE user_id = ?",
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
        "UPDATE accounts SET is_banned = 0, ban_reason = NULL, banned_at = NULL WHERE user_id = ?",
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
        "UPDATE accounts SET warning_count = COALESCE(warning_count, 0) + 1 WHERE user_id = ?",
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

      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT lb.leaderboard_id, lb.user_id, a.username, lb.rank, lb.date_recorded,
                lb.fastest_run_time, COALESCE(lb.total_kills, 0) AS total_kills
         FROM leaderboard_2 lb
         LEFT JOIN accounts a ON lb.user_id = a.user_id
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT ?`,
        [limit]
      );
      return rows;
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      return [];
    }
  }

  async saveLeaderboardEntry(userId: number, fastestRunTime: string | null, totalKills: number | null): Promise<void> {
    try {
      const [existing] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT leaderboard_id, fastest_run_time, total_kills FROM leaderboard_2 WHERE user_id = ?",
        [userId]
      );

      if (existing.length > 0) {
        const currentTime = existing[0].fastest_run_time;
        const currentKills = existing[0].total_kills || 0;

        const setClauses: string[] = [];
        const params: any[] = [];

        if (fastestRunTime && (!currentTime || fastestRunTime < currentTime)) {
          setClauses.push("fastest_run_time = ?");
          params.push(fastestRunTime);
        }
        if (totalKills !== null && totalKills > currentKills) {
          setClauses.push("total_kills = ?");
          params.push(totalKills);
        }

        if (setClauses.length > 0) {
          setClauses.push("date_recorded = NOW()");
          params.push(userId);
          await this.pool.query(
            `UPDATE leaderboard_2 SET ${setClauses.join(", ")} WHERE user_id = ?`,
            params
          );
        }
      } else {
        await this.pool.query(
          "INSERT INTO leaderboard_2 (user_id, fastest_run_time, total_kills, date_recorded) VALUES (?, ?, ?, NOW())",
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
        "INSERT INTO transactions_v2 (user_id, amount_spent_usd, card_number, currency_purchased, transaction_date) VALUES (?, ?, ?, ?, NOW())",
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
      const [txRows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT t.transaction_id, t.user_id, a.username, t.amount_spent_usd,
                t.card_number, t.currency_purchased, t.transaction_date
         FROM transactions_v2 t
         LEFT JOIN accounts a ON t.user_id = a.user_id
         ORDER BY t.transaction_date DESC`
      );

      const [aggRows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT currency_purchased AS mostPurchasedGold, COUNT(*) AS tierCount
         FROM transactions_v2
         GROUP BY currency_purchased
         ORDER BY tierCount DESC
         LIMIT 1`
      );

      const [totalRows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS transactionCount, COALESCE(SUM(amount_spent_usd), 0) AS totalRevenue FROM transactions_v2"
      );

      const [dailyRows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT DATE(transaction_date) AS day,
                COALESCE(SUM(amount_spent_usd), 0) AS revenue,
                COUNT(*) AS purchases
         FROM transactions_v2
         WHERE transaction_date >= DATE_SUB(NOW(), INTERVAL 29 DAY)
         GROUP BY DATE(transaction_date)
         ORDER BY day ASC`
      );

      const [tierRows] = await this.pool.query<mysql.RowDataPacket[]>(
        `SELECT currency_purchased AS gold, COUNT(*) AS purchases,
                COALESCE(SUM(amount_spent_usd), 0) AS revenue
         FROM transactions_v2
         GROUP BY currency_purchased
         ORDER BY purchases DESC`
      );

      const total = totalRows[0] || { transactionCount: 0, totalRevenue: 0 };
      const topTier = aggRows[0] || null;

      return {
        transactions: txRows,
        summary: {
          totalRevenue: parseFloat(total.totalRevenue) || 0,
          transactionCount: parseInt(total.transactionCount) || 0,
          mostPurchasedTier: topTier
            ? { goldAmount: topTier.mostPurchasedGold, count: parseInt(topTier.tierCount) }
            : null,
        },
        earningsByDay: dailyRows.map((r: any) => ({
          day: String(r.day).slice(0, 10),
          revenue: parseFloat(r.revenue) || 0,
          purchases: parseInt(r.purchases) || 0,
        })),
        tierBreakdown: tierRows.map((r: any) => ({
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
         VALUES (?, ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           total_shots = player_stats.total_shots + VALUES(total_shots),
           shots_hit   = player_stats.shots_hit   + VALUES(shots_hit),
           deaths      = player_stats.deaths      + VALUES(deaths)`,
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
         VALUES (?, 0, 0, 0, ?)
         ON DUPLICATE KEY UPDATE
           minutes_played = player_stats.minutes_played + VALUES(minutes_played)`,
        [userId, minutes]
      );
    } catch (err) {
      console.error("Error adding minutes played:", err);
      throw err;
    }
  }

  async getPlayerStats(userId: number): Promise<{ total_shots: number; shots_hit: number; deaths: number; minutes_played: number }> {
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
        "SELECT total_shots, shots_hit, deaths, minutes_played FROM player_stats WHERE user_id = ?",
        [userId]
      );
      return rows.length > 0 ? rows[0] as any : { total_shots: 0, shots_hit: 0, deaths: 0, minutes_played: 0 };
    } catch (err) {
      console.error("Error fetching player stats:", err);
      return { total_shots: 0, shots_hit: 0, deaths: 0, minutes_played: 0 };
    }
  }
}

export const storage: IStorage = new MySQLStorage();
