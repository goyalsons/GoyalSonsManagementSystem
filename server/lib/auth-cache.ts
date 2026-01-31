import { prisma } from "./prisma";

/**
 * Session-scoped auth snapshot cache.
 *
 * Goals:
 * - Avoid re-resolving Role→Policy joins and org subtree on every request.
 * - Keep request path non-blocking (no locks); all operations are O(1) Map access.
 * - Preserve security via periodic re-validation:
 *   - session existence / expiry
 *   - user.policyVersion changes
 *
 * NOTE:
 * - In-memory cache is process-local. In multi-instance deployments you should
 *   replace this with Redis (same key: sessionId) to get shared cache + invalidation.
 */

export type AuthSnapshot = {
  id: string;
  name: string;
  email: string;
  orgUnitId: string | null;
  employeeId: string | null;
  roles: { id: string; name: string }[];
  policies: string[];
  accessibleOrgUnitIds: string[];
  employee?: {
    firstName: string;
    lastName: string | null;
    gender: string | null;
    designationCode: string | null;
    designationName: string | null;
  } | null;
  // Optional fields that some routes expect (legacy / manager views)
  isManager?: boolean;
  managerScopes?: {
    departmentIds: string[] | null;
    designationIds: string[] | null;
    orgUnitIds: string[] | null;
  } | null;
};

type CacheEntry = {
  snapshot: AuthSnapshot;
  userId: string;
  policyVersion: number;
  sessionExpiresAt: Date;
  sessionLoginType: "mdo" | "employee";
  sessionEmployeeCardNo: string | null;
  cachedAt: number;
  lastPolicyVersionCheckAt: number;
  lastSessionCheckAt: number;
};

const cache = new Map<string, CacheEntry>();

const TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS || "300000"); // default 5 min
const POLICY_VERSION_CHECK_INTERVAL_MS = Number(
  process.env.AUTH_CACHE_POLICY_VERSION_CHECK_MS || "30000",
); // default 30s
const SESSION_CHECK_INTERVAL_MS = Number(process.env.AUTH_CACHE_SESSION_CHECK_MS || "60000"); // default 60s
const MAX_ENTRIES = Number(process.env.AUTH_CACHE_MAX_ENTRIES || "20000");

function nowMs(): number {
  return Date.now();
}

function isEntryExpired(entry: CacheEntry, now = nowMs()): boolean {
  if (entry.sessionExpiresAt.getTime() <= Date.now()) return true;
  if (!Number.isFinite(TTL_MS) || TTL_MS <= 0) return false;
  return now - entry.cachedAt > TTL_MS;
}

function pruneIfNeeded(): void {
  const now = nowMs();
  // Remove expired entries first
  for (const [key, entry] of Array.from(cache.entries())) {
    if (isEntryExpired(entry, now)) cache.delete(key);
  }
  // Soft cap: if still too large, drop oldest (simple scan)
  if (cache.size <= MAX_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [key, entry] of Array.from(cache.entries())) {
    if (entry.cachedAt < oldestAt) {
      oldestAt = entry.cachedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

export function invalidateSessionAuthCache(sessionId: string): void {
  cache.delete(sessionId);
}

/**
 * Invalidate all cached auth snapshots for a user (all their sessions).
 * Call after role/credentials change for immediate effect.
 */
export async function invalidateSessionsForUser(userId: string): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { userId },
    select: { id: true },
  });
  for (const s of sessions) {
    cache.delete(s.id);
  }
}

/**
 * Try to use cached snapshot for a session.
 *
 * Returns:
 * - { hit: true, snapshot } on valid cache hit
 * - { hit: false } if cache miss/expired/invalidated
 *
 * Security:
 * - Periodically checks session existence (prevents use-after-logout longer than interval/TTL)
 * - Periodically checks user.policyVersion (invalidates on RBAC changes)
 */
export async function getSessionAuthSnapshot(sessionId: string): Promise<
  | { hit: true; snapshot: AuthSnapshot; loginType: "mdo" | "employee"; employeeCardNo: string | null }
  | { hit: false; reason: "miss" | "expired" | "session_missing" | "session_expired" | "policy_version_changed" }
> {
  pruneIfNeeded();
  const entry = cache.get(sessionId);
  if (!entry) return { hit: false, reason: "miss" };

  const now = nowMs();
  if (isEntryExpired(entry, now)) {
    cache.delete(sessionId);
    return { hit: false, reason: "expired" };
  }

  // Re-check session existence/expiry periodically (cheap query)
  if (now - entry.lastSessionCheckAt >= SESSION_CHECK_INTERVAL_MS) {
    entry.lastSessionCheckAt = now;
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { expiresAt: true },
    });
    if (!session) {
      cache.delete(sessionId);
      return { hit: false, reason: "session_missing" };
    }
    if (session.expiresAt < new Date()) {
      cache.delete(sessionId);
      return { hit: false, reason: "session_expired" };
    }
    entry.sessionExpiresAt = session.expiresAt;
  }

  // Re-check policyVersion periodically (very cheap query)
  if (now - entry.lastPolicyVersionCheckAt >= POLICY_VERSION_CHECK_INTERVAL_MS) {
    entry.lastPolicyVersionCheckAt = now;
    const user = await prisma.user.findUnique({
      where: { id: entry.userId },
      select: { policyVersion: true },
    });
    const currentVersion = user?.policyVersion ?? -1;
    if (currentVersion !== entry.policyVersion) {
      cache.delete(sessionId);
      return { hit: false, reason: "policy_version_changed" };
    }
  }

  return {
    hit: true,
    snapshot: entry.snapshot,
    loginType: entry.sessionLoginType,
    employeeCardNo: entry.sessionEmployeeCardNo,
  };
}

export async function putSessionAuthSnapshot(params: {
  sessionId: string;
  userId: string;
  sessionExpiresAt: Date;
  sessionLoginType: "mdo" | "employee";
  sessionEmployeeCardNo: string | null;
  policyVersion: number;
  snapshot: AuthSnapshot;
}): Promise<void> {
  pruneIfNeeded();
  const now = nowMs();
  cache.set(params.sessionId, {
    snapshot: params.snapshot,
    userId: params.userId,
    policyVersion: params.policyVersion,
    sessionExpiresAt: params.sessionExpiresAt,
    sessionLoginType: params.sessionLoginType,
    sessionEmployeeCardNo: params.sessionEmployeeCardNo,
    cachedAt: now,
    lastPolicyVersionCheckAt: now,
    lastSessionCheckAt: now,
  });
}

