# Goyalsons Management System - Scripts

This folder contains automated scripts for setting up, testing, and troubleshooting the GMS application.

## Quick Start (For Cursor IDE)

Run the master setup script to automatically configure and test everything:

```bash
npm run setup:all
```

This single command will:
1. Check all dependencies (Node.js, npm, PostgreSQL)
2. Verify environment variables are configured
3. Install npm packages
4. Run database migrations
5. Seed initial data
6. Test all connections (Database, BigQuery, SMS)
7. Start the development server

---

## Individual Scripts

### Dependency Check
Verifies all required tools and versions are installed:
```bash
npm run scripts:deps
```

**Checks:**
- Node.js >= 20.x
- npm >= 10.x
- PostgreSQL client (psql)
- Prisma CLI
- Required environment variables

---

### Environment Tests

**Test Database Connection:**
```bash
npm run test:db
```
Verifies PostgreSQL connection and runs a test query.

**Test BigQuery Connection:**
```bash
npm run test:bigquery
```
Validates BigQuery credentials and runs a sample query.

**Test SMS Service:**
```bash
npm run test:sms
```
Performs a dry-run SMS test (no actual message sent).

**Test API Endpoints:**
```bash
npm run test:api
```
Tests key API endpoints for proper responses.

**Run All Environment Tests:**
```bash
npm run test:env
```

---

### Troubleshooting

**Find Missing Environment Variables:**
```bash
npm run troubleshoot:env
```
Compares current environment against `.env.example` and reports missing variables.

**Clear All Caches:**
```bash
npm run troubleshoot:cache
```
Clears BigQuery cache and temporary files.

---

## Database Commands

```bash
# Run migrations
npm run db:migrate

# Seed initial data (CEO, departments, roles)
npm run db:seed

# Push schema changes directly
npm run db:push

# Open visual database editor
npx prisma studio

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| SESSION_SECRET | Yes | Session encryption key |
| BIGQUERY_CREDENTIALS | Yes | Google Cloud service account JSON |
| SMS_API_KEY | Yes | InstaAlerts API key |
| SMS_SENDER_ID | No | Default: GOYLSN |
| GOOGLE_CLIENT_ID | No | For Google OAuth login |
| GOOGLE_CLIENT_SECRET | No | For Google OAuth login |
| OPENAI_API_KEY | No | For AI features |

---

## Troubleshooting Guide

### Database Connection Failed
1. Check `DATABASE_URL` is set correctly
2. Verify PostgreSQL is running
3. Run `npm run troubleshoot:env` to check all variables

### BigQuery Not Working
1. Ensure `BIGQUERY_CREDENTIALS` contains valid JSON
2. Verify service account has BigQuery access
3. Check project ID matches your BigQuery dataset

### SMS Not Sending
1. Verify `SMS_API_KEY` is correct
2. Check phone number format (10 digits)
3. Review SMS logs in database: `SELECT * FROM "SmsLog" ORDER BY "createdAt" DESC LIMIT 10;`

### API Errors
1. Restart the development server: `npm run dev`
2. Check browser console for errors
3. Review server logs for stack traces

---

## File Structure

```
scripts/
├── README.md              # This file
├── setup/
│   └── master.ts         # Master setup script
├── deps/
│   └── check.ts          # Dependency checker
├── tests/
│   ├── test-db-connection.ts
│   ├── test-bigquery.ts
│   ├── test-sms.ts
│   └── test-api.ts
└── troubleshoot/
    ├── repair-env.ts
    └── clear-caches.ts
```
