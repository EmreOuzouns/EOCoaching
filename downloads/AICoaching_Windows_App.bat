@echo off
chcp 65001 >NUL
title AICoaching - Windows Desktop Application
echo ========================================================
echo   AICoaching Desktop App Starting...
echo ========================================================

set APP_URL=http://localhost:8090
set LOCAL_SERVER="%~dp0server.py"
set USER_PYTHON="C:\Users\emreo\AppData\Local\Programs\Python\Python315\python.exe"

:: Start background server if server.py exists and port 8090 is not listening
netstat -ano | findstr :8090 >NUL 2>&1
if errorlevel 1 (
    if exist %LOCAL_SERVER% (
        if exist %USER_PYTHON% (
            start "" /b %USER_PYTHON% %LOCAL_SERVER% >NUL 2>&1
        ) else (
            start "" /b python %LOCAL_SERVER% >NUL 2>&1
        )
        timeout /t 2 /nobreak >NUL
    )
)

:: Launch in native borderless desktop app mode (Edge or Chrome)
where msedge >NUL 2>&1
if not errorlevel 1 (
    start "" msedge --app=%APP_URL%
    exit /b 0
)

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL%
    exit /b 0
)

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=%APP_URL%
    exit /b 0
)

start "" %APP_URL%
