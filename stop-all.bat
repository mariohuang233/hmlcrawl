@echo off
chcp 65001 >nul
title 雷神电量监控 - 停止所有服务

echo.
echo ========================================
echo    雷神电量监控 - 停止所有服务
echo ========================================
echo.

echo [1/2] Stopping PM2 crawler...
cd /d "%~dp0"
npm.cmd run pm2:stop
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] PM2 crawler stopped
) else (
    echo [WARNING] PM2 crawler stop failed or not running
)

echo.
echo [2/2] Stopping server...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq npm*start*" 2>nul
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Server stopped
) else (
    echo [WARNING] Server not running
)

echo.
echo ========================================
echo   All services stopped
echo ========================================
echo.
echo Note: Run start-all.bat to restart
echo.
timeout /t 3 >nul
