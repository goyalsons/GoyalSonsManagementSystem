# Fix Failed Migration on Railway

## Issue
Migration `20251228161859_add_help_ticket_assignment_fields` failed, blocking all new migrations.

## Quick Fix (Recommended)

### Step 1: Check Migration Status via Railway Database Console

1. Go to Railway Dashboard
2. Open your PostgreSQL service
3. Click "Connect" → "Query"
4. Run this query to check if columns exist:

```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'HelpTicket' 
AND column_name IN ('raisedByRole', 'assignedToRole', 'managerId', 'assignedToId');
```

### Step 2A: If Columns EXIST (migration partially applied)

Mark migration as applied:

```sql
UPDATE "_prisma_migrations" 
SET finished_at = NOW(),
    applied_steps_count = 1
WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
AND finished_at IS NULL;
```

### Step 2B: If Columns DON'T EXIST (migration didn't apply)

Mark migration as rolled back:

```sql
DELETE FROM "_prisma_migrations"
WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
AND finished_at IS NULL;
```

### Step 3: Redeploy

After running the SQL, redeploy your application on Railway. The deployment should now succeed.

## Alternative: Using Prisma CLI Locally

If you have Railway DATABASE_URL, you can run locally:

```bash
# Set DATABASE_URL from Railway
export DATABASE_URL="postgresql://..."

# If columns exist:
npx prisma migrate resolve --applied 20251228161859_add_help_ticket_assignment_fields

# If columns don't exist:
npx prisma migrate resolve --rolled-back 20251228161859_add_help_ticket_assignment_fields
```

