@echo off
chcp 65001 >nul
title 雷神电量监控 - 开机自启动

echo.
echo ========================================
echo    雷神电量监控 - 开机自启动
echo ========================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM 检查 .env.local
if not exist ".env.local" (
    echo [WARNING] 未找到 .env.local 配置文件！
    echo 请先运行 setup-crawler.bat 配置环境变量
    timeout /t 10 >nul
    goto :end
)

REM 检查是否已运行
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    REM 检查是否有爬虫相关进程
    wmic process where "name='node.exe' and commandline like '%%watchdog%%'" get processid 2>nul | find /V "ProcessId" | find /V "" >nul
    if !ERRORLEVEL! equ 0 (
        echo [SKIP] Crawler watchdog already running
        timeout /t 3 >nul
        goto :end
    )
)

echo.
echo [START] Starting crawler watchdog...
start /MIN "" cmd /c "node scripts\watchdog.js"
timeout /t 3 /nobreak >nul

echo.
echo [START] Starting crawler...
start /MIN "" cmd /c "node scripts\run-local-crawler.js"
timeout /t 3 /nobreak >nul

echo.
echo [START] Starting web server...
start /MIN "" cmd /c "node server.js"

echo.
echo ========================================
echo   All services started
echo ========================================
echo.
echo   Crawler: runs every 15 minutes
echo   Watchdog: checks every 5 minutes
echo   Server: http://localhost:3000
echo   Logs: .\logs\fetch-*.log
echo ========================================
echo.
timeout /t 5 >nul

:end
