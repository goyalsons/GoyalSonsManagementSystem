# RBAC Implementation – Deliverable Summary

## A) Database (Prisma)

### Schema changes
- **User**: `passwordHash` made optional (`String?`) for Google OAuth–only users.  
  Existing models **Role**, **Policy**, **UserRole**, **RolePolicy** were already present and used as-is.

### Migration
- **File**: `prisma/migrations/20260208120000_user_password_hash_optional/migration.sql`  
  - `ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;`

### Seed updates (`prisma/seed.ts`)
- **New policies** (category):
  - **pages**: `VIEW_DASHBOARD`, `VIEW_ATTENDANCE`, `VIEW_REPORTS`, `VIEW_PAYROLL`, `VIEW_USERS`, `VIEW_ROLES`, `VIEW_POLICIES`
  - **actions**: `CREATE_USER`, `EDIT_USER`, `RESET_PASSWORD`, `ASSIGN_ROLE`, `CREATE_ROLE`, `EDIT_ROLE`, `CREATE_POLICY`, `EDIT_POLICY`
  - **system**: `MANAGE_SYSTEM_SETTINGS`, `VIEW_AUDIT_LOGS`
- **New role**: **Manager** (default policies empty; assign via UI).
- **Director**: gets all policies (including new RBAC keys).
- **HR**: gets `VIEW_USERS`, `VIEW_ROLES`, `VIEW_POLICIES` in addition to existing HR policies.

---

## B) Backend (Express)

### New/updated files

| File | Purpose |
|------|--------|
| `server/constants/policies.ts` | New RBAC policy keys + `POLICY_KEY_RBAC_REGEX` (UPPER_SNAKE). |
| `server/lib/validation.ts` | (Uses existing `isValidPolicyKey`; policy key validation allows UPPER_SNAKE via constants.) |
| `server/lib/auth-middleware.ts` | `requireAnyPolicy(...policyKeys)` added. |
| `server/routes/users.routes.ts` | **New**. GET /api/users (paginated, search), PATCH /api/users/:id, PATCH /api/users/:id/password, PATCH /api/users/:id/role. |
| `server/routes/index.ts` | Register `registerUsersRoutes`. |
| `server/routes/user-assignment.routes.ts` | create-credentials gated by `CREATE_USER` (Director has it). |
| `server/routes/roles.routes.ts` | GET uses `requireAnyPolicy(VIEW_ROLES, ROLES_ASSIGNED_VIEW)`; POST/PUT/DELETE use `CREATE_ROLE` / `EDIT_ROLE`. |
| `server/routes/policies.routes.ts` | GET uses `requireAnyPolicy(VIEW_POLICIES, ROLES_ASSIGNED_VIEW, ADMIN_PANEL)`; POST `CREATE_POLICY`; PATCH /api/policies/:id added, gated by `EDIT_POLICY`. |

### Route → policy matrix

| Route | Method | Policy (or Director bypass) |
|-------|--------|-----------------------------|
| /api/users | GET | VIEW_USERS |
| /api/users/:id | PATCH | EDIT_USER |
| /api/users/:id/password | PATCH | RESET_PASSWORD |
| /api/users/:id/role | PATCH | ASSIGN_ROLE |
| /api/users/create-credentials | POST | CREATE_USER |
| /api/roles | GET | VIEW_ROLES or ROLES_ASSIGNED_VIEW |
| /api/roles/:id | GET | VIEW_ROLES or ROLES_ASSIGNED_VIEW |
| /api/roles | POST | CREATE_ROLE |
| /api/roles/:id | PUT | EDIT_ROLE |
| /api/roles/:id | DELETE | EDIT_ROLE |
| /api/policies | GET | VIEW_POLICIES or ROLES_ASSIGNED_VIEW or ADMIN_PANEL |
| /api/policies | POST | CREATE_POLICY |
| /api/policies/:id | PATCH | EDIT_POLICY |

### Behaviour
- **Director** bypasses all policy checks (unchanged).
- **Password**: existing `hashPassword` (sha256) kept for compatibility. Optional: move to bcrypt for new passwords and migrate on login.
- **Self-protection**: PATCH /api/users/:id with `status: "disabled"` is rejected when the target user is the current user.

---

## C) Frontend (React)

### New/updated files

| File | Purpose |
|------|--------|
| `client/src/lib/api.ts` | `apiPatch`, `usersApi.getList`, `usersApi.update`, `usersApi.resetPassword`, `usersApi.updateRole`, `policiesApi.update`. |
| `client/src/lib/auth-context.tsx` | `usePolicies()` hook. |
| `client/src/pages/users-management.tsx` | **New**. Table (email, name, role, status, createdAt), search, pagination, Create User, Edit, Reset Password, Change Role. |
| `client/src/pages/roles-management.tsx` | **New**. List roles, Edit name/description, Edit policies (grouped checkboxes). |
| `client/src/pages/policies-management.tsx` | **New**. List policies by group, Create policy, Edit description/category. |
| `client/src/App.tsx` | Lazy load Users/Roles/Policies pages; routes `/users-management`, `/roles-management`, `/policies-management` with `PageGuard`. |
| `client/src/config/nav.config.ts` | Entries for users-management, roles-management, policies-management. |
| `client/src/components/MainLayout.tsx` | Nav items: Users (VIEW_USERS), Roles (VIEW_ROLES), Policies (VIEW_POLICIES) with icons. |

### UI guards
- **PageGuard** (existing): wraps each management page with the required policy (VIEW_USERS, VIEW_ROLES, VIEW_POLICIES).
- **Buttons**: Create User / Edit / Reset Password / Change Role shown only if user has CREATE_USER, EDIT_USER, RESET_PASSWORD, ASSIGN_ROLE (Director sees all).

---

## D) Auth + session

- **GET /api/auth/me**: unchanged; returns user, roles, and **policies** from `getUserAuthInfo`. New RBAC policies are included when the user’s role has them.
- Frontend caches user (and thus policies) in **AuthContext**; `hasPolicy()` and `usePolicies()` use this.

---

## Commands to run

```bash
# 1. Apply migration (optional if DB already has User table)
npx prisma migrate deploy

# 2. Generate Prisma client (after schema change)
npx prisma generate

# 3. Seed roles and policies (adds new policies and Manager role; Director/HR get new permissions)
npm run seed
```

---

## Quick test steps (manual)

1. **Director creates user, changes role, resets password**
   - Log in as Director (e.g. first Google whitelist email or first seed user).
   - Open **Users** (sidebar). Create a user (email, password, role). Edit name/status, Change Role, Reset Password. Confirm all succeed.

2. **HR cannot access user management actions**
   - Assign a user the HR role (or use an existing HR user). Log in as HR.
   - **Users** page should be visible (VIEW_USERS). Create User / Edit / Reset Password / Change Role should be hidden (no CREATE_USER, EDIT_USER, RESET_PASSWORD, ASSIGN_ROLE).
   - Calling PATCH /api/users/:id or POST /api/users/create-credentials as HR should return 403.

3. **UI hides restricted pages**
   - Log in as a role that has only e.g. `dashboard.view` (no VIEW_USERS, VIEW_ROLES, VIEW_POLICIES). Sidebar should not show Users, Roles, Policies. Navigating to `/users-management` should show PageGuard “Access Denied”.

4. **Backend blocks unauthorized API calls**
   - With a non-Director token that lacks VIEW_USERS: `GET /api/users` → 403.
   - With a token that lacks EDIT_USER: `PATCH /api/users/:id` → 403.
   - With a token that lacks CREATE_POLICY: `POST /api/policies` → 403.

---

## Files changed/added (checklist)

- [x] `prisma/schema.prisma` – User.passwordHash optional  
- [x] `prisma/seed.ts` – New policies, Manager role, HR policy expansion  
- [x] `prisma/migrations/20260208120000_user_password_hash_optional/migration.sql`  
- [x] `server/constants/policies.ts` – RBAC keys + UPPER_SNAKE validation  
- [x] `server/lib/auth-middleware.ts` – requireAnyPolicy  
- [x] `server/routes/users.routes.ts` – new  
- [x] `server/routes/index.ts` – register users routes  
- [x] `server/routes/user-assignment.routes.ts` – CREATE_USER guard  
- [x] `server/routes/roles.routes.ts` – VIEW_ROLES, CREATE_ROLE, EDIT_ROLE  
- [x] `server/routes/policies.routes.ts` – VIEW_POLICIES, CREATE_POLICY, EDIT_POLICY, PATCH :id  
- [x] `client/src/lib/api.ts` – apiPatch, usersApi, policiesApi.update  
- [x] `client/src/lib/auth-context.tsx` – usePolicies  
- [x] `client/src/pages/users-management.tsx` – new  
- [x] `client/src/pages/roles-management.tsx` – new  
- [x] `client/src/pages/policies-management.tsx` – new  
- [x] `client/src/App.tsx` – routes + lazy components  
- [x] `client/src/config/nav.config.ts` – RBAC nav entries  
- [x] `client/src/components/MainLayout.tsx` – Users, Roles, Policies nav items  
