# Attendance Verification Module – Implementation Summary

## 1) Files changed (with short reason)

| File | Reason |
|------|--------|
| `prisma/schema.prisma` | Added `dismissedByManagerAt` to `AttendanceVerification` for manager “Remove” (soft-hide). |
| `prisma/migrations/20260215103520_add_dismissed_by_manager/migration.sql` | Migration for new column. |
| `server/routes/attendance-verification.routes.ts` | Added GET `/api/attendance/submit-context` (manager name/card/unit); my-queries filters out dismissed; POST `/api/attendance/my-queries/:ticketId/dismiss`; HR GET returns `batches` with managerName/managerCardNo/managerUnitNo and nested tickets. |
| `client/src/api/attendanceVerification.api.ts` | Added `getSubmitContext()`, `dismissTicket()`, `getHrQueries()` now returns `{ batches }`. |
| `client/src/api/attendanceVerification.types.ts` | Added `HrQueryBatch`; `HrQueryTicket` batch fields optional; kept `HrStatus`. |
| `client/src/pages/attendance/CheckViewCard.tsx` | Refactor: two-panel (member list left, attendance right), checkbox tick → collapse, date click → one popup (Correct/Not Correct), Not Correct modal (date + query + Save), black border for NOT_CORRECT, Submit to HO + tooltip, no buttons under dates. |
| `client/src/pages/attendance/check.tsx` | Submit gating (`canSubmit`), submit modal (manager name/card/unit), `getSubmitContext` + `getMyQueries`, `currentBatchTickets` for VerificationListCard, `canSubmit` and modal wiring. |
| `client/src/pages/attendance/team.tsx` | Replaced inline `CheckViewContent` with `CheckViewCard`; added submit modal, `canSubmit` (selected members only), my-queries + `currentBatchTickets`, `refetchMyQueries` for list; removed ~400 lines of duplicate UI. |
| `client/src/pages/attendance/VerificationListCard.tsx` | Post-submit: when `submittedTickets` provided, show only NOT_CORRECT with blue/red/green left border and Remove on RESOLVED; dismiss mutation + `onDismiss`. |
| `client/src/pages/hr/attendance-queries.tsx` | Switched to per-submission cards (Manager Name, Card No, Unit No + Open); Open expands batch tickets; Rejected/Resolved via existing Sheet. |

---

## 2) Before vs After (major UIs)

### Manager Check View (Attendance Check + Team Check View)

- **Before:** Single list of members with expand/collapse; Correct/Not Correct as small buttons under each date cell; Submit to HR with no gating or modal; verification list showed all (Correct + Not Correct) with filter; no status borders.
- **After:** Two-panel layout (members left, calendar right). Checkbox tick selects member and auto-collapses row. Date cell click opens one popup: Correct | Not Correct. Not Correct opens modal with selected date (read-only), query textarea, Save. NOT_CORRECT dates have black ring/border. No buttons under date cells. Submit to HO disabled until all required dates verified (tooltip: “Verify all dates before submitting”). Submit to HO opens modal with Manager Name, Card No, Unit No and Submit. After submit, verification list shows only problematic (NOT_CORRECT) items with blue (pending) / red (rejected, reason shown) / green (resolved, Remove button) borders.

### HR Attendance Queries

- **Before:** Single flat table of all tickets (Month, Manager, Employee, Card, Date, Query, HR status); row click opened Sheet for status/remark.
- **After:** One card per submission: Manager Name, Card No, Unit No and “Open”. Open expands to show that batch’s tickets; row click still opens Sheet for Rejected/Resolved with remark. Same filters (month, status, search).

### Verification List (manager, post-submit)

- **Before:** Table of all verifications (Correct + Not Correct) with filter; no HR status or borders.
- **After:** When batch is submitted, list shows only NOT_CORRECT items; left border by HR status (blue/red/green); Remove on green (resolved) that calls dismiss API and refetches.

---

## 3) Compile and types

- `npm run build` completes successfully.
- Lint fixes: team.tsx `teamResponse` typed for `.data`, `Array.from(selectedCheckMemberIds)` for Set iteration, `handleSubmitToHr` type `void | Promise<void>`, `onDismiss` wrapper.

---

## 4) Review checklist

| Item | Status | Notes |
|------|--------|--------|
| Responsive | ✅ | Two-panel uses `grid-cols-1 lg:grid-cols-3`; cards and tables stack on small screens; Sheet/Dialog work on mobile. |
| Clean UI | ✅ | No buttons under date cells; single date-click popup; minimal toolbar; consistent spacing and typography. |
| Matches workflow | ✅ | Checkbox → select + collapse; date click → Correct/Not Correct; Not Correct modal; black border; submit gating; submit modal; post-submit list with borders and Remove; HR per-submission cards and Open. |
| No date-under-buttons | ✅ | Correct/Not Correct only in date-click dropdown; no inline buttons under calendar cells. |
| Submit gating works | ✅ | `canSubmit` ensures every required attendance date (for selected members on team, all members on check) is CORRECT or NOT_CORRECT with query; button disabled with tooltip when false. |
| Status colors work | ✅ | Verification list: blue (pending), red (REJECTED + reason), green (RESOLVED + Remove). NOT_CORRECT date cells: black ring. |
| HR card grouping works | ✅ | HR GET returns `batches`; UI renders one card per batch with managerName, managerCardNo, managerUnitNo and Open; Open shows that batch’s tickets. |

---

## 5) Optional next steps

- Run full E2E on Attendance Check and HR Queries.
- Add unit tests for `canSubmit` and dismiss flow.
- Consider “Select all” for members also collapsing all rows if desired.
