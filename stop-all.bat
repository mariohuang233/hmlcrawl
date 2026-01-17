@echo off
chcp 65001 >nul
title 雷神电量监控 - 停止所有服务

echo.
echo ========================================
echo    雷神电量监控 - 停止所有服务
echo ========================================
echo.

echo [1/2] 停止 PM2 爬虫...
cd /d "%~dp0"
npm.cmd run pm2:stop
if %ERRORLEVEL% equ 0 (
    echo [成功] PM2 爬虫已停止
) else (
    echo [警告] PM2 爬虫停止失败或未运行
)

echo.
echo [2/2] 停止服务器...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq npm*start*" 2>nul
if %ERRORLEVEL% equ 0 (
    echo [成功] 服务器已停止
) else (
    echo [警告] 服务器未运行
)

echo.
echo ========================================
echo   所有服务已停止
echo ========================================
echo.
echo 提示: 运行 start-all.bat 重新启动
echo.
timeout /t 3 >nul
