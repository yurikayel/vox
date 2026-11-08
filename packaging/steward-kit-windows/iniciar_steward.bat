@echo off
title Vox Steward Kit (Relay + PWA)
cd /d "%~dp0\..\.."
echo ======================================================
echo   Iniciando Vox Steward Kit...
echo ======================================================
python packaging\steward-kit-windows\steward_launcher.py
pause
