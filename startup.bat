@echo off
chcp 65001 >nul
title 雷神电量监控 - 开机自启动

echo.
echo ========================================
echo    雷神电量监控 - 开机自启动
echo ========================================
echo.

REM Get current script directory
set SCRIPT_DIR=%~dp0

REM Check if already running
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo [SKIP] Services already running, no need to start
    echo.
    echo To restart, run stop-all.bat then start-all.bat
    echo.
    timeout /t 3 >nul
    goto :end
)

echo.
echo [START] Starting PM2 crawler...
cd /d "%SCRIPT_DIR%"
start /MIN "" cmd /c "npm.cmd run pm2:start"

echo.
echo [WAIT] Waiting 5 seconds before starting server...
timeout /t 5 /nobreak >nul

echo.
echo [START] Starting server...
start /MIN "" cmd /c "npm.cmd start"

echo.
echo ========================================
echo   All services started
echo ========================================
echo.
echo   Crawler: http://localhost:3000/health
echo   Frontend: http://localhost:3000
echo ========================================
echo.
echo Note: This window will close in 5 seconds
echo       To view logs, run logs.bat
echo.
timeout /t 5 >nul

:end
