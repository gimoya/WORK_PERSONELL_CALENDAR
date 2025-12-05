@echo off
cd /d "%~dp0"
REM Local development server for Personnel Planning Calendar
REM Starts a simple HTTP server and opens the app in your browser

echo Starting local development server...
echo Current directory: %CD%
echo.
echo Server will be available at: http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

REM Check if Python is available
python --version >nul 2>&1
if not errorlevel 1 (
    echo Using Python HTTP server...
    echo Starting server on http://localhost:8000
    timeout /t 2 /nobreak >nul
    start http://localhost:8000
    python -m http.server 8000
    goto end
)

REM Check if Node.js is available
echo Python not found. Checking for Node.js...
node --version >nul 2>&1
if not errorlevel 1 (
    echo Using Node.js http-server...
    echo Checking if http-server is installed...
    call npm list -g http-server >nul 2>&1
    if errorlevel 1 (
        echo Installing http-server...
        call npm install -g http-server
    )
    echo Starting server on http://localhost:8000
    timeout /t 2 /nobreak >nul
    start http://localhost:8000
    call http-server -p 8000
    goto end
)

REM Neither found
echo.
echo ERROR: Neither Python nor Node.js found!
echo Please install Python 3 or Node.js to run the local server.
echo.
echo Python: https://www.python.org/downloads/
echo Node.js: https://nodejs.org/
echo.
pause
exit /b 1

:end
pause
