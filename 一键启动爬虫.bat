@echo off
chcp 65001 >nul
title 电量爬虫 - 后台运行模式
cd /d "%~dp0"

echo.
echo ========================================
echo    电量爬虫 - 后台启动
echo ========================================
echo.

if not exist ".env.local" (
    echo [ERROR] 未找到 .env.local 配置文件！
    echo 请先运行 setup-crawler.bat 配置环境变量
    echo.
    pause
    exit /b 1
)

echo [1/2] 启动看门狗...
start /MIN "" cmd /c "node scripts\watchdog.js"
timeout /t 2 /nobreak >nul

echo [2/2] 启动爬虫...
start /MIN "" cmd /c "node scripts\run-local-crawler.js"

echo.
echo 爬虫已在后台启动！
echo 关闭此窗口不会影响爬虫运行。
echo 查看日志: logs.bat
echo.
pause
