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
    { username: string; email: string; profilePicture: string | null } | undefined
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
      "SELECT user_id AS id, username, password_hash AS password, email FROM accounts WHERE username = ?",
      [username]
    );
    const users = rows as any[];
    return users[0];
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
        `SELECT id FROM inventory_items WHERE inventory_id = ? LIMIT 1`,
        [userId]
      );
      const invResult = invRows as any[];

      if (invResult.length > 0) {
        // Update gold for all user's inventory_items rows
        await this.pool.execute(
          `UPDATE inventory_items SET gold = ? WHERE inventory_id = ?`,
          [currency, userId]
        );
      } else {
        // Create initial inventory_items entry with gold (item_id 0 means no item, just currency)
        await this.pool.execute(
          `INSERT INTO inventory_items (inventory_id, item_id, gold) VALUES (?, 0, ?)`,
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
        return { currency: 1000, cosmetics: [] };
      }
      const userId = users[0].user_id;

      // Get gold from inventory_items table (inventory_id = user_id)
      const [goldRows] = await this.pool.execute(
        `SELECT gold FROM inventory_items WHERE inventory_id = ? LIMIT 1`,
        [userId]
      );
      const goldResult = goldRows as any[];
      // New users with no inventory get 1000 gold starting balance
      const currency = goldResult.length > 0 ? (goldResult[0].gold || 1000) : 1000;

      // Get owned cosmetics from inventory_items table
      const [cosmeticRows] = await this.pool.execute(
        `SELECT i.item_name FROM items i 
         INNER JOIN inventory_items ii ON i.item_id = ii.item_id 
         WHERE ii.inventory_id = ? AND i.is_cosmetic = 1`,
        [userId]
      );
      const cosmetics = (cosmeticRows as any[]).map(row => row.item_name);

      return { currency, cosmetics };
    } catch (err) {
      console.error('Error fetching user data:', err);
      return { currency: 1000, cosmetics: [] };
    }
  }

  // ---------- Profile info ----------

  async getUserProfile(
    userId: number
  ): Promise<
    { username: string; email: string; profilePicture: string | null } | undefined
  > {
    const [rows] = await this.pool.execute(
      "SELECT username, email, profile_pic AS profilePicture FROM accounts WHERE user_id = ?",
      [userId]
    );
    const profiles = rows as any[];
    return profiles[0];
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
      // Get items directly from inventory_items table using user_id (inventory_id = user_id)
      const [rows] = await this.pool.execute(
        `SELECT DISTINCT
          i.item_id as id,
          i.item_name as name,
          i.item_type as type,
          i.store_price as price,
          i.is_cosmetic
        FROM items i
        INNER JOIN inventory_items ii ON i.item_id = ii.item_id
        WHERE ii.inventory_id = ?
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
      // Get gold from inventory_items table (inventory_id = user_id)
      const [rows] = await this.pool.execute(
        `SELECT gold FROM inventory_items WHERE inventory_id = ? LIMIT 1`,
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
        `UPDATE inventory_items SET gold = ? WHERE inventory_id = ?`,
        [newGold, userId]
      );
    } catch (err) {
      console.error('Error updating user gold:', err);
      throw err;
    }
  }

  async purchaseItem(userId: number, itemId: number, price: number): Promise<void> {
    try {
      // Get current gold from inventory_items (inventory_id = user_id)
      const [goldRows] = await this.pool.execute(
        `SELECT gold FROM inventory_items WHERE inventory_id = ? LIMIT 1`,
        [userId]
      );
      const goldResult = goldRows as any[];
      let currentGold = goldResult.length > 0 ? (goldResult[0].gold || 1000) : 1000;
      
      if (currentGold < price) {
        throw new Error('Insufficient gold');
      }

      // Check if user already owns this item
      const [existing] = await this.pool.execute(
        `SELECT id FROM inventory_items WHERE inventory_id = ? AND item_id = ?`,
        [userId, itemId]
      );
      const existingItems = existing as any[];
      if (existingItems.length > 0) {
        throw new Error('Item already owned');
      }

      const newGold = currentGold - price;

      // Add item to inventory_items table with updated gold
      await this.pool.execute(
        `INSERT INTO inventory_items (inventory_id, item_id, gold) VALUES (?, ?, ?)`,
        [userId, itemId, newGold]
      );

      // Update gold for all user's existing inventory rows
      await this.pool.execute(
        `UPDATE inventory_items SET gold = ? WHERE inventory_id = ?`,
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
}

// The single storage instance used everywhere else
export const storage: IStorage = new MySQLStorage();
