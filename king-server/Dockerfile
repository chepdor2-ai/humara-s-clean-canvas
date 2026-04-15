FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY king-server/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY king_server.py .

# Render sets PORT env var; default to 8400
ENV PORT=8400

EXPOSE ${PORT}

CMD ["python", "king_server.py"]
