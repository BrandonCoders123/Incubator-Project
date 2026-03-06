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
}

/**
 * MySQL-backed storage.
 *
 * This implementation is wired to your existing `accounts` table:
 *   user_id, username, password_hash, email, created_at, last_login, profile_pic
 */
class MySQLStorage implements IStorage {
  private pool: mysql.Pool;

  constructor() {
    // Make sure required env vars are present
    const requiredEnvVars = [
      "MYSQL_HOST",
      "MYSQL_USER",
      "MYSQL_PASSWORD",
      "MYSQL_DATABASE",
    ];
    const missing = requiredEnvVars.filter((v) => !process.env[v]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required MySQL environment variables: ${missing.join(", ")}`
      );
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
    const [rows] = await this.pool.execute(
      "SELECT user_id AS id, username, password_hash AS password, email FROM accounts WHERE user_id = ?",
      [id]
    );
    const users = rows as any[];
    return users[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [rows] = await this.pool.execute(
      "SELECT user_id AS id, username, password_hash AS password, email, COALESCE(adminCheck, 0) as adminCheck, COALESCE(is_banned, 0) as is_banned, ban_reason FROM accounts WHERE username = ?",
      [username]
    );
    const users = rows as any[];
    return users[0];
  }

  async isUserAdmin(userId: number): Promise<boolean> {
    try {
      const [rows] = await this.pool.execute(
        "SELECT COALESCE(adminCheck, 0) as adminCheck FROM accounts WHERE user_id = ?",
        [userId]
      );
      const users = rows as any[];
      return users[0]?.adminCheck === 1;
    } catch (err) {
      console.error('Error checking admin status:', err);
      return false;
    }
  }

  // ---------- User creation (FIXED) ----------

  async createUser(insertUser: InsertUser): Promise<User> {
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(insertUser.password, saltRounds);

    // IMPORTANT FIX:
    // Only insert into columns that actually exist in your `accounts` table.
    //
    // Table columns:
    //   user_id, username, password_hash, email, created_at, last_login, profile_pic
    //
    // `created_at` has a default of CURRENT_TIMESTAMP,
    // `last_login` and `profile_pic` have defaults as well,
    // so we can omit them from the INSERT.
    const [result] = await this.pool.execute(
      "INSERT INTO accounts (username, password_hash, email) VALUES (?, ?, ?)",
      [insertUser.username, hashedPassword, insertUser.email]
    );

    const insertResult = result as mysql.ResultSetHeader;

    return {
      id: insertResult.insertId,
      username: insertUser.username,
      password: hashedPassword,
      email: insertUser.email,
    };
  }

  // ---------- Currency / cosmetic data ----------
  // (Currently stubbed to simple defaults since your MySQL schema
  // doesn’t yet store per-user cosmetics/currency directly.)

  async updateUserCurrency(username: string, currency: number): Promise<void> {
    try {
      // Get user_id from accounts table
      const [userRows] = await this.pool.execute(
        `SELECT user_id FROM accounts WHERE username = ?`,
        [username]
      );
      const users = userRows as any[];
      if (users.length === 0) {
        console.log(`[updateUserCurrency] User ${username} not found`);
        return;
      }
      const userId = users[0].user_id;

      // Check if user has any inventory_items entries
      const [invRows] = await this.pool.execute(
        `SELECT id FROM inventory_items WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      const invResult = invRows as any[];

      if (invResult.length > 0) {
        // Update gold for all user's inventory_items rows
        await this.pool.execute(
          `UPDATE inventory_items SET gold = ? WHERE user_id = ?`,
          [currency, userId]
        );
      } else {
        // Create initial inventory_items entry with gold (item_id 0 means no item, just currency)
        await this.pool.execute(
          `INSERT INTO inventory_items (user_id, item_id, gold) VALUES (?, 0, ?)`,
          [userId, currency]
        );
      }
      console.log(`[updateUserCurrency] Set ${username} currency to ${currency}`);
    } catch (err) {
      console.error('Error updating user currency:', err);
      throw err;
    }
  }

  async getUserData(
    username: string
  ): Promise<{ currency: number; cosmetics: string[] } | undefined> {
    try {
      // Get user_id from accounts table
      const [userRows] = await this.pool.execute(
        `SELECT user_id FROM accounts WHERE username = ?`,
        [username]
      );
      const users = userRows as any[];
      if (users.length === 0) {
        return { currency: 500, cosmetics: [] };
      }
      const userId = users[0].user_id;

      // Get gold from inventory_items table only
      const [goldRows] = await this.pool.execute(
        `SELECT gold FROM inventory_items WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      const goldResult = goldRows as any[];
      const currency = goldResult.length > 0 ? (goldResult[0].gold || 500) : 500;

      // Get owned cosmetics from inventory_items table
      const [cosmeticRows] = await this.pool.execute(
        `SELECT i.item_name FROM items i 
         INNER JOIN inventory_items ii ON i.item_id = ii.item_id 
         WHERE ii.user_id = ? AND i.is_cosmetic = 1`,
        [userId]
      );
      const cosmetics = (cosmeticRows as any[]).map(row => row.item_name);

      return { currency, cosmetics };
    } catch (err) {
      console.error('Error fetching user data:', err);
      return { currency: 500, cosmetics: [] };
    }
  }

  // ---------- Profile info ----------

  async getUserProfile(
    userId: number
  ): Promise<
    { username: string; email: string; profilePicture: string | null; warning_count: number; isAdmin: boolean } | undefined
  > {
    const [rows] = await this.pool.execute(
      "SELECT username, email, profile_pic AS profilePicture, COALESCE(warning_count, 0) as warning_count, COALESCE(adminCheck, 0) as adminCheck FROM accounts WHERE user_id = ?",
      [userId]
    );
    const profiles = rows as any[];
    if (profiles[0]) {
      return {
        ...profiles[0],
        isAdmin: profiles[0].adminCheck === 1
      };
    }
    return undefined;
  }

  async updateUsername(userId: number, newUsername: string): Promise<void> {
    // Check if username already exists for someone else
    const [existing] = await this.pool.execute(
      "SELECT user_id FROM accounts WHERE username = ? AND user_id != ?",
      [newUsername, userId]
    );
    const existingUsers = existing as any[];
    if (existingUsers.length > 0) {
      throw new Error("Username already taken");
    }

    await this.pool.execute(
      "UPDATE accounts SET username = ? WHERE user_id = ?",
      [newUsername, userId]
    );
  }

  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    await this.pool.execute(
      "UPDATE accounts SET password_hash = ? WHERE user_id = ?",
      [newPasswordHash, userId]
    );
  }

  async updateProfilePicture(
    userId: number,
    profilePictureUrl: string
  ): Promise<void> {
    await this.pool.execute(
      "UPDATE accounts SET profile_pic = ? WHERE user_id = ?",
      [profilePictureUrl, userId]
    );
  }

  // ---------- Password verification ----------

  async verifyPassword(userId: number, password: string): Promise<boolean> {
    const [rows] = await this.pool.execute(
      "SELECT password_hash FROM accounts WHERE user_id = ?",
      [userId]
    );
    const users = rows as any[];
    if (users.length === 0) return false;

    return await bcrypt.compare(password, users[0].password_hash);
  }

  // ---------- Shop items ----------

  async getShopItems(): Promise<any[]> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT 
          item_id as id,
          item_name as name,
          item_type as type,
          store_price as price,
          is_cosmetic
        FROM items
        ORDER BY item_id ASC`
      );

      const items = rows as any[];
      return items.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.type,
        price: item.price,
        image_url: `https://via.placeholder.com/200?text=${encodeURIComponent(item.name)}`,
        rarity: item.is_cosmetic ? 'uncommon' : 'common',
        category: item.type
      }));
    } catch (err) {
      console.error('Error fetching shop items:', err);
      return [];
    }
  }

  // ---------- User inventory ----------

  async getUserInventory(userId: number): Promise<any[]> {
    try {
      // Get items directly from inventory_items table using user_id
      const [rows] = await this.pool.execute(
        `SELECT DISTINCT
          i.item_id as id,
          i.item_name as name,
          i.item_type as type,
          i.store_price as price,
          i.is_cosmetic
        FROM items i
        INNER JOIN inventory_items ii ON i.item_id = ii.item_id
        WHERE ii.user_id = ?
        ORDER BY i.item_id ASC`,
        [userId]
      );

      const items = rows as any[];
      return items.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        price: item.price,
        isCosmeticItem: item.is_cosmetic === 1 || item.is_cosmetic === true
      }));
    } catch (err) {
      console.error('Error fetching user inventory:', err);
      return [];
    }
  }

  async getUserCurrency(userId: number): Promise<number> {
    try {
      // Get gold from inventory_items table only
      const [rows] = await this.pool.execute(
        `SELECT gold FROM inventory_items WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      const result = rows as any[];
      if (result.length > 0) {
        return result[0].gold || 1000;
      }
      // New user with no inventory - return default starting gold
      return 1000;
    } catch (err) {
      console.error('Error fetching user currency:', err);
      return 1000;
    }
  }

  async updateUserGold(userId: number, newGold: number): Promise<void> {
    try {
      // Update gold in all inventory_items rows for this user
      await this.pool.execute(
        `UPDATE inventory_items SET gold = ? WHERE user_id = ?`,
        [newGold, userId]
      );
    } catch (err) {
      console.error('Error updating user gold:', err);
      throw err;
    }
  }

  async purchaseItem(userId: number, itemId: number, price: number): Promise<void> {
    try {
      // Get current gold from inventory_items only
      const [goldRows] = await this.pool.execute(
        `SELECT gold FROM inventory_items WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      const goldResult = goldRows as any[];
      let currentGold = goldResult.length > 0 ? (goldResult[0].gold || 1000) : 1000;
      
      // Special case: gold value of 67 means unlimited purchases (no gold check, no deduction)
      const hasUnlimitedGold = currentGold === 67;
      
      if (!hasUnlimitedGold && currentGold < price) {
        throw new Error('Insufficient gold');
      }

      // Check if user already owns this item
      const [existing] = await this.pool.execute(
        `SELECT id FROM inventory_items WHERE user_id = ? AND item_id = ?`,
        [userId, itemId]
      );
      const existingItems = existing as any[];
      if (existingItems.length > 0) {
        throw new Error('Item already owned');
      }

      // If unlimited gold, keep it at 67; otherwise deduct the price
      const newGold = hasUnlimitedGold ? 67 : currentGold - price;

      // Add item to inventory_items table (new table structure: id, user_id, item_id, gold, purchased_at)
      await this.pool.execute(
        `INSERT INTO inventory_items (user_id, item_id, gold) VALUES (?, ?, ?)`,
        [userId, itemId, newGold]
      );

      // Update gold for all user's existing inventory_items rows
      await this.pool.execute(
        `UPDATE inventory_items SET gold = ? WHERE user_id = ?`,
        [newGold, userId]
      );
    } catch (err) {
      console.error('Error purchasing item:', err);
      throw err;
    }
  }

  // ---------- User settings ----------

  async getUserSettings(userId: number): Promise<any> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT mouse_sensitivity, move_forward_key, move_backward_key, 
                move_left_key, move_right_key, jump_key 
         FROM user_settings WHERE user_id = ?`,
        [userId]
      );
      const result = rows as any[];
      if (result.length > 0) {
        return result[0];
      }
      // Return defaults if no settings exist
      return {
        mouse_sensitivity: 1.0,
        move_forward_key: "KeyW",
        move_backward_key: "KeyS",
        move_left_key: "KeyA",
        move_right_key: "KeyD",
        jump_key: "Space"
      };
    } catch (err) {
      console.error('Error fetching user settings:', err);
      // Return defaults on error
      return {
        mouse_sensitivity: 1.0,
        move_forward_key: "KeyW",
        move_backward_key: "KeyS",
        move_left_key: "KeyA",
        move_right_key: "KeyD",
        jump_key: "Space"
      };
    }
  }

  async saveUserSettings(userId: number, settings: any): Promise<void> {
    try {
      // Check if settings exist
      const [existing] = await this.pool.execute(
        `SELECT user_id FROM user_settings WHERE user_id = ?`,
        [userId]
      );
      const existingRows = existing as any[];

      if (existingRows.length > 0) {
        // Update existing settings
        await this.pool.execute(
          `UPDATE user_settings SET 
            mouse_sensitivity = ?,
            move_forward_key = ?,
            move_backward_key = ?,
            move_left_key = ?,
            move_right_key = ?,
            jump_key = ?
           WHERE user_id = ?`,
          [
            settings.mouse_sensitivity || 1.0,
            settings.move_forward_key || "KeyW",
            settings.move_backward_key || "KeyS",
            settings.move_left_key || "KeyA",
            settings.move_right_key || "KeyD",
            settings.jump_key || "Space",
            userId
          ]
        );
      } else {
        // Insert new settings
        await this.pool.execute(
          `INSERT INTO user_settings (user_id, mouse_sensitivity, move_forward_key, 
            move_backward_key, move_left_key, move_right_key, jump_key)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            settings.mouse_sensitivity || 1.0,
            settings.move_forward_key || "KeyW",
            settings.move_backward_key || "KeyS",
            settings.move_left_key || "KeyA",
            settings.move_right_key || "KeyD",
            settings.jump_key || "Space"
          ]
        );
      }
    } catch (err) {
      console.error('Error saving user settings:', err);
      throw err;
    }
  }

  // ---------- Admin methods ----------

  async getAdminByUsername(username: string): Promise<any | undefined> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT admin_id, admin_username, admin_password_hash, access_level, is_active 
         FROM admin WHERE admin_username = ? AND is_active = 1`,
        [username]
      );
      const admins = rows as any[];
      return admins[0];
    } catch (err) {
      console.error('Error fetching admin:', err);
      return undefined;
    }
  }

  async updateAdminLastLogin(adminId: number): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE admin SET last_login = NOW() WHERE admin_id = ?`,
        [adminId]
      );
    } catch (err) {
      console.error('Error updating admin last login:', err);
    }
  }

  async getAllUsers(): Promise<any[]> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT a.user_id, a.username, a.email, a.created_at, a.last_login,
                COALESCE((SELECT gold FROM inventory_items WHERE user_id = a.user_id LIMIT 1), 1000) as gold,
                COALESCE(a.is_banned, 0) as is_banned,
                a.ban_reason,
                COALESCE(a.warning_count, 0) as warning_count
         FROM accounts a
         ORDER BY a.user_id ASC`
      );
      return rows as any[];
    } catch (err) {
      console.error('Error fetching all users:', err);
      return [];
    }
  }

  async getAllItems(): Promise<any[]> {
    try {
      const [rows] = await this.pool.execute(
        `SELECT item_id, item_name, item_type, store_price, is_cosmetic
         FROM items
         ORDER BY item_id ASC`
      );
      return rows as any[];
    } catch (err) {
      console.error('Error fetching all items:', err);
      return [];
    }
  }

  async addItem(name: string, type: string, price: number, isCosmetic: boolean): Promise<any> {
    try {
      const [result] = await this.pool.execute(
        `INSERT INTO items (item_name, item_type, store_price, is_cosmetic) VALUES (?, ?, ?, ?)`,
        [name, type, price, isCosmetic ? 1 : 0]
      );
      const insertResult = result as any;
      return { item_id: insertResult.insertId, item_name: name, item_type: type, store_price: price, is_cosmetic: isCosmetic };
    } catch (err) {
      console.error('Error adding item:', err);
      throw err;
    }
  }

  async updateItem(itemId: number, name: string, type: string, price: number, isCosmetic: boolean): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE items SET item_name = ?, item_type = ?, store_price = ?, is_cosmetic = ? WHERE item_id = ?`,
        [name, type, price, isCosmetic ? 1 : 0, itemId]
      );
    } catch (err) {
      console.error('Error updating item:', err);
      throw err;
    }
  }

  async deleteItem(itemId: number): Promise<void> {
    try {
      await this.pool.execute(`DELETE FROM items WHERE item_id = ?`, [itemId]);
    } catch (err) {
      console.error('Error deleting item:', err);
      throw err;
    }
  }

  async setUserGold(userId: number, gold: number): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE inventory_items SET gold = ? WHERE user_id = ?`,
        [gold, userId]
      );
    } catch (err) {
      console.error('Error setting user gold:', err);
      throw err;
    }
  }

  async deleteUser(userId: number): Promise<void> {
    try {
      // Delete related records first (inventory, settings, etc.) - ignore errors for optional tables
      try {
        await this.pool.execute(`DELETE FROM inventory_items WHERE user_id = ?`, [userId]);
      } catch (e) {
        console.log('No inventory_items to delete or table does not exist');
      }
      try {
        await this.pool.execute(`DELETE FROM user_settings WHERE user_id = ?`, [userId]);
      } catch (e) {
        console.log('No user_settings to delete or table does not exist');
      }
      // Delete the user account
      await this.pool.execute(`DELETE FROM accounts WHERE user_id = ?`, [userId]);
    } catch (err) {
      console.error('Error deleting user:', err);
      throw err;
    }
  }

  async banUser(userId: number, reason: string | null): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE accounts SET is_banned = 1, ban_reason = ?, banned_at = NOW() WHERE user_id = ?`,
        [reason, userId]
      );
    } catch (err) {
      console.error('Error banning user:', err);
      throw err;
    }
  }

  async unbanUser(userId: number): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE accounts SET is_banned = 0, ban_reason = NULL, banned_at = NULL WHERE user_id = ?`,
        [userId]
      );
    } catch (err) {
      console.error('Error unbanning user:', err);
      throw err;
    }
  }

  async warnUser(userId: number): Promise<void> {
    try {
      await this.pool.execute(
        `UPDATE accounts SET warning_count = COALESCE(warning_count, 0) + 1 WHERE user_id = ?`,
        [userId]
      );
    } catch (err) {
      console.error('Error warning user:', err);
      throw err;
    }
  }

  async getLeaderboard(category: string, limit: number = 50): Promise<any[]> {
    try {
      // First check which columns exist in leaderboard_2
      const [columns] = await this.pool.execute(
        `SHOW COLUMNS FROM leaderboard_2`
      );
      const columnNames = (columns as any[]).map(c => c.Field);
      
      const hasFastestRunTime = columnNames.includes('fastest_run_time');
      const hasTotalKills = columnNames.includes('total_kills');
      
      // Build dynamic query - include fastest_run_time and total_kills
      let selectFields = `lb.leaderboard_id, lb.user_id, a.username, lb.rank, lb.date_recorded`;
      
      if (hasFastestRunTime) {
        selectFields += `, lb.fastest_run_time`;
      } else {
        selectFields += `, NULL as fastest_run_time`;
      }
      
      if (hasTotalKills) {
        selectFields += `, COALESCE(lb.total_kills, 0) as total_kills`;
      } else {
        selectFields += `, 0 as total_kills`;
      }
      
      // Determine order by clause based on category
      let orderBy: string;
      let whereClause = "";
      switch (category) {
        case "kills":
          orderBy = hasTotalKills ? "total_kills DESC" : "lb.leaderboard_id DESC";
          break;
        case "fastest_time":
          // For fastest time, order ASC (lower is better) and only show entries with a time
          orderBy = hasFastestRunTime ? "lb.fastest_run_time ASC" : "lb.leaderboard_id DESC";
          if (hasFastestRunTime) {
            whereClause = "WHERE lb.fastest_run_time IS NOT NULL";
          }
          break;
        default:
          orderBy = hasTotalKills ? "total_kills DESC" : "lb.leaderboard_id DESC";
          break;
      }
      
      const [rows] = await this.pool.execute(
        `SELECT ${selectFields}
        FROM leaderboard_2 lb
        LEFT JOIN accounts a ON lb.user_id = a.user_id
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ?`,
        [limit]
      );
      return rows as any[];
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      return [];
    }
  }

  async saveLeaderboardEntry(userId: number, fastestRunTime: string | null, totalKills: number | null): Promise<void> {
    try {
      // Check if user already has a leaderboard entry
      const [existing] = await this.pool.execute(
        `SELECT leaderboard_id, fastest_run_time, total_kills FROM leaderboard_2 WHERE user_id = ?`,
        [userId]
      );
      
      const existingRows = existing as any[];
      
      if (existingRows.length > 0) {
        const currentTime = existingRows[0].fastest_run_time;
        const currentKills = existingRows[0].total_kills || 0;
        
        // Build dynamic update query
        const updates: string[] = [];
        const params: any[] = [];
        
        // Update fastest_run_time only if new time is faster
        if (fastestRunTime && (!currentTime || fastestRunTime < currentTime)) {
          updates.push('fastest_run_time = ?');
          params.push(fastestRunTime);
          console.log(`Updated fastest time for user ${userId}: ${fastestRunTime}`);
        }
        
        // Update total_kills - use max value (best run, not accumulated)
        if (totalKills !== null && totalKills > currentKills) {
          updates.push('total_kills = ?');
          params.push(totalKills);
          console.log(`Updated total kills for user ${userId}: ${currentKills} -> ${totalKills}`);
        }
        
        if (updates.length > 0) {
          updates.push('date_recorded = NOW()');
          params.push(userId);
          await this.pool.execute(
            `UPDATE leaderboard_2 SET ${updates.join(', ')} WHERE user_id = ?`,
            params
          );
        }
      } else {
        // Create new entry
        await this.pool.execute(
          `INSERT INTO leaderboard_2 (user_id, fastest_run_time, total_kills, date_recorded) VALUES (?, ?, ?, NOW())`,
          [userId, fastestRunTime, totalKills || 0]
        );
        console.log(`Created new leaderboard entry for user ${userId}: time=${fastestRunTime}, kills=${totalKills}`);
      }
    } catch (err) {
      console.error('Error saving leaderboard entry:', err);
      throw err;
    }
  }

  async saveCurrencyTransaction(userId: number, amountUSD: number, cardNumber: string, goldAmount: number): Promise<void> {
    try {
      // Ensure card_number column exists (safe migration)
      try {
        await this.pool.execute(`ALTER TABLE transactions ADD COLUMN card_number VARCHAR(20) NULL`);
        console.log('Added card_number column to transactions table');
      } catch (alterErr: any) {
        // Column already exists — ignore
        if (!alterErr.message?.includes('Duplicate column name')) {
          console.warn('ALTER TABLE warning:', alterErr.message);
        }
      }

      await this.pool.execute(
        `INSERT INTO transactions (user_id, amount_spent_usd, card_number, currency_purchased, transaction_date)
         VALUES (?, ?, ?, ?, NOW())`,
        [userId, amountUSD, cardNumber, goldAmount]
      );
      console.log(`Transaction saved: user=${userId}, spent=$${amountUSD}, gold=${goldAmount}`);
    } catch (err) {
      console.error('Error saving currency transaction:', err);
      throw err;
    }
  }
}

// The single storage instance used everywhere else
export const storage: IStorage = new MySQLStorage();
