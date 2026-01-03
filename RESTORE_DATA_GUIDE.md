# Database Restore Guide

## Options for Restoring Data

### Option 1: Restore from SQL Backup File to Railway Database

If you have a `goyalsons_db.sql` backup file and want to restore it to Railway:

```bash
# Set Railway DATABASE_URL (from Railway dashboard)
$env:DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway"

# Run restore script
npx tsx scripts/restore-database.ts
```

Or manually using psql:
```bash
# Windows PowerShell
$env:PGPASSWORD="YOUR_PASSWORD"
psql -h trolley.proxy.rlwy.net -p 49135 -U postgres -d railway -f goyalsons_db.sql
```

### Option 2: Restore from SQL Backup File to Local Database

Restore to your local PostgreSQL database:

```bash
# Set local DATABASE_URL in .env file first
# DATABASE_URL="postgresql://postgres:password@localhost:5432/goyalsons_db"

# Run restore script
npx tsx scripts/restore-database.ts
```

Or manually:
```bash
psql -U postgres -d goyalsons_db -f goyalsons_db.sql
```

### Option 3: Backup from Railway and Restore to Local

**Step 1: Backup from Railway**
```bash
# Get Railway DATABASE_URL from Railway dashboard
$env:PGPASSWORD="YOUR_PASSWORD"
pg_dump -h trolley.proxy.rlwy.net -p 49135 -U postgres -d railway -F c -f railway_backup.dump
```

**Step 2: Restore to Local**
```bash
pg_restore -U postgres -d goyalsons_db -c railway_backup.dump
```

### Option 4: Restore Initial Data Only (Seed)

If you just want to restore initial/sample data (roles, policies, default users):

```bash
npm run db:seed
```

Or:
```bash
npx tsx prisma/seed.ts
```

### Option 5: Backup from Railway (Create New Backup)

To create a new backup from Railway database:

```bash
# Windows PowerShell
$env:PGPASSWORD="DGSncgmKBqTyPWnTpYosaaQKpObkSyUW"
pg_dump -h trolley.proxy.rlwy.net -p 49135 -U postgres -d railway -F p -f railway_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Or using DATABASE_URL
$env:DATABASE_URL="postgresql://postgres:DGSncgmKBqTyPWnTpYosaaQKpObkSyUW@trolley.proxy.rlwy.net:49135/railway"
pg_dump $env:DATABASE_URL -F p -f railway_backup.sql
```

## Requirements

- PostgreSQL client tools (`psql`, `pg_dump`, `pg_restore`)
- Correct DATABASE_URL in `.env` file
- Database connection access

## Quick Restore (Using Script)

The easiest way is to use the restore script:

```bash
# Make sure DATABASE_URL is set in .env file
npx tsx scripts/restore-database.ts
```

This script will:
1. Check if backup file exists
2. Parse DATABASE_URL
3. Restore data using psql
4. Show progress and errors

