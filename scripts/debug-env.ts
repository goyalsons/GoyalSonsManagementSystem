// #region agent log
// Debug instrumentation for env visibility before Prisma migrate (ESM-safe)
import fs from 'fs';
import path from 'path';

const endpoint = 'http://127.0.0.1:7242/ingest/ae6a2d66-92bb-4390-bfce-5a7ba2d3b1d0';
const logPath = path.resolve('.cursor/debug.log');
const sessionId = 'debug-session';
const runId = process.env.DEBUG_RUN_ID || `db-migrate-pre-${Date.now()}`;

type LogData = Record<string, unknown>;

function writeFileLog(payload: Record<string, unknown>) {
  try {
    fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // ignore file logging failures
  }
}

function sendLog(hypothesisId: string, location: string, message: string, data: LogData) {
  const payload = {
    sessionId,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  // network log
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // file fallback
  writeFileLog(payload);
}

function fileProbe(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split(/\r?\n/)[0] ?? '';
    return {
      exists: true,
      length: content.length,
      hasDatabaseUrl: content.includes('DATABASE_URL'),
      firstLineSample: firstLine.slice(0, 80),
    };
  } catch (err) {
    return { exists: false, error: (err as Error).message };
  }
}

// Hypothesis A: .env missing or unreadable
sendLog('A', 'scripts/debug-env.ts:52', 'process.cwd and env var presence', {
  cwd: process.cwd(),
  hasDatabaseUrlEnv: typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0,
  databaseUrlLength: process.env.DATABASE_URL?.length ?? null,
});

const rootEnvProbe = fileProbe('.env');
// Hypothesis B: .env exists but lacks DATABASE_URL or is BOM/encoding corrupted
sendLog('B', 'scripts/debug-env.ts:60', '.env probe', rootEnvProbe);

const prismaEnvProbe = fileProbe('prisma/.env');
// Hypothesis C: prisma/.env used instead of root .env or missing key
sendLog('C', 'scripts/debug-env.ts:64', 'prisma/.env probe', prismaEnvProbe);

// Hypothesis D: Environment overrides blanking DATABASE_URL
sendLog('D', 'scripts/debug-env.ts:68', 'env keys snapshot', {
  hasDatabaseUrlKey: Object.prototype.hasOwnProperty.call(process.env, 'DATABASE_URL'),
});

// Hypothesis E: Path issues
sendLog('E', 'scripts/debug-env.ts:73', 'resolved paths', {
  rootEnvPath: path.resolve('.env'),
  prismaEnvPath: path.resolve('prisma/.env'),
});
// #endregion

