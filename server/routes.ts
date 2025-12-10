import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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
  }
}

// Authentication middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
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

      // Regenerate session to prevent session fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration error:", err);
          return res.status(500).json({ error: "Login failed" });
        }

        // Save user session
        req.session.userId = user.id;
        req.session.username = user.username;

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
                currency: userData?.currency || 1000,
                cosmetics: userData?.cosmetics || [],
              });
            })
            .catch(() => {
              res.json({
                message: "Login successful",
                user: { username: user.username, id: user.id },
                currency: 1000,
                cosmetics: [],
              });
            });
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
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

  const httpServer = createServer(app);

  return httpServer;
}
