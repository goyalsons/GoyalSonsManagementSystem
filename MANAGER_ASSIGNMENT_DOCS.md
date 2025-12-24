# Manager Assignment System Documentation

## Overview

The Manager Assignment system allows administrators to assign employees as managers for specific organizational units and departments. This system is **separate** from the Role-Based Access Control (RBAC) system, maintaining a clear separation of concerns.

## Architecture: Role vs Manager Assignment

### Role & Permission System (RBAC)
- **Purpose**: Controls **what users can do** in the system (permissions)
- **Storage**: `UserRole` and `RolePolicy` tables
- **Scope**: System-wide permissions (e.g., "view employees", "create tasks", "approve claims")
- **Examples**: Admin, HR, Manager, Employee roles
- **UI Location**: `/roles` - Role cards and permission management

### Manager Assignment System
- **Purpose**: Defines **organizational hierarchy** and **who manages whom**
- **Storage**: `emp_manager` table
- **Scope**: Department/Unit-specific management relationships
- **Examples**: "John manages IT department in Mumbai branch"
- **UI Location**: `/roles/manager/assign` - Manager assignment page

## Key Differences

| Aspect | Role System | Manager Assignment |
|--------|-------------|-------------------|
| **What it controls** | Permissions (what you can do) | Hierarchy (who reports to whom) |
| **Granularity** | System-wide | Department/Unit-specific |
| **Database** | `UserRole`, `RolePolicy` | `emp_manager` |
| **Use Case** | "Can this user approve claims?" | "Who manages the Sales team in Delhi?" |
| **Independence** | Can have Manager role without managing anyone | Can manage departments without Manager role |

## Database Schema

### `emp_manager` Table

```sql
CREATE TABLE emp_manager (
    mid TEXT PRIMARY KEY,                    -- Unique assignment ID
    mcardno TEXT NOT NULL,                   -- Manager's card number (FK to Employee.cardNumber)
    morgUnitId TEXT,                         -- Organizational Unit ID (FK to OrgUnit.id)
    mdepartmentId TEXT,                      -- Department ID (FK to Department.id)
    mdesignationId TEXT,                     -- Designation ID (FK to Designation.id)
    mis_extinct BOOLEAN DEFAULT false        -- Soft delete flag
);
```

**Key Points:**
- One manager can have multiple assignments (one per department)
- Each assignment is independent
- `mis_extinct = false` means active assignment
- Card number is the primary identifier (not employee ID)

## API Endpoints

### GET `/api/employees/by-card/:cardNumber`
Fetches employee details by card number.

**Authentication**: Required (MDO users only)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "firstName": "John",
    "lastName": "Doe",
    "cardNumber": "1001",
    "designation": { "id": "...", "name": "Manager", "code": "MGR" },
    "orgUnit": { "id": "...", "name": "Mumbai Branch", "code": "MUM" },
    "department": { "id": "...", "name": "IT", "code": "IT" },
    "status": "ACTIVE"
  }
}
```

**Validation:**
- Card number must be provided
- Employee must exist
- Employee must be ACTIVE

### POST `/api/manager/assign`
Assigns a manager to one or more departments in a unit.

**Authentication**: Required (MDO users only)

**Request Body:**
```json
{
  "cardNumber": "1001",
  "orgUnitId": "uuid",
  "departmentIds": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Manager assigned successfully to 2 department(s)",
  "data": {
    "managerCardNumber": "1001",
    "managerName": "John Doe",
    "orgUnit": "Mumbai Branch",
    "departments": ["IT", "Sales"],
    "assignmentIds": ["assignment-id-1", "assignment-id-2"]
  }
}
```

**Validation Rules:**
1. Card number is required and must match an active employee
2. Unit ID must be valid
3. At least one department must be selected
4. All department IDs must be valid
5. Prevents duplicate active assignments (same manager + unit + department)

**Error Responses:**
- `400`: Missing required fields or invalid data
- `404`: Employee not found
- `409`: Duplicate assignment exists
- `500`: Server error

## Business Logic

### Assignment Rules
1. **One manager can manage multiple departments** in the same or different units
2. **One manager can manage multiple units** (separate assignments)
3. **Duplicate prevention**: Same manager + unit + department combination cannot be assigned twice (active)
4. **Employee status**: Only ACTIVE employees can be assigned as managers

### Validation Flow
```
1. Validate card number → Find employee
2. Check employee status → Must be ACTIVE
3. Validate unit → Must exist
4. Validate departments → All must exist
5. Check for duplicates → No active assignment for same combination
6. Create assignments → One record per department
```

## Frontend Implementation

### Page: `/roles/manager/assign`

**Components:**
1. **Card Number Input**: Required field, auto-searches on blur/Enter
2. **Employee Preview**: Read-only display showing:
   - Name
   - Card Number
   - Designation
   - Current Unit (if any)
3. **Unit Selection**: Single-select dropdown (required)
4. **Department Selection**: Multi-select checkboxes (at least one required)
5. **Assign Button**: Submits the assignment

**State Management:**
- Uses React Query for data fetching
- Separate state for form inputs and search
- Auto-reset on successful assignment

**User Flow:**
```
1. Enter card number → Auto-search on blur
2. View employee preview → Verify correct employee
3. Select unit → Loads departments for that unit
4. Select departments → Multi-select checkboxes
5. Click "Assign Manager" → Creates assignments
6. Success toast → Form resets
```

## Error Handling

### Frontend
- Toast notifications for success/error
- Inline error messages for validation
- Loading states during API calls
- Disabled states for invalid inputs

### Backend
- Comprehensive validation at each step
- Clear error messages
- Proper HTTP status codes
- Database constraint handling

## Security Considerations

1. **Authentication**: All endpoints require authentication
2. **Authorization**: Only MDO (Management/Admin) users can assign managers
3. **Input Validation**: Card numbers, IDs validated before processing
4. **SQL Injection**: Uses Prisma parameterized queries
5. **Duplicate Prevention**: Database-level and application-level checks

## Usage Examples

### Example 1: Assign Manager to Single Department
```json
POST /api/manager/assign
{
  "cardNumber": "1001",
  "orgUnitId": "mumbai-branch-id",
  "departmentIds": ["it-dept-id"]
}
```

### Example 2: Assign Manager to Multiple Departments
```json
POST /api/manager/assign
{
  "cardNumber": "1001",
  "orgUnitId": "mumbai-branch-id",
  "departmentIds": ["it-dept-id", "sales-dept-id", "hr-dept-id"]
}
```

### Example 3: Same Manager, Different Units
```json
// Assignment 1: Mumbai IT
POST /api/manager/assign
{
  "cardNumber": "1001",
  "orgUnitId": "mumbai-branch-id",
  "departmentIds": ["it-dept-id"]
}

// Assignment 2: Delhi IT (separate assignment)
POST /api/manager/assign
{
  "cardNumber": "1001",
  "orgUnitId": "delhi-branch-id",
  "departmentIds": ["it-dept-id"]
}
```

## Why Keep Roles and Manager Assignment Separate?

1. **Flexibility**: An employee can have Manager role but not manage anyone, or manage departments without the Manager role
2. **Clarity**: Permissions (roles) vs Hierarchy (manager assignment) are different concerns
3. **Scalability**: Manager assignments are department-specific, roles are system-wide
4. **Maintenance**: Changes to role permissions don't affect manager assignments and vice versa
5. **Reporting**: Can query manager hierarchy independently of role-based permissions

## Future Enhancements

- View existing manager assignments
- Edit/remove manager assignments
- Bulk manager assignment
- Manager hierarchy visualization
- Manager assignment history/audit log

