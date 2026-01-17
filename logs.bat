@echo off
chcp 65001 >nul
title 雷神电量监控 - 查看日志

echo.
echo ========================================
echo    雷神电量监控 - 查看日志
echo ========================================
echo.

cd /d "%~dp0"

:menu
cls
echo.
echo ========================================
echo    雷神电量监控 - 日志查看
echo ========================================
echo.
echo   [1] 查看爬虫日志（今天）
echo   [2] 查看爬虫日志（昨天）
echo   [3] 查看应用日志
echo   [4] 查看错误日志
echo   [5] 查看PM2日志
echo   [6] 实时监控爬虫日志
echo   [0] 退出
echo.
echo ========================================
echo.
set /p choice=请选择操作 (0-6):

if "%choice%"=="1" goto :log_today
if "%choice%"=="2" goto :log_yesterday
if "%choice%"=="3" goto :log_app
if "%choice%"=="4" goto :log_error
if "%choice%"=="5" goto :log_pm2
if "%choice%"=="6" goto :monitor
if "%choice%"=="0" goto :end

:log_today
cls
echo.
echo [查看] 今天爬虫日志（按 Ctrl+C 退出）
echo.
type logs\fetch-%date:~0,4%%date:~5,2%%date:~8,2%.log
echo.
echo.
echo 按任意键返回菜单...
pause >nul
goto :menu

:log_yesterday
cls
echo.
echo [查看] 昨天爬虫日志（按 Ctrl+C 退出）
echo.
set /a yesterday=%date:~0,4%%date:~5,2%%date:~8,2%
set /a day=%date:~3,2%
set /a /a day=%day%-1
if %day% lss 10 set day=0%day%
set yesterday=%yesterday%%day%
if exist logs\fetch-%yesterday%.log (
    type logs\fetch-%yesterday%.log
) else (
    echo [错误] 日志文件不存在
)
echo.
echo 按任意键返回菜单...
pause >nul
goto :menu

:log_app
cls
echo.
echo [查看] 应用日志（按 Ctrl+C 退出）
echo.
if exist logs\app.log (
    type logs\app.log
) else (
    echo [错误] 日志文件不存在
)
echo.
echo 按任意键返回菜单...
pause >nul
goto :menu

:log_error
cls
echo.
echo [查看] 错误日志（按 Ctrl+C 退出）
echo.
if exist logs\error.log (
    type logs\error.log
) else (
    echo [错误] 日志文件不存在
)
echo.
echo 按任意键返回菜单...
pause >nul
goto :menu

:log_pm2
cls
echo.
echo [查看] PM2 日志（按 Ctrl+C 退出）
echo.
if exist logs\pm2-out.log (
    type logs\pm2-out.log
) else (
    echo [错误] 日志文件不存在
)
echo.
echo 按任意键返回菜单...
pause >nul
goto :menu

:monitor
cls
echo.
echo [监控] 实时监控爬虫日志（按 Ctrl+C 退出）
echo.
echo 提示: 新的日志会自动显示在底部
echo.
:monitor_loop
cls
echo.
echo ========================================
echo    爬虫实时日志监控
echo ========================================
echo.
echo   最后更新: %time%
echo.
if exist logs\fetch-%date:~0,4%%date:~5,2%%date:~8,2%.log (
    type logs\fetch-%date:~0,4%%date:~5,2%%date:~8,2%.log
) else (
    echo [等待] 等待日志文件创建...
)
echo.
timeout /t 3 /nobreak >nul
goto :monitor_loop

:end
cls
echo.
echo [退出] 日志查看器
echo.
