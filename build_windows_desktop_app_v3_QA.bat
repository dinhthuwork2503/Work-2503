@echo off
chcp 65001 > nul
title Build Jordan Task Manager v3 QA

echo ==============================================
echo  Building Jordan Task Manager v3 Cloud Sync QA
echo ==============================================
echo.

where node > nul 2>&1
if errorlevel 1 (
    echo Khong tim thay Node.js.
    echo Neu khong muon cai Node.js tren may ca nhan, hay dung GitHub Actions.
    pause
    exit /b 1
)

echo [1/4] Cai package Electron...
call npm install --no-audit --no-fund

echo.
echo [2/4] Kiem tra syntax...
call node --check src/main.js
call node --check src/preload.js
call node --check src/renderer.js

echo.
echo [3/4] Build EXE / Installer...
call npm run build

echo.
echo [4/4] Hoan tat. File build nam trong thu muc release
pause
