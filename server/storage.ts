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
  purchaseItem(userId: number, itemId: number): Promise<void>;
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
    // TODO: If you later add a dedicated table for currency,
    // update this method to write to that table.
    console.log(
      `[updateUserCurrency] (stub) Would set ${username} currency to ${currency}`
    );
  }

  async getUserData(
    username: string
  ): Promise<{ currency: number; cosmetics: string[] } | undefined> {
    // For now, return some defaults so the game can run.
    // Update this once you have a proper user_data or stats table.
    return { currency: 1000, cosmetics: [] };
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
      const [rows] = await this.pool.execute(
        `SELECT DISTINCT
          i.item_id as id,
          i.item_name as name,
          i.item_type as type,
          i.store_price as price,
          i.is_cosmetic,
          CASE WHEN ui.user_id IS NOT NULL THEN 1 ELSE 0 END as owned
        FROM items i
        LEFT JOIN user_items ui ON i.item_id = ui.item_id AND ui.user_id = ?
        WHERE ui.user_id = ?
        ORDER BY i.item_id ASC`,
        [userId, userId]
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

  async purchaseItem(userId: number, itemId: number): Promise<void> {
    try {
      await this.pool.execute(
        `INSERT INTO user_items (user_id, item_id, purchased_at) 
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE purchased_at = NOW()`,
        [userId, itemId]
      );
    } catch (err) {
      console.error('Error purchasing item:', err);
      throw err;
    }
  }
}

// The single storage instance used everywhere else
export const storage: IStorage = new MySQLStorage();
