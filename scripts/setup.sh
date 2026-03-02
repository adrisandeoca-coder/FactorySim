#!/bin/bash

echo "========================================"
echo "FactorySim Setup Script"
echo "========================================"
echo

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python is not installed. Please install Python 3.11+ from https://python.org/"
    exit 1
fi

echo "[1/4] Installing Node.js dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Node.js dependencies"
    exit 1
fi

echo
echo "[2/4] Creating Python virtual environment..."
cd python
python3 -m venv venv
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create Python virtual environment"
    exit 1
fi

echo
echo "[3/4] Activating virtual environment and installing Python dependencies..."
source venv/bin/activate
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Python dependencies"
    exit 1
fi

pip install -e .
cd ..

echo
echo "[4/4] Setup complete!"
echo
echo "========================================"
echo "To run FactorySim in development mode:"
echo "  npm run dev"
echo
echo "To build for production:"
echo "  npm run build"
echo "  npm run package"
echo "========================================"
