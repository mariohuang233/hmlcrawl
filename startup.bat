@echo off
chcp 65001 >nul
title 雷神电量监控 - 开机自启动

echo.
echo ========================================
echo    雷神电量监控 - 开机自启动
echo ========================================
echo.

REM 获取当前脚本所在目录
set SCRIPT_DIR=%~dp0

REM 检查是否已经运行
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe" >nul
if %ERRORLEVEL% equ 0 (
    echo [跳过] 服务已在运行，无需重复启动
    echo.
    echo 提示: 如需重启服务，请运行 stop-all.bat 后再运行 start-all.bat
    echo.
    timeout /t 3 >nul
    goto :end
)

echo.
echo [启动] 正在启动 PM2 爬虫...
cd /d "%SCRIPT_DIR%"
start /MIN "" cmd /c "npm.cmd run pm2:start"

echo.
echo [等待] 等待 5 秒后启动服务器...
timeout /t 5 /nobreak >nul

echo.
echo [启动] 正在启动服务器...
start /MIN "" cmd /c "npm.cmd start"

echo.
echo ========================================
echo   所有服务已启动
echo ========================================
echo.
echo   爬虫: http://localhost:3000/health
echo   前端: http://localhost:3000
echo ========================================
echo.
echo 提示: 此窗口将在 5 秒后自动关闭
echo       如需查看日志，请运行 logs.bat
echo.
timeout /t 5 >nul

:end
