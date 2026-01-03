@echo off
setlocal enabledelayedexpansion
REM =============================================================================
REM Stop Development Server Script
REM =============================================================================
REM This script stops the npm run dev process running in the background
REM =============================================================================

echo [INFO] Stopping development server...
echo.

REM Kill all node.exe processes (this will stop npm run dev)
taskkill /IM node.exe /F >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Successfully stopped all node processes
) else (
    echo [WARN] No node processes found or could not stop them
)

REM Also try to kill npm processes
taskkill /IM npm.cmd /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq npm*" /F >nul 2>&1

echo.
echo [INFO] Done. Development server stopped.
echo [INFO] Check start-dev.log for details if needed.
pause

