# Goyalsons Management System - Local Development Setup Guide

A comprehensive guide to install Cursor IDE and set up the Goyalsons Management System (GMS) on your local machine.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Requirements](#2-system-requirements)
3. [Installing Cursor IDE](#3-installing-cursor-ide)
4. [Installing Prerequisites](#4-installing-prerequisites)
5. [Project Setup](#5-project-setup)
6. [Environment Configuration](#6-environment-configuration)
7. [Database Setup](#7-database-setup)
8. [Running the Application](#8-running-the-application)
9. [Project Structure Overview](#9-project-structure-overview)
10. [Troubleshooting](#10-troubleshooting)
11. [Additional Resources](#11-additional-resources)
12. [Automated Setup with Cursor](#12-automated-setup-with-cursor)

---

## 1. Introduction

### About Goyalsons Management System (GMS)

GMS is an enterprise resource planning (ERP) application designed for managing organizational operations including:

- **Employee Management** - Complete employee directory with organizational hierarchy
- **Attendance Tracking** - Real-time attendance with BigQuery integration
- **Task Assignment** - Create and assign tasks to employees
- **Claims Processing** - Submit and approve expense claims
- **Announcements** - Company-wide communication system
- **Role-Based Access Control** - Hierarchical permissions (CEO → Management → Department → Employee)

### Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL with Prisma ORM |
| Authentication | Token-based (Password + OTP via SMS) |
| External APIs | BigQuery (Attendance), Zoho Creator (Employee Sync) |

---

## 2. System Requirements

Before you begin, ensure your system meets these requirements:

### Minimum Requirements

| Component | Requirement |
|-----------|-------------|
| Operating System | Windows 10/11, macOS 10.15+, or Ubuntu 20.04+ |
| RAM | 8 GB (16 GB recommended) |
| Storage | 2 GB free space |
| Processor | 64-bit processor |

### Software Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | v20.x or later | JavaScript runtime |
| npm | v10.x or later | Package manager (comes with Node.js) |
| PostgreSQL | v14.x or later | Database |
| Git | v2.x or later | Version control |

---

## 3. Installing Cursor IDE

Cursor is an AI-powered code editor built on VS Code. It provides intelligent code completion and AI assistance.

### Step 1: Download Cursor

Visit the official Cursor website:

**Download Link:** [https://cursor.sh](https://cursor.sh)

Select the appropriate version for your operating system:
- **Windows:** Download the `.exe` installer
- **macOS:** Download the `.dmg` file
- **Linux:** Download the `.AppImage` or `.deb` file

### Step 2: Install Cursor

#### Windows Installation

1. Locate the downloaded `CursorSetup.exe` file
2. Double-click to run the installer
3. If prompted by Windows Defender, click **"More info"** then **"Run anyway"**
4. Follow the installation wizard:
   - Accept the license agreement
   - Choose installation location (default is recommended)
   - Select additional tasks (create desktop icon, add to PATH)
5. Click **Install** and wait for completion
6. Click **Finish** to launch Cursor

#### macOS Installation

1. Locate the downloaded `Cursor.dmg` file
2. Double-click to open the disk image
3. Drag the **Cursor** icon to the **Applications** folder
4. If prompted about unidentified developer:
   - Go to **System Preferences** → **Security & Privacy**
   - Click **"Open Anyway"** next to the Cursor message
5. Launch Cursor from Applications or Spotlight

#### Linux Installation

**For .AppImage:**
```bash
chmod +x Cursor-*.AppImage
./Cursor-*.AppImage
```

**For .deb (Ubuntu/Debian):**
```bash
sudo dpkg -i cursor_*.deb
sudo apt-get install -f  # Install dependencies if needed
```

### Step 3: Initial Cursor Setup

1. **Sign in** with your Cursor account (or create one)
2. When prompted, you can import settings from VS Code
3. Select your preferred theme (Dark/Light)

### Step 4: Install Recommended Extensions

Open Cursor and install these extensions (Ctrl+Shift+X or Cmd+Shift+X):

| Extension | Purpose |
|-----------|---------|
| **ESLint** | JavaScript/TypeScript linting |
| **Prettier** | Code formatting |
| **Prisma** | Prisma schema syntax highlighting |
| **Tailwind CSS IntelliSense** | Tailwind class autocomplete |
| **Thunder Client** | API testing (alternative to Postman) |
| **GitLens** | Enhanced Git integration |
| **Auto Rename Tag** | Automatically rename paired HTML/JSX tags |

To install an extension:
1. Click the Extensions icon in the sidebar (or press `Ctrl+Shift+X`)
2. Search for the extension name
3. Click **Install**

---

## 4. Installing Prerequisites

### 4.1 Install Node.js

#### Windows

1. Visit [https://nodejs.org](https://nodejs.org)
2. Download the **LTS version** (v20.x recommended)
3. Run the installer and follow the prompts
4. Check "Automatically install necessary tools" when prompted
5. Verify installation:
   ```cmd
   node --version
   npm --version
   ```

#### macOS

**Option 1: Official Installer**
1. Visit [https://nodejs.org](https://nodejs.org)
2. Download and run the macOS installer

**Option 2: Using Homebrew (Recommended)**
```bash
brew install node@20
```

Verify installation:
```bash
node --version
npm --version
```

#### Linux (Ubuntu/Debian)

```bash
# Install using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 4.2 Install PostgreSQL

#### Windows

1. Download from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Run the installer
3. During installation:
   - Remember the **password** you set for the `postgres` user
   - Default port: `5432`
   - Include **pgAdmin 4** (GUI tool)
4. Complete the installation

#### macOS

**Using Homebrew:**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Using Postgres.app (Recommended for beginners):**
1. Download from [https://postgresapp.com](https://postgresapp.com)
2. Move to Applications folder
3. Open and click "Initialize"

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Set password for postgres user
sudo -u postgres psql
\password postgres
# Enter your password twice
\q
```

### 4.3 Install Git

#### Windows

1. Download from [https://git-scm.com/download/win](https://git-scm.com/download/win)
2. Run the installer with default options
3. Verify: `git --version`

#### macOS

```bash
# Git comes pre-installed, or install via Homebrew:
brew install git
git --version
```

#### Linux

```bash
sudo apt install git
git --version
```

---

## 5. Project Setup

### Step 1: Get the Project Files

#### Option A: Clone from Git Repository

If the project is in a Git repository:
```bash
git clone <repository-url>
cd GoyalsonsManagementSystem
```

#### Option B: Download from Replit

1. In Replit, click the three dots menu (⋮) next to "Files"
2. Select **"Download as ZIP"**
3. Extract the ZIP file to your desired location
4. Open terminal and navigate to the project:
   ```bash
   cd path/to/GoyalsonsManagementSystem
   ```

### Step 2: Open in Cursor

1. Open Cursor IDE
2. Go to **File** → **Open Folder**
3. Navigate to the `GoyalsonsManagementSystem` folder
4. Click **Select Folder**

### Step 3: Install Dependencies

Open the integrated terminal in Cursor (`Ctrl+`` or `Cmd+``) and run:

```bash
npm install
```

This will install all required packages defined in `package.json`. Wait for the installation to complete (this may take a few minutes).

---

## 6. Environment Configuration

### Step 1: Create Environment File

Create a `.env` file in the project root directory:

```bash
# Windows (PowerShell)
New-Item -Path ".env" -ItemType File

# macOS/Linux
touch .env
```

### Step 2: Configure Environment Variables

Open the `.env` file in Cursor and add the following variables:

```env
# ============================================
# DATABASE CONFIGURATION
# ============================================
# Replace with your local PostgreSQL credentials
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/goyalsons_db"

# Individual database connection parameters
PGHOST="localhost"
PGPORT="5432"
PGUSER="postgres"
PGPASSWORD="YOUR_PASSWORD"
PGDATABASE="goyalsons_db"

# ============================================
# APPLICATION SETTINGS
# ============================================
NODE_ENV="development"
PORT="5000"

# ============================================
# SMS CONFIGURATION (InstaAlerts)
# ============================================
# Required for OTP-based login
SMS_API_KEY="your_instaalerts_api_key"
SMS_SENDER_ID="GOYLSN"
SMS_DLT_ENTITY_ID="1101682460000011989"
SMS_DLT_TEMPLATE_ID="1107176475621761408"

# ============================================
# BIGQUERY CONFIGURATION (Optional)
# ============================================
# Required for Attendance History feature
# This should be the JSON content of your Google Cloud Service Account key
BIGQUERY_CREDENTIALS='{"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'

# ============================================
# EXTERNAL API CONFIGURATION (Optional)
# ============================================
# Employee data sync from external system
# Configure this in Admin → Master Settings after setup
```

### Environment Variables Explained

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Full PostgreSQL connection string |
| `PGHOST` | Yes | Database server hostname |
| `PGPORT` | Yes | Database port (default: 5432) |
| `PGUSER` | Yes | Database username |
| `PGPASSWORD` | Yes | Database password |
| `PGDATABASE` | Yes | Database name |
| `NODE_ENV` | Yes | Environment mode (development/production) |
| `PORT` | No | Server port (default: 5000) |
| `SMS_API_KEY` | For OTP | InstaAlerts API key for sending SMS |
| `BIGQUERY_CREDENTIALS` | For Attendance | Google Cloud Service Account JSON |

---

## 7. Database Setup

### Step 1: Create the Database

#### Using Command Line (psql)

```bash
# Windows
psql -U postgres

# macOS/Linux
sudo -u postgres psql
```

Then run:
```sql
CREATE DATABASE goyalsons_db;
\q
```

#### Using pgAdmin 4

1. Open pgAdmin 4
2. Right-click on **Databases**
3. Select **Create** → **Database**
4. Enter name: `goyalsons_db`
5. Click **Save**

### Step 2: Generate Prisma Client

```bash
npx prisma generate
```

### Step 3: Run Database Migrations

This creates all the necessary tables:

```bash
npm run db:migrate
```

If you encounter issues, you can use Drizzle to push the schema directly:
```bash
npm run db:push
```

### Step 4: Seed Initial Data

The project includes a seed script to create initial data (roles, policies, default admin user):

```bash
npm run db:seed
```

Or run directly:
```bash
npx tsx prisma/seed.ts
```

### Verify Database Setup

Connect to the database and check tables:

```bash
npx prisma studio
```

This opens Prisma Studio in your browser, where you can:
- View all tables
- Browse and edit data
- Verify the seed data was created

---

## 8. Running the Application

### Development Mode

Start the development server:

```bash
npm run dev
```

This starts the Express.js backend server with Vite middleware that serves the React frontend. Both are served from the same port.

**Note:** The server uses Vite's development middleware to serve the frontend, so you only need to run a single command.

### Access the Application

Open your browser and navigate to:

```
http://localhost:5000
```

### Default Login Credentials

After seeding the database, you can log in with:

| Field | Value |
|-------|-------|
| Email | akshat@goyalsons.com |
| Password | akshat@123 |
| Role | CEO (Super Admin) |

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (backend + frontend) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npx prisma studio` | Open database GUI |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema changes to database (Drizzle) |
| `npm run db:seed` | Seed initial data |

---

## 9. Project Structure Overview

```
GoyalsonsManagementSystem/
├── client/                    # Frontend React application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   └── MainLayout.tsx # Main application layout
│   │   ├── pages/            # Page components
│   │   │   ├── dashboard.tsx  # Dashboard page
│   │   │   ├── employees/     # Employee management
│   │   │   ├── attendance/    # Attendance tracking
│   │   │   ├── tasks/         # Task management
│   │   │   ├── claims/        # Claims processing
│   │   │   └── users/         # User management
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utility functions
│   │   └── App.tsx           # Main App component
│   └── index.html            # HTML entry point
│
├── server/                    # Backend Express application
│   ├── index.ts              # Server entry point
│   ├── routes.ts             # API route definitions
│   ├── auth.ts               # Authentication middleware
│   ├── storage.ts            # Data storage layer
│   └── bigquery-service.ts   # BigQuery integration
│
├── prisma/                    # Database schema and migrations
│   ├── schema.prisma         # Prisma schema definition
│   ├── seed.ts               # Database seeding script
│   └── migrations/           # Database migration files
│
├── shared/                    # Shared types and utilities
│   └── schema.ts             # TypeScript type definitions
│
├── uploads/                   # File upload directory
├── .env                       # Environment variables (create this)
├── package.json              # Project dependencies
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite configuration
└── tailwind.config.ts        # Tailwind CSS configuration
```

### Key Files

| File | Purpose |
|------|---------|
| `server/routes.ts` | All API endpoints |
| `server/auth.ts` | Authentication and authorization logic |
| `prisma/schema.prisma` | Database schema definition |
| `client/src/lib/api.ts` | Frontend API client |
| `client/src/components/MainLayout.tsx` | Application shell with navigation |

---

## 10. Troubleshooting

### Common Issues and Solutions

#### Issue: "npm install" fails with permission errors

**Windows:**
```cmd
# Run Command Prompt as Administrator
npm install
```

**macOS/Linux:**
```bash
# Don't use sudo with npm, instead fix permissions:
sudo chown -R $(whoami) ~/.npm
npm install
```

#### Issue: PostgreSQL connection refused

1. Ensure PostgreSQL service is running:
   ```bash
   # Windows (Services)
   # Check if "postgresql-x64-14" service is running
   
   # macOS
   brew services start postgresql@14
   
   # Linux
   sudo systemctl start postgresql
   ```

2. Verify credentials in `.env` file match your PostgreSQL setup

3. Check if the database exists:
   ```bash
   psql -U postgres -c "\l"
   ```

#### Issue: "prisma: command not found"

Install Prisma CLI globally:
```bash
npm install -g prisma
```

Or use npx:
```bash
npx prisma <command>
```

#### Issue: Port 5000 already in use

Find and kill the process using port 5000:

**Windows:**
```cmd
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

**macOS/Linux:**
```bash
lsof -i :5000
kill -9 <PID>
```

Or change the port in `.env`:
```env
PORT=3000
```

#### Issue: BigQuery authentication fails

1. Ensure `BIGQUERY_CREDENTIALS` contains valid JSON
2. The service account needs "BigQuery Data Viewer" role
3. Check that the JSON is properly escaped in the `.env` file

#### Issue: Prisma migration fails

Reset the database (WARNING: This deletes all data):
```bash
npx prisma migrate reset
```

Or force push schema changes:
```bash
npx prisma db push --force-reset
```

#### Issue: Frontend not updating after code changes

Clear Vite cache:
```bash
rm -rf node_modules/.vite
npm run dev
```

#### Issue: TypeScript errors in Cursor

1. Restart TypeScript server: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"
2. Rebuild: `npm run build`

### Getting Help

If you encounter issues not covered here:

1. Check the terminal/console for error messages
2. Search the error message online
3. Check the project's existing issues or documentation
4. Contact the development team

---

## 11. Additional Resources

### Documentation Links

- **Node.js:** [https://nodejs.org/docs](https://nodejs.org/docs)
- **PostgreSQL:** [https://www.postgresql.org/docs](https://www.postgresql.org/docs)
- **Prisma:** [https://www.prisma.io/docs](https://www.prisma.io/docs)
- **React:** [https://react.dev](https://react.dev)
- **Tailwind CSS:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Cursor:** [https://cursor.sh/docs](https://cursor.sh/docs)

### Useful Commands Cheat Sheet

```bash
# Development
npm run dev              # Start dev server (backend + frontend)
npm run build            # Build for production
npm run start            # Run production server

# Database
npx prisma studio        # Open database GUI
npx prisma generate      # Generate Prisma client
npm run db:migrate       # Run database migrations
npm run db:push          # Push schema changes (Drizzle)
npm run db:seed          # Seed initial data
npm run db:reset         # Reset database and reseed (WARNING: deletes data)

# Troubleshooting
npm cache clean --force  # Clear npm cache
rm -rf node_modules      # Remove dependencies
npm install              # Reinstall dependencies
```

---

## 12. Automated Setup with Cursor

### Quick Start (One Command)

If you're using Cursor IDE, you can set up the entire project with a single command:

```bash
npm run setup:all
```

This master script will:
1. Check all dependencies (Node.js 20+, npm 10+, PostgreSQL)
2. Verify environment variables are configured
3. Install npm packages if needed
4. Generate Prisma client
5. Push database schema
6. Test database connection
7. Test BigQuery connection (if configured)
8. Test SMS service (if configured)

### Available Testing Scripts

After setup, you can run individual tests:

| Command | Description |
|---------|-------------|
| `npm run scripts:deps` | Check all dependencies and environment variables |
| `npm run test:db` | Test database connection |
| `npm run test:bigquery` | Test BigQuery connection |
| `npm run test:sms` | Test SMS service configuration |
| `npm run test:api` | Test API endpoints |
| `npm run test:env` | Run all environment tests |
| `npm run troubleshoot:env` | Find missing environment variables |
| `npm run troubleshoot:cache` | Clear all caches |

### Scripts Folder Structure

The `scripts/` folder contains all automation scripts:

```
scripts/
├── README.md              # Detailed documentation
├── setup/
│   └── master.ts         # Master setup script (npm run setup:all)
├── deps/
│   └── check.ts          # Dependency checker
├── tests/
│   ├── test-db-connection.ts    # Database test
│   ├── test-bigquery.ts         # BigQuery test
│   ├── test-sms.ts              # SMS test
│   └── test-api.ts              # API test
└── troubleshoot/
    ├── repair-env.ts     # Environment variable checker
    └── clear-caches.ts   # Cache clearing utility
```

### Cursor AI Integration

When you provide the `scripts/` folder to Cursor AI, it can:

1. **Analyze** - Read the scripts to understand project setup requirements
2. **Diagnose** - Run tests to identify configuration issues
3. **Fix** - Suggest corrections based on test output
4. **Execute** - Run the master setup to configure everything

**Example prompts for Cursor:**
- "Run the setup script and fix any issues"
- "Check why the database connection is failing"
- "Verify all environment variables are configured"
- "Test the BigQuery connection"

---

## Checklist Before Running

- [ ] Node.js v20+ installed
- [ ] PostgreSQL installed and running
- [ ] Git installed
- [ ] Cursor IDE installed with recommended extensions
- [ ] Project folder opened in Cursor
- [ ] `npm install` completed successfully
- [ ] `.env` file created with database credentials
- [ ] Database `goyalsons_db` created
- [ ] `npx prisma migrate dev` ran successfully
- [ ] `npx prisma db seed` ran successfully

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Author:** Goyalsons Development Team
