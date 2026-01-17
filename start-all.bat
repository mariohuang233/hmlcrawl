@echo off
chcp 65001 >nul
title 雷神电量监控 - 一键启动所有服务

echo.
echo ========================================
echo    雷神电量监控 - 一键启动
echo ========================================
echo.

REM 检查是否已经运行
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo [警告] Node.js 进程已在运行
    echo.
    echo 正在检查 PM2 状态...
    call :check_pm2
) else (
    echo [启动] 启动 PM2 爬虫...
    call :start_crawler
)

goto :end

:check_pm2
cd /d "%~dp0"
npm.cmd run pm2:status >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [状态] PM2 爬虫正在运行
    echo.
    echo 正在启动服务器...
    call :start_server
) else (
    echo [启动] PM2 爬虫未运行，正在启动...
    call :start_crawler
)
goto :end

:start_crawler
cd /d "%~dp0"
echo.
echo [1/2] 启动 PM2 爬虫...
npm.cmd run pm2:start
if %ERRORLEVEL% equ 0 (
    echo [成功] PM2 爬虫启动成功
    echo.
    echo 正在启动服务器...
    call :start_server
) else (
    echo [错误] PM2 爬虫启动失败
    echo.
    pause
    exit /b 1
)

:start_server
echo.
echo [2/2] 启动服务器...
start /B "" cmd /c "cd /d "%~dp0" && npm.cmd start"
echo.
echo [完成] 所有服务已启动
echo.
echo ========================================
echo   爬虫: http://localhost:3000/health
echo   前端: http://localhost:3000
echo ========================================
echo.
echo 提示: 关闭此窗口不会停止服务
echo       如需停止，请运行 stop-all.bat
echo.
timeout /t 5 >nul

:end
echo.
echo 按任意键退出...
pause >nul
