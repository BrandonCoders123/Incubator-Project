import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getRunState, saveRunState, resetRunState, getLoadout, saveLoadout } from "./pg-augments";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Extend Express session type
declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
    isAdmin?: boolean;
  }
}

// Authentication middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Admin authentication middleware - checks user session + adminCheck in DB
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // Verify user is admin in database
  try {
    const isAdmin = await storage.isUserAdmin(req.session.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch (err) {
    console.error("Admin validation error:", err);
    return res.status(500).json({ error: "Admin validation failed" });
  }
  
  next();
}

// Configure multer for profile picture uploads
const uploadDir = path.join(
  process.cwd(),
  "client",
  "public",
  "uploads",
  "profiles",
);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `profile-${uniqueId}${ext}`);
  },
});

const upload = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // User registration endpoint
  app.post("/api/register", async (req, res) => {
    try {
      const { username, password, email } = req.body;

      console.log("Registration request:", {
        username,
        password: password ? "***" : undefined,
        email,
      });

      // 1. Validate required fields
      if (!username || !password || !email) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // 2. Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // 3. Try to create the user in MySQL
      const newUser = await storage.createUser({ username, password, email });

      // 4. Seed a default row in player_run_state so the account appears immediately
      await saveRunState(newUser.id, 1, 1, {});

      console.log("User created successfully with id:", newUser.id);
      return res.json({
        message: "User created successfully",
        userId: newUser.id,
      });
    } catch (err: any) {
      // ---------- DEBUG OUTPUT ----------
      console.error("Registration error:", err);

      // If this is a MySQL duplicate entry error, return a clear message
      if (err && err.code === "ER_DUP_ENTRY") {
        return res
          .status(400)
          .json({ error: "Username or email already exists in the database" });
      }

      // In development, expose the actual error message so we know what’s wrong.
      // (If you want to hide details later, you can remove `details`.)
      return res.status(500).json({
        error: "Failed to create user",
        details: err?.message || String(err),
      });
    }
  });

  // User login endpoint
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check if user is banned
      if ((user as any).is_banned === 1) {
        const banReason = (user as any).ban_reason || "No reason provided";
        return res.status(403).json({ 
          error: "Account banned", 
          banned: true,
          ban_reason: banReason 
        });
      }

      // Regenerate session to prevent session fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ error: "Login failed" });
        }

        // Save user session
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = (user as any).adminCheck === 1;

        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.status(500).json({ error: "Login failed" });
          }

          storage
            .getUserData(username)
            .then((userData) => {
              res.json({
                message: "Login successful",
                user: { username: user.username, id: user.id },
                currency: userData?.currency || 500,
                cosmetics: userData?.cosmetics || [],
                isAdmin: (user as any).adminCheck === 1,
              });
            })
            .catch(() => {
              res.json({
                message: "Login successful",
                user: { username: user.username, id: user.id },
                currency: 500,
                cosmetics: [],
                isAdmin: (user as any).adminCheck === 1,
              });
            });
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Session check endpoint - returns current user if logged in
  app.get("/api/session", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const userData = await storage.getUserData(req.session.username);
      const isAdmin = await storage.isUserAdmin(req.session.userId);
      return res.json({
        user: { username: req.session.username, id: req.session.userId },
        currency: userData?.currency || 500,
        cosmetics: userData?.cosmetics || [],
        isAdmin,
      });
    } catch (err) {
      console.error("Session check error:", err);
      return res.status(500).json({ error: "Session check failed" });
    }
  });

  // Update user currency endpoint
  app.post("/api/update-currency", async (req, res) => {
    try {
      const { username, currency } = req.body;
      await storage.updateUserCurrency(username, currency);
      res.json({ message: "Currency updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update currency" });
    }
  });

  // Profile endpoints - all require authentication

  // Get user profile
  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      // Get the authenticated user's profile
      const userId = req.session.userId!;
      const profile = await storage.getUserProfile(userId);

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // Update username
  app.put("/api/profile/username", requireAuth, async (req, res) => {
    try {
      const { newUsername } = req.body;
      const userId = req.session.userId!;

      if (
        !newUsername ||
        typeof newUsername !== "string" ||
        newUsername.trim().length === 0
      ) {
        return res.status(400).json({ error: "Valid username is required" });
      }

      await storage.updateUsername(userId, newUsername.trim());

      // Update session username
      req.session.username = newUsername.trim();

      res.json({
        message: "Username updated successfully",
        username: newUsername.trim(),
      });
    } catch (error: any) {
      console.error("Update username error:", error);
      if (error.message === "Username already taken") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update username" });
    }
  });

  // Update password
  app.put("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const { oldPassword, newPassword, confirmPassword } = req.body;
      const userId = req.session.userId!;

      if (!oldPassword || !newPassword || !confirmPassword) {
        return res
          .status(400)
          .json({ error: "All password fields are required" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "New passwords do not match" });
      }

      if (newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "New password must be at least 6 characters" });
      }

      // Verify old password
      const isValidPassword = await storage.verifyPassword(userId, oldPassword);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await storage.updatePassword(userId, hashedPassword);
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({ error: "Failed to update password" });
    }
  });

  // Upload profile picture
  app.post("/api/profile/picture", requireAuth, (req, res) => {
    // Use multer middleware with error handling
    upload.single("profilePicture")(req, res, async (err) => {
      try {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
              return res
                .status(400)
                .json({ error: "File size too large. Maximum 5MB allowed" });
            }
            return res.status(400).json({ error: err.message });
          }
          return res
            .status(400)
            .json({ error: err.message || "File upload failed" });
        }

        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const userId = req.session.userId!;

        // Generate the URL path for the uploaded file
        const profilePictureUrl = `/uploads/profiles/${req.file.filename}`;

        // Update database with new profile picture URL
        await storage.updateProfilePicture(userId, profilePictureUrl);

        res.json({
          message: "Profile picture updated successfully",
          profilePictureUrl,
        });
      } catch (error) {
        console.error("Upload profile picture error:", error);
        res.status(500).json({ error: "Failed to upload profile picture" });
      }
    });
  });

  // Update profile picture from URL
  app.post("/api/profile/picture-url", requireAuth, async (req, res) => {
    try {
      const { imageUrl } = req.body;
      const userId = req.session.userId!;

      if (!imageUrl || typeof imageUrl !== "string") {
        return res.status(400).json({ error: "Valid image URL is required" });
      }

      const trimmedUrl = imageUrl.trim();

      // Basic URL validation
      try {
        new URL(trimmedUrl);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Update database with new profile picture URL
      await storage.updateProfilePicture(userId, trimmedUrl);

      res.json({
        message: "Profile picture updated successfully",
        profilePictureUrl: trimmedUrl,
      });
    } catch (error) {
      console.error("Update profile picture from URL error:", error);
      res.status(500).json({ error: "Failed to update profile picture" });
    }
  });

  // Get shop items endpoint
  app.get("/getItems.php", async (req, res) => {
    try {
      const items = await storage.getShopItems();
      res.json(items);
    } catch (error) {
      console.error("Get shop items error:", error);
      res.status(500).json({ error: "Failed to load shop items" });
    }
  });

  // Get user inventory endpoint
  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const inventory = await storage.getUserInventory(userId);
      res.json(inventory);
    } catch (error) {
      console.error("Get user inventory error:", error);
      res.status(500).json({ error: "Failed to load inventory" });
    }
  });

  // Purchase item endpoint
  app.post("/api/purchase", requireAuth, async (req, res) => {
    try {
      const { itemId, price } = req.body;
      const userId = req.session.userId!;

      if (!itemId) {
        return res.status(400).json({ error: "Item ID is required" });
      }

      await storage.purchaseItem(userId, itemId, price || 0);
      
      // Return updated currency
      const newCurrency = await storage.getUserCurrency(userId);
      res.json({ message: "Item purchased successfully", currency: newCurrency });
    } catch (error: any) {
      console.error("Purchase error:", error);
      if (error.message === 'Insufficient gold') {
        return res.status(400).json({ error: "Not enough gold" });
      }
      if (error.message === 'Item already owned') {
        return res.status(400).json({ error: "You already own this item" });
      }
      res.status(500).json({ error: "Failed to purchase item" });
    }
  });

  // Buy in-game currency with payment info (test mode - no real charges)
  app.post("/api/buy-currency", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { cardNumber, cardExpiry, cardCVC, amountUSD, goldAmount } = req.body;

      if (!cardNumber || !cardExpiry || !cardCVC) {
        return res.status(400).json({ error: "Card details are required" });
      }
      if (!amountUSD || !goldAmount) {
        return res.status(400).json({ error: "Amount and gold amount are required" });
      }

      // Basic card validation
      const rawCard = String(cardNumber).replace(/\s/g, "");
      if (!/^\d{16}$/.test(rawCard)) {
        return res.status(400).json({ error: "Card number must be 16 digits" });
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        return res.status(400).json({ error: "Expiry must be MM/YY format" });
      }
      if (!/^\d{3,4}$/.test(cardCVC)) {
        return res.status(400).json({ error: "CVC must be 3 or 4 digits" });
      }

      // Save transaction (storing last 4 digits for reference)
      const last4 = rawCard.slice(-4);
      await storage.saveCurrencyTransaction(userId, amountUSD, `****${last4}`, goldAmount);

      // Add gold to user's account
      const currentGold = await storage.getUserCurrency(userId);
      const newGold = currentGold === 67 ? 67 : currentGold + goldAmount;
      await storage.updateUserGold(userId, newGold);

      res.json({ success: true, newGold, message: `${goldAmount} gold added to your account!` });
    } catch (error) {
      console.error("Buy currency error:", error);
      res.status(500).json({ error: "Failed to process purchase" });
    }
  });

  // Get user currency endpoint
  app.get("/api/currency", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currency = await storage.getUserCurrency(userId);
      res.json({ currency });
    } catch (error) {
      console.error("Get currency error:", error);
      res.status(500).json({ error: "Failed to get currency" });
    }
  });

  // Logout endpoint
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get user settings endpoint
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const settings = await storage.getUserSettings(userId);
      res.json({ success: true, settings });
    } catch (error) {
      console.error("Get settings error:", error);
      res.status(500).json({ success: false, error: "Failed to load settings" });
    }
  });

  // Save user settings endpoint
  app.post("/api/settings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const settings = req.body;
      await storage.saveUserSettings(userId, settings);
      res.json({ success: true, message: "Settings saved successfully" });
    } catch (error) {
      console.error("Save settings error:", error);
      res.status(500).json({ success: false, error: "Failed to save settings" });
    }
  });

  // ============ ADMIN ROUTES ============

  // Check admin session - uses regular user session + adminCheck from DB
  app.get("/api/admin/session", async (req, res) => {
    if (req.session.userId) {
      const isAdmin = await storage.isUserAdmin(req.session.userId);
      if (isAdmin) {
        res.json({
          isAdmin: true,
          admin: {
            id: req.session.userId,
            username: req.session.username
          }
        });
        return;
      }
    }
    res.json({ isAdmin: false });
  });

  // Get all users (admin only)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json({ success: true, users });
    } catch (error) {
      console.error("Admin get users error:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Set user gold (admin only)
  app.post("/api/admin/users/:userId/gold", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { gold } = req.body;
      await storage.setUserGold(userId, gold);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin set gold error:", error);
      res.status(500).json({ error: "Failed to set user gold" });
    }
  });

  // Delete user (admin only)
  app.delete("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      // Prevent admin from deleting themselves
      if (userId === req.session.userId) {
        return res.status(400).json({ success: false, error: "Cannot delete your own account" });
      }
      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete user error:", error);
      res.status(500).json({ success: false, error: "Failed to delete user" });
    }
  });

  // Ban user (admin only)
  app.post("/api/admin/users/:userId/ban", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { reason } = req.body;
      // Prevent admin from banning themselves
      if (userId === req.session.userId) {
        return res.status(400).json({ success: false, error: "Cannot ban your own account" });
      }
      await storage.banUser(userId, reason || null);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin ban user error:", error);
      res.status(500).json({ success: false, error: "Failed to ban user" });
    }
  });

  // Unban user (admin only)
  app.post("/api/admin/users/:userId/unban", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.unbanUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin unban user error:", error);
      res.status(500).json({ success: false, error: "Failed to unban user" });
    }
  });

  // Warn user (admin only)
  app.post("/api/admin/users/:userId/warn", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.warnUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin warn user error:", error);
      res.status(500).json({ success: false, error: "Failed to warn user" });
    }
  });

  // Get all items (admin only)
  app.get("/api/admin/items", requireAdmin, async (req, res) => {
    try {
      const items = await storage.getAllItems();
      res.json({ success: true, items });
    } catch (error) {
      console.error("Admin get items error:", error);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  // Add item (admin only)
  app.post("/api/admin/items", requireAdmin, async (req, res) => {
    try {
      const { name, type, price, isCosmetic } = req.body;
      const item = await storage.addItem(name, type, price, isCosmetic);
      res.json({ success: true, item });
    } catch (error) {
      console.error("Admin add item error:", error);
      res.status(500).json({ error: "Failed to add item" });
    }
  });

  // Update item (admin only)
  app.put("/api/admin/items/:itemId", requireAdmin, async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const { name, type, price, isCosmetic } = req.body;
      await storage.updateItem(itemId, name, type, price, isCosmetic);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin update item error:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  // Delete item (admin only)
  app.delete("/api/admin/items/:itemId", requireAdmin, async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      await storage.deleteItem(itemId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete item error:", error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  // Leaderboard - public route
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const category = (req.query.category as string) || "kills";
      const limit = parseInt(req.query.limit as string) || 50;
      const entries = await storage.getLeaderboard(category, limit);
      res.json(entries);
    } catch (error) {
      console.error("Leaderboard fetch error:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // Save leaderboard entry on level/wave completion - requires authentication
  app.post("/api/leaderboard", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const username = req.session.username!;
      const { fastestRunTime, totalKills } = req.body;
      
      // At least one stat must be provided
      if (!fastestRunTime && (totalKills === undefined || totalKills === null)) {
        return res.status(400).json({ error: "At least fastestRunTime or totalKills is required" });
      }
      
      await storage.saveLeaderboardEntry(userId, username, fastestRunTime || null, totalKills ?? null);
      res.json({ success: true, message: "Leaderboard entry saved" });
    } catch (error) {
      console.error("Leaderboard save error:", error);
      res.status(500).json({ error: "Failed to save leaderboard entry" });
    }
  });

  // Player stats — get own stats
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const stats = await storage.getPlayerStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Stats fetch error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Player stats — save shots/hits/deaths at end of game
  app.post("/api/stats/update", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { shots = 0, hits = 0, deaths = 0 } = req.body;
      await storage.incrementPlayerStats(userId, shots, hits, deaths);
      res.json({ success: true });
    } catch (error) {
      console.error("Stats update error:", error);
      res.status(500).json({ error: "Failed to update stats" });
    }
  });

  // Player stats — heartbeat every 60 s of active gameplay
  app.post("/api/stats/heartbeat", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { minutes = 1 } = req.body;
      await storage.addMinutesPlayed(userId, minutes);
      res.json({ success: true });
    } catch (error) {
      console.error("Stats heartbeat error:", error);
      res.status(500).json({ error: "Failed to record time played" });
    }
  });

  // Admin — get all transactions with summary
  app.get("/api/admin/transactions", requireAdmin, async (req, res) => {
    try {
      const data = await storage.getAllTransactions();
      res.json({ success: true, ...data });
    } catch (error) {
      console.error("Admin transactions fetch error:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // ── Augment / Run-State Routes ──────────────────────────────────────────────

  // GET /api/run/state — fetch the logged-in player's current augments and mode levels
  app.get("/api/run/state", requireAuth, async (req, res) => {
    try {
      const state = await getRunState(req.session.userId!);
      res.json({ success: true, ...state });
    } catch (error) {
      console.error("Failed to get run state:", error);
      res.status(500).json({ error: "Failed to fetch run state" });
    }
  });

  // POST /api/run/state — save augment tiers and current mode levels
  // Body: { storyModeLevel, endlessModeLevel, augments, storyDifficulty?, savedHealth?, savedCoins?, savedWeapons?, savedGameMode? }
  app.post("/api/run/state", requireAuth, async (req, res) => {
    try {
      const {
        storyModeLevel,
        endlessModeLevel,
        augments,
        storyDifficulty,
        savedHealth,
        savedCoins,
        savedWeapons,
        savedGameMode,
      } = req.body;

      if (
        typeof storyModeLevel !== "number" ||
        typeof endlessModeLevel !== "number" ||
        typeof augments !== "object" ||
        augments === null
      ) {
        return res.status(400).json({ error: "Invalid body" });
      }

      const VALID_GAME_MODES = ["story", "endless"];
      const VALID_DIFFICULTIES = ["normal", "hard", "extreme"];

      const sanitizedGameMode =
        typeof savedGameMode === "string" && VALID_GAME_MODES.includes(savedGameMode)
          ? savedGameMode
          : null;

      const sanitizedDifficulty =
        typeof storyDifficulty === "string" && VALID_DIFFICULTIES.includes(storyDifficulty)
          ? storyDifficulty
          : null;

      let sanitizedWeapons: { currentWeapon: number; ammo: number; reserveAmmo: number; unlockedWeapons: number[] } | null = null;
      if (
        savedWeapons !== null &&
        savedWeapons !== undefined &&
        typeof savedWeapons === "object" &&
        typeof savedWeapons.currentWeapon === "number" &&
        typeof savedWeapons.ammo === "number" &&
        typeof savedWeapons.reserveAmmo === "number" &&
        Array.isArray(savedWeapons.unlockedWeapons) &&
        savedWeapons.unlockedWeapons.every((w: unknown) => typeof w === "number")
      ) {
        sanitizedWeapons = {
          currentWeapon: savedWeapons.currentWeapon,
          ammo: savedWeapons.ammo,
          reserveAmmo: savedWeapons.reserveAmmo,
          unlockedWeapons: savedWeapons.unlockedWeapons,
        };
      }

      await saveRunState(
        req.session.userId!,
        storyModeLevel,
        endlessModeLevel,
        augments,
        {
          storyDifficulty: sanitizedDifficulty,
          savedHealth: typeof savedHealth === "number" ? savedHealth : null,
          savedCoins: typeof savedCoins === "number" ? savedCoins : null,
          savedWeapons: sanitizedWeapons,
          savedGameMode: sanitizedGameMode,
        }
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to save run state:", error);
      res.status(500).json({ error: "Failed to save run state" });
    }
  });

  // DELETE /api/run/reset — wipe all temporary augment/level data for this player
  // Call this on death, win, or manual progress reset
  app.delete("/api/run/reset", requireAuth, async (req, res) => {
    try {
      await resetRunState(req.session.userId!);
      res.json({ success: true, message: "Run state cleared" });
    } catch (error) {
      console.error("Failed to reset run state:", error);
      res.status(500).json({ error: "Failed to reset run state" });
    }
  });

  // ── Loadout & Equipped Skins Routes ─────────────────────────────────────────

  // GET /api/loadout — fetch the player's saved weapon loadout and equipped skins
  app.get("/api/loadout", requireAuth, async (req, res) => {
    try {
      const data = await getLoadout(req.session.userId!);
      res.json(data);
    } catch (error) {
      console.error("Failed to fetch loadout:", error);
      res.status(500).json({ error: "Failed to fetch loadout" });
    }
  });

  // POST /api/loadout — save the player's weapon loadout and equipped skins
  // Body: { loadout: Record<string, number>, equippedSkins: Record<string, string> }
  app.post("/api/loadout", requireAuth, async (req, res) => {
    try {
      const { loadout, equippedSkins } = req.body;
      if (!loadout || typeof loadout !== "object") {
        return res.status(400).json({ error: "loadout must be an object" });
      }
      if (!equippedSkins || typeof equippedSkins !== "object") {
        return res.status(400).json({ error: "equippedSkins must be an object" });
      }
      await saveLoadout(req.session.userId!, loadout, equippedSkins);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to save loadout:", error);
      res.status(500).json({ error: "Failed to save loadout" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────

  const httpServer = createServer(app);

  return httpServer;
}
