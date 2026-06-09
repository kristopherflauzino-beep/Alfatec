@echo off
setlocal
cd /d "%~dp0"

if exist "dist\ChamadaDoProfessor.exe" (
  start "" "dist\ChamadaDoProfessor.exe"
) else (
  start "" pythonw "app_desktop.py"
)
