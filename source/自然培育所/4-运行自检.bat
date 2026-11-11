@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  自然培育所 · 自动化验收
echo  ------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [错误] 未检测到 Node.js。
  echo         请安装 Node 18+ 后重试：https://nodejs.org/
  echo.
  pause
  exit /b 1
)
node tools\audit.mjs
echo.
pause
