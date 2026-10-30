@echo off
setlocal
cd /d "%~dp0"

set "PREVIEW_SCRIPT=%~dp0supplemental\scripts\run-hub-preview.ps1"
if not exist "%PREVIEW_SCRIPT%" (
    echo Pulse preview script was not found: %PREVIEW_SCRIPT%
    pause
    exit /b 1
)

set "PULSE_POWERSHELL=powershell.exe"
where pwsh.exe >nul 2>nul
if not errorlevel 1 set "PULSE_POWERSHELL=pwsh.exe"

"%PULSE_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%PREVIEW_SCRIPT%"
if errorlevel 1 (
    echo.
    echo Pulse production preview failed to start.
    pause
    exit /b 1
)

echo.
echo Pulse production preview is running at http://localhost:8090
echo Stop it with Stop-Pulse-Preview.cmd before returning to development.
exit /b 0
