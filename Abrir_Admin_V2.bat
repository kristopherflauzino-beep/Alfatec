@echo off
setlocal
cd /d "%~dp0"

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open_admin_v2.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel abrir a Central Admin V2 automaticamente.
  echo Tente acessar manualmente em:
  echo http://127.0.0.1:8787/admin/
  echo.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8787/admin/"
