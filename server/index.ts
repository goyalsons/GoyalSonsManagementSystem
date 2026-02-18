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
import { waitForDatabase } from "./lib/db-connect";

console.log("BOOT => NODE_ENV:", process.env.NODE_ENV, "PORT:", process.env.PORT);

const app = express();
const httpServer = createServer(app);

// Health check endpoints: no auth, no DB, fast. Keep BEFORE any auth/session middleware.
// Railway should use healthcheckPath: "/healthz"
app.get("/healthz", (_req, res) =>
  res.status(200).json({ status: "ok", ts: new Date().toISOString() })
);
// Do NOT register GET "/" here — let static/SPA serve index.html for "/" so the client app loads and can redirect to /login.
app.get("/api/health", (_req, res) =>
  res.status(200).json({ status: "ok", ts: new Date().toISOString() })
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "1024mb", // attendance verification batch save can be large (400+ entries)
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "5mb" }));

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

  // Unmatched API routes: return 404 JSON so client never gets HTML (e.g. from SPA fallback)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.originalUrl?.startsWith("/api/")) return next();
    res.status(404).json({ message: "API route not found", path: req.originalUrl });
  });

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

  // ALWAYS serve on PORT (Railway sets this). Bind to 0.0.0.0 so external healthchecks succeed.
  const port = Number(process.env.PORT ?? 5000);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`listening on 0.0.0.0:${port}`);

    // Resilient DB connect: retry with backoff; only start schedulers after DB is reachable.
    void (async () => {
      const dbOk = await waitForDatabase();
      if (!dbOk) {
        console.warn("[Server] DB not reachable after retries. Schedulers and DB-backed init skipped.");
        return;
      }

      const { prisma } = await import("./lib/prisma");

      // Launch: OTP DB cleanup job; replace with cron/worker later.
      const { startOtpCleanup } = await import("./services/otp-cleanup.service");
      startOtpCleanup();

      startAutoSync();
      const SALES_PIVOT_INTERVAL_MS = 2 * 60 * 60 * 1000;
      const runPivot = runSalesPivotRefresh;
      if (runPivot) {
        setInterval(runPivot, SALES_PIVOT_INTERVAL_MS);
        setTimeout(() => runPivot(), 30 * 1000);
        log("Sales pivot auto-refresh scheduled every 2 hours");
      }

      try {
        await createSalesDataTable();
      } catch (error: any) {
        console.warn("[Server] Could not create SalesData table (may already exist):", error?.message ?? "unknown");
      }

      try {
        // #region agent log
        const path = await import("path");
        const fs = await import("fs");
        const debugPath = path.join(process.cwd(), ".cursor", "debug.log");
        const fallbackPath = path.join(process.cwd(), "debug-startup.log");
        const line = JSON.stringify({ location: "server/index.ts", message: "about to run initializePolicySync (seed not run from server)", data: {}, timestamp: Date.now(), hypothesisId: "H3" }) + "\n";
        try {
          fs.mkdirSync(path.dirname(debugPath), { recursive: true });
          fs.appendFileSync(debugPath, line);
        } catch (_) {
          try { fs.appendFileSync(fallbackPath, line); } catch (_) {}
        }
        // #endregion
        await initializePolicySync();
      } catch (error: any) {
        console.error("[Server] Failed to sync policies:", error?.message ?? "unknown");
      }

      try {
        const { POLICY_KEYS_FLAT } = await import("../shared/policies");
        const dbKeys = new Set(
          (await prisma.policy.findMany({ select: { key: true } })).map((p: { key: string }) => p.key),
        );
        const missing = POLICY_KEYS_FLAT.filter((k) => !dbKeys.has(k));
        if (missing.length > 0) {
          console.warn(
            "[Server] RBAC startup guard:",
            missing.length,
            "policies from registry missing in DB. Missing (sample):",
            missing.slice(0, 5).join(", "),
          );
        }
      } catch (guardErr: any) {
        console.warn("[Server] RBAC startup guard check failed:", guardErr?.message ?? "unknown");
      }
    })();
  });
})();
