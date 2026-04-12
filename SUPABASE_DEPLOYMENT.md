# Supabase Deployment Guide

## Prerequisites

Install Supabase CLI:
```powershell
npm install -g supabase
```

## Login to Supabase

```powershell
supabase login
```

## Link to Your Supabase Project

```powershell
cd "c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas\humanizer-engine"
supabase link --project-ref lqkpjghjermvxzgkocne
```

## Deploy Edge Functions

```powershell
# Deploy all functions
supabase functions deploy

# Or deploy specific function
supabase functions deploy humanize
supabase functions deploy health
```

## Set Environment Variables

```powershell
# Set API URL for edge functions
supabase secrets set NEXT_API_URL=https://your-vercel-app.vercel.app

# Set OpenAI API Key
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
```

## Test Edge Functions Locally

```powershell
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve

# Test the function
curl http://localhost:54321/functions/v1/health
```

## Access Your Edge Functions

After deployment, your functions will be available at:
- https://lqkpjghjermvxzgkocne.supabase.co/functions/v1/humanize
- https://lqkpjghjermvxzgkocne.supabase.co/functions/v1/health

## Testing

```powershell
# Test humanize function
curl -X POST https://lqkpjghjermvxzgkocne.supabase.co/functions/v1/humanize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"text":"Your text here","engine":"ninja"}'
```
