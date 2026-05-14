@echo off
setlocal

echo local-kanban-board setup
echo ------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found on PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found on PATH.
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  )
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo ERROR: Rust cargo was not found. Install Rust or add %%USERPROFILE%%\.cargo\bin to PATH.
  exit /b 1
)

where cl.exe >nul 2>nul
if errorlevel 1 (
  echo NOTE: cl.exe was not found on PATH. Tauri can still build if Visual Studio Build Tools are installed and discoverable by Rust.
)

pushd "%~dp0.."

echo Installing npm dependencies...
call npm install
if errorlevel 1 (
  popd
  exit /b 1
)

echo Checking Rust project...
pushd src-tauri
cargo check
if errorlevel 1 (
  popd
  popd
  exit /b 1
)
popd

if not exist "%APPDATA%\com.local.localkanbanboard" mkdir "%APPDATA%\com.local.localkanbanboard"

echo.
echo Setup complete.
echo Config directory: %APPDATA%\com.local.localkanbanboard
echo The app will ask you to choose a vault folder on first launch.
echo Run scripts\dev.bat to start development mode.

popd
