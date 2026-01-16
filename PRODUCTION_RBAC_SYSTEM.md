# Production-Ready UI-Driven RBAC System

## Overview

This is a **production-ready, UI-driven policy and access control system** where:
- **UI pages are the single source of truth**
- **Policies are auto-generated from pages**
- **No code changes required when adding new pages**
- **Everything is configurable from Admin UI**

## Architecture

### Database Schema

```prisma
model User {
  id            String        @id @default(uuid())
  name          String
  email         String        @unique
  passwordHash  String
  status        String        @default("active")
  isSuperAdmin  Boolean       @default(false)
  roles         UserRole[]
  // ... other fields
}

model Role {
  id          String       @id @default(uuid())
  name        String       @unique
  description String?
  users       UserRole[]
  policies    RolePolicy[]
}

model Policy {
  id          String       @id @default(uuid())
  key         String       @unique
  description String?
  category    String?
  isActive    Boolean      @default(true)
  pageId      String?      // Links to UiPage if auto-generated
  page        UiPage?
  roles       RolePolicy[]
}

model UiPage {
  id              String    @id @default(uuid())
  pageKey         String    @unique
  pageName        String
  path            String    @unique
  policyPrefix    String
  autoGenerate    Boolean   @default(true)
  icon            String?
  order           Int       @default(0)
  isActive        Boolean   @default(true)
  policies        Policy[]
}
```

### Key Principles

1. **Only Users Exist**: No separate Employee/Staff/Manager entities. These are just roles assigned to users.

2. **UI-First Design**: Every UI page automatically maps to backend policies.

3. **Auto-Generation**: When a new page is created:
   - Page record is created in `UiPage` table
   - Policies are auto-generated: `{prefix}.view`, `{prefix}.create`, `{prefix}.update`, `{prefix}.delete`
   - Custom actions can be added (e.g., `help_tickets.assign`, `help_tickets.close`)

4. **Database as Source of Truth**: All policies come from PostgreSQL, not hardcoded enums.

## Workflow

### Adding a New Page (No Code Required)

1. **Admin logs into Admin UI**
2. **Navigates to "Page Management"**
3. **Clicks "Create Page"**
4. **Fills in form:**
   - Page Key: `help-tickets`
   - Page Name: `Help Tickets`
   - Path: `/help-tickets`
   - Policy Prefix: `help_tickets`
   - Custom Actions (optional): `assign`, `close`
5. **Clicks "Create"**
6. **System automatically:**
   - Creates page record
   - Generates policies: `help_tickets.view`, `help_tickets.create`, `help_tickets.update`, `help_tickets.delete`, `help_tickets.assign`, `help_tickets.close`
   - Policies are ready to assign to roles

### Assigning Policies to Roles

1. **Admin navigates to "Role Management"**
2. **Selects a role (e.g., "Manager")**
3. **Sees all available policies from database**
4. **Checks policies to assign:**
   - `help_tickets.view`
   - `help_tickets.create`
   - `help_tickets.update`
5. **Saves role**
6. **All users with "Manager" role now have these policies**

### Assigning Roles to Users

1. **Admin navigates to "User Management"**
2. **Selects a user**
3. **Assigns roles:**
   - Manager
   - Sales Staff
4. **User gets union of all policies from both roles**

### Login Flow

1. **User logs in**
2. **Backend fetches:**
   - User's roles
   - Policies from all roles (union)
3. **Policies stored in JWT token**
4. **Frontend receives policies**
5. **Navigation renders only pages user has `{page}.view` policy for**
6. **Backend validates policies on every API request**

## Backend Implementation

### Policy Guard Middleware

```typescript
import { policyGuard } from "../lib/policy-guard";

// Single policy
app.get("/api/help-tickets", requireAuth, policyGuard("help_tickets.view"), handler);

// Any of multiple policies
app.post("/api/help-tickets", requireAuth, policyGuardAny(["help_tickets.create", "help_tickets.admin"]), handler);

// All of multiple policies
app.put("/api/help-tickets/:id", requireAuth, policyGuardAll(["help_tickets.update", "help_tickets.approve"]), handler);
```

### Page Management Service

```typescript
import { createPage } from "../services/page-management.service";

// Create a new page with auto-generated policies
await createPage({
  pageKey: "help-tickets",
  pageName: "Help Tickets",
  path: "/help-tickets",
  policyPrefix: "help_tickets",
  actions: [
    { name: "assign", policyKey: "help_tickets.assign" },
    { name: "close", policyKey: "help_tickets.close" },
  ],
});
```

## Frontend Implementation

### Navigation Rendering

```typescript
import { useActivePages } from "@/hooks/use-pages";
import { useAuth } from "@/lib/auth-context";

function Navigation() {
  const { data: pages } = useActivePages();
  const { hasPolicy } = useAuth();

  return (
    <nav>
      {pages
        ?.filter((page) => hasPolicy(`${page.policyPrefix}.view`))
        .map((page) => (
          <NavLink key={page.id} to={page.path}>
            {page.pageName}
          </NavLink>
        ))}
    </nav>
  );
}
```

### Page Guard Component

```typescript
import { PageGuard } from "@/components/PageGuard";

function HelpTicketsPage() {
  return (
    <PageGuard policy="help_tickets.view">
      <HelpTicketsContent />
    </PageGuard>
  );
}
```

## API Endpoints

### Page Management (Admin Only)

- `GET /api/pages` - Get all pages
- `GET /api/pages/active` - Get active pages (for navigation)
- `GET /api/pages/:id` - Get single page
- `POST /api/pages` - Create new page (auto-generates policies)
- `PUT /api/pages/:id` - Update page
- `DELETE /api/pages/:id` - Soft delete page

### Policy Management

- `GET /api/policies` - Get all policies
- Policies are managed through pages (auto-generated)

### Role Management

- `GET /api/roles` - Get all roles
- `POST /api/roles` - Create role
- `PUT /api/roles/:id` - Update role (assign policies)
- `DELETE /api/roles/:id` - Delete role

## Migration Guide

### Step 1: Run Database Migration

```bash
npx prisma migrate dev --name add_ui_pages
```

### Step 2: Sync Existing Pages

```bash
# Via API (admin only)
POST /api/pages/sync
```

Or programmatically:

```typescript
import { syncPagesFromNavConfig } from "../services/page-management.service";
await syncPagesFromNavConfig();
```

### Step 3: Update Frontend

Replace hardcoded navigation with dynamic pages:

```typescript
// OLD (hardcoded)
const navItems = [
  { path: "/help-tickets", label: "Help Tickets", policy: "help_tickets.view" },
];

// NEW (from database)
const { data: pages } = useActivePages();
const navItems = pages?.map(page => ({
  path: page.path,
  label: page.pageName,
  policy: `${page.policyPrefix}.view`,
}));
```

### Step 4: Update Backend Routes

Replace hardcoded policy checks:

```typescript
// OLD
app.get("/api/help-tickets", requireAuth, requirePolicy("help_tickets.view"), handler);

// NEW (same, but policy comes from DB)
app.get("/api/help-tickets", requireAuth, policyGuard("help_tickets.view"), handler);
```

## Benefits

1. **Zero Code Changes**: Add new pages entirely from Admin UI
2. **Consistency**: UI and backend always in sync
3. **Scalability**: Easy to add new features without touching code
4. **Maintainability**: Single source of truth (database)
5. **Flexibility**: Custom actions per page
6. **Audit Trail**: All policies tracked in database

## Security

- **SuperAdmin bypasses all checks**
- **Policies validated from database on every request**
- **JWT contains policy snapshot for performance**
- **Policy versioning forces re-login when policies change**
- **No hardcoded permissions anywhere**

## Example: Adding "Reports" Page

1. Admin creates page:
   - Key: `reports`
   - Name: `Reports`
   - Path: `/reports`
   - Prefix: `reports`

2. System auto-generates:
   - `reports.view`
   - `reports.create`
   - `reports.update`
   - `reports.delete`

3. Admin assigns `reports.view` to "Manager" role

4. All managers see "Reports" in navigation

5. Backend route:
   ```typescript
   app.get("/api/reports", requireAuth, policyGuard("reports.view"), handler);
   ```

6. **No code changes required!**

## Files Created

- `prisma/schema.prisma` - Added `UiPage` model
- `server/services/page-management.service.ts` - Page management logic
- `server/routes/pages.routes.ts` - Page management API
- `server/lib/policy-guard.ts` - Centralized policy middleware
- `client/src/pages/admin/pages.tsx` - Admin UI for page management
- `client/src/hooks/use-pages.ts` - Frontend hook for pages

## Next Steps

1. Run migration: `npx prisma migrate dev`
2. Create initial pages via Admin UI
3. Update navigation to use `useActivePages()` hook
4. Replace `requirePolicy` with `policyGuard` in routes
5. Test end-to-end flow
