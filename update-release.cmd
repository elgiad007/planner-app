@echo off
setlocal
rem Keep the window open even if PowerShell cannot start the script.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-release.ps1" -NoPause
set "releaseExitCode=%ERRORLEVEL%"
echo.
if not "%releaseExitCode%"=="0" echo Release update failed with exit code %releaseExitCode%.
if /I "%~1"=="-NoPause" goto finished
echo Review the results above before closing this window.
pause
:finished
exit /b %releaseExitCode%
