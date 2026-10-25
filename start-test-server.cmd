@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-test-server.ps1" %*
set "serverExitCode=%ERRORLEVEL%"
if "%serverExitCode%"=="0" goto finished
echo.
echo Test server stopped with exit code %serverExitCode%.
pause
:finished
exit /b %serverExitCode%
