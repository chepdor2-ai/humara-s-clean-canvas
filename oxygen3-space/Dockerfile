FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (smaller image)
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY oxygen3_server.py .

# Model config
ENV OXYGEN3_MODEL_DIR=/app/model
ENV HF_MODEL_REPO=maguna956/oxygen3-humanizer

# Download model at build time for fast cold starts
RUN python -c "\
from huggingface_hub import snapshot_download; \
snapshot_download('maguna956/oxygen3-humanizer', local_dir='/app/model')"

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/health')" || exit 1

EXPOSE 7860
CMD ["python", "oxygen3_server.py"]
