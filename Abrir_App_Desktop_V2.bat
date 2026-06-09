@echo off
setlocal
cd /d "%~dp0"

set "PY312W=C:\Users\Kristopher Cunha\AppData\Local\Programs\Python\Python312\pythonw.exe"

if exist "%PY312W%" (
    start "" "%PY312W%" "app_desktop_v2.py"
) else (
    start "" pythonw "app_desktop_v2.py"
)
