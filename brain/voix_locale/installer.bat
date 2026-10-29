@echo off
chcp 65001 >nul
title Capri - local voice
rem Optional: the 100% local natural voice (Chatterbox, on the NVIDIA GPU).
rem About 5 GB (PyTorch + the model). Then: hub > Settings > Her voice > "Natural, on your PC".
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
    echo The local voice is already installed.
    pause
    exit /b
)
echo Installing the local voice (several minutes)...
py -3.12 -m venv .venv || goto :error
.venv\Scripts\python -m pip install --upgrade pip -q
.venv\Scripts\pip install -q torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124 || goto :error
.venv\Scripts\pip install -q chatterbox-tts fastapi uvicorn soundfile || goto :error
echo.
echo Local voice installed. Pick it in the hub: Settings ^> Her voice.
pause
exit /b

:error
echo Installation failed, read the message above.
pause
