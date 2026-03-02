@echo off
setlocal enabledelayedexpansion

echo ========================================
echo FactorySim Setup Script
echo ========================================
echo.

:: Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."
cd /d "%PROJECT_DIR%"

echo Project directory: %CD%
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed. Please install Python 3.11+ from https://python.org/
    pause
    exit /b 1
)

echo [1/4] Installing Node.js dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Node.js dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Creating Python virtual environment...
cd /d "%PROJECT_DIR%\python"
echo Current directory: %CD%
python -m venv venv
if %errorlevel% neq 0 (
    echo ERROR: Failed to create Python virtual environment
    pause
    exit /b 1
)

echo.
echo [3/4] Installing Python dependencies...
call "%PROJECT_DIR%\python\venv\Scripts\activate.bat"
python -m pip install --upgrade pip
pip install -r "%PROJECT_DIR%\python\requirements.txt"
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

pip install -e "%PROJECT_DIR%\python"
cd /d "%PROJECT_DIR%"

echo.
echo [4/4] Setup complete!
echo.
echo ========================================
echo To run FactorySim in development mode:
echo   npm run dev
echo.
echo To build for production:
echo   npm run build
echo   npm run package
echo ========================================
pause
