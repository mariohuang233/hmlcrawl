@echo off
chcp 65001 >nul
title 雷神电量监控 - 一键启动所有服务

echo.
echo ========================================
echo    雷神电量监控 - 一键启动
echo ========================================
echo.

REM Check if already running
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo [WARNING] Node.js process is already running
    echo.
    echo Checking PM2 status...
    call :check_pm2
) else (
    echo [START] Starting PM2 crawler...
    call :start_crawler
)

goto :end

:check_pm2
cd /d "%~dp0"
npm.cmd run pm2:status >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [STATUS] PM2 crawler is running
    echo.
    echo Starting server...
    call :start_server
) else (
    echo [START] PM2 crawler is not running, starting...
    call :start_crawler
)
goto :end

:start_crawler
cd /d "%~dp0"
echo.
echo [1/2] Starting PM2 crawler...
npm.cmd run pm2:start
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] PM2 crawler started successfully
    echo.
    echo Starting server...
    call :start_server
) else (
    echo [ERROR] PM2 crawler failed to start
    echo.
    pause
    exit /b 1
)

:start_server
echo.
echo [2/2] Starting server...
start /B "" cmd /c "cd /d "%~dp0" && npm.cmd start"
echo.
echo [COMPLETE] All services started
echo.
echo ========================================
echo   Crawler: http://localhost:3000/health
echo   Frontend: http://localhost:3000
echo ========================================
echo.
echo Note: Closing this window will NOT stop services
echo       To stop, run stop-all.bat
echo.
timeout /t 5 >nul

:end
echo.
echo Press any key to exit...
pause >nul
