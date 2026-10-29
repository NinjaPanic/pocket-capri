@echo off
chcp 65001 >nul
title Capri
rem Start Capri with Capri.vbs (no window, just her icon next to the clock).
rem This file installs everything the first time, then starts the avatar, which starts Ollama and her brain.

rem --- Ollama (runs her model) -----------------------------------------------------
if not exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    echo Ollama is not installed. Get it from https://ollama.com/download then run this file again.
    start "" https://ollama.com/download
    pause
    exit /b
)

rem --- Brain (Python 3.12) ---------------------------------------------------------
cd /d "%~dp0brain"
if not exist .venv\Scripts\python.exe (
    echo Installing her brain - a few minutes, first time only...
    py -3.12 -m venv .venv || goto :error
    .venv\Scripts\python -m pip install --upgrade pip -q
    .venv\Scripts\python -m pip install -r requirements.txt -q || goto :error
)

rem --- Offline voice (Kokoro) ---------------------------------------------------------
if not exist models\kokoro-v1.0.int8.onnx (
    echo Downloading the offline voice...
    if not exist models mkdir models
    curl -L -o models\kokoro-v1.0.int8.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx || goto :error
    curl -L -o models\voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin || goto :error
)

rem --- Ollama models: the one that talks and sees, and the memory one ------------------
rem (checked on disk: Ollama is stopped when Capri quits, and "ollama list" needs it running)
set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
set "MODELS=%USERPROFILE%\.ollama\models\manifests\registry.ollama.ai\library"
set NEED=
if not exist "%MODELS%\qwen3-vl\8b-instruct" set NEED=1
if not exist "%MODELS%\nomic-embed-text\latest" set NEED=1
if defined NEED (
    curl -s http://127.0.0.1:11434/api/version >nul 2>&1 || start "" /B "%OLLAMA%" serve
    timeout /t 5 /nobreak >nul
    echo Downloading her models - about 6 GB, first time only...
    "%OLLAMA%" pull qwen3-vl:8b-instruct || goto :error
    "%OLLAMA%" pull nomic-embed-text || goto :error
)

rem --- Avatar (Node.js) ------------------------------------------------------------
cd /d "%~dp0body"
if not exist node_modules (
    echo Installing her avatar - first time only...
    call npm ci --no-audit --no-fund || goto :error
)

call node scripts\build.mjs >nul || goto :error
start "" "%~dp0body\node_modules\electron\dist\electron.exe" "%~dp0body"
exit /b

:error
echo.
echo Installation failed. Read the message above (or open a GitHub issue with it).
pause
