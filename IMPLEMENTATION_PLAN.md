# GMS Implementation Plan: RBAC Enhancements

Aligned with policies-first RBAC. No schema changes required (uses existing `User`, `UserRole`, `Role`, `emp_manager`).

---

## 1. AUTO-CREATE USER + EMPLOYEE ROLE ON SYNC

**Requirement:** When employee data is synced/created, automatically create/link User and assign "Employee" role (not only on OTP login).

### Files to Edit
- `server/auto-sync.ts`

### Logic Location
- `processEmployeeRecord()` (lines ~229–445) — inside the employee upsert block, after `prisma.employee.upsert()` succeeds.

### Implementation

**After** `prisma.employee.upsert()` (around line 439), add:

```ts
// Auto-create User + Employee role for new/synced employees
const employeeRecord = await prisma.employee.findUnique({
  where: { cardNumber: emp["CARD_NO"] },
  include: { user: true },
});
if (employeeRecord && !employeeRecord.user) {
  const fullName = [employeeRecord.firstName, employeeRecord.lastName].filter(Boolean).join(" ");
  const email = employeeRecord.companyEmail || employeeRecord.personalEmail 
    || `emp-${employeeRecord.cardNumber}@example.invalid`;
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  const finalEmail = existingByEmail 
    ? `emp-${employeeRecord.id}@example.invalid` 
    : email;
  const employeeRole = await prisma.role.findUnique({ where: { name: "Employee" }, select: { id: true } });
  if (employeeRole) {
    const user = await prisma.user.create({
      data: {
        name: fullName || "Employee",
        email: finalEmail,
        passwordHash: "sync-created",
        employeeId: employeeRecord.id,
        orgUnitId: employeeRecord.orgUnitId,
        status: "active",
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: employeeRole.id },
    });
  }
}
```

**Notes:**
- `passwordHash: "sync-created"` ensures they cannot login via password until admin sets one via Add Configuration.
- OTP login in `otp.routes.ts` already creates User if missing and calls `ensureEmployeeRole`. With sync creating User first, OTP path will find existing User and only ensure Employee role (idempotent).

---

## 2. SINGLE ACTIVE ROLE ON ADMIN ROLE CHANGE

**Requirement:** When admin changes a user's role, remove all existing roles, add only the selected role, increment `policyVersion`, invalidate auth cache.

### Files to Edit
- `server/routes/user-assignment.routes.ts`
- `server/lib/auth-cache.ts` (optional, for immediate invalidation)

### 2a. Modify `POST /api/users/assign-role`

**Current behavior:** Adds role only; does not remove others.

**New behavior:** Replace all roles with the selected one.

**Patch** — replace the block from line 59 to 81 with:

```ts
// Single active role: remove all existing roles, add only the selected one
await prisma.$transaction(async (tx) => {
  await tx.userRole.deleteMany({ where: { userId } });
  await tx.userRole.create({
    data: { userId, roleId },
  });
  await tx.user.update({
    where: { id: userId },
    data: { policyVersion: { increment: 1 } },
  });
});
```

**Add import:** `invalidateSessionAuthCache` from `../lib/auth-cache`.

**Add cache invalidation** (after transaction, before `res.json`):

```ts
const sessions = await prisma.session.findMany({
  where: { userId },
  select: { id: true },
});
sessions.forEach((s) => invalidateSessionAuthCache(s.id));
```

### 2b. Add `invalidateSessionsForUser` (optional, cleaner)

**File:** `server/lib/auth-cache.ts`

Add:

```ts
export async function invalidateSessionsForUser(userId: string): Promise<void> {
  const sessions = await prisma.session.findMany({
    where: { userId },
    select: { id: true },
  });
  sessions.forEach((s) => cache.delete(s.id));
}
```

Then in user-assignment: `await invalidateSessionsForUser(userId);` instead of manual loop.

**Note:** Without this, `policyVersion` increment already causes cache refresh within `POLICY_VERSION_CHECK_INTERVAL_MS` (default 30s). The explicit invalidation gives immediate effect.

---

## 3. MANAGER ROLE ON EMP_MANAGER ASSIGN/REMOVE

**Requirement:** Assign "Manager" role when emp_manager is assigned; remove "Manager" role when manager assignment is removed (if no other manager scopes).

### Files to Edit
- `prisma/seed.ts` — add "Manager" role
- `server/routes/emp-manager.routes.ts` — assign/remove Manager role

### 3a. Add "Manager" Role to Seed

**File:** `prisma/seed.ts`

In `roles` array (around line 210), add:

```ts
{
  name: "Manager",
  description: "Team manager - auto-assigned via emp_manager",
  policies: ["dashboard.view", "attendance.history.view", "attendance.self.view", "sales.self.view", "requests.self.view", "requests.create", "attendance.team.view", "sales-staff.view", "requests.team.view", "requests.approve"],
},
```

Add to `allowedRoleNames` (the roles array already drives this via `roles.map((r) => r.name)`).

### 3b. Assign Manager Role on `POST /api/emp-manager`

**File:** `server/routes/emp-manager.routes.ts`

After the transaction that creates/updates emp_manager (around line 76), before the `policyVersion` increment block:

```ts
const managerRole = await prisma.role.findUnique({ where: { name: "Manager" }, select: { id: true } });
if (managerRole) {
  const employee = await prisma.employee.findFirst({
    where: { cardNumber: String(mcardno) },
    include: { user: true },
  });
  if (employee?.user) {
    const existing = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: employee.user.id, roleId: managerRole.id } },
    });
    if (!existing) {
      await prisma.userRole.create({
        data: { userId: employee.user.id, roleId: managerRole.id },
      });
    }
  }
}
```

The existing `policyVersion` increment (lines 78–91) already runs; keep it.

### 3c. Remove Manager Role on `DELETE /api/emp-manager`

**File:** `server/routes/emp-manager.routes.ts`

After fetching `existing` (line 280) and before `prisma.$executeRaw` DELETE, get the employee and user. After the DELETE, add:

```ts
const employee = await prisma.employee.findFirst({
  where: { cardNumber: existing[0].mcardno },
  select: { id: true, user: { select: { id: true } } },
});
if (employee?.user) {
  const managerRole = await prisma.role.findUnique({ where: { name: "Manager" }, select: { id: true } });
  if (managerRole) {
    await prisma.userRole.deleteMany({
      where: {
        userId: employee.user.id,
        roleId: managerRole.id,
      },
    });
  }
}
```

**Note:** emp_manager has one row per `mcardno`; deleting that row means no manager scope remains, so we always remove the Manager role in this case.

---

## 4. ADD CONFIGURATION (ID/PASSWORD USER)

**Requirement:** "Add Configuration" button on Roles Management page to create ID/password user + assign role. Store credentials in `User.passwordHash`. Director-only access.

### Files to Edit
- `server/routes/auth.routes.ts` (or new `server/routes/users.routes.ts`) — new endpoint
- `server/routes/index.ts` — register route
- `client/src/pages/roles-assigned/index.tsx` or `client/src/pages/roles/index.tsx` — button + dialog
- `client/src/lib/api.ts` — API client

### 4a. Backend: `POST /api/users/create-credentials`

**New endpoint** (e.g. in `server/routes/user-assignment.routes.ts` or a new `users.routes.ts`):

**Protection:** `requireAuth` + `requirePolicy` with Director-only check:

```ts
// Director-only: check role, not just policy
if (!req.user!.roles?.some((r) => r.name === "Director")) {
  return res.status(403).json({ message: "Only Director can create credential users" });
}
```

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword",
  "name": "Display Name",
  "roleId": "uuid-of-role"
}
```

**Response:**
```json
{
  "success": true,
  "user": { "id": "...", "name": "...", "email": "..." },
  "role": { "id": "...", "name": "..." }
}
```

**Logic:**
1. Validate email, password (min length), name, roleId.
2. Check email not already in use.
3. `hashPassword(password)` (reuse from auth-middleware).
4. Create User with `passwordHash`, `name`, `email`, `status: "active"`.
5. Assign single role: `UserRole.create({ userId, roleId })` (replacing any existing — single active role).
6. Increment `policyVersion`.
7. Return user + role.

**File:** Add to `server/routes/user-assignment.routes.ts`:

```ts
app.post("/api/users/create-credentials", requireAuth, async (req, res) => {
  if (!req.user!.roles?.some((r) => r.name === "Director")) {
    return res.status(403).json({ message: "Only Director can create credential users" });
  }
  const { email, password, name, roleId } = req.body;
  if (!email || !password || !roleId) {
    return res.status(400).json({ message: "email, password, and roleId are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }
  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) {
    return res.status(400).json({ message: "Email already in use" });
  }
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return res.status(404).json({ message: "Role not found" });
  const displayName = (name || email.split("@")[0]).trim() || "User";
  const user = await prisma.user.create({
    data: {
      name: displayName,
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
      status: "active",
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await prisma.user.update({ where: { id: user.id }, data: { policyVersion: { increment: 1 } } });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email }, role: { id: role.id, name: role.name } });
});
```

**Import:** `hashPassword` from `../lib/auth-middleware`.

### 4b. Frontend: Add Configuration Button + Dialog

**File:** `client/src/pages/roles-assigned/index.tsx` (or `client/src/pages/roles/index.tsx`)

- Add "Add Configuration" button in header (next to existing actions).
- Dialog fields: Email, Password, Display Name, Role (dropdown from `rolesApi.getAll()`).
- On submit: `apiPost("/users/create-credentials", { email, password, name, roleId })`.
- On success: toast + close + invalidate `["roles"]` and `["employees"]` queries.
- Show in Members view; new user appears when listed via users/employees API.

**API client** in `client/src/lib/api.ts`:
```ts
createCredentialsUser: (data: { email: string; password: string; name?: string; roleId: string }) =>
  apiPost<{ success: boolean; user: any; role: any }>("/users/create-credentials", data),
```

---

## 5. ROLE LABEL ON DASHBOARDS

**Requirement:** Show role label at top of every dashboard (Director/Manager/Employee) based on primary role.

### Files to Edit
- `client/src/pages/dashboard.tsx` — already shows `user.roles` badges
- `client/src/pages/manager/dashboard.tsx` — add role label
- `client/src/components/MainLayout.tsx` — optional: add role in header/sidebar

### 5a. Primary Role Helper

**File:** `client/src/lib/utils.ts` or inline

```ts
export function getPrimaryRoleLabel(roles: { name: string }[] | undefined): string {
  if (!roles?.length) return "Employee";
  const names = roles.map((r) => r.name);
  if (names.includes("Director")) return "Director";
  if (names.includes("Manager")) return "Manager";
  return names[0] || "Employee";
}
```

### 5b. Dashboard Pages

**`client/src/pages/dashboard.tsx`** — Lines 228–244 already render role badges. Add a prominent label above or beside the greeting:

```tsx
<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
  {getPrimaryRoleLabel(user.roles)}
</span>
```

**`client/src/pages/manager/dashboard.tsx`** — Add similar block at top of content:
```tsx
const { user } = useAuth();
// ...
<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
  {getPrimaryRoleLabel(user?.roles)} · Team Dashboard
</span>
```

**`client/src/components/MainLayout.tsx`** — Optional: show role in header next to user name (around line 365 in sidebar user block):
```tsx
<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
  {getPrimaryRoleLabel(user.roles)}
</p>
```

---

## 6. REMOVE PASSWORD LOGIN AUTO-PROMOTION TO DIRECTOR

**Requirement:** Password login must NOT auto-promote to Director; respect assigned role.

### Current Code (Director Promotion)

| Location | File | Lines |
|----------|------|-------|
| Function definition | `server/routes/auth.routes.ts` | 16–73 |
| Google OAuth callback | `server/routes/auth.routes.ts` | 121 |
| Env override login | `server/routes/auth.routes.ts` | 192 |
| Normal password login | `server/routes/auth.routes.ts` | 228 |

### Safest Change

1. **Remove** all calls to `promotePasswordLoginToDirector` from `auth.routes.ts`.
2. **Keep** `promotePasswordLoginToDirector` (or delete it) — if unused, it can be removed.
3. **Google OAuth:** Keep current behavior (Director promotion) OR change to respect existing roles. Requirement only mentions "password login"; Google OAuth is separate. To align: stop promoting on Google OAuth too and use assigned roles. Specify in requirements.
4. **Env override:** Same as password login — use assigned roles.

**Proposed patch for `server/routes/auth.routes.ts`:**

- **Lines 117–121 (Google callback):** Remove `await promotePasswordLoginToDirector(user.id);`
- **Lines 188–194 (env override):** Remove `await promotePasswordLoginToDirector(envUser.id);`
- **Lines 224–228 (password login):** Remove `await promotePasswordLoginToDirector(user.id);`
- **Delete** the entire `promotePasswordLoginToDirector` function (lines 8–73).

**Result:** Password and Google logins use whatever roles the user has. Users created via "Add Configuration" will have the assigned role. Seed users (from `ALLOWED_GOOGLE_EMAILS`) keep their seeded roles.

**Migration note:** Existing users who only had Director via auto-promotion will lose it. To preserve them, run a one-time migration that assigns Director to users who currently have no roles (or only Employee) and were created before this change. Alternatively, re-run seed to re-assign roles for whitelisted emails.

---

## FILE LIST SUMMARY

| Area | File | Changes |
|------|------|---------|
| Backend | `server/auto-sync.ts` | Auto-create User + Employee role after employee upsert |
| Backend | `server/routes/user-assignment.routes.ts` | Single active role on assign; new `create-credentials` endpoint |
| Backend | `server/routes/emp-manager.routes.ts` | Assign/remove Manager role on emp_manager changes |
| Backend | `server/routes/auth.routes.ts` | Remove `promotePasswordLoginToDirector` and all calls |
| Backend | `server/lib/auth-cache.ts` | (Optional) `invalidateSessionsForUser` |
| Prisma | `prisma/seed.ts` | Add "Manager" role |
| Frontend | `client/src/pages/roles-assigned/index.tsx` | "Add Configuration" button + dialog |
| Frontend | `client/src/pages/dashboard.tsx` | Primary role label |
| Frontend | `client/src/pages/manager/dashboard.tsx` | Primary role label |
| Frontend | `client/src/components/MainLayout.tsx` | (Optional) Role in sidebar |
| Frontend | `client/src/lib/api.ts` | `createCredentialsUser` |
| Frontend | `client/src/lib/utils.ts` | `getPrimaryRoleLabel` |

---

## API CONTRACTS

### POST /api/users/create-credentials (NEW)

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword",
  "name": "Display Name",
  "roleId": "uuid"
}
```

**Response 200:**
```json
{
  "success": true,
  "user": { "id": "...", "name": "...", "email": "..." },
  "role": { "id": "...", "name": "..." }
}
```

**Errors:** 400 (validation), 403 (non-Director), 404 (role not found)

### POST /api/users/assign-role (MODIFIED)

**Request:** Unchanged `{ userId, roleId }`

**Response:** Unchanged. Behavior: replaces all roles with the selected one.

---

## IMPLEMENTATION ORDER

1. **Phase 1 – Non-breaking**
   - Add Manager role to seed
   - Manager role assign/remove in emp-manager routes
   - Primary role label on dashboards
   - `getPrimaryRoleLabel` helper

2. **Phase 2 – Auth changes**
   - Remove password/Google Director promotion
   - Single active role in assign-role
   - Add `create-credentials` endpoint
   - Add Configuration UI

3. **Phase 3 – Sync**
   - Auto-create User + Employee role in auto-sync

**Verification:**
- OTP login still creates User + Employee role when User is missing (unchanged).
- OTP login with pre-created User from sync: finds User, ensures Employee role.
- Google OAuth: respects assigned roles.
- Password login: respects assigned roles.
- Add Configuration: creates user with chosen role, login uses that role.
