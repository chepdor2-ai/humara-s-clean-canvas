#!/usr/bin/env python3
"""
Deploy Oxygen 3.0 Humanizer to a Hugging Face Space (Docker SDK).

Usage:
    python deploy_oxygen3_space.py

Prerequisites:
    pip install huggingface_hub
    huggingface-cli login   (or set HF_TOKEN env var)

This script:
  1. Creates/gets the Space  maguna956/oxygen3-humanizer  (Docker SDK)
  2. Uploads:  README.md, Dockerfile, requirements.txt, oxygen3_server.py
  3. The Space builds the Docker image which downloads the model at build time
     from  maguna956/oxygen3-humanizer  (the model repo).

Once deployed, set this env var on your Vercel frontend:
    OXYGEN3_API_URL=https://maguna956-oxygen3-humanizer.hf.space
"""
import os
import shutil
import tempfile
from pathlib import Path
from huggingface_hub import HfApi, create_repo

SPACE_ID = "maguna956/oxygen3-humanizer"
SPACE_SDK = "docker"
ROOT = Path(__file__).resolve().parent


def main():
    api = HfApi()

    # 1. Create or get the Space
    print(f"Creating/getting Space: {SPACE_ID} ...")
    create_repo(
        repo_id=SPACE_ID,
        repo_type="space",
        space_sdk=SPACE_SDK,
        exist_ok=True,
        private=False,
    )
    print(f"  Space ready: https://huggingface.co/spaces/{SPACE_ID}")

    # 2. Gather files to upload
    space_dir = ROOT / "oxygen3-space"
    files_to_upload = {
        "README.md": space_dir / "README.md",
        "Dockerfile": space_dir / "Dockerfile",
        "requirements.txt": space_dir / "requirements.txt",
        "oxygen3_server.py": ROOT / "oxygen3_server.py",
    }

    # Verify all files exist
    for name, path in files_to_upload.items():
        if not path.exists():
            print(f"  ERROR: Missing file: {path}")
            return
        print(f"  Found: {name} ({path.stat().st_size:,} bytes)")

    # 3. Upload to the Space
    print("\nUploading files to Space...")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for name, src in files_to_upload.items():
            shutil.copy2(src, tmp_path / name)

        api.upload_folder(
            folder_path=str(tmp_path),
            repo_id=SPACE_ID,
            repo_type="space",
        )

    print(f"\nDone! Space will build and start automatically.")
    print(f"  Dashboard: https://huggingface.co/spaces/{SPACE_ID}")
    print(f"  API URL:   https://maguna956-oxygen3-humanizer.hf.space")
    print(f"\nAdd to Vercel env vars:")
    print(f"  OXYGEN3_API_URL=https://maguna956-oxygen3-humanizer.hf.space")


if __name__ == "__main__":
    main()
