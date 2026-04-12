FROM python:3.12-slim

WORKDIR /app

# Install CPU PyTorch (smaller) + deps
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir \
    transformers \
    fastapi \
    uvicorn[standard] \
    safetensors \
    huggingface_hub

COPY oxygen3_server.py .

# Model will be downloaded from HF Hub at startup
ENV OXYGEN3_MODEL_DIR=/app/model
ENV HF_MODEL_REPO=maguna956/oxygen3-humanizer

# Download model at build time for faster cold starts
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('${HF_MODEL_REPO:-maguna956/oxygen3-humanizer}', local_dir='/app/model')" || true

EXPOSE 7860
CMD ["python", "oxygen3_server.py"]
