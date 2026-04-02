# Python Backend Files - Preserved for Future Upgrades

This directory contains the original Python FastAPI backend.

## Purpose

These files are kept as backup for:
1. **Future migrations** - When scaling to dedicated microservices
2. **Reference implementation** - The TypeScript API mimics this architecture  
3. **Upgrades** - New features can be developed in Python first
4. **Testing** - Compare TypeScript vs Python outputs

## Core Files

- `main.py` - FastAPI server with all routes
- `humanizer.py` - Core text humanization engine
- `humanizer_v2.py` - Advanced multi-pass humanizer
- `llm_humanizer.py` - LLM-powered ninja mode
- `llm_pipeline.py` - 8-phase anti-detection pipeline
- `multi_detector.py` - 22-detector ensemble
- `post_processor.py` - Post-processing refinements
- `ninja_post_processor.py` - Advanced post-processing
- `context_analyzer.py` - Semantic analysis
- `text_analyzer.py` - Text metrics and analysis
- `ai_detector.py` - Detection algorithms
- `detector_integration.py` - API integrations
- `semantic_guard.py` - Meaning preservation
- `style_memory.py` - Style profiling
- `dictionary.py` - Synonym dictionary loader
- `rules.py` - Transformation rules
- `advanced_transforms.py` - Advanced transformations
- `academic_rules.py` - Academic tone rules
- `evaluator.py` - Quality evaluation
- `trainer.py` - Model training
- `validation.py` - Input validation
- `utils*.py` - Utility functions
- `dataset_loader.py` - Training data loader

## Running Python Backend Locally

```bash
# Activate virtual environment
cd "e:\Websites\Humanizer Engine\humanizer-engine\python-backup"
& "e:\Websites\Humanizer Engine\.venv\Scripts\Activate.ps1"

# Run FastAPI server
python main.py
# or
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Integration with TypeScript

The TypeScript API endpoints in `/api/*.ts` currently return mock data.

To integrate Python logic:

### Option 1: Deploy Python as Microservice

```bash
# Deploy to Railway
railway up

# Update TypeScript to call Python service
# In api/humanize.ts:
const response = await fetch(`${process.env.PYTHON_SERVICE_URL}/api/humanize`, {
  method: 'POST',
  body: JSON.stringify({ text, engine })
});
```

### Option 2: Use Vercel Python Runtime (Experimental)

Create `api/python/humanize.py` and Vercel will handle it.

### Option 3: WebAssembly

Compile critical Python modules to WASM for edge execution.

## Requirements

See `/python-backup/requirements.txt` for full dependencies.

## License

Same as main project (MIT).
