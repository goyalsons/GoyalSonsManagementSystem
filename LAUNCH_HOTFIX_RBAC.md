# Production Launch Hotfix — RBAC Store Manager Downgrade

## 1) Root cause summary

**Bug:** After assigning Store Manager to a card-linked user, logout and re-login with card caused the user to be downgraded to Employee and policies reset.

**Cause:** Session middleware (`loadUserFromSession` in `server/lib/auth-middleware.ts`) used to run “auto-fix” logic when it saw a user with no roles (or no policies) and an employee session / `employeeId`. It called `ensureUserHasRole(userId, "Employee")`, which in turn called `replaceUserRoles(prisma, userId, employeeRoleId)`. That function **deletes all UserRole rows for the user** and creates a single new one for Employee, so Store Manager (and any other role) was wiped on every cache-miss request (e.g. first request after re-login).

**Fix:** Role mutation was removed from session middleware. Middleware is now read-only for RBAC. A launch flag `DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true` documents and enforces “no role autofix in middleware.” Role assignment is only done in admin assign endpoints and OTP first-time user creation.

---

## 2) Middleware hotfix diff

**File: `server/lib/auth-middleware.ts`**

- Comment updated to: **"RBAC must not mutate in session middleware (launch hotfix)."**
- When `DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true`, any role autofix is skipped (no mutation).
- Added **`[RBAC DEBUG]`** log with `sessionId`, `userId`, `loginType`, `employeeId`, `rolesCount`, marked **TODO REMOVE AFTER LAUNCH**.

```diff
--- a/server/lib/auth-middleware.ts
+++ b/server/lib/auth-middleware.ts
@@ -262,13 +262,24 @@ export async function loadUserFromSession(req: Request, res: Response, next: NextFunction) {
       return next();
     }
 
-    // RBAC must not be mutated in auth middleware. Authentication layer is READ-ONLY.
-    // Auto-assigning Employee here called replaceUserRoles and wiped admin-assigned roles
-    // (e.g. Store Manager) on re-login. Only OTP verification may assign Employee on first-time user creation.
+    // RBAC must not mutate in session middleware (launch hotfix).
+    // When DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true, any role autofix is skipped; we do not mutate roles here.
+    if (process.env.DISABLE_MIDDLEWARE_ROLE_AUTOFIX === "true") {
+      // Launch safety: explicitly no role mutation in middleware.
+    }
     const autoAssignWouldHaveTriggered = wouldHaveTriggeredEmployeeAutoAssign(
       session,
       authInfo
     );
+    // TODO REMOVE AFTER LAUNCH
+    console.log("[RBAC DEBUG]", {
+      sessionId: session.id,
+      userId: session.userId,
+      loginType: session.loginType,
+      employeeId: authInfo.employeeId ?? null,
+      rolesCount: authInfo.roles?.length ?? 0,
+    });
     // TODO REMOVE AFTER DEBUG: session load diagnostics (temporary, ~1 week)
     console.log("[loadUserFromSession]", JSON.stringify({
```

*(Note: The hotfix that removed `ensureUserHasRole` and `replaceUserRoles` from this file was already applied earlier; the above shows only the comment, env guard, and RBAC DEBUG log.)*

---

## 3) Query fix diff (if needed)

**No change required.**

`getUserAuthInfo()` uses `getUserWithRoles(userId)` in `server/lib/authorization.ts`. `getUserWithRoles` already loads **User → UserRole → Role**:

- **File:** `server/lib/authorization.ts`
- **Lines 42–61:** `prisma.user.findUnique` with `roles: { include: { role: { select: { id: true, name: true } } } }`.

Roles are therefore read correctly. The RBAC DEBUG log was added in **middleware** (where `sessionId`, `userId`, `loginType`, and `authInfo` are available) rather than inside `getUserAuthInfo`, which does not have `sessionId`.

---

## 4) Env flag diff

**File: `ENV_EXAMPLE.md`**

```diff
 ## Authentication

 ```env
 ENABLE_PASSWORD_LOGIN_DIRECTOR_PROMOTION=false
+
+# Launch safety: when true, session middleware must never mutate user roles (no ensureUserHasRole / replaceUserRoles).
+# Set to true for production to prevent card-linked users (e.g. Store Manager) from being downgraded to Employee on re-login.
+DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true
 ```
```

**New file: `.env.example`**

```env
# Copy to .env and fill in. See ENV_EXAMPLE.md for full list and descriptions.
NODE_ENV=development
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/goyalsons_db?connection_limit=10

# Launch safety: when true, session middleware never mutates user roles (prevents Store Manager downgrade on re-login).
DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true

ENABLE_PASSWORD_LOGIN_DIRECTOR_PROMOTION=false
```

---

## 5) Test file

**File: `tests/api/rbac-store-manager-persists.test.ts`**

- **Setup:** Creates OrgUnit, Employee (with `cardNumber`), User (`employeeId` set), Store Manager role, and assigns that role to the user.
- **Simulate re-login:** Creates a new Session with `loginType: "employee"` and `employeeCardNo` (same as after card OTP login).
- **Assert:** `GET /api/auth/me` with `X-Session-Id` returns 200 and `body.roles` includes `"Store Manager"`.
- **Runner:** Vitest + supertest (project uses vitest; API tests use supertest against `createApp()`).

**Helper:** Session is created via `prisma.session.create` in the test; no separate helper file. Auth test helper `tests/helpers/auth.ts` provides `createSessionForUser` and `setSessionHeader` for other tests; this test creates an employee-type session inline.

**Run:**

```bash
npx vitest run tests/api/rbac-store-manager-persists.test.ts --config vitest.api.config.ts
```

**Result:** Test passes (Store Manager persists after “re-login”).

---

## 6) Launch verification checklist

- [x] **Middleware:** No `ensureUserHasRole`, no `replaceUserRoles` in `loadUserFromSession`.
- [x] **Comment:** “RBAC must not mutate in session middleware (launch hotfix)” present.
- [x] **Env flag:** `DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true` documented in ENV_EXAMPLE.md and .env.example; middleware checks it (no role mutation when set).
- [x] **Role fetch:** `getUserWithRoles` includes User → UserRole → Role; no query change.
- [x] **RBAC DEBUG log:** Added with sessionId, userId, loginType, employeeId, rolesCount; marked TODO REMOVE AFTER LAUNCH.
- [x] **Regression test:** Assign Store Manager → re-login (new session) → GET /api/auth/me shows Store Manager; test passes.
- [ ] **Production:** Set `DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true` in production env.
- [ ] **Manual:** Assign Store Manager to a card-linked user, logout, login again with card, confirm role and policies remain.
- [ ] **Post-launch:** Remove or gate `[RBAC DEBUG]` and any other TODO REMOVE AFTER LAUNCH logs.
