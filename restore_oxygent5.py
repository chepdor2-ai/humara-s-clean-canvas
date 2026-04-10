"""Restore the oxygent5 HF Space — re-upload original files."""
import os
from huggingface_hub import HfApi

HF_TOKEN = os.environ.get("HF_TOKEN", "")
SPACE_ID = "maguna956/oxygent5"
BASE = r"c:\Users\User\Documents\GitHub\New folder\humara-s-clean-canvas"

api = HfApi(token=HF_TOKEN)

# 1. Upload oxygen_server.py and validation_post_process.py
for fname in ["oxygen_server.py", "validation_post_process.py"]:
    fpath = os.path.join(BASE, fname)
    if os.path.exists(fpath):
        print(f"Uploading {fname} ({os.path.getsize(fpath)} bytes)...")
        api.upload_file(
            path_or_fileobj=fpath,
            path_in_repo=fname,
            repo_id=SPACE_ID,
            repo_type="space",
            token=HF_TOKEN,
        )
        print(f"  -> Done")

# 2. Upload oxygen-model/ directory
model_dir = os.path.join(BASE, "oxygen-model")
for fname in os.listdir(model_dir):
    fpath = os.path.join(model_dir, fname)
    size_mb = os.path.getsize(fpath) / (1024*1024)
    print(f"Uploading oxygen-model/{fname} ({size_mb:.1f} MB)...")
    api.upload_file(
        path_or_fileobj=fpath,
        path_in_repo=f"oxygen-model/{fname}",
        repo_id=SPACE_ID,
        repo_type="space",
        token=HF_TOKEN,
    )
    print(f"  -> Done")

# 3. Restore Dockerfile that runs oxygen_server.py
DOCKERFILE = """FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 7860
CMD ["uvicorn", "oxygen_server:app", "--host", "0.0.0.0", "--port", "7860"]
"""
print("Uploading Dockerfile...")
api.upload_file(
    path_or_fileobj=DOCKERFILE.encode(),
    path_in_repo="Dockerfile",
    repo_id=SPACE_ID,
    repo_type="space",
    token=HF_TOKEN,
)

# 4. Restore requirements
REQS = """fastapi>=0.110.0
uvicorn>=0.27.0
torch>=2.0.0
transformers>=4.40.0
sentencepiece
protobuf
"""
print("Uploading requirements.txt...")
api.upload_file(
    path_or_fileobj=REQS.encode(),
    path_in_repo="requirements.txt",
    repo_id=SPACE_ID,
    repo_type="space",
    token=HF_TOKEN,
)

# 5. Restore app.py shim that imports from oxygen_server
APP_SHIM = '''# Thin wrapper — Hugging Face Spaces expects app.py
from oxygen_server import app
'''
print("Uploading app.py...")
api.upload_file(
    path_or_fileobj=APP_SHIM.encode(),
    path_in_repo="app.py",
    repo_id=SPACE_ID,
    repo_type="space",
    token=HF_TOKEN,
)

# 6. Delete the DIPPER-specific app.py replacement I uploaded (now replaced by shim above)
print("\nAll files restored! Space will rebuild now.")
print(f"https://huggingface.co/spaces/{SPACE_ID}")
