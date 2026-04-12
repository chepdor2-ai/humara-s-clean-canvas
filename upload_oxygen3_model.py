#!/usr/bin/env python3
"""
Upload the fine-tuned Oxygen 3.0 model to HuggingFace Hub.
Run this once to make the model available for cloud deployment.

Usage:
  1. Install: pip install huggingface_hub
  2. Login:   huggingface-cli login
  3. Run:     python upload_oxygen3_model.py
"""
import os
from huggingface_hub import HfApi

MODEL_DIR = "oxygen3-model"
REPO_ID = "maguna956/oxygen3-humanizer"  # Change to your HF username/repo


def main():
    if not os.path.exists(MODEL_DIR):
        print(f"ERROR: {MODEL_DIR}/ not found. Extract the model first.")
        return

    api = HfApi()
    
    # Create repo if needed
    try:
        api.create_repo(repo_id=REPO_ID, exist_ok=True, repo_type="model")
        print(f"Repository {REPO_ID} ready.")
    except Exception as e:
        print(f"Note: {e}")

    # Upload all model files
    files = ["model.safetensors", "config.json", "tokenizer.json",
             "tokenizer_config.json", "generation_config.json"]
    
    for f in files:
        path = os.path.join(MODEL_DIR, f)
        if os.path.exists(path):
            size_mb = os.path.getsize(path) / 1e6
            print(f"Uploading {f} ({size_mb:.1f} MB)...")
            api.upload_file(
                path_or_fileobj=path,
                path_in_repo=f,
                repo_id=REPO_ID,
            )
            print(f"  ✓ {f} uploaded")
        else:
            print(f"  SKIP: {f} not found")

    print(f"\nDone! Model available at: https://huggingface.co/{REPO_ID}")
    print(f"Set HF_MODEL_REPO={REPO_ID} in your deployment environment.")


if __name__ == "__main__":
    main()
