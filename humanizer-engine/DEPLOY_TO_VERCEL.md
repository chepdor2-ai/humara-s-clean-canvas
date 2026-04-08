# 🚀 Vercel Deployment Guide - All Humanizers

## ✅ Pre-Deployment Checklist

All humanizers are now configured with validation post-processing:
- ✅ V1.1 (fast_v11) - 16-phase pipeline with title protection & validation
- ✅ Standard Engine - Main humanizer v3 with chunking support
- ✅ Ghost Mini v1.2 - Academic prose engine with 9-phase pipeline
- ✅ Humara - Stealth humanizer with v5 engine
- ✅ Premium - Advanced humanizer
- ✅ LLM (Ninja/Omega) - AI-powered humanizer
- ✅ Ghost Pro - Professional humanizer

All engines now include:
- Sentence-by-sentence validation
- Auto-repair for truncation and missing sentences
- Word preservation ratio checking (0.5-1.8x)
- Title detection and protection
- Capitalization fixes

## 🎯 Quick Deploy (Recommended)

### Option 1: Vercel Web Dashboard (No Login Issues)

1. **Open Vercel Dashboard**: https://vercel.com/new

2. **Import Repository**:
   - Click "Add New..." → "Project"
   - Select your GitHub repository: `chepdor2-ai/humara-s-clean-canvas`
   - Click "Import"

3. **Configure Project**:
   ```
   Framework Preset: Next.js
   Root Directory: humanizer-engine
   Build Command: cd frontend && npm install && npm run build
   Output Directory: frontend/.next
   Install Command: cd frontend && npm install
   ```

4. **Environment Variables**:
   Click "Environment Variables" and add:
   
   ```env
   # Required for LLM humanizers (Ninja, Omega)
   OPENAI_API_KEY=your_openai_api_key_here
   LLM_MODEL=gpt-4o-mini
   
   # Supabase (optional - for user management)
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   
   # Payment (optional - for subscriptions)
   PAYSTACK_SECRET_KEY=your_paystack_secret_key
   
   # Admin access (optional)
   ADMIN_EMAILS=your-email@example.com
   ```

5. **Deploy**: Click "Deploy" and wait 2-5 minutes

6. **Verify**: Your app will be live at `https://your-project-name.vercel.app`

### Option 2: PowerShell Script (Automated)

```powershell
cd "c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas\humanizer-engine"

# Run deployment script
.\deploy-vercel.ps1
```

The script will:
- Install dependencies
- Build the frontend
- Validate API endpoints
- Deploy to Vercel (preview or production)

### Option 3: Vercel CLI (Manual)

```powershell
cd "c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas\humanizer-engine"

# Login to Vercel (one-time)
npx vercel login

# Deploy to preview
npx vercel

# Deploy to production
npx vercel --prod
```

## 📡 API Endpoints

After deployment, these endpoints will be available:

### 1. Humanize Endpoint
```
POST https://your-app.vercel.app/api/humanize
```

**Request Body**:
```json
{
  "text": "Your AI-generated text here",
  "engine": "fast_v11",
  "tone": "academic",
  "strength": "medium",
  "depth": "medium",
  "strict_meaning": true,
  "premium": false
}
```

**Supported Engines**:
- `fast_v11` - V1.1 16-phase pipeline (fastest, most reliable)
- `engine` or `standard` - Main humanizer v3
- `ghost_mini` or `nuru` - Academic prose engine
- `humara` - Stealth humanizer
- `ninja` or `omega` or `llm` - AI-powered (requires OpenAI API key)
- `premium` - Advanced humanizer
- `ghost_pro` - Professional humanizer

**Response**:
```json
{
  "humanized": "Humanized text with all sentences intact",
  "original": "Your AI-generated text...",
  "word_count": 150,
  "engine_used": "fast_v11",
  "metadata": {
    "processing_time_ms": 1234,
    "original_words": 150,
    "humanized_words": 152,
    "original_sentences": 8,
    "humanized_sentences": 8,
    "sentence_count_preserved": true,
    "validation": {
      "passed": true,
      "repaired": false,
      "stats": {
        "originalSentences": 8,
        "processedSentences": 8,
        "originalWords": 150,
        "processedWords": 152,
        "preservationRatio": 1.01
      }
    }
  }
}
```

### 2. Detection Endpoint
```
POST https://your-app.vercel.app/api/detect
```

**Request Body**:
```json
{
  "text": "Text to check for AI detection"
}
```

### 3. Health Check
```
GET https://your-app.vercel.app/api/health
```

## 🧪 Testing After Deployment

### Test All Humanizers

```powershell
# Test fast_v11
$body = @{
    text = "This is a test sentence to verify the humanizer works correctly."
    engine = "fast_v11"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://your-app.vercel.app/api/humanize" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

# Test ghost_mini
$body = @{
    text = "Academic text for testing the ghost mini engine."
    engine = "ghost_mini"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://your-app.vercel.app/api/humanize" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body

# Test humara
$body = @{
    text = "Professional text for testing the humara engine."
    engine = "humara"
    tone = "professional"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://your-app.vercel.app/api/humanize" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

## 🔧 Troubleshooting

### Build Fails

**Error**: `Cannot find module '../frontend/lib/...'`

**Solution**: Ensure the `root directory` in Vercel is set to `humanizer-engine`

---

**Error**: `ENOENT: no such file or directory`

**Solution**: Check that all imports in `api/humanize.ts` point to existing files

---

### API Returns 500 Error

**Error**: `Humanization engine failed`

**Solution**: 
1. Check Vercel function logs in dashboard
2. Verify all humanizer modules are correctly imported
3. Ensure validation modules are present

---

### Timeout Errors

**Error**: `Function execution timed out`

**Solution**: The `vercel.json` already sets `maxDuration: 300` (5 minutes). If still timing out:
1. Use faster engines (fast_v11, ghost_mini)
2. Split large texts into chunks
3. Increase function memory in `vercel.json`

---

### Missing Environment Variables

**Error**: `OpenAI API key not found`

**Solution**: 
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `OPENAI_API_KEY`
3. Redeploy the project

## 📊 Performance

Expected processing times on Vercel:

| Engine | ~500 words | ~1000 words | ~2000 words |
|--------|-----------|-------------|-------------|
| fast_v11 | 2-4s | 5-8s | 10-15s |
| ghost_mini | 1-3s | 3-6s | 8-12s |
| humara | 2-5s | 6-10s | 12-20s |
| standard | 3-6s | 8-15s | 20-30s |
| llm (ninja/omega) | 10-20s | 25-45s | 60-90s |

*All engines include validation overhead (~0.5-1s)*

## 🔄 Continuous Deployment

Every push to `main` branch will automatically trigger a new deployment.

To deploy only specific commits:
1. Use a separate branch for development
2. Merge to `main` when ready to deploy
3. Or disable auto-deploy in Vercel settings

## 🌐 Custom Domain

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain (e.g., `humanize.yourdomain.com`)
3. Update DNS records as instructed
4. Wait for DNS propagation (<1 hour)

## ✅ Post-Deployment Verification

- [ ] Homepage loads
- [ ] All humanizer engines work (test each one)
- [ ] API endpoints return proper JSON responses
- [ ] Validation is working (check metadata.validation in response)
- [ ] No title duplication
- [ ] No paragraph truncation
- [ ] Proper capitalization
- [ ] Error handling works (test with empty text, etc.)

## 🎉 You're Live!

All humanizers are now deployed and running on Vercel with:
- ✅ Sentence-by-sentence validation
- ✅ Auto-repair for quality issues
- ✅ Title protection
- ✅ No truncation
- ✅ Proper capitalization
- ✅ Word preservation checking

Share your URL: `https://your-project-name.vercel.app` 🚀
