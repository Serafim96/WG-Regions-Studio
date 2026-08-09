@echo off
setlocal
cd /d "%~dp0"
call "%~dp0WG-Regions-Studio.bat" --setup-only
if errorlevel 1 exit /b 1
echo.
pause
