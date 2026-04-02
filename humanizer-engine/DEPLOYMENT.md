# Ghost Humanizer Engine - Vercel Deployment Guide

🚀 **Production-Ready Deployment Configuration**

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build static files
npm run build

# 3. Test locally
npm run dev

# 4. Deploy to Vercel
npm run deploy
```

## 📁 Project Structure

```
humanizer-engine/
├── api/                    # TypeScript Serverless Functions
│   ├── humanize.ts        # POST /api/humanize
│   ├── detect.ts          # POST /api/detect  
│   └── health.ts          # GET /api/health
├── public/                # Static files (CDN-served)
│   └── *.html            # All website pages
├── python-backup/         # Original Python backend
│   ├── main.py           # FastAPI server
│   ├── humanizer.py      # Core logic
│   └── ...               # All Python modules
├── scripts/
│   └── build.js          # Build automation
├── vercel.json           # Deployment config
├── package.json          # Dependencies
└── tsconfig.json         # TypeScript config
```

## 🌐 Live URLs

After deployment:
- Landing: `https://your-project.vercel.app`
- App: `https://your-project.vercel.app/app`
- API: `https://your-project.vercel.app/api/*`

## 🔧 Environment Setup

In Vercel Dashboard → Settings → Environment Variables:

```env
OPENAI_API_KEY=sk-...
NODE_ENV=production
PYTHON_SERVICE_URL=https://...  # If using Python microservice
```

## 🐍 Python Integration Options

### Option A: Keep Python Separate (Recommended)
Deploy Python on Railway/Render, call from TypeScript API.

### Option B: Migrate to TypeScript
Port Python humanizer logic to TypeScript/WASM.

### Option C: Hybrid
Use Vercel's Python runtime (beta) for critical functions.

---

For full docs, see README.md
