# Vercel Deployment Guide - Web Interface (No CLI Required)

## 🚀 Quick Deployment (Recommended - No Login Issues!)

### Step 1: Deploy on Vercel Web Dashboard

1. **Open Vercel**: https://vercel.com/new

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
   OPENAI_API_KEY=your_openai_api_key_here
   
   LLM_MODEL=gpt-4o-mini
   
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
   
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
   
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
