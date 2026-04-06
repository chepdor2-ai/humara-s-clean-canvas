# Vercel Deployment Guide

## Quick Deployment via GitHub Integration (Recommended)

### Step 1: Push to GitHub (if not already done)
```powershell
cd "c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas"
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### Step 2: Deploy on Vercel

1. **Go to Vercel**: https://vercel.com/new

2. **Import Repository**:
   - Click "Add New..." → "Project"
   - Select your GitHub repository: `b89761382-rgb/humara-s-clean-canvas`
   - Click "Import"

3. **Configure Project**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `humanizer-engine/frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

4. **Add Environment Variables**:
   Click "Environment Variables" and add these:

   ```
   OPENAI_API_KEY=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
   
   LLM_MODEL=gpt-4o-mini
   
   NEXT_PUBLIC_SUPABASE_URL=https://lqkpjghjermvxzgkocne.supabase.co
   
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxa3BqZ2hqZXJtdnh6Z2tvY25lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjkyODQsImV4cCI6MjA5MDc0NTI4NH0.QC4F5yGp2ZoXrXH4wwGjAGB7oPMmDiBN9SurM-kqiW4
   
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxa3BqZ2hqZXJtdnh6Z2tvY25lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE2OTI4NCwiZXhwIjoyMDkwNzQ1Mjg0fQ.JEcpsIG7K6VqVrD6uKbqqXFKe28JRCAL7sn3v5EiV-w
   
   PAYSTACK_SECRET_KEY=your_paystack_secret_key_here
   
   ADMIN_EMAILS=your-email@example.com
   ```

5. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete (usually 2-5 minutes)

6. **Your App is Live!** 🎉
   - You'll get a URL like: `https://your-project-name.vercel.app`
   - Production URL: `https://your-project-name.vercel.app`
   - Every push to `main` branch will auto-deploy

---

## Alternative: CLI Deployment

If you prefer using the CLI:

```powershell
cd "c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas\humanizer-engine\frontend"

# Login to Vercel (opens browser)
npx vercel login

# Deploy to preview
npx vercel

# Deploy to production
npx vercel --prod
```

---

## Post-Deployment Checklist

- ✅ Environment variables configured
- ✅ Domain working (check the Vercel URL)
- ✅ API endpoints responding
- ✅ Test all engines: ninja, omega, nuru, fast_v11, ghost_mini, ghost_pro
- ✅ Check AI detection scores
- ✅ Verify Supabase connection
- ✅ Test payment integration (if using Paystack)

---

## Updating Environment Variables

After deployment, you can update environment variables:

1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to "Settings" → "Environment Variables"
4. Add/Edit/Delete variables
5. Redeploy to apply changes

---

## Custom Domain (Optional)

1. Go to your project settings on Vercel
2. Click "Domains"
3. Add your custom domain
4. Follow the DNS configuration instructions
5. Wait for DNS propagation (usually < 1 hour)

---

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify environment variables are set correctly

### API Routes Not Working
- Ensure `OPENAI_API_KEY` is set
- Check Supabase credentials
- Review function logs in Vercel dashboard

### Slow Response Times
- Check OpenAI API quota/rate limits
- Consider upgrading Vercel plan for better performance
- Optimize engine performance settings
