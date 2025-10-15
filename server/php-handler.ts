import { Express, Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function setupPhpHandler(app: Express) {
  // Serve PHP files
  app.get("*.php", async (req: Request, res: Response) => {
    try {
      const phpFile = path.join(__dirname, "..", "php", req.path);
      
      // Check if file exists
      if (!fs.existsSync(phpFile)) {
        return res.status(404).send("PHP file not found");
      }

      // Build query string from request
      const queryString = new URLSearchParams(req.query as any).toString();
      
      // Set environment variables for PHP
      const env = {
        ...process.env,
        REQUEST_METHOD: req.method,
        QUERY_STRING: queryString,
        REQUEST_URI: req.originalUrl,
        SCRIPT_FILENAME: phpFile,
        REDIRECT_STATUS: "200",
      };

      // Execute PHP file
      const { stdout, stderr } = await execAsync(`php ${phpFile}`, { env });

      if (stderr) {
        console.error("PHP Error:", stderr);
      }

      // Send PHP output
      res.send(stdout);
    } catch (error) {
      console.error("Error executing PHP:", error);
      res.status(500).send("Error executing PHP");
    }
  });
}
