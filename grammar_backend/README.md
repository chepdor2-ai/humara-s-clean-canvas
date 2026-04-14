# Grammar Correction Backend

FastAPI-based grammar correction engine with a 10-stage pipeline: validate → parse → protect spans → normalize → rules → ML → resolve conflicts → diff guard → score → format.

## Quick Start

```bash
cd grammar_backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs at `http://localhost:8000/docs`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/check` | Full document correction |
| POST | `/check/sentence` | Single sentence correction |
| POST | `/batch` | Batch document correction |
| GET | `/health` | Service health + model status |
| GET | `/metrics` | Request/edit statistics |
| POST | `/rules/reload` | Hot-reload YAML rules |

## Example

```bash
curl -X POST http://localhost:8000/check \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The Court '\'' s decision are important.",
    "domain": "legal",
    "strict_minimal_edits": true,
    "preserve_citations": true
  }'
```

## Architecture

```
Request → Validator → Sentence Splitter → Protected Spans Detector
       → Normalizer → Rule Engine → ML Corrector → Conflict Resolver
       → Diff Guard → Scorer → Formatter → Response
```

**Phase 1** (rule-based): Normalizer + Rule Engine + Diff Guard — works out of the box.

**Phase 2** (ML): Uncomment torch/transformers in `requirements.txt` and set `GRAMMAR_ML_ENABLED=true`.

## Rules

YAML rule packs in `app/rules/`:
- `punctuation_rules.yaml`
- `capitalization_rules.yaml`
- `spacing_rules.yaml`
- `legal_rules.yaml`
- `academic_rules.yaml`

Hot-reload with `POST /rules/reload`.

## Testing

```bash
cd grammar_backend
pytest app/tests/ -v
```

## Docker

```bash
docker build -t grammar-api .
docker run -p 8000:8000 grammar-api
```
