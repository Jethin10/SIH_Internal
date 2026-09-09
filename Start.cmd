@echo off
cd /d "%~dp0"
if exist ".runtime\node\node.exe" (
  ".runtime\node\node.exe" extension\scripts\start.js
) else (
  node extension\scripts\start.js
)
if errorlevel 1 pause
