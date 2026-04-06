@echo off
echo =========================================
echo    Multi-Platform Deployment Tool
echo =========================================
echo.

cd /d "%~dp0"

echo [1/5] Checking Node.js...
node --version || (
    echo ERROR: Node.js not found
    exit /b 1
)

echo [2/5] Installing dependencies...
call npm install

echo [3/5] Testing build...
call npm run build

echo [4/5] Committing to Git...
git add -A
git commit -m "Automated deployment - %date% %time%"
git push origin main

echo [5/5] Running deployment script...
node deploy-all.js

echo.
echo =========================================
echo    Deployment Complete!
echo =========================================
echo.
echo Next: Visit https://vercel.com/dashboard
echo.
pause
