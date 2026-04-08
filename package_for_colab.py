#!/usr/bin/env python3
"""
Package the oxygen-model/ folder into a ZIP for Google Drive upload.
Run this locally, then upload the ZIP to Drive before opening the Colab notebook.

Usage:
    py -3.12 package_for_colab.py
"""
import os
import shutil
import sys

MODEL_DIR = "oxygen-model"
ZIP_NAME = "oxygen-model-for-colab"

if not os.path.exists(MODEL_DIR):
    print(f"Error: {MODEL_DIR}/ not found. Run from the project root.")
    sys.exit(1)

# Show what we're packaging
print(f"Packaging {MODEL_DIR}/ for Colab upload...\n")
total = 0
for f in sorted(os.listdir(MODEL_DIR)):
    path = os.path.join(MODEL_DIR, f)
    if os.path.isfile(path):
        size = os.path.getsize(path)
        total += size
        print(f"  {f}: {size/1e6:.1f} MB")
print(f"\n  Total: {total/1e6:.0f} MB")

# Create ZIP
print(f"\nCreating {ZIP_NAME}.zip...")
shutil.make_archive(ZIP_NAME, "zip", ".", MODEL_DIR)
zip_size = os.path.getsize(f"{ZIP_NAME}.zip")
print(f"Done! {ZIP_NAME}.zip ({zip_size/1e6:.0f} MB)")

print(f"""
Next steps:
  1. Upload {ZIP_NAME}.zip to Google Drive
  2. In Drive, extract it so you have a folder: MyDrive/oxygen-model/
     (Right-click > Open with > ZIP Extractor, or upload the folder directly)
  3. Open finetune_oxygen_colab.ipynb in Colab
  4. Set runtime to GPU (Runtime > Change runtime type > T4 GPU)
  5. Run all cells
""")
