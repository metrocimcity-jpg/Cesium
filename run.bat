@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo Node.js / npm was not found. Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting MetroCIM gallery at http://localhost:5180/
call npm start
if errorlevel 1 pause
