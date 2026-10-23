@echo off
cd /d "%~dp0"
echo ==========================================
echo  CineAIros - Monkey Testing Automatizado
echo ==========================================
echo.

REM Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python no encontrado. Instala Python 3.10+
    pause
    exit /b 1
)

REM Verificar/crear entorno virtual
if not exist venv (
    echo 📦 Creando entorno virtual...
    python -m venv venv
)

REM Activar venv e instalar dependencias
call venv\Scripts\activate.bat
echo 📥 Instalando dependencias...
pip install -q -r requirements.txt

echo 🎭 Instalando Playwright browsers...
playwright install chromium

echo.
echo 🚀 Ejecutando Monkey Test...
echo.
python tests/monkey_test.py
if errorlevel 1 (
    echo.
    echo ❌ El Monkey Test ha fallado. Revisa el error anterior.
    pause
    exit /b 1
)

echo.
echo ✅ Completado. Revisa la carpeta results/
pause