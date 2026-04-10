FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app, server, and validation module
COPY app.py .
COPY oxygen_server.py .
COPY validation_post_process.py .

# Model will be downloaded from HF Hub at startup (or copied if you
# upload it directly to the repo).  If you push model files into
# oxygen-model/ alongside this Dockerfile the COPY below picks them up.
COPY oxygen-model/ ./oxygen-model/

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
