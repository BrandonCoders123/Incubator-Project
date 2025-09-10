import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)
  
  // User registration endpoint
  app.post('/api/register', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      
      // Create new user
      const newUser = await storage.createUser({ username, password });
      res.json({ message: 'User created successfully', userId: newUser.id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });
  
  // User login endpoint
  app.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const userData = await storage.getUserData(username);
      res.json({ 
        message: 'Login successful', 
        user: { username: user.username, id: user.id },
        currency: userData?.currency || 1000,
        cosmetics: userData?.cosmetics || []
      });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });
  
  // Update user currency endpoint
  app.post('/api/update-currency', async (req, res) => {
    try {
      const { username, currency } = req.body;
      await storage.updateUserCurrency(username, currency);
      res.json({ message: 'Currency updated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update currency' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
