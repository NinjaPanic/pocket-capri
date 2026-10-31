@echo off
chcp 65001 >nul
title Découpe de Capri
rem Découpe en cliquant (Segment Anything 2). Ouvre la page dans ton navigateur une fois SAM chargé.
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
    echo Installation de SAM 2 - quelques minutes, la premiere fois seulement...
    py -3.12 -m venv .venv || goto :error
    .venv\Scripts\python -m pip install -q --upgrade pip
    .venv\Scripts\python -m pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu124 || goto :error
    set SAM2_BUILD_CUDA=0
    .venv\Scripts\python -m pip install -q sam2 huggingface_hub fastapi uvicorn pillow numpy python-multipart || goto :error
)
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://127.0.0.1:8790"
.venv\Scripts\python server.py %*
pause
exit /b

:error
echo Installation ratee : lis le message ci-dessus.
pause
