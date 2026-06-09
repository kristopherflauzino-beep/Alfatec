@echo off
setlocal
cd /d "%~dp0"

set EXPO_NO_TELEMETRY=1

for /f %%P in ('powershell -NoProfile -Command "$ports=8081..8100; $used=@(); try { $used = Get-NetTCPConnection -State Listen -ErrorAction Stop | Select-Object -ExpandProperty LocalPort } catch { }; $free = ($ports | Where-Object { $_ -notin $used } | Select-Object -First 1); if (-not $free) { $free = 8101 }; Write-Output $free"') do set EXPO_PORT=%%P
for /f %%I in ('powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | Sort-Object SkipAsSource, InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress; if (-not $ip) { $ip = '127.0.0.1' }; Write-Output $ip"') do set EXPO_IP=%%I
set REACT_NATIVE_PACKAGER_HOSTNAME=%EXPO_IP%

echo Iniciando o app Android em modo LAN na porta %EXPO_PORT%...
echo O computador e o smartphone precisam estar na mesma rede Wi-Fi.
echo Abra o Expo Go no celular e escaneie o QR Code quando ele aparecer.
echo Se o Expo Go nao estiver instalado, instale primeiro no smartphone.
echo Se precisar abrir manualmente no Expo Go, use: exp://%EXPO_IP%:%EXPO_PORT%
call npx expo start --lan --clear --port %EXPO_PORT%
