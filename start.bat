@echo off
color 0A
cls
echo.
echo ========================================
echo    ISHG Bot - Startup Script
echo ========================================
echo.
echo Memulai mesin AI Ollama...
start "Ollama AI Engine" cmd /c "ollama run qwen3:8b"
timeout /t 5 /nobreak >nul
echo Menyalakan server Bot Telegram...
echo.
npm run dev
pause
