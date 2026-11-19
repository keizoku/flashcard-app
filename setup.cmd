@echo off
rem Flashcard app setup for Windows (runs setup.ps1). See docs/setup.md
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set RESULT=%ERRORLEVEL%
echo.
pause
exit /b %RESULT%
