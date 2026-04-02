# GhostEngine — AI Text Humanizer

Rewrite AI-generated text into authentic, human-sounding prose that bypasses Turnitin, Originality.AI, GPTZero, and 20+ other detectors. Built with a TypeScript core engine, Next.js frontend, and Python FastAPI backend — Vercel-ready.

> **Responsible use:** This project is intended for legitimate editing (clarity, tone, readability) of text you are authorized to modify. Comply with your institution/employer policies and applicable laws.

---

## Project structure

```
humanizer-engine/
├── ts-engine/              TypeScript humanizer core (Bun)
│   └── src/
│       ├── humanizer.ts        Main humanization pipeline
│       ├── rules.ts            Pattern replacement rules
│       ├── academic-rules.ts   Academic tone rules
│       ├── advanced-transforms.ts  Structural transforms
│       ├── context-analyzer.ts Context-aware processing
│       ├── post-processor.ts   Output cleanup
│       ├── multi-detector.ts   22-engine detection suite
│       ├── llm-humanizer.ts    Ninja LLM multi-pass
│       ├── llm-pipeline.ts     8-phase LLM pipeline
│       ├── server.ts           Bun HTTP server
│       └── test-suite.ts       Test runner
├── frontend/               Next.js 16 web application
│   └── app/
│       ├── page.tsx            Humanizer UI
│       └── detector/           AI detector page
├── static/                 Static landing & marketing pages
│   ├── index.html              Landing page
│   ├── app.html                Humanizer app UI
│   ├── detector.html           AI detector
│   ├── login.html / signup.html / reset-password.html
│   ├── pricing.html / about.html / how-it-works.html
│   ├── terms.html / privacy.html
│   └── 404.html                Error page
├── api/                    Vercel serverless functions (TypeScript)
│   ├── humanize.ts             POST /api/humanize
│   ├── detect.ts               POST /api/detect
│   └── health.ts               GET /api/health
├── python-backup/          Python backend (preserved for upgrades)
├── main.py                 FastAPI server (local dev)
├── simple_server.py        Minimal HTTP server (zero deps)
├── vercel.json             Vercel deployment config
└── dictionaries/           Synonym & thesaurus data
```

---

## Quick start

### Option A — TypeScript engine (recommended)

```powershell
cd ts-engine
bun install
bun run src/server.ts
```

### Option B — Next.js frontend

```powershell
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Option C — Python backend (local dev)

```powershell
& ".\.venv\Scripts\Activate.ps1"
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
# → http://localhost:8000
```

### Option D — Minimal server (zero external deps)

```powershell
python simple_server.py
# → http://localhost:8000
```

---

## Website pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `static/index.html` | Marketing landing page |
| `/app` | `static/app.html` | Humanizer application |
| `/detector` | `static/detector.html` | AI detector tool |
| `/login` | `static/login.html` | Login |
| `/signup` | `static/signup.html` | Sign up |
| `/reset-password` | `static/reset-password.html` | Password reset |
| `/pricing` | `static/pricing.html` | Pricing |
| `/about` | `static/about.html` | About us |
| `/how-it-works` | `static/how-it-works.html` | How it works |
| `/terms` | `static/terms.html` | Terms of service |
| `/privacy` | `static/privacy.html` | Privacy policy |

---

## API endpoints

### `POST /api/humanize`

Rewrite text with the selected engine and return detector scores.

```json
{
  "text": "...",
  "engine": "ghost_mini",
  "strength": "balanced",
  "tone": "neutral",
  "strict_meaning": true,
  "no_contractions": true,
  "enable_post_processing": true
}
```

**Response:**

```json
{
  "original": "...",
  "humanized": "...",
  "word_count": 123,
  "engine_used": "ghost_mini",
  "input_detector_results": { "overall": 95.0, "gptzero": 92.3 },
  "output_detector_results": { "overall": 4.2, "gptzero": 3.1 }
}
```

### `POST /api/detect`

Run text through the 22-engine multi-detector ensemble.

```json
{ "text": "..." }
```

### `GET /api/health`

Returns service status, version, and region.

---

## Engines

| Engine | Type | Description |
|--------|------|-------------|
| **Ghost Mini** | Rule-based | Fast synonym swaps and structural transforms |
| **Ghost Pro** | Rule-based | Deeper clause reordering, burstiness injection |
| **Ninja** | LLM + rules | Multi-pass OpenAI refinement with 8-phase pipeline |

### Settings

- **Strength:** `light` / `balanced` / `deep`
- **Tone:** `neutral` / `academic` / `professional`
- **Strict Meaning:** conservative synonym/structure changes
- **No Contractions:** expands and avoids contractions
- **Post-Processing:** removes filler phrases, reduces repetition

---

## Deployment (Vercel)

```powershell
npm install
npm run build
vercel --prod
```

### Environment variables (Vercel Dashboard)

```
OPENAI_API_KEY=sk-...              # Required for Ninja engine
PYTHON_SERVICE_URL=https://...     # Optional: external Python microservice
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| **Core engine** | TypeScript (Bun runtime) |
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4 |
| **Static pages** | HTML5, Tailwind CDN |
| **API** | Vercel Serverless Functions (TypeScript) |
| **Local backend** | Python 3.12, FastAPI, Uvicorn |
| **Detection** | 22-engine ensemble (GPTZero, Turnitin, Originality, etc.) |
| **LLM** | OpenAI API (Ninja mode) |
| **Hosting** | Vercel Edge Network |

---

## Development

### Run tests

```powershell
# TypeScript
cd ts-engine
bun run src/test-suite.ts

# Python
python test_core.py
python test_integration.py
```

### Conventions

- TypeScript engine: `ts-engine/src/` — kebab-case filenames
- Python modules: project root — snake_case filenames
- Static HTML pages: Tailwind CDN, no build step
- Next.js frontend: `frontend/` with its own `package.json`

---

## Configuration

### OpenAI (Ninja engine)

```powershell
$env:OPENAI_API_KEY = "your_key_here"
```

Or add to `.env` in the project root.

### spaCy model

```powershell
python -m spacy download en_core_web_sm
```

### NLTK data

```powershell
python -c "import nltk; nltk.download('punkt')"
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `No module named '_socket'` | Use Python 3.12 instead of 3.14 |
| `Can't find model 'en_core_web_sm'` | `python -m spacy download en_core_web_sm` |
| NLTK tokenizer errors | `python -c "import nltk; nltk.download('punkt')"` |
| Slow first request | Normal — models load on first use |
| Ninja engine fallback | Set `OPENAI_API_KEY`; falls back to Ghost Pro otherwise |

---

## License

MIT
