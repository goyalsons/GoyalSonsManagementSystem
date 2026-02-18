# Attendance Verification Workflow Rebuild

## Summary

Rebuilt attendance verification UI from scratch: removed old verification/check/audit pages and replaced with a new module with three routes and policy-based gating.

---

## 1. Files Removed

| File | Reason |
|------|--------|
| `client/src/pages/attendance/TeamAttendanceCheckView.tsx` | Replaced by `/attendance/check` |
| `client/src/pages/attendance/team-verification-audit.tsx` | Replaced by new flows |
| `client/src/pages/attendance/team-verification-audit-batch.tsx` | Replaced by new flows |

---

## 2. Files Added

| File | Purpose |
|------|---------|
| `client/src/api/attendanceVerification.types.ts` | Shared types for batches, verifications, tickets, HR status |
| `client/src/api/attendanceVerification.api.ts` | API client: create/load batch, submit, verifications, my-queries, HR queries, resolve |
| `client/src/pages/attendance/check.tsx` | Store Manager verification: month selector, employee list + grid, Correct/Not Correct, autosave, Submit to HR |
| `client/src/pages/attendance/my-queries.tsx` | Manager inbox: batch cards, tickets table, Accept / Re-raise |
| `client/src/pages/hr/attendance-queries.tsx` | HR dashboard: filters, tickets table, drawer with status + remark |
| `prisma/migrations/20260211140000_verification_submit_hr/migration.sql` | `submittedAt` on batch; `hrStatus`, `hrRemark`, `reraiseRemark` on verification |

---

## 3. Files Changed

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | `AttendanceVerificationBatch.submittedAt`; `AttendanceVerification.hrStatus`, `hrRemark`, `reraiseRemark` |
| `shared/policies.ts` | Added `attendance.team.queries.view`, `attendance.hr.view`, `attendance.hr.resolve` |
| `server/constants/policies.ts` | Added same policy constants |
| `server/routes/attendance-verification.routes.ts` | Added: POST/GET `verification-batches`, POST submit, GET my-queries, GET/PATCH hr/queries, POST accept/reraise |
| `client/src/config/nav.config.ts` | Added nav entries for `/attendance/check`, `/attendance/my-queries`, `/hr/attendance-queries` |
| `client/src/App.tsx` | Removed audit routes; added routes for check, my-queries, hr/attendance-queries with PageGuard |
| `client/src/components/MainLayout.tsx` | My Team submenu: Attendance Check, My Queries; standalone HR Attendance Queries link |
| `client/src/pages/attendance/team.tsx` | Removed Check View tab and `TeamAttendanceCheckView`; single-member view only |
| `client/src/lib/policy-groups.ts` | Attendance group: My Queries, HR View, HR Resolve |
| `client/src/lib/page-permissions.ts` | Attendance manageKeys: added queries.view, hr.view, hr.resolve |

---

## 4. New Routes & Policies

| Route | Policy | Description |
|-------|--------|-------------|
| `/attendance/check` | `attendance.team.verify` | Store Manager verification: month → batch, employee list + grid, Correct/Not Correct, autosave, Submit to HR |
| `/attendance/my-queries` | `attendance.team.queries.view` | Manager inbox: batch cards, tickets with HR status/remark, Accept, Re-raise (modal with remark) |
| `/hr/attendance-queries` | `attendance.hr.view` | HR tickets dashboard; resolve actions require `attendance.hr.resolve` |

---

## 5. Backend API (used by new UI)

- **POST** `/api/attendance/verification-batches` – create batch (body: `monthStart`, optional `notes`)
- **GET** `/api/attendance/verification-batches?monthStart=YYYY-MM-DD` – get batch for current user + month
- **POST** `/api/attendance/verification-batches/:id/submit` – submit batch (locks editing)
- **GET** `/api/attendance/team-verifications?batchId=...` or `?from=&to=` – verifications map
- **POST** `/api/attendance/team-verifications` – save updates (body: `batchId`, `updates[]`)
- **GET** `/api/attendance/my-queries` – manager’s submitted batches with NOT_CORRECT tickets
- **POST** `/api/attendance/my-queries/:ticketId/accept` – manager accept
- **POST** `/api/attendance/my-queries/:ticketId/reraise` – manager re-raise (body: `remark`)
- **GET** `/api/attendance/hr/queries?month=&branch=&status=&search=` – HR ticket list (filters)
- **PATCH** `/api/attendance/hr/queries/:id` – HR resolve (body: `hrStatus`, `hrRemark`)

---

## 6. Manual Test Steps

### 6.1 Policies

1. Restart server so policy-sync creates `attendance.team.queries.view`, `attendance.hr.view`, `attendance.hr.resolve`.
2. In **Roles Management**, assign:
   - Store Manager role: `attendance.team.verify`, `attendance.team.queries.view`
   - HR role: `attendance.hr.view`, `attendance.hr.resolve`

### 6.2 Attendance Check (`/attendance/check`)

1. Log in as a user with `attendance.team.verify`.
2. Go to **My Team → Attendance Check** (or `/attendance/check`).
3. Select a month; batch should create/load (loading state then grid).
4. Confirm employee list on the left and day columns on the right with attendance status (P/A/HD etc.).
5. For a cell: click **?** or **Correct** → mark Correct; click **?** and open popover → enter reason → Confirm → mark Not Correct.
6. Confirm autosave: change a cell, wait ~500ms, check network for POST `team-verifications`; on error a toast and inline error should appear.
7. Click **Submit to HR**; confirm success toast and that grid becomes read-only (no Correct/Not Correct buttons).

### 6.3 My Queries (`/attendance/my-queries`)

1. Log in as the same manager who submitted a batch.
2. Go to **My Team → My Queries** (or `/attendance/my-queries`).
3. Confirm batch cards with month and submitted date, and a table of tickets (employee, date, your query, HR status, HR remark).
4. Click **Accept** on a ticket → success; **Re-raise** → modal opens, enter remark, submit → success and list refreshes.

### 6.4 HR Attendance Queries (`/hr/attendance-queries`)

1. Log in as a user with `attendance.hr.view` (and `attendance.hr.resolve` for saving).
2. Go to **HR Attendance Queries** in nav (or `/hr/attendance-queries`).
3. Use filters: Month, Status, Search (name/card); confirm table updates.
4. Click a row → drawer opens with manager query, re-raise remark (if any), Status dropdown, Remark textarea.
5. Set status to NEED_INFO or RESOLVED or REJECTED → Remark required; enter remark and **Save** → success and drawer closes.
6. Confirm IN_PROGRESS can be set without remark; RESOLVED/REJECTED/NEED_INFO require remark.

### 6.5 Navigation & Guards

1. Without `attendance.team.verify`: **Attendance Check** should not be visible (or redirect/403 per your nav logic).
2. Without `attendance.team.queries.view`: **My Queries** not accessible.
3. Without `attendance.hr.view`: **HR Attendance Queries** not accessible.
4. With only `attendance.hr.view` (no `attendance.hr.resolve`): HR page loads but resolve/save in drawer should be disabled or guarded (if you add that check in UI).

---

## 7. Optional Follow-ups

- **Branch filter** on HR page: backend supports `branch` (orgUnitId); wire a branch dropdown if org units are available.
- **Assigned filter**: not in backend yet; add if you introduce assignment of tickets to HR users.
- **Attendance snapshot in HR drawer**: optionally call `/attendance/history/:cardNo?month=...` for the ticket’s employee/date and show a short summary in the drawer.
