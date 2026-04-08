#!/usr/bin/env pwsh
# One-Click Vercel Deployment
# Opens Vercel import page pre-configured for this repository

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Quick Deploy to Vercel" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Repository details
$repoOwner = "chepdor2-ai"
$repoName = "humara-s-clean-canvas"
$repoUrl = "https://github.com/$repoOwner/$repoName"

Write-Host "Repository: $repoUrl" -ForegroundColor Green
Write-Host "Root Directory: humanizer-engine" -ForegroundColor Green
Write-Host ""

# Open Vercel import page
Write-Host "Opening Vercel deployment page..." -ForegroundColor Yellow
Write-Host ""

# Method 1: Direct import URL
$importUrl = "https://vercel.com/new/clone?repository-url=$repoUrl&root-directory=humanizer-engine"
Start-Process $importUrl

Write-Host "Browser opened with pre-configured settings!" -ForegroundColor Green
Write-Host ""
Write-Host "In the Vercel page that just opened:" -ForegroundColor Cyan
Write-Host "  1. Connect your GitHub account (if not already)" -ForegroundColor White
Write-Host "  2. Click 'Import' for the repository" -ForegroundColor White
Write-Host "  3. Verify settings:" -ForegroundColor White
Write-Host "     - Root Directory: humanizer-engine" -ForegroundColor Gray
Write-Host "     - Framework: Next.js (auto-detected)" -ForegroundColor Gray
Write-Host "  4. Click 'Deploy' button" -ForegroundColor White
Write-Host ""
Write-Host "Advanced Settings (Optional):" -ForegroundColor Yellow
Write-Host "  Build Command: cd frontend && npm install && npm run build" -ForegroundColor Gray
Write-Host "  Install Command: cd frontend && npm install" -ForegroundColor Gray
Write-Host "  Output Directory: frontend/.next" -ForegroundColor Gray
Write-Host ""
Write-Host "Environment Variables (Optional - only for LLM engines):" -ForegroundColor Yellow
Write-Host "  OPENAI_API_KEY - For AI-powered engines (ninja, omega)" -ForegroundColor Gray
Write-Host "  LLM_MODEL - gpt-4o-mini (recommended)" -ForegroundColor Gray
Write-Host ""
Write-Host "All 7 humanizers will be deployed:" -ForegroundColor Cyan
Write-Host "  ✓ V1.1 (fast_v11) - 16-phase with validation" -ForegroundColor Green
Write-Host "  ✓ Standard (engine) - Main humanizer v3" -ForegroundColor Green
Write-Host "  ✓ Ghost Mini (ghost_mini/nuru) - Academic" -ForegroundColor Green
Write-Host "  ✓ Humara - Stealth engine" -ForegroundColor Green
Write-Host "  ✓ Premium - Advanced humanizer" -ForegroundColor Green
Write-Host "  ✓ LLM (ninja/omega) - AI-powered" -ForegroundColor Green
Write-Host "  ✓ Ghost Pro - Professional" -ForegroundColor Green
Write-Host ""
Write-Host "Deployment will take 3-5 minutes..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Ready to Deploy! Check your browser" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
