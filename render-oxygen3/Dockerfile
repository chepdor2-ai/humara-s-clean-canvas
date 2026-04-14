FROM python:3.11-slim

WORKDIR /app

# Install CPU-only PyTorch first (smaller image, no CUDA)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
RUN pip install --no-cache-dir \
    transformers \
    fastapi \
    "uvicorn[standard]" \
    safetensors \
    pydantic \
    huggingface_hub \
    sentencepiece \
    protobuf

# Download the model at build time (cached in Docker layer — fast cold starts)
# Render auto-injects env vars as Docker build args
ARG HF_TOKEN
ARG HF_MODEL_REPO=maguna956/oxygen3-humanizer
RUN HF_TOKEN=${HF_TOKEN} HF_MODEL_REPO=${HF_MODEL_REPO} python - <<'PY'
import os
from huggingface_hub import snapshot_download

repo_id = (os.environ.get('HF_MODEL_REPO') or 'maguna956/oxygen3-humanizer').strip()
token = (os.environ.get('HF_TOKEN') or '').strip()

kwargs = dict(repo_id=repo_id, local_dir='/app/oxygen3-model')
if token:
  kwargs['token'] = token

try:
  snapshot_download(**kwargs)
except Exception as e:
  if not token:
    raise RuntimeError(
      f'Anonymous download failed for {repo_id}. '
      'Set HF_TOKEN in Render env vars, or use a public model repo.'
    ) from e
  raise

# Handle case where files are in a subfolder (e.g. oxygen3-model/)
import glob, shutil
nested = glob.glob('/app/oxygen3-model/oxygen3-model/*.json') + \
         glob.glob('/app/oxygen3-model/oxygen3-model/*.safetensors')
if nested:
  for f in glob.glob('/app/oxygen3-model/oxygen3-model/*'):
    shutil.move(f, '/app/oxygen3-model/')
  shutil.rmtree('/app/oxygen3-model/oxygen3-model', ignore_errors=True)
  print('Flattened nested oxygen3-model/ subfolder')

# Verify critical files exist
import pathlib
model_dir = pathlib.Path('/app/oxygen3-model')
for req in ['config.json', 'tokenizer_config.json']:
  assert (model_dir / req).exists(), f'Missing {req} in downloaded model!'
print('Model download OK:', [p.name for p in model_dir.iterdir()])
PY

# Copy server files
COPY oxygen3_server.py .
COPY validation_post_process.py .

ENV OXYGEN3_MODEL_DIR=/app/oxygen3-model
ENV PORT=7860

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/health')" || exit 1

CMD ["python", "oxygen3_server.py"]
