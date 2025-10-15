import { Express, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function setupPhpHandler(app: Express) {
  // Serve PHP files for all HTTP methods
  app.all("*.php", async (req: Request, res: Response) => {
    try {
      // Remove leading slash from request path
      const requestedPath = req.path.substring(1);
      
      // Normalize the path to prevent traversal
      const normalizedPath = path.posix.normalize(requestedPath);
      
      // Reject absolute paths or paths that start with ..
      if (path.isAbsolute(normalizedPath) || normalizedPath.startsWith("..")) {
        return res.status(403).send("Forbidden");
      }
      
      // Build the full PHP file path
      const phpDir = path.join(__dirname, "..", "php");
      const phpFile = path.join(phpDir, normalizedPath);
      
      // Check if file exists
      if (!fs.existsSync(phpFile)) {
        return res.status(404).send("PHP file not found");
      }
      
      // Verify the resolved path is still within the php directory
      const realPhpFile = fs.realpathSync(phpFile).replace(/\\/g, "/");
      const realPhpDir = fs.realpathSync(phpDir).replace(/\\/g, "/");
      
      if (!realPhpFile.startsWith(realPhpDir)) {
        return res.status(403).send("Forbidden");
      }

      // Build query string from request
      const queryString = new URLSearchParams(req.query as any).toString();
      
      // Prepare request body for POST
      let requestBody = "";
      if (req.method === "POST" && req.body) {
        if (typeof req.body === "string") {
          requestBody = req.body;
        } else {
          // Convert JSON body to URL-encoded format for PHP
          requestBody = new URLSearchParams(req.body).toString();
        }
      }
      
      // Set environment variables for PHP
      const env = {
        ...process.env,
        REQUEST_METHOD: req.method,
        QUERY_STRING: queryString,
        REQUEST_URI: req.originalUrl,
        SCRIPT_FILENAME: phpFile,
        REDIRECT_STATUS: "200",
        CONTENT_TYPE: req.headers["content-type"] || "application/x-www-form-urlencoded",
        CONTENT_LENGTH: requestBody.length.toString(),
        SERVER_NAME: req.hostname,
        SERVER_PORT: "5000",
        HTTP_HOST: req.headers.host || "localhost:5000",
      };

      // Execute PHP file using spawn to handle stdin
      const phpProcess = spawn("php-cgi", [phpFile], {
        env,
        cwd: path.dirname(phpFile),
      });

      let output = "";
      let errorOutput = "";

      phpProcess.stdout.on("data", (data) => {
        output += data.toString();
      });

      phpProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      // Send request body to PHP via stdin
      if (requestBody) {
        phpProcess.stdin.write(requestBody);
      }
      phpProcess.stdin.end();

      phpProcess.on("close", (code) => {
        if (code !== 0 && errorOutput) {
          console.error("PHP Error:", errorOutput);
          return res.status(500).send("Error executing PHP");
        }

        // Parse CGI output (headers + body)
        const parts = output.split("\r\n\r\n");
        if (parts.length < 2) {
          // Try \n\n separator
          const altParts = output.split("\n\n");
          if (altParts.length >= 2) {
            const headers = altParts[0];
            const body = altParts.slice(1).join("\n\n");
            parseHeadersAndSend(headers, body, res);
          } else {
            res.send(output);
          }
        } else {
          const headers = parts[0];
          const body = parts.slice(1).join("\r\n\r\n");
          parseHeadersAndSend(headers, body, res);
        }
      });
    } catch (error) {
      console.error("Error executing PHP:", error);
      res.status(500).send("Error executing PHP");
    }
  });
}

function parseHeadersAndSend(headers: string, body: string, res: Response) {
  const headerLines = headers.split(/\r?\n/);
  
  for (const line of headerLines) {
    if (line.includes(": ")) {
      const [key, ...valueParts] = line.split(": ");
      const value = valueParts.join(": ");
      
      const lowerKey = key.toLowerCase();
      
      if (lowerKey === "status") {
        const statusCode = parseInt(value.split(" ")[0]);
        res.status(statusCode);
      } else if (lowerKey === "location" || lowerKey === "content-type" || lowerKey === "set-cookie") {
        res.setHeader(key, value);
      } else if (lowerKey.startsWith("x-") || lowerKey === "cache-control") {
        // Forward custom headers and cache control
        res.setHeader(key, value);
      }
    }
  }
  
  res.send(body);
}
