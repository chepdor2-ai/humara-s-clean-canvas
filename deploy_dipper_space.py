"""Deploy the DIPPER Space to HuggingFace."""
import os
from huggingface_hub import HfApi, create_repo

HF_TOKEN = os.environ.get("HF_TOKEN", "")
SPACE_ID = "maguna956/dipper-paraphraser"

api = HfApi(token=HF_TOKEN)

# Create the Space repo (ZeroGPU = free GPU)
try:
    create_repo(
        repo_id=SPACE_ID,
        repo_type="space",
        space_sdk="gradio",
        token=HF_TOKEN,
        exist_ok=True,
    )
    print(f"Space created/exists: {SPACE_ID}")
except Exception as e:
    print(f"Error creating repo: {e}")

# Upload files
space_dir = os.path.join(os.path.dirname(__file__), "dipper-space")

for fname in ["app.py", "requirements.txt"]:
    fpath = os.path.join(space_dir, fname)
    print(f"Uploading {fname}...")
    api.upload_file(
        path_or_fileobj=fpath,
        path_in_repo=fname,
        repo_id=SPACE_ID,
        repo_type="space",
        token=HF_TOKEN,
    )
    print(f"  -> Uploaded {fname}")

print(f"\nSpace deployed: https://huggingface.co/spaces/{SPACE_ID}")
print(f"API: https://{SPACE_ID.replace('/', '-')}.hf.space/gradio_api/call/paraphrase")
