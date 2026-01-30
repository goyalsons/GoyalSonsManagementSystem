import dotenv from "dotenv";
import path from "path";

// In production (Railway), DO NOT load .env from disk.
// Railway injects environment variables (PORT, DATABASE_URL, etc.) and those must win.
if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    path: path.resolve(process.cwd(), ".env"),
  });
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startAutoSync } from "./auto-sync";
import { createSalesDataTable } from "./create-sales-data-table";
import { initializePolicySync } from "./services/policy-sync.service";
import { runSalesPivotRefresh } from "./routes/sales-staff.routes";


console.log(
  "ENV CHECK =>",
  process.env.BIGQUERY_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS
);

console.log("BOOT => NODE_ENV:", process.env.NODE_ENV, "PORT:", process.env.PORT);

const app = express();
const httpServer = createServer(app);

// Health check must be fast and available in all envs.
// Keep it BEFORE any auth/session middleware.
app.get("/api/health", (_req, res) => res.status(200).send("ok"));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    startAutoSync();

    // Sales pivot data: auto-refresh every 2 hours
    const SALES_PIVOT_INTERVAL_MS = 2 * 60 * 60 * 1000;
    const runPivot = runSalesPivotRefresh;
    if (runPivot) {
      setInterval(runPivot, SALES_PIVOT_INTERVAL_MS);
      setTimeout(() => runPivot(), 30 * 1000);
      log("Sales pivot auto-refresh scheduled every 2 hours");
    }

    // Run DB-backed startup tasks WITHOUT blocking listen/healthcheck.
    void (async () => {
      // Create SalesData table if it doesn't exist
      try {
        await createSalesDataTable();
      } catch (error: any) {
        console.warn(
          "[Server] Could not create SalesData table (may already exist):",
          error.message,
        );
      }

      // Sync policies from NAV_CONFIG to database
      try {
        await initializePolicySync();
      } catch (error: any) {
        console.error("[Server] ❌ Failed to sync policies:", error.message);
        // Don't block server startup, but log the error
      }
    })();
  });
})();
