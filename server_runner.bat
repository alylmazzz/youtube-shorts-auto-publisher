@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo YouTube Shorts Local Server calisiyor
echo ========================================
echo.
echo Panel: http://localhost:8788/youtubert_LOCAL_REFRESH_TOKEN_READY.html
echo Transcription endpoint: http://localhost:8788/transcribe
echo OAuth endpoint: http://localhost:8788/api/local-oauth/token
echo.
echo Bu pencere acik kalmali. Kapatirsan otomasyon durur.
echo.
npm start
echo.
echo Server kapandi.
pause
