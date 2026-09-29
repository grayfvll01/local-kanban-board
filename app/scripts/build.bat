@echo off
setlocal

where cargo >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  )
)

pushd "%~dp0.."
call npm run version:check
if errorlevel 1 (
  popd
  exit /b 1
)

if defined TAURI_SIGNING_PRIVATE_KEY (
  call npm run build
) else (
  echo NOTE: TAURI_SIGNING_PRIVATE_KEY is not set, so this local build is not signed for updates.
  call npx tauri build --config src-tauri/tauri.unsigned.conf.json
)
if errorlevel 1 (
  popd
  exit /b 1
)

echo.
echo Direct executable:
echo %CD%\src-tauri\target\release\local-kanban.exe
echo.
echo Windows installer:
for /f "delims=" %%V in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%V"
echo %CD%\src-tauri\target\release\bundle\nsis\Local Kanban_%APP_VERSION%_x64-setup.exe
popd
