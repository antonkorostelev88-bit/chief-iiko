@echo off
setlocal
cd /d "%~dp0"

echo.
echo === iiko Chef MVP ===
echo.

set "USE_BUNDLED="
where npm.cmd >nul 2>nul
if not errorlevel 1 goto ready

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "BUNDLED_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs"
if not exist "%BUNDLED_NODE%" goto no_node
if not exist "%BUNDLED_PNPM%" goto no_node
set "USE_BUNDLED=1"
goto ready

:no_node
echo Node.js/npm was not found.
echo Install Node.js LTS from https://nodejs.org/ and run this file again.
echo.
pause
exit /b 1

:ready
if not exist node_modules (
  echo Installing dependencies...
  if defined USE_BUNDLED (
    "%BUNDLED_NODE%" "%BUNDLED_PNPM%" install
  ) else (
    npm.cmd install
  )
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting app at http://127.0.0.1:3000
echo Keep this window open while you use the site.
echo.
start "" "http://127.0.0.1:3000"
if defined USE_BUNDLED (
  "%BUNDLED_NODE%" "%BUNDLED_PNPM%" run dev -- --hostname 127.0.0.1 --port 3000
) else (
  npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
)

pause
