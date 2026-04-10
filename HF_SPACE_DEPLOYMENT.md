# Deploying the T5 Humanizer to Hugging Face Spaces

This guide walks you through deploying the Oxygen T5 model as a **Hugging Face Space** (Docker SDK, free tier) and connecting it to the frontend as the **Humara 3.0** engine.

---

## Prerequisites

- A [Hugging Face account](https://huggingface.co/join)
- [Git](https://git-scm.com/) installed with [Git LFS](https://git-lfs.com/) enabled
- The `oxygen-model/` folder (944 MB model) in your workspace root

---

## Step 1 — Create the Hugging Face Space

1. Go to **https://huggingface.co/new-space**
2. Fill in:
   - **Owner**: your HF username or org
   - **Space name**: `oxygen-t5-humanizer` (or anything you like)
   - **SDK**: **Docker**
   - **Visibility**: **Private** (recommended — you'll protect it with an API key)
   - **Hardware**: **CPU basic (free)** — works fine for inference, just slower (~10-30s per request). Upgrade to GPU if you need speed.
3. Click **Create Space**

---

## Step 2 — Clone the Space locally

```bash
git lfs install
git clone https://huggingface.co/spaces/YOUR_USERNAME/oxygen-t5-humanizer
cd oxygen-t5-humanizer
```

---

## Step 3 — Copy the deployment files

Copy these files from your workspace `hf-space/` folder into the cloned Space repo:

```
oxygen-t5-humanizer/
├── .gitattributes          ← from hf-space/.gitattributes (Git LFS tracking)
├── README.md               ← from hf-space/README.md (Space metadata)
├── Dockerfile              ← from hf-space/Dockerfile
├── requirements.txt        ← from hf-space/requirements.txt
├── app.py                  ← from hf-space/app.py (auth wrapper)
├── oxygen_server.py        ← from workspace root (the full server)
├── validation_post_process.py  ← from workspace root
└── oxygen-model/           ← from workspace root (entire folder)
    ├── config.json
    ├── generation_config.json
    ├── model.safetensors   ← 944 MB — tracked by Git LFS
    ├── tokenizer.json
    └── tokenizer_config.json
```

PowerShell commands to copy:

```powershell
# From your workspace root
$SPACE = "path\to\oxygen-t5-humanizer"

Copy-Item hf-space\.gitattributes $SPACE\
Copy-Item hf-space\README.md $SPACE\
Copy-Item hf-space\Dockerfile $SPACE\
Copy-Item hf-space\requirements.txt $SPACE\
Copy-Item hf-space\app.py $SPACE\
Copy-Item oxygen_server.py $SPACE\
Copy-Item validation_post_process.py $SPACE\
Copy-Item -Recurse oxygen-model $SPACE\oxygen-model
```

---

## Step 4 — Push to Hugging Face

```bash
cd oxygen-t5-humanizer
git add .
git commit -m "Initial deployment with T5 model"
git push
```

> **Note**: The first push uploads the 944 MB model via Git LFS. This may take a while depending on your upload speed.

After pushing, go to your Space page. You'll see it building the Docker image. This takes ~5-10 minutes. Once it shows **Running**, the API is live.

---

## Step 5 — Set the API secret

1. Go to your Space → **Settings** → **Repository secrets**
2. Click **New secret**
3. Name: `HF_API_SECRET`
4. Value: Generate a strong random string (e.g. `openssl rand -hex 32` or use a password manager)
5. Click **Save**

The Space will restart automatically. Now all `/humanize` requests require `Authorization: Bearer <your-secret>`.

---

## Step 6 — Test the API

```bash
# Health check (no auth needed)
curl https://YOUR_USERNAME-oxygen-t5-humanizer.hf.space/health

# Humanize (auth required)
curl -X POST https://YOUR_USERNAME-oxygen-t5-humanizer.hf.space/humanize \
  -H "Authorization: Bearer YOUR_HF_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text": "Artificial intelligence has become increasingly important in modern society.", "mode": "quality"}'
```

You should get back:
```json
{
  "humanized": "...",
  "success": true,
  "params_used": { "mode": "quality", ... },
  "stats": { "avg_change_ratio": 0.45, ... }
}
```

---

## Step 7 — Connect to the frontend

Add these environment variables to your Vercel project (or `.env.local` for local dev):

```env
T5_API_URL=https://YOUR_USERNAME-oxygen-t5-humanizer.hf.space
T5_API_KEY=YOUR_HF_API_SECRET
```

**In Vercel:**
1. Go to your project → **Settings** → **Environment Variables**
2. Add `T5_API_URL` and `T5_API_KEY`
3. Redeploy

The **Humara 3.0** engine is now available in the engine dropdown.

---

## Step 8 — Enable in Supabase (optional)

If you use the `engine_config` table to control engine visibility:

```sql
INSERT INTO engine_config (engine_id, enabled, premium, sort_order)
VALUES ('oxygen_t5', true, false, 4);
```

---

## Architecture Overview

```
Browser → Vercel (Next.js SSE route)
               │
               ├── engine = 'oxygen'     → local TypeScript (Humara 2.0)
               ├── engine = 'ozone'      → ozone3.site API (Humara 2.1)
               ├── engine = 'easy'       → essaywritingsupport.com API (Humara 2.2)
               └── engine = 'oxygen_t5'  → HF Space API (Humara 3.0)
                                                │
                                          T5 model server
                                          (FastAPI + PyTorch)
                                          944 MB T5 model
                                          Multi-phase pipeline
```

---

## Performance Notes

| Hardware | Latency per request | Cost |
|----------|-------------------|------|
| CPU basic (free) | ~15-30s | Free |
| CPU upgrade (2 vCPU) | ~8-15s | $0.03/hr |
| T4 GPU (small) | ~2-5s | $0.06/hr |
| A10G GPU | ~1-2s | $0.60/hr |

For production, a **T4 GPU small** ($0.06/hr ≈ $43/mo) gives good latency. The free CPU tier works for testing and low-traffic use.

---

## Troubleshooting

### Space stuck on "Building"
- Check the build logs for errors (usually missing files or Python deps)
- Make sure `oxygen-model/` contains all 5 files

### 503 "Model not loaded"
- The model takes ~30-60s to load on CPU. Wait and retry.
- Check Space logs for OOM errors — if the model doesn't fit in memory, upgrade hardware.

### Timeout errors from frontend
- The T5 client has a 3-minute timeout. On free CPU tier, a long text (50+ sentences) might exceed this.
- Split into shorter texts, or upgrade to GPU.

### "Invalid API token" (403)
- Ensure `T5_API_KEY` in Vercel matches `HF_API_SECRET` in the Space's secrets exactly.
