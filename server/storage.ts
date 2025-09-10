import { users, type User, type InsertUser } from "@shared/schema";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserCurrency(username: string, currency: number): Promise<void>;
  getUserData(username: string): Promise<{currency: number, cosmetics: string[]} | undefined>;
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
}

export const storage = new FileStorage();
