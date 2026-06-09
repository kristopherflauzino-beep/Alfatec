@echo off
setlocal
cd /d "%~dp0"

call node "v2\backend\server.js"
