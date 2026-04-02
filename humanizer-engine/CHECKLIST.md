# Vercel Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. File Structure
- [x] `/api/*.ts` - TypeScript serverless functions created
- [x] `/public/*.html` - Static files copied from /static
- [x] `/python-backup/*.py` - Python files backed up
- [x] `/scripts/build.js` - Build script created
- [x] `vercel.json` - Deployment configuration
- [x] `package.json` - Node.js dependencies
- [x] `tsconfig.json` - TypeScript configuration
- [x] `.vercelignore` - Ignore rules
- [x] `.gitignore` - Git ignore rules

### 2. Configuration Files

#### vercel.json
- [x] Static build configuration
- [x] Route rewrites for SPA-style routing
- [x] Security headers configured
- [x] API routes mapped

#### package.json
- [x] Build script: `npm run build`
- [x] Dev script: `npm run dev`
- [x] Deploy script: `npm run deploy`
- [x] Dependencies listed

### 3. API Endpoints

- [x] `/api/humanize.ts` - Text humanization endpoint
- [x] `/api/detect.ts` - AI detection endpoint
- [x] `/api/health.ts` - Health check endpoint

### 4. Static Pages

- [x] `index.html` - Landing page
- [x] `app.html` - Humanizer application
- [x] `login.html` - Login page
- [x] `signup.html` - Registration page
- [x] `reset-password.html` - Password reset
- [x] `pricing.html` - Pricing page
- [x] `about.html` - About page
- [x] `how-it-works.html` - How it works
- [x] `terms.html` - Terms of service
- [x] `privacy.html` - Privacy policy
- [x] `404.html` - Error page
- [x] `detector.html` - AI detector page

## 🚀 Deployment Steps

### Step 1: Install Dependencies
```bash
cd "e:\Websites\Humanizer Engine\humanizer-engine"
npm install
```

### Step 2: Test Build
```bash
npm run build
```
Expected output: "✓ Build complete!"

### Step 3: Test Locally
```bash
npm run dev
```
Visit: http://localhost:3000

### Step 4: Login to Vercel
```bash
vercel login
```

### Step 5: Link Project
```bash
vercel link
```
- Create new project or link existing
- Confirm project settings

### Step 6: Deploy Preview
```bash
vercel
```
Get a preview URL to test

### Step 7: Deploy Production
```bash
vercel --prod
# or
npm run deploy
```

## 🔧 Post-Deployment

### 1. Configure Environment Variables
In Vercel Dashboard → Settings → Environment Variables:
```
OPENAI_API_KEY=sk-...
NODE_ENV=production
```

### 2. Test All Pages
- [ ] https://your-domain.vercel.app/
- [ ] https://your-domain.vercel.app/app
- [ ] https://your-domain.vercel.app/login
- [ ] https://your-domain.vercel.app/api/health

### 3. Test API Endpoints
```bash
# Health check
curl https://your-domain.vercel.app/api/health

# Humanize (mock)
curl -X POST https://your-domain.vercel.app/api/humanize \
  -H "Content-Type: application/json" \
  -d '{"text":"Test text","engine":"ghost_mini"}'

# Detect (mock)
curl -X POST https://your-domain.vercel.app/api/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"Test text"}'
```

### 4. Configure Custom Domain (Optional)
- Vercel Dashboard → Domains
- Add custom domain
- Configure DNS records

### 5. Enable Analytics
- Vercel Dashboard → Analytics
- Enable Web Analytics
- Monitor performance

## 🐍 Python Backend Integration

### Current Status: Mock Data
TypeScript APIs return mock responses for demonstration.

### Integration Options:

#### Option A: Python Microservice (Recommended)
1. Deploy Python backend to Railway/Render
   ```bash
   cd python-backup
   railway login
   railway up
   ```

2. Update TypeScript API to call Python service
   ```typescript
   // In api/humanize.ts
   const pythonUrl = process.env.PYTHON_SERVICE_URL;
   const response = await fetch(`${pythonUrl}/api/humanize`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ text, engine })
   });
   ```

3. Set environment variable in Vercel
   ```
   PYTHON_SERVICE_URL=https://your-railway-app.railway.app
   ```

#### Option B: Serverless Python on Vercel
1. Create `api/python/` directory
2. Add Python files with `VercelRequest`/`VercelResponse`
3. Vercel auto-detects and runs Python runtime

#### Option C: WebAssembly
1. Compile Python to WASM using PyScript/Pyodide
2. Run in edge functions
3. Best performance but complex setup

## 📊 Monitoring

### Vercel Dashboard
- Function logs
- Analytics
- Performance metrics
- Error tracking

### Custom Monitoring
Add logging in TypeScript:
```typescript
console.log('[API] Request received:', { text: text.substring(0, 50) });
```

View with:
```bash
vercel logs --follow
```

## 🔄 Updates & Redeploy

### Code Changes
```bash
# Make changes to files
git add .
git commit -m "Update feature"
git push

# Or manual deploy
vercel --prod
```

### Automatic Deployments
Connect Vercel to your Git repository for automatic deployments on push.

## ⚠️ Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
vercel --force
```

### Function Timeout
Increase in `vercel.json`:
```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 10
    }
  }
}
```

### Memory Issues
Upgrade Vercel plan or optimize function code.

## 📚 Resources

- [Vercel Docs](https://vercel.com/docs)
- [Vercel CLI](https://vercel.com/docs/cli)
- [Serverless Functions](https://vercel.com/docs/functions)
- [Environment Variables](https://vercel.com/docs/environment-variables)

---

**Status**: ✅ Ready for deployment
**Last Updated**: April 1, 2026
