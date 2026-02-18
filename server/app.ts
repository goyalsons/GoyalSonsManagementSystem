/**
 * Express app factory for use in server startup and in API tests (Supertest).
 * Load .env or .env.test via dotenv before importing this in tests.
 */
import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV !== "production") {
  const envFile = process.env.DOTENV_PATH || ".env";
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
}

import express, { type Request, Response } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";

const app = express();

app.use(
  express.json({
    limit: "5mb", // attendance verification batch save can be large (400+ entries)
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "5mb" }));

/** Build and return the app with all routes. Used by server/index.ts and API tests. */
export async function createApp() {
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  return app;
}
