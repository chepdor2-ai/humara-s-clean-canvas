FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (layer cache)
COPY king-server/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY king_server.py .

# Render injects PORT at runtime (default 10000)
# Do NOT set ENV PORT here — let Render control it

CMD ["sh", "-c", "uvicorn king_server:app --host 0.0.0.0 --port ${PORT:-10000}"]
