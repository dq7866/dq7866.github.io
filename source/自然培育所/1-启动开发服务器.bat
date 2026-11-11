@echo off
chcp 65001 >nul
title Nature Lab - Dev Server
cd /d "%~dp0"

echo ==========================================
echo   Nature Lab  /  Local Dev Server
echo ==========================================
echo.

where python >nul 2>nul
if errorlevel 1 goto nopython

echo Serving : %~dp0game
echo URL      : http://localhost:8080
echo.
echo Edit files, then press F5 in the browser. No restart needed.
echo Close this window to stop the server.
echo.

start "" http://localhost:8080/index.html
python -m http.server 8080 --directory "%~dp0game"
goto end

:nopython
echo [!] Python 3 not found.
echo     Install from https://www.python.org/downloads/  (check "Add to PATH")
echo     Or just double-click the "Open Game" shortcut (file:// mode).
echo.
pause
exit /b 1

:end
pause
