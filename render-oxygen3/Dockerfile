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
    huggingface_hub

# Download the model at build time (cached in Docker layer — fast cold starts)
# Render auto-injects env vars as Docker build args
ARG HF_TOKEN
ARG HF_MODEL_REPO=maguna956/oxygen3-humanizer
RUN HF_TOKEN=${HF_TOKEN} HF_MODEL_REPO=${HF_MODEL_REPO} python - <<'PY'
import os
from huggingface_hub import snapshot_download

repo_id = (os.environ.get('HF_MODEL_REPO') or 'maguna956/oxygen3-humanizer').strip()
token = (os.environ.get('HF_TOKEN') or '').strip()

try:
  if token:
    snapshot_download(repo_id, local_dir='/app/oxygen3-model', token=token)
  else:
    # Allows public model repos to build without a token.
    snapshot_download(repo_id, local_dir='/app/oxygen3-model')
except Exception as e:
  if not token:
    raise RuntimeError(
      f'HF_TOKEN is empty and anonymous download failed for {repo_id}. '
      'Set HF_TOKEN in Render service environment variables, or set HF_MODEL_REPO to a public model. '
      'For existing Blueprint services, add/update env vars manually in Render Dashboard -> Environment.'
    ) from e
  raise
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
