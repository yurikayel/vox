@echo off
echo ========================================================
echo   Executando Testes Unitarios Locais do Vox (Fase 3.2)
echo ========================================================
echo.
echo [1/2] Executando testes unitarios do Cliente JS (node:test)...
call node --test tests/*.test.js
if %errorlevel% neq 0 (
    echo [ERRO] Falha nos testes do cliente JS!
    exit /b %errorlevel%
)

echo.
echo [2/2] Executando testes unitarios do Relay/Signaling Python (unittest)...
call python -m unittest discover -s relay -p "test_*.py"
if %errorlevel% neq 0 (
    echo [ERRO] Falha nos testes do relay Python!
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo   TODOS OS TESTES UNITARIOS PASSARAM COM SUCESSO!
echo ========================================================
