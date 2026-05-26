@echo off
chcp 65001 >nul
title 雷神电量监控 - 停止所有服务

echo.
echo ========================================
echo    雷神电量监控 - 停止所有服务
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Stopping PM2 crawler...
npm.cmd run pm2:stop 2>nul
npx pm2 delete watchdog 2>nul
npx pm2 delete electricity-crawler 2>nul

echo [2/4] Stopping watchdog and crawler processes...
taskkill /F /FI "WINDOWTITLE eq node *watchdog*" 2>nul
taskkill /F /FI "WINDOWTITLE eq node *run-local-crawler*" 2>nul

echo [3/4] Stopping web server...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq node *server*" 2>nul
taskkill /F /IM node.exe /FI "WINDOWTITLE eq npm*start*" 2>nul

echo [4/4] Cleaning up PID files...
if exist "logs\.crawler.pid" del "logs\.crawler.pid" 2>nul

echo.
echo ========================================
echo   All services stopped
echo ========================================
echo.
echo Note: Run start-crawler.bat to restart crawler
echo       Or setup-crawler.bat for more options
echo.
timeout /t 3 >nul
