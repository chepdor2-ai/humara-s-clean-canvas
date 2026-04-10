<#
.SYNOPSIS
  Deploy Oxygen T5 Humanizer to Google Cloud Run.

.DESCRIPTION
  Builds a Docker image, pushes it to Google Artifact Registry, and deploys to Cloud Run.
  
  Prerequisites:
    1. Install Google Cloud CLI: https://cloud.google.com/sdk/docs/install
    2. Run: gcloud auth login
    3. Run: gcloud config set project YOUR_PROJECT_ID
    4. Enable APIs: gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com

.PARAMETER ProjectId
  Your GCP project ID.

.PARAMETER Region
  Cloud Run region (default: us-central1).

.PARAMETER ApiSecret
  Bearer token secret for the /humanize endpoint.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,

    [string]$Region = "us-central1",

    [string]$ApiSecret = ""
)

$ErrorActionPreference = "Stop"
$ServiceName = "oxygen-humanizer"
$RepoName = "oxygen-repo"
$ImageTag = "$Region-docker.pkg.dev/$ProjectId/$RepoName/$ServiceName"

# ── 0. Paths ──
$RootDir = Split-Path -Parent $PSScriptRoot
$CloudRunDir = $PSScriptRoot

Write-Host "=== Oxygen T5 → Google Cloud Run ===" -ForegroundColor Cyan
Write-Host "Project : $ProjectId"
Write-Host "Region  : $Region"
Write-Host "Service : $ServiceName"
Write-Host ""

# ── 1. Copy source files into cloud-run/ build context ──
Write-Host "Copying source files..." -ForegroundColor Yellow
Copy-Item "$RootDir\oxygen_server.py"          "$CloudRunDir\oxygen_server.py"    -Force
Copy-Item "$RootDir\validation_post_process.py" "$CloudRunDir\validation_post_process.py" -Force
if (Test-Path "$RootDir\oxygen-model") {
    Copy-Item "$RootDir\oxygen-model" "$CloudRunDir\oxygen-model" -Recurse -Force
}

# ── 2. Create Artifact Registry repo (idempotent) ──
Write-Host "Ensuring Artifact Registry repo exists..." -ForegroundColor Yellow
gcloud artifacts repositories create $RepoName `
    --repository-format=docker `
    --location=$Region `
    --description="Oxygen T5 Humanizer images" `
    --quiet 2>$null

# ── 3. Build with Cloud Build ──
Write-Host "Building Docker image via Cloud Build..." -ForegroundColor Yellow
gcloud builds submit $CloudRunDir `
    --tag $ImageTag `
    --timeout=1800 `
    --machine-type=e2-highcpu-8 `
    --quiet

# ── 4. Deploy to Cloud Run ──
Write-Host "Deploying to Cloud Run..." -ForegroundColor Yellow
$envVars = ""
if ($ApiSecret) {
    $envVars = "--set-env-vars=GCR_API_SECRET=$ApiSecret"
}

$deployCmd = @(
    "gcloud", "run", "deploy", $ServiceName,
    "--image", $ImageTag,
    "--region", $Region,
    "--platform", "managed",
    "--memory", "2Gi",
    "--cpu", "2",
    "--timeout", "300",
    "--concurrency", "10",
    "--min-instances", "0",
    "--max-instances", "1",
    "--allow-unauthenticated",
    "--quiet"
)
if ($envVars) { $deployCmd += $envVars }

& $deployCmd[0] $deployCmd[1..($deployCmd.Length-1)]

# ── 5. Get URL ──
$url = gcloud run services describe $ServiceName --region $Region --format "value(status.url)" 2>$null
Write-Host ""
Write-Host "=== DEPLOYED ===" -ForegroundColor Green
Write-Host "URL: $url"
Write-Host ""
Write-Host "Set this in your frontend .env.local:" -ForegroundColor Cyan
Write-Host "  T5_API_URL_BACKUP=$url"
Write-Host "  T5_API_KEY_BACKUP=<your GCR_API_SECRET>"
Write-Host ""

# ── 6. Cleanup copied files ──
Remove-Item "$CloudRunDir\oxygen_server.py" -ErrorAction SilentlyContinue
Remove-Item "$CloudRunDir\validation_post_process.py" -ErrorAction SilentlyContinue
Remove-Item "$CloudRunDir\oxygen-model" -Recurse -ErrorAction SilentlyContinue

Write-Host "Done!" -ForegroundColor Green
