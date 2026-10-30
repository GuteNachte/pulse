@echo off
setlocal
cd /d "%~dp0"

set "DEV_SCRIPT=%~dp0supplemental\scripts\run-hub-dev.ps1"
if not exist "%DEV_SCRIPT%" (
    echo Pulse development script was not found: %DEV_SCRIPT%
    pause
    exit /b 1
)

set "PULSE_POWERSHELL=powershell.exe"
where pwsh.exe >nul 2>nul
if not errorlevel 1 set "PULSE_POWERSHELL=pwsh.exe"

"%PULSE_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%DEV_SCRIPT%"
if errorlevel 1 (
    echo.
    echo Pulse development environment failed to start.
    pause
    exit /b 1
)

start "" "http://localhost:5173"
exit /b 0
