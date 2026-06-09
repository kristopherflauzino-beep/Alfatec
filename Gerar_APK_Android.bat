@echo off
setlocal
cd /d "%~dp0"

echo Gerando APK Android instalavel pelo EAS Build...
echo Esse APK abre no celular sem depender do Expo Go depois de instalado.
echo Se for a primeira vez, o EAS pode pedir login na conta Expo.

call npx eas build -p android --profile preview
