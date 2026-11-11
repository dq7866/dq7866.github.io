@echo off
chcp 65001 >nul
title Nature Lab - Build Single File
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python 3 not found. Install from https://www.python.org/downloads/
  pause
  exit /b 1
)

python "%~dp0tools\build_single.py"
echo.
pause
