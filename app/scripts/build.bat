@echo off
setlocal

where cargo >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  )
)

pushd "%~dp0.."
call npm run build
if errorlevel 1 (
  popd
  exit /b 1
)

echo.
echo Direct executable:
echo %CD%\src-tauri\target\release\local-kanban-word.exe
echo.
echo Windows installer:
echo %CD%\src-tauri\target\release\bundle\nsis\local-kanban-word_0.1.0_x64-setup.exe
popd
