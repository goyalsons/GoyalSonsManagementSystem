# Railway Healthcheck Fix – Final Execution Report

## 1) Root cause

- **Healthcheck path:** Railway was using `healthcheckPath: "/api/health"`. The app did expose `/api/health`, but it was registered after other middleware and shared the path with route registration that runs inside `registerRoutes()`, so the first handler in `server/index.ts` was a simple `send("ok")`. The main risks were:
  - **Timing:** If the healthcheck ran before the server finished binding (e.g. during or right after `prisma migrate deploy`), it could fail.
  - **Path consistency:** Using a dedicated, minimal path like `/healthz` is clearer and is registered first with no auth/DB.
- **Binding:** The server already used `process.env.PORT` and `0.0.0.0`; the fallback was standardized and the log message was made explicit for Railway.
- **Start script:** `railway-start.cjs` already ran `prisma migrate deploy` then started the server and did not block indefinitely; failures could be clearer (sanitized DB URL, explicit exit messages).

## 2) Fixes applied

1. **Unauthenticated health route**
   - **GET /healthz** – Returns `200` and JSON `{ status: "ok", ts: "<ISO timestamp>" }`. No auth, no DB. Registered first in `server/index.ts`.
   - **GET /** – Returns `200` with body `OK`.
   - **GET /api/health** – Returns same JSON as `/healthz` for backward compatibility. Duplicate registration in `server/routes/index.ts` removed so the single definition in `server/index.ts` is the source of truth.

2. **Server binding**
   - `const port = Number(process.env.PORT ?? 5000);`
   - `httpServer.listen(port, "0.0.0.0", () => { ... });`
   - Startup log: `listening on 0.0.0.0:${port}` so Railway logs clearly show the bound address and port.

3. **railway-start.cjs**
   - Log **sanitized** `DATABASE_URL` (protocol, host, port, path, optional user; **no password**).
   - Log `PORT` (or “(not set)”).
   - On **prisma migrate deploy** failure: `process.exit(1)` with a short, readable message (“prisma migrate deploy failed. Aborting. Check logs above.”). No change to the existing auto-resolve logic for the known init migration; only exit messaging improved.
   - After successful migrate: log “prisma migrate deploy completed.” then start the server as before.

4. **Railway config**
   - **railway.json** – `healthcheckPath` set from `"/api/health"` to **`"/healthz"`**.

5. **Docs**
   - **RAILWAY_DEPLOYMENT.md** – Describes healthcheck path (`/healthz`), Railway settings checklist (PORT, start command, healthcheck path), and how to verify after deploy (hit `/healthz`, check logs for `listening on 0.0.0.0:<PORT>`). Also includes a local `curl` example for testing.

## 3) Files changed

| File | Change |
|------|--------|
| **server/index.ts** | Added `GET /healthz` and `GET /`; made `GET /api/health` return JSON `{ status, ts }`; set `port = Number(process.env.PORT ?? 5000)`; log `listening on 0.0.0.0:${port}`. |
| **server/routes/index.ts** | Removed duplicate `GET /api/health` handler; added comment that health routes live in `server/index.ts`. |
| **scripts/railway-start.cjs** | Added `sanitizeDatabaseUrl()`; log sanitized `DATABASE_URL` and `PORT`; on migrate failure exit(1) with clear message; log “prisma migrate deploy completed.” on success. |
| **railway.json** | `healthcheckPath`: `"/api/health"` → `"/healthz"`. |
| **RAILWAY_DEPLOYMENT.md** | New: healthcheck path, Railway checklist, verification steps, local `curl` test. |
| **RAILWAY_HEALTHCHECK_FIX_REPORT.md** | This report. |

## 4) Commands to run

**Local verification (optional):**

```bash
npm run build
cross-env NODE_ENV=production PORT=5000 node scripts/railway-start.cjs
# In another terminal:
curl -s http://localhost:5000/healthz
# Expected: {"status":"ok","ts":"..."}
```

**After deploy on Railway:**

- Open `https://<your-service>.railway.app/healthz` → expect `200` and `{"status":"ok","ts":"..."}`.
- In Railway logs, confirm: `listening on 0.0.0.0:<PORT>`.

## 5) Railway settings checklist

| Item | Value / Note |
|------|----------------|
| **PORT** | Do not set manually; Railway injects it. |
| **Start command** | `npm start` (unchanged). |
| **Healthcheck path** | **`/healthz`** (set in railway.json). |
| **Build** | `npm install && npm run build` (unchanged). |

---

**Constraints respected:** Prisma migrations kept; `migrate deploy` still runs at startup in `railway-start.cjs`. No business logic changed. Changes are minimal and production-safe.
