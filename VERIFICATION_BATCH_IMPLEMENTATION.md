# Verification Batch Implementation - Deliverable

## Summary

Implemented generic RBAC-based Verification Audit with batch support for Team Attendance Check View.

---

## 1. Changed Files

### Database / Prisma
- `prisma/schema.prisma` - Added `AttendanceVerificationBatch` model, updated `AttendanceVerification` with `batchId`
- `prisma/migrations/20260211120000_add_verification_batch/migration.sql` - Migration (handles existing data via legacy batch)

### Backend
- `server/routes/attendance-verification.routes.ts` - Rewritten:
  - POST `/api/attendance/team-verification/batches` (policy: `attendance.team.verify`)
  - GET/POST `/api/attendance/team-verifications` - now supports `batchId`, POST requires batchId
  - GET `/api/attendance/team-verification/audit/batches` (policy: `attendance.team.verification.audit.view`)
  - GET `/api/attendance/team-verification/audit/batches/:batchId` (same policy)
- `server/constants/policies.ts` - Added new policy constants

### Shared
- `shared/policies.ts` - Added:
  - `attendance.team.verify`
  - `attendance.team.verification.audit.view`
  - `attendance.team.verification.audit.export`

### Frontend
- `client/src/pages/attendance/TeamAttendanceCheckView.tsx` - Batch flow: create batch on month load, include batchId in saves, disable verification when no batch
- `client/src/pages/attendance/team-verification-audit.tsx` - New: Audit list page (month selector, batch cards)
- `client/src/pages/attendance/team-verification-audit-batch.tsx` - New: Batch details page (filters, table)
- `client/src/App.tsx` - Routes for audit pages
- `client/src/components/MainLayout.tsx` - Added "Verification Audit" under My Team
- `client/src/config/nav.config.ts` - Nav entry for audit
- `client/src/lib/policy-groups.ts` - New policies in Attendance group
- `client/src/lib/page-permissions.ts` - Attendance manageKeys updated

---

## 2. Prisma Migration

Migration already applied. For fresh DB or production:

```bash
npx prisma migrate deploy
```

---

## 3. Seed Updates

No seed file changes required. New policies are in `shared/policies.ts` and will be created by **policy-sync** on server startup. Assign the following policies to roles as needed:

- `attendance.team.verify` - Create batch and save verifications
- `attendance.team.verification.audit.view` - View audit batches
- `attendance.team.verification.audit.export` - (Optional) Export audit data

---

## 4. Manual Test Steps

1. **Server restart** – Policy sync will create new policies in DB.

2. **Assign policies** – In Roles Management, add `attendance.team.verify` and `attendance.team.verification.audit.view` to the appropriate role (e.g. Manager/Director).

3. **Team Check View**
   - Go to My Team → Team Attendance → Check View.
   - Select a month – a batch should be created automatically.
   - Mark employees as Correct/Not Correct. For Not Correct, enter a reason in the popover.
   - Save – verify that data persists and Export works (if `attendance.team.export` is assigned).

4. **Verification Audit**
   - Go to My Team → Verification Audit.
   - Use Month filter or "All months".
   - Confirm batches appear as cards (Month, Created by, Counts).
   - Click **Open** on a batch – details page should load.
   - Use Filters (All / Correct / Not Correct) and confirm table updates.

5. **Backward compatibility**
   - Existing verification data was migrated to a legacy batch (`legacy_batch_20250101`).
   - Users without `attendance.team.verify` still see Check View in read-only (from/to fetch).
   - Users with `attendance.team.view` only cannot save; verification actions are disabled when batch creation fails.

---

## 5. Existing Functionality

- Team Check View: Works with batch flow. Verification actions are disabled until batch is created.
- Export: Still gated by `attendance.team.export`.
- Verification list: Shows verified employees with filters; unchanged behavior.
- Legacy data: Preserved in a migration batch; visible via Audit.
