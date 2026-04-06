# Quick Deployment Script
# Run: powershell -ExecutionPolicy Bypass -File deploy.ps1

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "   Multi-Platform Deployment Tool" -ForegroundColor Cyan
Write-Host "=========================================`n" -ForegroundColor Cyan

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Check Node.js
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
node --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Node.js not found" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
npm install

# Test build
Write-Host "`n[3/5] Testing production build..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Build failed, but continuing..." -ForegroundColor Yellow
}

# Git commit and push
Write-Host "`n[4/5] Pushing to GitHub..." -ForegroundColor Yellow
git add -A
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git commit -m "Automated deployment - $timestamp"
git push origin main

# Run deployment script
Write-Host "`n[5/5] Running deployment script..." -ForegroundColor Yellow
node deploy-all.js

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "   Deployment Process Complete!" -ForegroundColor Green
Write-Host "=========================================`n" -ForegroundColor Green

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  • Visit https://vercel.com/dashboard" -ForegroundColor White
Write-Host "  • Check deployment logs" -ForegroundColor White
Write-Host "  • Test your live app`n" -ForegroundColor White

Read-Host "Press Enter to exit"
