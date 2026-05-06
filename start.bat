@echo off
setlocal
cd /d "%~dp0"
title YouTube Shorts Auto Publisher - Baslat

echo.
echo ========================================
echo YouTube Shorts Auto Publisher baslatiliyor
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo HATA: Node.js bulunamadi.
  echo Lutfen Node.js LTS kur: https://nodejs.org/
  echo Kurduktan sonra bu start.bat dosyasina tekrar cift tikla.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo HATA: npm bulunamadi. Node.js kurulumu bozuk olabilir.
  pause
  exit /b 1
)

if not exist package.json (
  if exist package_local_oauth_refresh.json (
    copy package_local_oauth_refresh.json package.json >nul
  )
)

if not exist node_modules (
  echo Ilk kurulum: npm paketleri yukleniyor...
  call npm install
  if errorlevel 1 (
    echo.
    echo HATA: npm install basarisiz oldu.
    pause
    exit /b 1
  )
) else (
  echo node_modules bulundu, paket kurulumu atlandi.
)

echo.
echo Lokal server ayri pencerede baslatiliyor...
start "YouTube Shorts Local Server" "%~dp0server_runner.bat"

echo Panel aciliyor...
timeout /t 4 /nobreak >nul
start "" "http://localhost:8788/youtubert_LOCAL_REFRESH_TOKEN_READY.html"

echo.
echo Hazir.
echo - Server penceresi acik kalmali.
echo - Panel acilmazsa elle ac: http://localhost:8788/youtubert_LOCAL_REFRESH_TOKEN_READY.html
echo - Transcription URI: http://localhost:8788/transcribe
echo.
pause
