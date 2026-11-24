@echo off
title YuklaSmartBot - avto-start ornatish
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-autostart.ps1"
echo.
pause
