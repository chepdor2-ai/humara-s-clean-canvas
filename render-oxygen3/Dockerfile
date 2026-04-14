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
RUN HF_TOKEN=${HF_TOKEN} python - <<'PY'
import os
from huggingface_hub import snapshot_download

token = (os.environ.get('HF_TOKEN') or '').strip()
if not token:
  raise RuntimeError(
    'HF_TOKEN is empty during Docker build. Set HF_TOKEN in Render service environment variables. '
    'For existing Blueprint services, add/update it manually in Render Dashboard -> Environment.'
  )

snapshot_download('maguna956/oxygen3-humanizer', local_dir='/app/oxygen3-model', token=token)
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
