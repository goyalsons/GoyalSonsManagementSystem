# Goyalsons Management System (GMS)

A comprehensive management system for Goyalsons, featuring organizational hierarchy visibility, attendance tracking, employee management, and claims processing.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Routing**: wouter (Client-side routing)
- **State Management**: React Query + Context API

## Features

### Organization Hierarchy Visibility
The system implements role-based access control (RBAC) with organizational hierarchy scoping:

| Role | Access Level |
|------|-------------|
| CEO / SuperAdmin | Full access to all organization data |
| Management | Access to Management unit and all departments below |
| Department (HR, Finance, IT, etc.) | Access only to their department data |
| Employee | Limited access within their department |

### Key Features
- **Authentication**: Session-based login with role-based access
- **Dashboard**: Real-time stats based on user's org scope
- **Attendance**: Check-in/out with org-scoped visibility
- **Employees**: Employee directory filtered by access level
- **Tasks**: Task management with org-scoped assignment
- **Claims**: Claims processing with approval workflows

## Project Structure
```
/GoyalsonsManagementSystem
 ├── client/src/
 │   ├── pages/        → Application Pages
 │   ├── components/   → UI Components
 │   └── lib/          → Auth context, API utilities
 ├── server/
 │   ├── lib/          → Authorization helpers
 │   └── routes.ts     → API routes
 ├── prisma/
 │   ├── schema.prisma → Database schema
 │   └── seed.ts       → Seed data script
 └── shared/           → Shared types
```

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database
```bash
npx prisma generate
npx prisma migrate dev
npm run seed
```

### 3. Run Development Server
```bash
npm run dev
```

## Test Users

This repo does not ship with hardcoded company emails. In development, users are typically seeded from environment configuration (for example `ALLOWED_GOOGLE_EMAILS`) and/or created via OTP/employee flows.

## API Endpoints

All protected endpoints require Bearer token authentication and enforce org-scope filtering:

- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user info
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/employees` - List employees (org-scoped)
- `GET /api/attendance` - List attendance records (org-scoped)
- `GET /api/tasks` - List tasks (org-scoped)
- `GET /api/claims` - List claims (org-scoped)
- `GET /api/users` - List users (org-scoped)

## Authorization Model

The system uses a three-tier authorization model:

1. **Authentication**: Session-based with Bearer tokens
2. **Policy Check**: Users must have the required policy (e.g., `attendance.history.view`)
3. **Org Scope**: Data is filtered to user's accessible org units (subtree)

```
CEO Office
└── Management
    ├── Human Resources (HR)
    ├── Finance
    ├── Information Technology (IT)
    ├── Marketing
    └── Operations
```

Users can only access data within their org unit and all child units.
