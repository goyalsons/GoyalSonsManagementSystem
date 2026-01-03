@echo off
REM =============================================================================
REM Auto Startup Script for Development Server (Background Mode)
REM =============================================================================
REM This script automatically runs 'npm run dev' in the project directory
REM Output is logged to start-dev.log
REM =============================================================================

REM Configuration: Set your project path here (Windows format)
SET PROJECT_PATH=%~dp0

REM Change to project directory
cd /d "%PROJECT_PATH%"

REM Log file path
SET LOG_FILE=%PROJECT_PATH%start-dev.log

REM Log startup info
echo [%date% %time%] ======================================== >> "%LOG_FILE%"
echo [%date% %time%] Starting development server... >> "%LOG_FILE%"
echo [%date% %time%] Project path: %PROJECT_PATH% >> "%LOG_FILE%"
echo [%date% %time%] ======================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

REM Check if package.json exists
IF NOT EXIST "package.json" (
    echo [%date% %time%] [ERROR] package.json not found in project directory >> "%LOG_FILE%"
    echo [%date% %time%] [ERROR] Are you sure this is a Node.js project? >> "%LOG_FILE%"
    exit /b 1
)

REM Check if node_modules exists (optional warning)
IF NOT EXIST "node_modules" (
    echo [%date% %time%] [WARN] node_modules not found. You may need to run 'npm install' first. >> "%LOG_FILE%"
    echo. >> "%LOG_FILE%"
)

REM Run npm run dev and redirect all output to log file (stdout and stderr)
echo [%date% %time%] Starting development server with 'npm run dev'... >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
npm run dev >> "%LOG_FILE%" 2>&1

