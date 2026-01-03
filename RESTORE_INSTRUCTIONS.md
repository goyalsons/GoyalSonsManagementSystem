# How to Restore Data to Railway Database

## Method 1: Using Railway Database Console (Easiest)

1. **Go to Railway Dashboard**
   - Open your Railway project
   - Click on your PostgreSQL service

2. **Open Database Console**
   - Click "Connect" tab
   - Click "Query" button
   - This opens a SQL query editor

3. **Restore Data**
   - Open `goyalsons_db.sql` file in a text editor
   - Copy the SQL content (you may need to copy in smaller chunks if file is large)
   - Paste into Railway query editor
   - Click "Run" or press Ctrl+Enter

**Note:** For large files, you may need to run sections separately.

---

## Method 2: Using pgAdmin (If Installed)

1. **Add Railway Server to pgAdmin**
   - Open pgAdmin
   - Right-click "Servers" → "Create" → "Server"
   - General tab: Name = "Railway"
   - Connection tab:
     - Host: `trolley.proxy.rlwy.net`
     - Port: `49135`
     - Database: `railway`
     - Username: `postgres`
     - Password: `DGSncgmKBqTyPWnTpYosaaQKpObkSyUW`

2. **Restore**
   - Right-click on "railway" database
   - Select "Restore..."
   - Choose your `goyalsons_db.sql` file
   - Click "Restore"

---

## Method 3: Install PostgreSQL Client and Use Command Line

### Install PostgreSQL Client (Windows)

1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Install (you only need the client tools, not full server)
3. Add to PATH: `C:\Program Files\PostgreSQL\16\bin` (adjust version)

### Then Run:

```powershell
$env:PGPASSWORD="DGSncgmKBqTyPWnTpYosaaQKpObkSyUW"
psql -h trolley.proxy.rlwy.net -p 49135 -U postgres -d railway -f goyalsons_db.sql
```

---

## Method 4: Use Seed Data Only (If you just need initial data)

If you only need initial/sample data (not full backup):

```bash
npm run db:seed
```

This will create:
- Default roles and policies
- Sample users
- Basic configuration

---

## Which Method Should You Use?

- **Small database / Quick restore**: Use Railway Console (Method 1)
- **Large database / Full restore**: Use pgAdmin (Method 2) or Command Line (Method 3)
- **Just initial data**: Use Seed (Method 4)

