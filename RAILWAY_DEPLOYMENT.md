# Railway Deployment

## Healthcheck

- **Use path:** `GET /healthz` (recommended). Returns `200` and JSON `{ "status": "ok", "ts": "<ISO timestamp>" }` without auth or DB.
- **Optional:** `GET /` returns `200 OK`; `GET /api/health` returns the same JSON as `/healthz`.
- In **railway.json** the deploy healthcheck is set to `"healthcheckPath": "/healthz"`. Ensure this is not overridden in the Railway dashboard.

## Railway settings checklist

| Setting | Value / Note |
|--------|----------------|
| **PORT** | Leave unset; Railway injects `PORT` automatically. |
| **Start command** | `npm start` (runs `scripts/railway-start.cjs` → migrate deploy, then `node dist/index.cjs`). |
| **Healthcheck path** | `/healthz`. |
| **Build** | `npm install && npm run build` (from railway.json). |

## Verify after deploy

1. Open the service URL in the browser: `https://<your-app>.railway.app/healthz`.
2. You should see `200` and JSON: `{"status":"ok","ts":"..."}`.
3. In Railway logs, confirm: `listening on 0.0.0.0:<PORT>` (PORT is the one Railway sets).

## Local test (before pushing)

```bash
# Build and start production server locally (optional)
npm run build
cross-env NODE_ENV=production PORT=5000 node scripts/railway-start.cjs
# In another terminal:
curl -s http://localhost:5000/healthz
# Expected: {"status":"ok","ts":"..."}
```

Or with dev server (different port if your dev uses 5000):

```bash
npm run dev
# Then: curl -s http://localhost:5000/healthz
```
