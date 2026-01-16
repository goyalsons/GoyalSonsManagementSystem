# RBAC System Implementation

## Overview

This document describes the production-ready RBAC (Role-Based Access Control) system implemented for the Goyalsons Management System.

## Core Principles

1. **User-Only Entity**: Only `User` entity exists. No parallel `Employee` concept in auth flow.
2. **Policy-Driven**: All access control is based on policies, not role names.
3. **JWT-Based**: Short-lived JWT tokens contain policy snapshots.
4. **Admin-Controlled**: All permissions managed via Admin UI and database.
5. **No Code Changes Required**: After go-live, permission changes don't require redeployment.

## Architecture

### Database Schema

```
User
├── policyVersion (Int) - Increments when policies change, forces JWT refresh
├── roles (UserRole[]) - Many-to-many with Role
└── ...

Role
├── name (String, unique)
├── level (Int)
├── policies (RolePolicy[]) - Many-to-many with Policy
└── ...

Policy
├── key (String, unique) - Canonical policy key (e.g., "users.view")
├── isActive (Boolean) - Admin can enable/disable
├── description (String)
└── category (String)

UserRole (junction table)
├── userId
├── roleId
└── createdAt

RolePolicy (junction table)
├── roleId
├── policyId
└── createdAt

AuditLog
├── userId (actor)
├── action (create, update, delete, assign, remove)
├── entity (role, policy, user_role)
├── entityId
└── meta (JSON)
```

### Authentication Flow

```
1. User logs in → POST /api/auth/login
2. Backend fetches user's active policies from DB
3. Backend generates JWT with:
   - userId, email
   - policies[] (snapshot)
   - policyVersion (user's current version)
4. Frontend stores JWT token
5. On each API request:
   - JWT is verified
   - policyVersion is checked against user's current version
   - If mismatch → 401, user must re-login
6. Policies from JWT are used for authorization (no DB query)
```

### Authorization Flow

```
Request → loadUserFromJWT middleware
  ↓
Extract JWT from Authorization header
  ↓
Verify JWT signature & expiration
  ↓
Check policyVersion matches user's current version
  ↓
Attach user + policies to req.user
  ↓
requireAuth middleware (checks req.user exists)
  ↓
requirePolicy(policyKey) middleware (checks policy in req.user.policies)
  ↓
Route handler executes
```

## Canonical Policy Set

These are the ONLY policies that exist in the system:

```typescript
dashboard.view
users.view
users.assign_role
attendance.view
attendance.create
sales.view
sales.refresh
sales.staff.view
sales.staff.refresh
tasks.view
tasks.create
claims.view
announcements.view
targets.view
roles.view
roles.create
roles.edit
roles.delete
policies.view
policies.create
manager.view
manager.assign
manager.delete
manager.team.view
help_tickets.view
help_tickets.create
help_tickets.update
settings.view
settings.edit
admin.panel
```

⚠️ **DO NOT RENAME OR ADD POLICIES** without client approval.

## Role Assignment Security

### Rules

1. **Assigner must have `users.assign_role` policy**
2. **Assigner must own ALL non-org-scoped policies in the role being assigned**
   - Prevents privilege escalation
   - Non-org-scoped policies: `dashboard.view`, `roles.*`, `policies.*`, `admin.panel`, `settings.*`
3. **Target user must be within assigner's org scope** (unless SuperAdmin)

### Example

User A wants to assign Role X to User B.

Role X contains:
- `attendance.view` (org-scoped) ✅
- `roles.create` (non-org-scoped) ❌ User A doesn't have this
- `sales.view` (org-scoped) ✅

**Result**: ❌ Denied - User A cannot grant `roles.create` because they don't have it.

## Admin APIs

### Policies

- `GET /api/admin/policies` - List all policies
- `POST /api/admin/policies` - Create policy
- `PUT /api/admin/policies/:id` - Update policy (enable/disable, description)

### Roles

- `GET /api/admin/roles` - List all roles with policies
- `GET /api/admin/roles/:id` - Get role details
- `POST /api/admin/roles` - Create role
- `PUT /api/admin/roles/:id` - Update role (name, policies, etc.)
- `DELETE /api/admin/roles/:id` - Delete role

### User-Role Assignments

- `GET /api/admin/users/:userId/roles` - Get user's roles
- `POST /api/admin/users/:userId/roles/:roleId` - Assign role to user
- `DELETE /api/admin/users/:userId/roles/:roleId` - Remove role from user

## Policy Version Management

When policies change, affected users' `policyVersion` is incremented:

1. **Role's policies updated** → All users with that role get `policyVersion++`
2. **Policy disabled** → All users with roles containing that policy get `policyVersion++`
3. **Role assigned/removed** → Target user gets `policyVersion++`

On next API request, JWT's `policyVersion` won't match user's current version → 401 → User must re-login.

## Frontend Contract

### Login Response

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "policies": ["dashboard.view", "users.view", "attendance.view"]
  }
}
```

### Frontend Usage

```typescript
// Show/hide navigation items
if (user.policies.includes("users.view")) {
  // Show "Users" nav item
}

// Enable/disable buttons
<Button disabled={!user.policies.includes("roles.create")}>
  Create Role
</Button>
```

**Never check role names** - always use policy keys.

## File Structure

```
server/
├── lib/
│   ├── jwt.ts                    # JWT signing/verification
│   ├── auth-middleware.ts         # requireAuth, requirePolicy, loadUserFromJWT
│   ├── authorization.ts          # getUserPolicies, getAccessibleOrgUnitIds
│   ├── role-assignment-security.ts # canAssignRole, canRemoveRole
│   └── audit-log.ts              # Audit logging functions
├── routes/
│   ├── auth.routes.ts            # /api/auth/login, /api/auth/me
│   └── rbac-admin.routes.ts      # Admin APIs for RBAC management
└── constants/
    └── policies.ts                # Canonical policy constants
```

## Migration Steps

1. **Run Prisma migration**:
   ```bash
   npx prisma migrate dev --name add_policy_version_and_isactive
   ```

2. **Seed canonical policies**:
   ```bash
   npm run seed
   ```

3. **Update environment variables**:
   ```env
   JWT_SECRET=<generate-random-64-char-string>
   JWT_EXPIRY_SECONDS=900  # 15 minutes (optional)
   ```

4. **Test login flow**:
   - Login should return JWT token
   - JWT should contain policies array
   - `/api/auth/me` should return user with policies

## Security Considerations

1. **JWT Secret**: Must be strong, random, and kept secret
2. **Token Expiry**: Short-lived (15 minutes default) forces frequent re-authentication
3. **Policy Version**: Prevents stale permissions after policy changes
4. **Privilege Escalation**: Prevented by role assignment security rules
5. **Audit Logging**: All RBAC operations are logged
6. **Input Validation**: All API inputs are validated
7. **SuperAdmin Bypass**: SuperAdmin bypasses all checks (logged for audit)

## Testing Checklist

- [ ] Login returns JWT with policies
- [ ] JWT verification works
- [ ] Policy version mismatch forces re-login
- [ ] requirePolicy middleware blocks unauthorized access
- [ ] Role assignment security prevents privilege escalation
- [ ] Policy changes increment user policyVersion
- [ ] Admin APIs work correctly
- [ ] Audit logs are created for all operations
- [ ] Frontend can use policies array for UI control

## Production Deployment

1. Set strong `JWT_SECRET` in production environment
2. Run migrations: `npx prisma migrate deploy`
3. Seed policies: `npm run seed`
4. Verify all admin APIs are protected
5. Test login flow end-to-end
6. Monitor audit logs for suspicious activity

---

**Last Updated**: 2025-01-XX
**Version**: 1.0.0
