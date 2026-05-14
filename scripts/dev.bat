@echo off
setlocal

where cargo >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
  )
)

pushd "%~dp0.."
call npm run dev
set EXITCODE=%ERRORLEVEL%
popd
exit /b %EXITCODE%
