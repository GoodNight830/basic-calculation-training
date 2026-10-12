@echo off
rem ============================================================
rem  Basic Calculation Training - one-click launcher
rem
rem  Double-click this file to start the dev server.
rem  Optional argument (one of): dev / build / preview / test / check
rem     start.bat check     only inspect the environment
rem     start.bat preview   build + local production preview
rem     start.bat dev       dev server (default)
rem
rem  NOTE: keep this file ASCII-only. cmd.exe mis-parses batch
rem  files that mix UTF-8 text with a code page switch, so all
rem  Chinese output lives in .tools\start.ps1 (UTF-8 with BOM).
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File ".tools\start.ps1" %*
set "CODE=%ERRORLEVEL%"

echo.
pause
exit /b %CODE%
