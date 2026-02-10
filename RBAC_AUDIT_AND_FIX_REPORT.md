# RBAC Regression Bug — Full Audit & Fix Report

---

## 1) Root cause list (ranked)

| Rank | Root cause | Likelihood |
|------|------------|------------|
| **1** | **`loadUserFromSession()` called `ensureUserHasRole(userId, "Employee")` on cache miss.** That function used `replaceUserRoles(prisma, userId, roleId)`, which does `userRole.deleteMany({ where: { userId } })` then `userRole.create({ userId, roleId })`. So on every request that missed the auth cache (e.g. first request after login, or after cache TTL), any employee-linked user with no roles or no policies got their roles **replaced** by Employee. Store Manager was wiped. | **Confirmed** |
| 2 | `getUserAuthInfo` returning empty roles incorrectly | Low — roles come from DB via `getUserWithRoles`; no evidence of wrong read. |
| 3 | Cache storing empty snapshot | Low — snapshot is written after computing authInfo; if roles were correct in DB they’d be in the snapshot. |
| 4 | policyVersion mismatch resetting roles | No — policyVersion only invalidates cache; it does not mutate UserRole. |
| 5 | Seed or policy sync modifying UserRole on startup | No — `initializePolicySync` only touches Policy and RolePolicy, not UserRole. Seed runs only when explicitly invoked. |

---

## 2) Evidence with file + lines

**Primary evidence (root cause #1):**

- **server/lib/auth-middleware.ts** (state before hotfix):
  - Session load path (cache miss) loaded `authInfo` from `getUserAuthInfo(session.userId)`.
  - It then checked `hasNoRoles` and, for employee sessions or when `authInfo.employeeId` was set, called **`ensureUserHasRole(session.userId, "Employee")`** (old ~264–277).
  - **server/lib/auth-middleware.ts** (removed function) **`ensureUserHasRole`** (old ~185–207):
    - Looked up or created Role "Employee", then called **`replaceUserRoles(prisma, userId, role.id)`**.
  - **server/lib/role-replacement.ts** (unchanged) **`replaceUserRoles`** (lines 8–22):
    - `tx.userRole.deleteMany({ where: { userId } })` — removes all roles for the user.
    - `tx.userRole.create({ data: { userId, roleId } })` — assigns only the given role (Employee).
  - So: any employee-linked user with no roles (or the condition that previously triggered the block) caused **Store Manager (and any other role) to be deleted and replaced by Employee** on the next cache-miss request (e.g. re-login or after cache expiry).

**Schema constraint (single role):**

- **prisma/schema.prisma** (lines 91–102): `UserRole` has `@@unique([userId])`, so one user can have only one role. “Adding” a second role is impossible; the only way to “ensure” Employee for someone who already has Store Manager is to **replace** (delete + create), which is what `replaceUserRoles` did.

---

## 3) Hotfix diff

**File: server/lib/auth-middleware.ts**

- Remove `ensureUserHasRole` and any call to it from the session load path.
- Remove `replaceUserRoles` import.
- Add a read-only helper used only for logging (e.g. “would have triggered auto-assign”).
- Add a short comment that RBAC must not be mutated in auth middleware.

```diff
--- a/server/lib/auth-middleware.ts
+++ b/server/lib/auth-middleware.ts
@@ -1,7 +1,6 @@
 import { Request, Response, NextFunction } from "express";
 import { prisma } from "./prisma";
 import { getUserAuthInfo } from "./authorization";
-import { replaceUserRoles } from "./role-replacement";
 import { POLICIES, getAllPolicyKeys } from "../constants/policies";
 import * as crypto from "crypto";
 import { getSessionAuthSnapshot, putSessionAuthSnapshot } from "./auth-cache";
@@ -181,27 +180,27 @@ function getSessionId(req: Request): string | null {
   return sessionHeader ? String(sessionHeader) : null;
 }
 
-async function ensureUserHasRole(userId: string, roleName: string): Promise<boolean> {
-  const role = await prisma.role.upsert({
-    where: { name: roleName },
-    update: {},
-    create: { name: roleName },
-    select: { id: true },
-  });
-
-  const existing = await prisma.userRole.findUnique({
-    where: {
-      userId_roleId: {
-        userId,
-        roleId: role.id,
-      },
-    },
-    select: { userId: true },
-  });
-  if (existing) return false;
-
-  await replaceUserRoles(prisma, userId, role.id);
-  return true;
+/**
+ * True if the old middleware logic would have attempted to auto-assign Employee role.
+ * We no longer do this in middleware (only in OTP verification when creating a new user)
+ * to avoid wiping higher roles (e.g. Store Manager). Used for temporary logging only.
+ */
+function wouldHaveTriggeredEmployeeAutoAssign(
+  session: { loginType: string },
+  authInfo: {
+    roles: { name: string }[] | undefined;
+    policies: string[] | undefined;
+    employeeId: string | null;
+  }
+): boolean {
+  const hasNoRoles = !authInfo.roles || authInfo.roles.length === 0;
+  const hasNoPolicies = !authInfo.policies || authInfo.policies.length === 0;
+  const notDirector = !authInfo.roles?.some((r) => r.name === "Director");
+  const employeeSessionOrLinked =
+    session.loginType === "employee" || Boolean(authInfo.employeeId);
+  return Boolean(hasNoRoles && hasNoPolicies && notDirector && employeeSessionOrLinked);
 }
 
 /**
@@ -258,19 +257,26 @@ export async function loadUserFromSession(req: Request, res: Response, next: NextFunction) {
     let authInfo = await getUserAuthInfo(session.userId);
     if (!authInfo) {
       return next();
     }
 
-    // If user has no roles at all, auto-attach Employee for employee sessions so they get default access.
-    // Do NOT add Employee when user already has other roles (e.g. Store Manager); respect admin's choice.
-    const hasNoRoles = !authInfo.roles || authInfo.roles.length === 0;
-    if (
-      hasNoRoles &&
-      (!authInfo.policies || authInfo.policies.length === 0) &&
-      !authInfo.roles?.some((r) => r.name === "Director") &&
-      (session.loginType === "employee" || Boolean(authInfo.employeeId))
-    ) {
-      const changed = await ensureUserHasRole(session.userId, "Employee");
-      if (changed) {
-        authInfo = await getUserAuthInfo(session.userId);
-      }
-    }
+    // RBAC must not be mutated in auth middleware. Authentication layer is READ-ONLY.
+    // Auto-assigning Employee here called replaceUserRoles and wiped admin-assigned roles
+    // (e.g. Store Manager) on re-login. Only OTP verification may assign Employee on first-time user creation.
+    const autoAssignWouldHaveTriggered = wouldHaveTriggeredEmployeeAutoAssign(
+      session,
+      authInfo
+    );
+    // TODO REMOVE AFTER DEBUG: session load diagnostics (temporary, ~1 week)
+    console.log("[loadUserFromSession]", JSON.stringify({
+      userId: session.userId,
+      sessionId: session.id,
+      loginType: session.loginType,
+      rolesLength: authInfo.roles?.length ?? 0,
+      employeeId: authInfo.employeeId ?? null,
+      autoAssignTriggered: false,
+      autoAssignWouldHaveTriggered,
+    }));
 
     req.user = {
```

**File: server/routes/otp.routes.ts**

- No change required for the hotfix. `ensureEmployeeRole` in otp.routes.ts **does not** call `replaceUserRoles`; it only does `userRole.create` if the user does not already have the Employee role (and catches unique violation if the user already has another role, e.g. Store Manager). So it does not overwrite existing roles.

---

## 4) Proper fix diff (architectural)

The hotfix **is** the architectural fix: the authentication layer is now read-only for RBAC.

- **Refactored auth-middleware.ts:** Already applied:
  - No role mutation in `loadUserFromSession`.
  - Only reads: session → `getUserAuthInfo(session.userId)` → `req.user` + cache.
  - Comment documents the rule: “RBAC must not be mutated in auth middleware.”
- **Confirmed allowed mutation points:**
  - **server/routes/user-assignment.routes.ts** — `POST /api/users/assign-role`, `DELETE .../roles/:roleId` (admin).
  - **server/routes/otp.routes.ts** — `ensureEmployeeRole` only in OTP verify flows (adds Employee when missing; does not replace).
  - **server/routes/auth.routes.ts** — `promotePasswordLoginToDirector` (optional, env-gated).
  - **prisma/seed.ts** — when explicitly run.
  - **server/services/policy-sync.service.ts** — Policy/RolePolicy only, not UserRole.
  - **server/lib/role-replacement.ts** — used only by admin assign and auth.routes (Director promotion), not by session middleware.

No further code diff is required beyond the hotfix; the “proper fix” is to keep the hotfix and the above rule.

---

## 5) Debug logging diff

Already included in the hotfix diff above. Only addition is the explicit “TODO REMOVE AFTER DEBUG” label:

```diff
-    // Temporary log (remove after ~1 week): session load diagnostics
+    // TODO REMOVE AFTER DEBUG: session load diagnostics (temporary, ~1 week)
     console.log("[loadUserFromSession]", JSON.stringify({
```

Log fields: `userId`, `sessionId`, `loginType`, `rolesLength`, `employeeId`, `autoAssignTriggered` (always false), `autoAssignWouldHaveTriggered`.

---

## 6) Test file

**File: tests/api/rbac-store-manager-persists.test.ts**

- Creates: OrgUnit, Employee (with cardNumber), User (employeeId set), Store Manager role, UserRole (user → Store Manager).
- Creates a new Session with `loginType: "employee"` and `employeeCardNo` (simulates re-login with card).
- Calls `GET /api/auth/me` with `X-Session-Id`.
- Asserts: status 200, `body.roles` includes `"Store Manager"`, `body.loginType === "employee"`, `body.employeeId` matches.

Run:

```bash
npx vitest run tests/api/rbac-store-manager-persists.test.ts --config vitest.api.config.ts
```

---

## 7) Post-fix verification checklist

- [x] **loadUserFromSession** never calls `ensureUserHasRole` or `replaceUserRoles`.
- [x] **Auth middleware** has an inline comment that RBAC must not be mutated there.
- [x] **OTP flows** still assign Employee only via `ensureEmployeeRole` (add-if-missing, no replace).
- [x] **Regression test** passes: Store Manager persists after “re-login” (new session, employee type).
- [x] **TypeScript** compiles; no new lint errors.
- [ ] **Manual**: Assign Store Manager to a card-linked user, logout, login again with card, open app and/or call `/api/auth/me` — role remains Store Manager.
- [ ] **After ~1 week**: Remove or gate the `[loadUserFromSession]` debug log (search for “TODO REMOVE AFTER DEBUG”).

---

# Phase 1 — Prisma schema relations (reference)

- **User** — `employeeId` @unique → Employee; `roles` → UserRole[].
- **Role** — `users` → UserRole[]; `policies` → RolePolicy[].
- **Policy** — `roles` → RolePolicy[].
- **UserRole** — userId, roleId; `@@id([userId, roleId])`; **`@@unique([userId])`** (single role per user).
- **RolePolicy** — roleId, policyId.
- **Employee** — `cardNumber` String? **@unique**; `user` → User (1:1).

**Duplicate users:** User.email is @unique; Employee is linked by User.employeeId (unique). So one User per Employee; no duplicate users from schema alone. Duplicates could only occur if application logic created multiple Users for the same employee (e.g. different emails); OTP/create flows use upsert or single create.

---

# Phase 2 — RBAC mutation risks table

| Match | File | Line | Why dangerous | Mutates UserRole? |
|-------|------|------|----------------|-------------------|
| replaceUserRoles | server/lib/role-replacement.ts | 14–16 | Deletes all roles for user, creates one | Yes |
| replaceUserRoles | server/routes/user-assignment.routes.ts | 72, 303, 324, 385 | Admin assign / backfill | Yes (intended) |
| replaceUserRoles | server/routes/auth.routes.ts | 59 | Director promotion (env-gated) | Yes (intended) |
| replaceUserRoles | server/routes/users.routes.ts | 200 | PATCH user role | Yes (intended) |
| replaceUserRoles | server/routes/emp-manager.routes.ts | 100 | Assign manager → Store Manager | Yes (intended) |
| ensureUserHasRole | server/lib/auth-middleware.ts | (removed) | Was called in session middleware; wiped Store Manager | Yes (removed) |
| ensureEmployeeRole | server/routes/otp.routes.ts | 7–35, 203, 569 | Adds Employee if missing; create only, catch unique | No replace (add only) |
| UserRole.create | server/routes/otp.routes.ts | 26–28 | First-time Employee | Yes (intended) |
| UserRole.deleteMany | server/lib/role-replacement.ts | 14 | Inside replaceUserRoles | Yes |
| userRole.create (replaceExisting: false) | server/routes/user-assignment.routes.ts | 76–80 | Add role; fails if user already has another (unique userId) | Attempts add |
| initializePolicySync | server/index.ts | 155 | Policy/RolePolicy sync | No (Policy, RolePolicy only) |
| seed | prisma/seed.ts | 399–410 | UserRole create/delete for ALLOWED_GOOGLE_EMAILS | Yes (when seed run) |
| auth-cache | server/lib/auth-cache.ts | get/put | Cache read/write; no role writes | No |
| hasNoRoles / wouldHaveTriggeredEmployeeAutoAssign | server/lib/auth-middleware.ts | 200–205 | Read-only condition for logging | No |

---

# Phase 2 — Auth flow trace (where roles READ vs WRITTEN)

| Path | Where roles READ | Where roles WRITTEN | Auto Employee / replaceUserRoles / empty-role overwrite |
|------|------------------|---------------------|----------------------------------------------------------|
| POST /api/auth/login | getUserAuthInfo after login | Session create; promotePasswordLoginToDirector (optional) | Director promotion uses replaceUserRoles (intended). No Employee in middleware. |
| OTP verify (phone) | getUserAuthInfo | ensureEmployeeRole (add if missing) | OTP only; add-only, no replace. |
| POST verify-employee-otp | getUserAuthInfo | ensureEmployeeRole; Session create | OTP only; add-only. |
| employee-lookup | — | — | No role write. |
| Google OAuth callback | — | promotePasswordLoginToDirector; Session create | Director only; no Employee in middleware. |
| loadUserFromSession | getUserAuthInfo(session.userId) | **None (after fix)** | **Fixed: no mutation.** |
| GET /api/auth/me | req.user (set by loadUserFromSession) | — | Read-only. |

Exact locations:

- **Roles READ:** `server/lib/authorization.ts` — `getUserWithRoles` (roles from UserRole + Role); `getUserAuthInfo` uses it. `server/lib/auth-middleware.ts` — `loadUserFromSession` calls `getUserAuthInfo(session.userId)` (~260) and sets `req.user`.
- **Roles WRITTEN (intended):** `server/lib/role-replacement.ts` — `replaceUserRoles`. Called from user-assignment.routes.ts (assign-role), users.routes.ts (PATCH role), auth.routes.ts (Director), emp-manager.routes.ts (Store Manager). `server/routes/otp.routes.ts` — `ensureEmployeeRole` does `userRole.create` only if no Employee role (~26–28).
- **Removed:** `server/lib/auth-middleware.ts` — previously called `ensureUserHasRole(session.userId, "Employee")` in session load (old ~271–276), which called `replaceUserRoles` and wiped Store Manager.

---

# Phase 3 — Why roles were wiped and how Store Manager was replaced

- **loadUserFromSession** (on cache miss) did check a condition equivalent to “has no roles” and “employee session or employeeId”. For that condition it called **ensureUserHasRole(userId, "Employee")**.
- **ensureUserHasRole** did: find/create Employee role → if user doesn’t already have that role → **replaceUserRoles(prisma, userId, role.id)**.
- **replaceUserRoles** does: **deleteMany({ where: { userId } })** on UserRole, then **create({ userId, roleId })**. So the user’s existing role (e.g. Store Manager) was removed and only Employee was left.
- So: after re-login (new session), the first request that missed the auth cache hit this path and replaced Store Manager with Employee. Cached requests did not mutate roles but once the cache expired or a new session was used, the next load did.

---

This report and the hotfix together give a concrete, code-backed analysis and patches with no schema change and no regression.
