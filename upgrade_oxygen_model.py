#!/usr/bin/env python3
"""
Upgrade the Oxygen model to a paraphrase-specialized T5.

The current oxygen-model/ is a generic T5-v1.1-base that was barely fine-tuned
(only 6 training pairs). This script downloads a purpose-built paraphrase model
that achieves dramatically better rewriting quality out of the box.

Options:
  1. humarin/chatgpt_paraphrase_on_T5_base  — Best overall (trained on ChatGPT paraphrase data)
  2. Vamsi/T5_Paraphrase_Paws              — Good for short sentences
  3. ramsrigouthamg/t5_paraphraser           — Classic paraphraser

Usage:
  py -3.12 upgrade_oxygen_model.py                    # Downloads best model
  py -3.12 upgrade_oxygen_model.py --model vamsi      # Use Vamsi model
  py -3.12 upgrade_oxygen_model.py --model ramsri      # Use ramsri model
  py -3.12 upgrade_oxygen_model.py --test-only         # Test current model without downloading
"""

import argparse
import os
import shutil
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MODEL_DIR = "oxygen-model"
BACKUP_DIR = "oxygen-model-backup"

MODELS = {
    "humarin": {
        "name": "humarin/chatgpt_paraphrase_on_T5_base",
        "description": "Best overall — trained on ChatGPT paraphrase data, 220M params",
        "prefix": "paraphrase: ",
    },
    "vamsi": {
        "name": "Vamsi/T5_Paraphrase_Paws",
        "description": "Good for short sentences — trained on PAWS paraphrase dataset",
        "prefix": "paraphrase: ",
    },
    "ramsri": {
        "name": "ramsrigouthamg/t5_paraphraser",
        "description": "Classic T5 paraphraser — well-tested",
        "prefix": "paraphrase: ",
    },
}


def download_model(model_key: str):
    """Download a paraphrase model from HuggingFace."""
    from transformers import AutoTokenizer, T5ForConditionalGeneration
    
    info = MODELS[model_key]
    model_name = info["name"]
    
    logger.info(f"Downloading model: {model_name}")
    logger.info(f"Description: {info['description']}")
    
    # Backup existing model
    if os.path.exists(MODEL_DIR):
        if os.path.exists(BACKUP_DIR):
            shutil.rmtree(BACKUP_DIR)
        logger.info(f"Backing up current model to {BACKUP_DIR}/")
        shutil.copytree(MODEL_DIR, BACKUP_DIR)
    
    # Download
    logger.info("Downloading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    logger.info("Downloading model weights (~900MB)...")
    model = T5ForConditionalGeneration.from_pretrained(model_name)
    
    # Save locally
    os.makedirs(MODEL_DIR, exist_ok=True)
    logger.info(f"Saving to {MODEL_DIR}/...")
    tokenizer.save_pretrained(MODEL_DIR)
    model.save_pretrained(MODEL_DIR)
    
    # Save model info
    import json
    with open(os.path.join(MODEL_DIR, "model_source.json"), "w") as f:
        json.dump({
            "source": model_name,
            "prefix": info["prefix"],
            "description": info["description"],
        }, f, indent=2)
    
    n = sum(p.numel() for p in model.parameters())
    logger.info(f"Model saved: {n:,} parameters")
    logger.info(f"Prefix for this model: '{info['prefix']}'")
    return model, tokenizer, info["prefix"]


def test_model(model, tokenizer, prefix: str, device: str = "cpu"):
    """Test the model with sample inputs."""
    import torch
    
    model = model.to(device)
    model.eval()
    
    test_texts = [
        "Artificial intelligence has fundamentally transformed the landscape of modern healthcare.",
        "Furthermore, the implications of these advances extend far beyond the technical realm.",
        "The integration of machine learning algorithms has revolutionized data analysis in recent years.",
        "It is important to note that current detection mechanisms remain insufficient for the task.",
        "Digital learning platforms now offer personalized experiences that adapt to individual student needs.",
    ]
    
    logger.info(f"\n{'='*70}")
    logger.info(f"Testing model with prefix: '{prefix}'")
    logger.info(f"{'='*70}")
    
    for text in test_texts:
        input_text = f"{prefix}{text}" if prefix else text
        inputs = tokenizer(input_text, return_tensors="pt", max_length=256,
                          truncation=True, padding=True).to(device)
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=256,
                num_beams=8,
                num_beam_groups=4,
                num_return_sequences=4,
                diversity_penalty=1.5,
                do_sample=False,
                no_repeat_ngram_size=3,
                repetition_penalty=1.8,
                early_stopping=True,
            )
        
        logger.info(f"\n  INPUT:  {text}")
        for i in range(outputs.shape[0]):
            result = tokenizer.decode(outputs[i], skip_special_tokens=True).strip()
            # Measure change
            orig_words = set(w.lower().strip(".,;:!?") for w in text.split())
            out_words = set(w.lower().strip(".,;:!?") for w in result.split())
            overlap = orig_words & out_words
            change = 1.0 - (len(overlap) / max(len(orig_words), len(out_words))) if orig_words else 0
            marker = " ★" if change >= 0.35 else ""
            logger.info(f"  OUT[{i}]: {result}  [change={change:.0%}]{marker}")


def main():
    parser = argparse.ArgumentParser(description="Upgrade Oxygen T5 model")
    parser.add_argument("--model", choices=list(MODELS.keys()), default="humarin",
                       help="Which model to download (default: humarin)")
    parser.add_argument("--test-only", action="store_true",
                       help="Test current model without downloading")
    parser.add_argument("--restore-backup", action="store_true",
                       help="Restore the backed-up model")
    args = parser.parse_args()
    
    if args.restore_backup:
        if os.path.exists(BACKUP_DIR):
            if os.path.exists(MODEL_DIR):
                shutil.rmtree(MODEL_DIR)
            shutil.copytree(BACKUP_DIR, MODEL_DIR)
            logger.info(f"Restored backup from {BACKUP_DIR}/")
        else:
            logger.error(f"No backup found at {BACKUP_DIR}/")
        return
    
    import torch
    from transformers import AutoTokenizer, T5ForConditionalGeneration
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    if args.test_only:
        logger.info(f"Loading current model from {MODEL_DIR}/...")
        tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True)
        model = T5ForConditionalGeneration.from_pretrained(MODEL_DIR, local_files_only=True)
        
        # Check for model source info
        prefix = ""
        source_file = os.path.join(MODEL_DIR, "model_source.json")
        if os.path.exists(source_file):
            import json
            with open(source_file) as f:
                info = json.load(f)
            prefix = info.get("prefix", "")
            logger.info(f"Model source: {info.get('source', 'unknown')}")
        
        test_model(model, tokenizer, prefix, device)
        return
    
    # Download and test
    model, tokenizer, prefix = download_model(args.model)
    test_model(model, tokenizer, prefix, device)
    
    logger.info(f"\n{'='*70}")
    logger.info("IMPORTANT: Update oxygen_server.py to use the prefix!")
    logger.info(f"The new model expects input prefixed with: '{prefix}'")
    logger.info(f"Restart the Oxygen server after this upgrade.")
    logger.info(f"{'='*70}")


if __name__ == "__main__":
    main()
