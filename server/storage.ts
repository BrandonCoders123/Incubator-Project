import { users, type User, type InsertUser } from "@shared/schema";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserCurrency(username: string, currency: number): Promise<void>;
  getUserData(username: string): Promise<{currency: number, cosmetics: string[]} | undefined>;
  getUserProfile(userId: number): Promise<{username: string, email: string, profilePicture: string | null} | undefined>;
  updateUsername(userId: number, newUsername: string): Promise<void>;
  updatePassword(userId: number, newPasswordHash: string): Promise<void>;
  updateProfilePicture(userId: number, profilePictureUrl: string): Promise<void>;
  verifyPassword(userId: number, password: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.currentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  async updateUserCurrency(username: string, currency: number): Promise<void> {
    // In-memory implementation - would need to be enhanced
  }
  
  async getUserData(username: string): Promise<{currency: number, cosmetics: string[]} | undefined> {
    return { currency: 0, cosmetics: [] };
  }
  
  async getUserProfile(userId: number): Promise<{username: string, email: string, profilePicture: string | null} | undefined> {
    throw new Error('Not implemented in MemStorage');
  }
  
  async updateUsername(userId: number, newUsername: string): Promise<void> {
    throw new Error('Not implemented in MemStorage');
  }
  
  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    throw new Error('Not implemented in MemStorage');
  }
  
  async updateProfilePicture(userId: number, profilePictureUrl: string): Promise<void> {
    throw new Error('Not implemented in MemStorage');
  }
  
  async verifyPassword(userId: number, password: string): Promise<boolean> {
    throw new Error('Not implemented in MemStorage');
  }
}

// File-based storage implementation
export class FileStorage implements IStorage {
  private accountsPath = path.join(__dirname, 'accounts.json');
  private userDataPath = path.join(__dirname, 'user_data.json');
  
  private async loadAccounts() {
    try {
      const data = await fs.readFile(this.accountsPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { users: [] };
    }
  }
  
  private async saveAccounts(data: any) {
    await fs.writeFile(this.accountsPath, JSON.stringify(data, null, 2));
  }
  
  private async loadUserData() {
    try {
      const data = await fs.readFile(this.userDataPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { user_data: {} };
    }
  }
  
  private async saveUserData(data: any) {
    await fs.writeFile(this.userDataPath, JSON.stringify(data, null, 2));
  }
  
  async getUser(id: number): Promise<User | undefined> {
    const accounts = await this.loadAccounts();
    return accounts.users.find((user: User) => user.id === id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const accounts = await this.loadAccounts();
    return accounts.users.find((user: User) => user.username === username);
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const accounts = await this.loadAccounts();
    const id = accounts.users.length > 0 ? Math.max(...accounts.users.map((u: User) => u.id)) + 1 : 1;
    const user: User = { ...insertUser, id };
    accounts.users.push(user);
    await this.saveAccounts(accounts);
    
    // Initialize user data
    const userData = await this.loadUserData();
    userData.user_data[insertUser.username] = { currency: 1000, cosmetics: [] };
    await this.saveUserData(userData);
    
    return user;
  }
  
  async updateUserCurrency(username: string, currency: number): Promise<void> {
    const userData = await this.loadUserData();
    if (!userData.user_data[username]) {
      userData.user_data[username] = { currency: 0, cosmetics: [] };
    }
    userData.user_data[username].currency = currency;
    await this.saveUserData(userData);
  }
  
  async getUserData(username: string): Promise<{currency: number, cosmetics: string[]} | undefined> {
    const userData = await this.loadUserData();
    return userData.user_data[username];
  }
  
  async getUserProfile(userId: number): Promise<{username: string, email: string, profilePicture: string | null} | undefined> {
    throw new Error('Not implemented in FileStorage');
  }
  
  async updateUsername(userId: number, newUsername: string): Promise<void> {
    throw new Error('Not implemented in FileStorage');
  }
  
  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    throw new Error('Not implemented in FileStorage');
  }
  
  async updateProfilePicture(userId: number, profilePictureUrl: string): Promise<void> {
    throw new Error('Not implemented in FileStorage');
  }
  
  async verifyPassword(userId: number, password: string): Promise<boolean> {
    throw new Error('Not implemented in FileStorage');
  }
}

// MySQL storage implementation
export class MySQLStorage implements IStorage {
  private pool: mysql.Pool;

  constructor() {
    // Validate required environment variables
    const requiredEnvVars = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required MySQL environment variables: ${missing.join(', ')}`);
    }

    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [rows] = await this.pool.execute(
      'SELECT user_id as id, username, password_hash as password, email FROM accounts WHERE user_id = ?',
      [id]
    );
    const users = rows as any[];
    return users[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [rows] = await this.pool.execute(
      'SELECT user_id as id, username, password_hash as password, email FROM accounts WHERE username = ?',
      [username]
    );
    const users = rows as any[];
    return users[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(insertUser.password, saltRounds);
    
    const [result] = await this.pool.execute(
      'INSERT INTO accounts (username, password_hash, email, created_at, last_login, is_blocked) VALUES (?, ?, ?, NOW(), NOW(), 0)',
      [insertUser.username, hashedPassword, insertUser.email]
    );
    const insertResult = result as any;
    return {
      id: insertResult.insertId,
      username: insertUser.username,
      password: hashedPassword,
      email: insertUser.email
    };
  }

  async updateUserCurrency(username: string, currency: number): Promise<void> {
    // This would require a separate table for user data in MySQL
    // For now, we'll skip this since the accounts table doesn't have currency
  }

  async getUserData(username: string): Promise<{currency: number, cosmetics: string[]} | undefined> {
    // This would require a separate table for user data in MySQL
    // For now, return default values
    return { currency: 1000, cosmetics: [] };
  }

  async getUserProfile(userId: number): Promise<{username: string, email: string, profilePicture: string | null} | undefined> {
    const [rows] = await this.pool.execute(
      'SELECT username, email, profile_picture as profilePicture FROM accounts WHERE user_id = ?',
      [userId]
    );
    const profiles = rows as any[];
    return profiles[0];
  }

  async updateUsername(userId: number, newUsername: string): Promise<void> {
    // Check if username already exists
    const [existing] = await this.pool.execute(
      'SELECT user_id FROM accounts WHERE username = ? AND user_id != ?',
      [newUsername, userId]
    );
    const existingUsers = existing as any[];
    if (existingUsers.length > 0) {
      throw new Error('Username already taken');
    }
    
    await this.pool.execute(
      'UPDATE accounts SET username = ? WHERE user_id = ?',
      [newUsername, userId]
    );
  }

  async updatePassword(userId: number, newPasswordHash: string): Promise<void> {
    await this.pool.execute(
      'UPDATE accounts SET password_hash = ? WHERE user_id = ?',
      [newPasswordHash, userId]
    );
  }

  async updateProfilePicture(userId: number, profilePictureUrl: string): Promise<void> {
    await this.pool.execute(
      'UPDATE accounts SET profile_picture = ? WHERE user_id = ?',
      [profilePictureUrl, userId]
    );
  }

  async verifyPassword(userId: number, password: string): Promise<boolean> {
    const [rows] = await this.pool.execute(
      'SELECT password_hash FROM accounts WHERE user_id = ?',
      [userId]
    );
    const users = rows as any[];
    if (users.length === 0) return false;
    
    return await bcrypt.compare(password, users[0].password_hash);
  }
}

export const storage = new MySQLStorage();
