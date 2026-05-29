@echo off
setlocal
cd /d "%~dp0"
title V-Max Launcher

echo.
echo ==============================
echo   Starting V-Max...
echo ==============================
echo.
echo Close this window or press Ctrl+C to stop V-Max.
echo.

call npm start

echo.
echo V-Max stopped.
pause
