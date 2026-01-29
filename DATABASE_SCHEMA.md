# Goyalsons Management System - Database Schema Documentation

A comprehensive reference of all PostgreSQL database tables, columns, relationships, and data types.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Core Tables](#3-core-tables)
   - [User](#user)
   - [Role](#role)
   - [Policy](#policy)
   - [Session](#session)
   - [UserRole](#userrole)
   - [RolePolicy](#rolepolicy)
   - [UserSettings](#usersettings)
4. [Organization Tables](#4-organization-tables)
   - [OrgUnit](#orgunit)
   - [Department](#department)
   - [Designation](#designation)
   - [TimePolicy](#timepolicy)
5. [Employee Tables](#5-employee-tables)
   - [Employee](#employee)
   - [EmployeeTarget](#employeetarget)
6. [Attendance Tables](#6-attendance-tables)
   - [Attendance](#attendance)
7. [Task & Claims Tables](#7-task--claims-tables)
   - [Task](#task)
   - [Claim](#claim)
   - [ClaimAttachment](#claimattachment)
8. [Communication Tables](#8-communication-tables)
   - [Announcement](#announcement)
   - [_AnnouncementRecipients](#_announcementrecipients)
9. [System Tables](#9-system-tables)
   - [ApiRouting](#apirouting)
   - [DataImportLog](#dataimportlog)
   - [SystemSettings](#systemsettings)
   - [OtpCode](#otpcode)
   - [SmsLog](#smslog)
   - [AuditLog](#auditlog)
10. [Foreign Key Relationships](#10-foreign-key-relationships)
11. [Indexes](#11-indexes)

---

## 1. Overview

The Goyalsons Management System database is built on PostgreSQL and uses Prisma ORM for schema management. The database supports:

- **Role-Based Access Control (RBAC)** - Users, Roles, and Policies
- **Organizational Hierarchy** - OrgUnits with parent-child relationships
- **Employee Management** - Complete employee records with departments and designations
- **Attendance Tracking** - Check-in/check-out with geolocation
- **Task Management** - Task assignment and tracking
- **Claims Processing** - Expense claims with attachments
- **Audit Logging** - Complete audit trail of all actions

### Database Statistics

| Metric | Value |
|--------|-------|
| Total Tables | 23 |
| Total Columns | ~180 |
| Foreign Key Relationships | 23 |

---

## 2. Entity Relationship Diagram

```
                                    ┌─────────────┐
                                    │   Policy    │
                                    └──────┬──────┘
                                           │
                                           │ many-to-many
                                           ▼
┌─────────────┐    many-to-many    ┌─────────────┐
│    User     │◄──────────────────►│    Role     │
└──────┬──────┘    (UserRole)      └─────────────┘
       │                                  │
       │ one-to-one                       │ (RolePolicy)
       ▼                                  │
┌─────────────┐                           │
│UserSettings │                           │
└─────────────┘                           │
       │                                  │
       │ one-to-many                      │
       ▼                                  │
┌─────────────┐    one-to-many    ┌─────────────┐
│   Session   │                   │  Employee   │◄────────────┐
└─────────────┘                   └──────┬──────┘             │
                                         │                    │
              ┌──────────────────────────┼────────────────────┤
              │                          │                    │
              ▼                          ▼                    ▼
       ┌─────────────┐           ┌─────────────┐      ┌─────────────┐
       │   OrgUnit   │           │ Department  │      │ Designation │
       └─────────────┘           └─────────────┘      └─────────────┘
              │
              │ self-referencing (parent-child)
              ▼
       ┌─────────────┐
       │   OrgUnit   │
       └─────────────┘

┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Attendance │    │    Task     │    │   Claim     │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ belongs to       │ assigned to      │ belongs to
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Employee   │    │  Employee   │    │  Employee   │
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## 3. Core Tables

### User

The main user account table for system authentication and authorization.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key (UUID) |
| `name` | text | NO | - | Full name of the user |
| `email` | text | NO | - | Email address (unique, used for login) |
| `phone` | text | YES | - | Phone number |
| `passwordHash` | text | NO | - | SHA-256 hashed password |
| `status` | text | NO | 'active' | Account status: active, inactive, suspended |
| `isSuperAdmin` | boolean | NO | false | Super admin bypasses all authorization |
| `orgUnitId` | text | YES | - | FK to OrgUnit (user's organizational unit) |
| `employeeId` | text | YES | - | FK to Employee (linked employee record) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

**Relationships:**
- Has many `Session` records
- Has many `UserRole` records (many-to-many with Role)
- Has one `UserSettings` record
- Belongs to `OrgUnit` (optional)
- Belongs to `Employee` (optional)

---

### Role

Defines user roles with hierarchical levels.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `name` | text | NO | - | Role name (CEO, Manager, Employee, etc.) |
| `description` | text | YES | - | Role description |
| `level` | integer | NO | 0 | Hierarchy level (higher = more authority) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |

**Relationships:**
- Has many `UserRole` records
- Has many `RolePolicy` records (many-to-many with Policy)

---

### Policy

Permission policies that can be assigned to roles.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `key` | text | NO | - | Policy key (e.g., dashboard.view, employees.view) |
| `description` | text | YES | - | Policy description |
| `category` | text | YES | - | Category for grouping (users, tasks, etc.) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |

**Common Policy Keys (locked allowlist):**
- `dashboard.view`
- `roles-assigned.view`, `employees.view`
- `attendance.history.view`
- `sales.view`, `sales-staff.view`
- `admin.panel`, `admin.routing.view`, `admin.master-settings.view`
- `integrations.fetched-data.view`
- `trainings.view`
- `requests.view`, `salary.view`, `settings.view`
- `assigned-manager.view`
- `help_tickets.view`, `help_tickets.create`, `help_tickets.update`, `help_tickets.assign`, `help_tickets.close`
- `no_policy.view`

---

### Session

User authentication sessions with token-based access.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key (also serves as session token) |
| `userId` | text | NO | - | FK to User |
| `expiresAt` | timestamp | NO | - | Session expiration time |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Session creation time |

**Notes:**
- Default session duration is 7 days
- Token is sent in Authorization header as Bearer token

---

### UserRole

Junction table for User-Role many-to-many relationship.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `userId` | text | NO | - | FK to User (composite PK) |
| `roleId` | text | NO | - | FK to Role (composite PK) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Assignment time |

---

### RolePolicy

Junction table for Role-Policy many-to-many relationship.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `roleId` | text | NO | - | FK to Role (composite PK) |
| `policyId` | text | NO | - | FK to Policy (composite PK) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Assignment time |

---

### UserSettings

Per-user preferences and settings.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `userId` | text | NO | - | FK to User (unique) |
| `theme` | text | NO | 'light' | UI theme: light, dark |
| `emailNotifications` | boolean | NO | true | Email notification preference |
| `smsNotifications` | boolean | NO | false | SMS notification preference |
| `loginMethod` | text | NO | 'password' | Preferred login: password, otp |
| `timezone` | text | NO | 'Asia/Kolkata' | User timezone |
| `language` | text | NO | 'en' | UI language preference |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

---

## 4. Organization Tables

### OrgUnit

Organizational units with hierarchical structure (branches, divisions).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `name` | text | NO | - | Unit name (e.g., UNIT-1, GSHO) |
| `code` | text | NO | - | Unique unit code |
| `description` | text | YES | - | Unit description |
| `type` | text | NO | 'functional' | Unit type: functional, branch |
| `level` | integer | NO | 0 | Hierarchy level |
| `path` | text | YES | - | Materialized path for tree traversal |
| `parentId` | text | YES | - | FK to OrgUnit (self-referencing) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

**Notes:**
- Self-referencing for parent-child hierarchy
- Used for access control scoping (users can only see data in their subtree)

---

### Department

Functional departments within the organization.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `code` | text | NO | - | Department code (unique) |
| `name` | text | NO | - | Department name (HR, IT, Finance, etc.) |
| `description` | text | YES | - | Department description |
| `isActive` | boolean | NO | true | Active status |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

---

### Designation

Job titles and positions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `code` | text | NO | - | Designation code (unique) |
| `name` | text | NO | - | Designation name (Manager, Executive, etc.) |
| `description` | text | YES | - | Designation description |
| `isActive` | boolean | NO | true | Active status |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

---

### TimePolicy

Work schedule and time policies.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `code` | text | NO | - | Policy code (unique) |
| `name` | text | NO | - | Policy name |
| `isSinglePunch` | boolean | NO | false | Whether single punch is allowed |
| `scheduleJson` | jsonb | YES | - | Schedule configuration as JSON |
| `isActive` | boolean | NO | true | Active status |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

---

## 5. Employee Tables

### Employee

Core employee records with personal and organizational information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `firstName` | text | NO | - | First name |
| `lastName` | text | YES | - | Last name |
| `employeeCode` | text | YES | - | Employee code |
| `cardNumber` | text | YES | - | Attendance card number (unique identifier) |
| `phone` | text | YES | - | Primary phone number |
| `secondaryPhone` | text | YES | - | Secondary phone number |
| `personalEmail` | text | YES | - | Personal email address |
| `companyEmail` | text | YES | - | Company email address |
| `gender` | text | YES | - | Gender |
| `aadhaar` | text | YES | - | Aadhaar card number |
| `profileImageUrl` | text | YES | - | Profile image URL |
| `joiningDate` | timestamp | YES | - | Date of joining |
| `interviewDate` | timestamp | YES | - | Interview/exit date |
| `status` | text | NO | 'ACTIVE' | Employee status: ACTIVE, INACTIVE |
| `shiftStart` | text | YES | - | Shift start time |
| `shiftEnd` | text | YES | - | Shift end time |
| `weeklyOff` | text | YES | - | Weekly off day(s) |
| `orgUnitId` | text | YES | - | FK to OrgUnit |
| `departmentId` | text | YES | - | FK to Department |
| `designationId` | text | YES | - | FK to Designation |
| `timePolicyId` | text | YES | - | FK to TimePolicy |
| `zohoId` | text | YES | - | Zoho Creator record ID |
| `externalId` | text | YES | - | External system ID |
| `autoNumber` | text | YES | - | Auto-generated number |
| `metadata` | jsonb | YES | - | Additional metadata as JSON |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

**Relationships:**
- Belongs to `OrgUnit`
- Belongs to `Department`
- Belongs to `Designation`
- Belongs to `TimePolicy`
- Has many `Attendance` records
- Has many `Task` records (as assignee)
- Has many `Claim` records
- Has many `EmployeeTarget` records

---

### EmployeeTarget

Performance targets assigned to employees.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `employeeId` | text | NO | - | FK to Employee |
| `periodStart` | timestamp | NO | - | Target period start date |
| `periodEnd` | timestamp | NO | - | Target period end date |
| `metric` | text | NO | - | Target metric name |
| `value` | double precision | NO | - | Target value |
| `achieved` | double precision | NO | 0 | Achieved value |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |

---

## 6. Attendance Tables

### Attendance

Employee attendance records with geolocation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `employeeId` | text | NO | - | FK to Employee |
| `date` | timestamp | NO | - | Attendance date |
| `checkInAt` | timestamp | YES | - | Check-in timestamp |
| `checkOutAt` | timestamp | YES | - | Check-out timestamp |
| `status` | text | NO | - | Status: present, absent, half-day, leave |
| `lat` | double precision | YES | - | Latitude of check-in location |
| `lng` | double precision | YES | - | Longitude of check-in location |
| `geoAccuracy` | integer | YES | - | GPS accuracy in meters |
| `meta` | jsonb | YES | - | Additional metadata |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |

**Notes:**
- Historical attendance data is stored in BigQuery (ATTENDENCE_SUMMARY table)
- This table stores real-time attendance from the mobile app

---

## 7. Task & Claims Tables

### Task

Task management for assignments and tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `title` | text | NO | - | Task title |
| `description` | text | YES | - | Task description |
| `assigneeId` | text | YES | - | FK to Employee (assigned to) |
| `creatorId` | text | YES | - | FK to User (created by) |
| `status` | text | NO | 'open' | Status: open, in_progress, completed, cancelled |
| `priority` | text | YES | - | Priority: low, medium, high, urgent |
| `dueDate` | timestamp | YES | - | Task due date |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

---

### Claim

Expense claim submissions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `employeeId` | text | NO | - | FK to Employee |
| `amount` | double precision | NO | - | Claim amount |
| `currency` | text | NO | 'INR' | Currency code |
| `category` | text | NO | - | Claim category (travel, food, etc.) |
| `status` | text | NO | 'pending' | Status: pending, approved, rejected |
| `submittedAt` | timestamp | NO | CURRENT_TIMESTAMP | Submission timestamp |

---

### ClaimAttachment

File attachments for claims.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `claimId` | text | NO | - | FK to Claim |
| `url` | text | NO | - | File URL |
| `name` | text | YES | - | Original filename |

---

## 8. Communication Tables

### Announcement

Company-wide announcements and notifications.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `title` | text | NO | - | Announcement title |
| `body` | text | NO | - | Announcement content |
| `scope` | text | NO | - | Visibility scope: all, department, branch |
| `createdById` | text | YES | - | FK to User (author) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Creation timestamp |

---

### _AnnouncementRecipients

Junction table for announcement-employee targeting.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `A` | text | NO | - | FK to Announcement |
| `B` | text | NO | - | FK to Employee |

---

## 9. System Tables

### ApiRouting

External API data source configuration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `name` | text | NO | - | Data source name |
| `description` | text | YES | - | Description |
| `endpoint` | text | YES | - | API endpoint URL |
| `method` | text | NO | 'GET' | HTTP method |
| `sourceType` | text | NO | 'api' | Source type: api, csv, excel |
| `csvFilePath` | text | YES | - | Path to uploaded CSV file |
| `csvUrl` | text | YES | - | URL to CSV file |
| `headers` | jsonb | YES | - | HTTP headers as JSON |
| `isActive` | boolean | NO | true | Active status |
| `status` | text | NO | 'draft' | Status: draft, active, error |
| `syncEnabled` | boolean | NO | false | Auto-sync enabled |
| `syncIntervalHours` | integer | NO | 0 | Sync interval (hours) |
| `syncIntervalMinutes` | integer | NO | 10 | Sync interval (minutes) |
| `syncSchedule` | text | YES | - | Cron expression |
| `lastSyncAt` | timestamp | YES | - | Last sync timestamp |
| `lastSyncStatus` | text | YES | - | Last sync status |
| `lastTestAt` | timestamp | YES | - | Last test timestamp |
| `lastTestStatus` | text | YES | - | Last test status |
| `syncProgressCurrent` | integer | NO | 0 | Current sync progress |
| `syncProgressTotal` | integer | NO | 0 | Total records to sync |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

---

### DataImportLog

Log of data import operations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `sourceName` | text | NO | - | Data source name |
| `sourceUrl` | text | YES | - | Source URL |
| `status` | text | NO | 'pending' | Status: pending, running, completed, failed |
| `recordsTotal` | integer | NO | 0 | Total records to import |
| `recordsImported` | integer | NO | 0 | Successfully imported records |
| `recordsFailed` | integer | NO | 0 | Failed records |
| `errorMessage` | text | YES | - | Error message if failed |
| `startedAt` | timestamp | NO | CURRENT_TIMESTAMP | Import start time |
| `completedAt` | timestamp | YES | - | Import completion time |
| `metadata` | jsonb | YES | - | Additional metadata |

---

### SystemSettings

Global system configuration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `key` | text | NO | - | Setting key (unique) |
| `value` | text | NO | - | Setting value |
| `description` | text | YES | - | Setting description |
| `category` | text | NO | 'general' | Setting category |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

**Common Settings:**
- `EMPLOYEE_MASTER_URL` - External API URL for employee data sync

---

### OtpCode

One-time password codes for authentication.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `phone` | text | YES | - | Phone number for OTP |
| `email` | text | YES | - | Email for OTP |
| `code` | text | NO | - | OTP code (6 digits) |
| `type` | text | NO | 'login' | OTP type: login, reset |
| `used` | boolean | NO | false | Whether code has been used |
| `expiresAt` | timestamp | NO | - | Expiration time (5 minutes) |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Creation time |

---

### SmsLog

SMS delivery tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `recipientPhone` | text | NO | - | Recipient phone number |
| `messageType` | text | NO | 'OTP' | Message type: OTP, notification |
| `messageText` | text | YES | - | Message content |
| `status` | text | NO | 'pending' | Status: pending, sent, delivered, failed |
| `apiResponse` | jsonb | YES | - | API response from SMS provider |
| `apiMessageId` | text | YES | - | Message ID from provider |
| `customerRef` | text | YES | - | Customer reference number |
| `sentAt` | timestamp | YES | - | Send timestamp |
| `deliveredAt` | timestamp | YES | - | Delivery timestamp |
| `failedAt` | timestamp | YES | - | Failure timestamp |
| `errorMessage` | text | YES | - | Error message if failed |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Record creation time |
| `updatedAt` | timestamp | NO | - | Last update time |

---

### AuditLog

System audit trail for all actions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key |
| `userId` | text | YES | - | FK to User (who performed action) |
| `action` | text | NO | - | Action type: create, update, delete, login |
| `entity` | text | NO | - | Entity type: user, employee, task, etc. |
| `entityId` | text | YES | - | Affected entity ID |
| `meta` | jsonb | YES | - | Additional details as JSON |
| `createdAt` | timestamp | NO | CURRENT_TIMESTAMP | Action timestamp |

---

## 10. Foreign Key Relationships

| Table | Column | References | Description |
|-------|--------|------------|-------------|
| `Announcement` | createdById | User.id | Announcement author |
| `Attendance` | employeeId | Employee.id | Employee attendance |
| `AuditLog` | userId | User.id | User who performed action |
| `Claim` | employeeId | Employee.id | Claim submitter |
| `ClaimAttachment` | claimId | Claim.id | Claim attachment belongs to |
| `Employee` | orgUnitId | OrgUnit.id | Employee's branch/unit |
| `Employee` | departmentId | Department.id | Employee's department |
| `Employee` | designationId | Designation.id | Employee's designation |
| `Employee` | timePolicyId | TimePolicy.id | Employee's time policy |
| `EmployeeTarget` | employeeId | Employee.id | Target assigned to |
| `OrgUnit` | parentId | OrgUnit.id | Parent organizational unit |
| `RolePolicy` | roleId | Role.id | Role in policy assignment |
| `RolePolicy` | policyId | Policy.id | Policy in role assignment |
| `Session` | userId | User.id | Session owner |
| `Task` | assigneeId | Employee.id | Task assigned to |
| `Task` | creatorId | User.id | Task created by |
| `User` | orgUnitId | OrgUnit.id | User's organizational unit |
| `User` | employeeId | Employee.id | Linked employee record |
| `UserRole` | userId | User.id | User in role assignment |
| `UserRole` | roleId | Role.id | Role assigned to user |
| `UserSettings` | userId | User.id | Settings owner |
| `_AnnouncementRecipients` | A | Announcement.id | Announcement in targeting |
| `_AnnouncementRecipients` | B | Employee.id | Employee recipient |

---

## 11. Indexes

The following indexes are created for query optimization:

### Employee Table Indexes
- `Employee_orgUnitId_idx` - For filtering by organizational unit
- `Employee_departmentId_idx` - For filtering by department
- `Employee_designationId_idx` - For filtering by designation
- `Employee_status_idx` - For filtering active/inactive employees
- `Employee_firstName_idx` - For name search

### Other Important Indexes
- `User_email_key` - Unique index on email
- `Policy_key_key` - Unique index on policy key
- `Department_code_key` - Unique index on department code
- `Designation_code_key` - Unique index on designation code
- `TimePolicy_code_key` - Unique index on time policy code
- `OrgUnit_code_key` - Unique index on org unit code

---

## Quick Reference

### Common Queries

**Get all active employees with their department:**
```sql
SELECT e.*, d.name as department_name 
FROM "Employee" e
LEFT JOIN "Department" d ON e."departmentId" = d.id
WHERE e.status = 'ACTIVE';
```

**Get user with roles and policies:**
```sql
SELECT u.*, r.name as role_name, p.key as policy_key
FROM "User" u
JOIN "UserRole" ur ON u.id = ur."userId"
JOIN "Role" r ON ur."roleId" = r.id
JOIN "RolePolicy" rp ON r.id = rp."roleId"
JOIN "Policy" p ON rp."policyId" = p.id
WHERE u.id = 'user-id';
```

**Get organizational hierarchy:**
```sql
WITH RECURSIVE org_tree AS (
  SELECT id, name, "parentId", 0 as level
  FROM "OrgUnit"
  WHERE "parentId" IS NULL
  UNION ALL
  SELECT o.id, o.name, o."parentId", t.level + 1
  FROM "OrgUnit" o
  JOIN org_tree t ON o."parentId" = t.id
)
SELECT * FROM org_tree ORDER BY level, name;
```

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Generated from:** PostgreSQL Database Schema
