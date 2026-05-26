@echo off
chcp 65001 >nul
title 雷神电量爬虫 - 一键安装/设置

cd /d "%~dp0"

:MENU
cls
echo.
echo ========================================
echo    雷神电量爬虫 - 安装/设置工具
echo ========================================
echo.
echo   [1] 一键启动爬虫（看门狗模式）
echo   [2] 安装为开机自启服务
echo   [3] 移除开机自启服务
echo   [4] 查看爬虫状态
echo   [5] 停止爬虫
echo   [6] 配置环境变量
echo   [0] 退出
echo.
echo ========================================
echo.

set /p choice="请选择 (0-6): "

if "%choice%"=="1" goto :START
if "%choice%"=="2" goto :INSTALL
if "%choice%"=="3" goto :UNINSTALL
if "%choice%"=="4" goto :STATUS
if "%choice%"=="5" goto :STOP
if "%choice%"=="6" goto :CONFIG
if "%choice%"=="0" exit /b 0

goto :MENU

:CHECK_ENV
if exist ".env.local" (
    goto :EOF
)
echo.
echo [WARNING] 未找到 .env.local 配置文件！
echo.
echo 是否要创建配置文件？(Y/N)
set /p create_env=": "
if /i "%create_env%"=="Y" goto :CONFIG
goto :EOF

:CONFIG
cls
echo.
echo ========================================
echo    配置环境变量
echo ========================================
echo.
echo 请准备好你的 MongoDB 连接信息。
echo.
echo 默认 MongoDB 地址:
echo   mongodb+srv://mariohuang:密码@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true^&w=majority^&appName=yierbubu
echo.
set /p mongo_uri="请输入 MongoDB 连接字符串（回车用默认值）: "
if "%mongo_uri%"=="" (
    echo.
    echo 请输入 MongoDB 密码:
    set /p mongo_pwd=": "
    set "mongo_uri=mongodb+srv://mariohuang:%mongo_pwd%@yierbubu.aha67vc.mongodb.net/electricity?retryWrites=true&w=majority&appName=yierbubu"
)
echo.
echo 正在写入 .env.local ...
(
    echo # MongoDB连接字符串
    echo MONGO_URI=%mongo_uri%
    echo.
    echo # 服务器端口
    echo PORT=3000
    echo.
    echo # 使用直连IP（绕过DNS解析）
    echo USE_DIRECT_IP=true
    echo.
    echo # 电表ID
    echo METER_ID=18100071580
    echo.
    echo # 电表名称
    echo METER_NAME=2759弄18号402阳台
    echo.
    echo # 日志级别
    echo LOG_LEVEL=info
) > .env.local
echo.
echo [SUCCESS] .env.local 已创建！
echo.
pause
goto :MENU

:START
cls
echo.
echo ========================================
echo    启动爬虫（看门狗模式）
echo ========================================
echo.

call :CHECK_ENV

echo 正在停止已有爬虫进程...
taskkill /F /FI "WINDOWTITLE eq node *watchdog*" 2>nul
taskkill /F /FI "WINDOWTITLE eq node *run-local-crawler*" 2>nul
timeout /t 2 /nobreak >nul

echo.
echo 正在启动看门狗（后台运行）...
start /MIN "" cmd /c "node scripts\watchdog.js"

echo.
echo 正在启动爬虫进程...
start /MIN "" cmd /c "node scripts\run-local-crawler.js"

echo.
echo [SUCCESS] 爬虫已启动！
echo.
echo   - 看门狗会每5分钟检查爬虫状态
echo   - 爬虫每15分钟执行一次数据采集
echo   - 日志位置: .\logs\fetch-*.log
echo   - 看门狗日志: .\logs\watchdog.log
echo.
echo 提示: 关闭此窗口不会影响爬虫运行！
echo       如需彻底停止，请运行 setup-crawler.bat 选择[停止爬虫]
echo.
pause
goto :MENU

:INSTALL
cls
echo.
echo ========================================
echo    安装为开机自启服务
echo ========================================
echo.

call :CHECK_ENV

echo 检查 Node.js 环境...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 未找到 Node.js！请先安装 Node.js
    pause
    goto :MENU
)
echo [OK] Node.js 已安装

echo.
echo 检查 PM2...
where pm2 >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] PM2 未安装，正在安装...
    npm install -g pm2
)
echo [OK] PM2 已安装

echo.
echo 正在停止已有爬虫进程...
taskkill /F /FI "WINDOWTITLE eq node *watchdog*" 2>nul
taskkill /F /FI "WINDOWTITLE eq node *run-local-crawler*" 2>nul
npm run pm2:stop 2>nul
timeout /t 2 /nobreak >nul

echo.
echo 正在通过 PM2 启动爬虫...
npm run pm2:start
timeout /t 3 /nobreak >nul

echo.
echo 正在通过 PM2 启动看门狗...
npx pm2 start scripts\watchdog.js --name watchdog
timeout /t 2 /nobreak >nul

echo.
echo 保存 PM2 进程列表...
npx pm2 save
timeout /t 2 /nobreak >nul

echo.
echo 设置 PM2 开机自启...
npx pm2 startup
echo.
echo [INFO] 请复制上面输出的命令并在管理员终端中执行
echo       以完成开机自启设置。

echo.
echo ========================================
echo   [下一步] 创建 Windows 定时任务
echo ========================================
echo.
echo 将在 Windows 任务计划程序中创建任务，
echo 确保爬虫在开机时自动启动...
echo.

set "TASK_NAME=ElectricityCrawlerWatchdog"
set "SCRIPT_PATH=%~dp0scripts\watchdog.js"
set "NODE_PATH="
where node >nul 2>&1 && set "NODE_PATH=node"

schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] 任务计划已存在，正在更新...
    schtasks /Delete /TN "%TASK_NAME%" /F >nul
)

schtasks /Create /SC ONSTART /DELAY 0000:01 /TN "%TASK_NAME%" /TR "cmd /c cd /d '%~dp0' && node scripts\watchdog.js" /RL HIGHEST /F

if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] 开机自启任务已创建！
) else (
    echo [WARNING] 创建任务失败，请以管理员身份运行此脚本
    echo          或者手动运行: schtasks /Create /SC ONSTART /TN "%TASK_NAME%" /TR "cmd /c cd /d '%~dp0' && node scripts\watchdog.js" /RL HIGHEST /F
)

echo.
echo ========================================
echo   [PM2 状态]
echo ========================================
npx pm2 status

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo   - 爬虫将通过 PM2 管理（自动重启）
echo   - 看门狗将每5分钟检查爬虫状态
echo   - 电脑重启后会自动启动
echo   - 日志位置: .\logs\
echo.
pause
goto :MENU

:UNINSTALL
cls
echo.
echo ========================================
echo    移除开机自启服务
echo ========================================
echo.

echo 停止 PM2 进程...
npm run pm2:stop
npx pm2 delete watchdog 2>nul
npx pm2 delete electricity-crawler 2>nul

echo.
echo 删除 PM2 开机自启...
npx pm2 unstartup

echo.
echo 删除 Windows 任务计划...
set "TASK_NAME=ElectricityCrawlerWatchdog"
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

echo.
echo 停止所有爬虫相关进程...
taskkill /F /FI "WINDOWTITLE eq node *watchdog*" 2>nul
taskkill /F /FI "WINDOWTITLE eq node *run-local-crawler*" 2>nul

echo.
echo [SUCCESS] 已移除所有开机自启服务！
pause
goto :MENU

:STATUS
cls
echo.
echo ========================================
echo    爬虫运行状态
echo ========================================
echo.

echo [1] PM2 进程状态:
npx pm2 status 2>nul
echo.

echo [2] 运行的 Node 进程:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /I "node.exe"
echo.

echo [3] 今日爬虫日志:
set "today=%date:~0,4%%date:~5,2%%date:~8,2%"
if exist "logs\fetch-%today%.log" (
    echo 日志文件: logs\fetch-%today%.log
    for /f %%i in ('find /c /v "" < "logs\fetch-%today%.log"') do set lines=%%i
    echo 行数: %lines%
    echo.
    echo 最近5条记录:
    powershell -Command "Get-Content 'logs\fetch-%today%.log' -Tail 5"
) else (
    echo [WARNING] 今日无爬虫日志！
    echo 最新日志文件:
    dir /b /o-d logs\fetch-*.log 2>nul
)
echo.

echo [4] 看门狗状态:
if exist "logs\.crawler.pid" (
    set /p crawler_pid=<"logs\.crawler.pid"
    echo PID文件存在: %crawler_pid%
    tasklist /FI "PID eq %crawler_pid%" 2>nul | find "%crawler_pid%" >nul && echo 进程运行中 || echo 进程已不存在
) else (
    echo 无PID文件（爬虫可能未通过看门狗启动）
)
echo.

echo [5] 配置文件状态:
if exist ".env.local" (
    echo [OK] .env.local 已配置
) else (
    echo [WARNING] .env.local 未配置！
)

echo.
pause
goto :MENU

:STOP
cls
echo.
echo ========================================
echo    停止爬虫
echo ========================================
echo.

echo 停止 PM2 爬虫...
npm run pm2:stop 2>nul
npx pm2 delete watchdog 2>nul

echo.
echo 强制终止所有爬虫相关进程...
taskkill /F /FI "WINDOWTITLE eq node *watchdog*" 2>nul
taskkill /F /FI "WINDOWTITLE eq node *run-local-crawler*" 2>nul

echo.
echo [SUCCESS] 爬虫已停止！
pause
goto :MENU
