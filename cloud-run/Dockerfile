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

# Copy model files
COPY oxygen-model/ ./oxygen-model/

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

EXPOSE 8080

CMD exec uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1 --timeout-keep-alive 120
