#!/usr/bin/env pwsh
# Vercel Deployment Script for Humara Humanizer
# Ensures all humanizers are built and deployed correctly

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Humara Humanizer - Vercel Deploy" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the correct directory
if (-not (Test-Path "frontend/package.json")) {
    Write-Host "ERROR: Must run from humanizer-engine directory" -ForegroundColor Red
    exit 1
}

# Step 1: Install dependencies
Write-Host "[1/5] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend dependency installation failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

# Step 2: Build frontend
Write-Host "[2/5] Building Next.js frontend..." -ForegroundColor Yellow
Set-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend build failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

# Step 3: Validate API endpoints
Write-Host "[3/5] Validating API endpoints..." -ForegroundColor Yellow
$apiFiles = @("api/humanize.ts", "api/detect.ts", "api/health.ts")
foreach ($file in $apiFiles) {
    if (-not (Test-Path $file)) {
        Write-Host "WARNING: $file not found" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ $file" -ForegroundColor Green
    }
}

# Step 4: Check validation modules
Write-Host "[4/5] Checking validation modules..." -ForegroundColor Yellow
$validationFiles = @(
    "frontend/lib/engine/validation-post-process.ts",
    "../validation_post_process.py"
)
foreach ($file in $validationFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file MISSING" -ForegroundColor Red
    }
}

# Step 5: Deploy to Vercel
Write-Host "[5/5] Deploying to Vercel..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Choose deployment type:" -ForegroundColor Cyan
Write-Host "  1) Preview deployment (test)" -ForegroundColor White
Write-Host "  2) Production deployment" -ForegroundColor White
Write-Host ""
$choice = Read-Host "Enter choice (1 or 2)"

if ($choice -eq "2") {
    Write-Host ""
    Write-Host "Deploying to PRODUCTION..." -ForegroundColor Magenta
    npx vercel --prod
} else {
    Write-Host ""
    Write-Host "Deploying to PREVIEW..." -ForegroundColor Cyan
    npx vercel
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "  ✓ Deployment Successful!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "All humanizers are now live:" -ForegroundColor White
    Write-Host "  • V1.1 (fast_v11) - 16-phase pipeline with validation" -ForegroundColor Gray
    Write-Host "  • Standard Engine - Main humanizer v3" -ForegroundColor Gray
    Write-Host "  • Ghost Mini v1.2 - Academic prose engine" -ForegroundColor Gray
    Write-Host "  • Humara - Stealth humanizer" -ForegroundColor Gray
    Write-Host "  • Premium - Advanced humanizer" -ForegroundColor Gray
    Write-Host "  • LLM (Ninja/Omega) - AI-powered humanizer" -ForegroundColor Gray
    Write-Host "  • Ghost Pro - Professional humanizer" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Red
    Write-Host "  ✗ Deployment Failed" -ForegroundColor Red
    Write-Host "==================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  1. Not logged in to Vercel: Run 'npx vercel login'" -ForegroundColor Gray
    Write-Host "  2. Missing environment variables in Vercel dashboard" -ForegroundColor Gray
    Write-Host "  3. Build errors - check the error messages above" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
