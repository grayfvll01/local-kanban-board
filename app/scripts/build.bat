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

call npm run build
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
