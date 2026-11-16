@echo off
title EOCoaching v2 — SQLite Server
echo ==================================================
echo   EOCoaching v2 Server Starting...
echo   Storage Engine: SQLite + Hybrid Offline Engine
echo ==================================================

set USER_PYTHON="C:\Users\emreo\AppData\Local\Programs\Python\Python315\python.exe"

:: Open browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak > NUL && start http://localhost:8090"

:: Start server
if exist %USER_PYTHON% (
    %USER_PYTHON% server.py
) else (
    python server.py
)
pause
