@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows.ps1"
if errorlevel 1 (
  echo Setup failed. Read the error above, then run Setup.cmd again.
  pause
  exit /b 1
)
pause
