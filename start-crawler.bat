@echo off
chcp 65001 >nul
title 雷神电量爬虫 - 启动

cd /d "%~dp0"

echo.
echo ========================================
echo    雷神电量爬虫 - 启动中...
echo ========================================
echo.

REM 检查 .env.local
if not exist ".env.local" (
    echo [WARNING] 未找到 .env.local 配置文件！
    echo 请先运行 setup-crawler.bat 选择[6]配置环境变量
    echo 或者复制 .env.local.template 为 .env.local 并修改密码
    echo.
    pause
    exit /b 1
)

echo [1/3] 正在启动看门狗（后台运行）...
start /MIN "" cmd /c "node scripts\watchdog.js"
timeout /t 2 /nobreak >nul

echo [2/3] 正在启动爬虫（后台运行）...
start /MIN "" cmd /c "node scripts\run-local-crawler.js"
timeout /t 2 /nobreak >nul

echo [3/3] 启动完成！
echo.
echo ========================================
echo  爬虫已成功启动！
echo ========================================
echo.
echo   - 爬虫每15分钟执行一次数据采集
echo   - 看门狗每5分钟检查爬虫状态
echo   - 关闭此窗口不会影响爬虫运行
echo   - 日志位置: .\logs\fetch-*.log
echo.
echo 如需彻底停止: 运行 stop-all.bat 或 setup-crawler.bat
echo 查看实时日志: 运行 logs.bat
echo.
pause
