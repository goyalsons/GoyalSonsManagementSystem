# Environment Variables Example

Copy these variables to your `.env` file and update with your actual values.

## Database (required)

```env
# PostgreSQL connection string. For Railway/remote DB, include connection_limit to avoid pool exhaustion.
# Example local:  postgresql://postgres:PASSWORD@localhost:5432/gms_dev
# Example Railway: postgresql://postgres:PASSWORD@host:port/railway?sslmode=require&connection_limit=10
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/goyalsons_db?connection_limit=10"
```

**Important for Railway / remote DB:** Add `connection_limit=10` (and if needed `connect_timeout=30`) to the URL. If the URL already has `?sslmode=require`, use `&connection_limit=10`. Prisma’s default pool size is small (e.g. 2); login + auto-sync can exhaust it and cause "Timed out fetching a new connection" or "Server has closed the connection".

## Sales API Configuration

```env
# Sales API Host (e.g., VENDOR.GOYALSONS.COM)
SALES_API_HOST=VENDOR.GOYALSONS.COM

# Sales API Port
SALES_API_PORT=99

# Sales API Path
SALES_API_PATH=/gsweb_v3/webform2.aspx

# Sales API Key
SALES_API_KEY=ank2024

# Sales API SQL Query (REQUIRED - This is your API query)
SALES_API_SQL_QUERY=SELECT SHRTNAME, DEPT, SMNO, SM, EMAIL, BILL_MONTH, BRAND, TOTAL_SALE, PR_DAYS, INHOUSE_SAL, SYSDATE UPD_ON FROM GSMT.SM_MONTHLY Where SMNO IN (Select SMNO FROM GSMT.SM_MONTHLY where BILL_MONTH >= ADD_MONTHS(SYSDATE, -2) and TOTAL_SALE >= 100)

# Sales API Token (Bearer token for authentication)
SALES_API_TOKEN=your_token_here

# Sales API Timeout in milliseconds (default: 60000 = 60 seconds)
SALES_API_TIMEOUT_MS=60000

# Sales API User Agent
SALES_API_USER_AGENT=PostmanRuntime/7.43.4

# Reject unauthorized SSL certificates (true/false)
SALES_API_REJECT_UNAUTHORIZED=false

# Maximum redirects allowed
SALES_API_MAX_REDIRECTS=20

```

## Authentication

```env
# Enable legacy behavior: auto-promote password/Google login users to Director (default: false)
# When false, users get their actual DB roles. Use "Add Configuration" to create ID/password users with roles.
ENABLE_PASSWORD_LOGIN_DIRECTOR_PROMOTION=false

# Launch safety: when true, session middleware must never mutate user roles (no ensureUserHasRole / replaceUserRoles).
# Set to true for production to prevent card-linked users (e.g. Store Manager) from being downgraded to Employee on re-login.
DISABLE_MIDDLEWARE_ROLE_AUTOFIX=true
```

## BigQuery (optional – for Attendance History)

```env
# Option A: JSON string (for Railway/production). Use \n for newlines in private_key.
BIGQUERY_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----","client_email":"..."}'

# Option B: File path (for local dev – avoids env newline corruption). Path can be absolute or relative to project root.
# GOOGLE_APPLICATION_CREDENTIALS=./bigquery-credentials.json
```

**If you see "Invalid JWT / reasonable timeframe"**: Sync your system clock with the internet (NTP). Google rejects JWTs when the server clock is wrong.

## How to Use

1. Create a `.env` file in the root directory
2. Copy the variables above
3. Update the values with your actual configuration
4. Restart your development server

