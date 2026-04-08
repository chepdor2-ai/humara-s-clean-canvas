#!/usr/bin/env python3
"""
Fine-tune the Oxygen T5 model on AI→Human text pairs.

Usage:
  # Fine-tune on local data (humanizer-engine/data/train/)
  py -3.12 finetune_oxygen.py --local

  # Fine-tune on HuggingFace datasets (HC3 + GPT-Wiki-Intro + dmitva)
  py -3.12 finetune_oxygen.py --huggingface

  # Both local + HuggingFace
  py -3.12 finetune_oxygen.py --local --huggingface

  # Custom settings
  py -3.12 finetune_oxygen.py --local --epochs 5 --lr 3e-5 --batch-size 4

  # Resume from checkpoint
  py -3.12 finetune_oxygen.py --local --resume checkpoints/checkpoint-500

Requirements:
  pip install torch transformers datasets safetensors tqdm
"""

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    T5ForConditionalGeneration,
    get_linear_schedule_with_warmup,
)
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Constants ──
MODEL_DIR = "oxygen-model"
OUTPUT_DIR = "oxygen-model-finetuned"
CHECKPOINT_DIR = "checkpoints"
LOCAL_DATA_DIR = "humanizer-engine/data/train"
MAX_INPUT_LEN = 256   # tokens — T5 context is 512, but shorter is faster
MAX_TARGET_LEN = 256


# ── Dataset ──

class HumanizerDataset(Dataset):
    """Dataset of (AI_text, Human_text) pairs for T5 fine-tuning."""

    def __init__(self, pairs: list[tuple[str, str]], tokenizer, max_input=MAX_INPUT_LEN,
                 max_target=MAX_TARGET_LEN):
        self.pairs = pairs
        self.tokenizer = tokenizer
        self.max_input = max_input
        self.max_target = max_target

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, idx):
        ai_text, human_text = self.pairs[idx]

        # Encode input (AI text)
        input_enc = self.tokenizer(
            ai_text,
            max_length=self.max_input,
            truncation=True,
            padding="max_length",
            return_tensors="pt",
        )

        # Encode target (human text) — labels for the decoder
        target_enc = self.tokenizer(
            human_text,
            max_length=self.max_target,
            truncation=True,
            padding="max_length",
            return_tensors="pt",
        )

        input_ids = input_enc["input_ids"].squeeze(0)
        attention_mask = input_enc["attention_mask"].squeeze(0)
        labels = target_enc["input_ids"].squeeze(0)

        # Replace padding token IDs with -100 so they're ignored in loss
        labels[labels == self.tokenizer.pad_token_id] = -100

        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "labels": labels,
        }


# ── Data Loading ──

def load_local_pairs() -> list[tuple[str, str]]:
    """Load AI/human text pairs from local data/train/ directory."""
    pairs = []
    data_dir = Path(LOCAL_DATA_DIR)
    if not data_dir.exists():
        logger.warning(f"Local data dir not found: {data_dir}")
        return pairs

    # Find all sample pairs
    ai_files = sorted(data_dir.glob("*_ai.txt"))
    for ai_file in ai_files:
        human_file = Path(str(ai_file).replace("_ai.txt", "_human.txt"))
        if human_file.exists():
            ai_text = ai_file.read_text(encoding="utf-8").strip()
            human_text = human_file.read_text(encoding="utf-8").strip()
            if ai_text and human_text:
                # Split into sentence pairs for fine-grained training
                ai_sentences = split_sentences(ai_text)
                human_sentences = split_sentences(human_text)

                # Add full-text pair
                pairs.append((ai_text, human_text))

                # Add sentence-level pairs if counts roughly match
                if abs(len(ai_sentences) - len(human_sentences)) <= 2:
                    for a, h in zip(ai_sentences, human_sentences):
                        if len(a.split()) >= 5 and len(h.split()) >= 5:
                            pairs.append((a, h))

    logger.info(f"Loaded {len(pairs)} pairs from local data ({len(ai_files)} files)")
    return pairs


def load_huggingface_pairs(max_samples: int = 10000) -> list[tuple[str, str]]:
    """Load AI/human text pairs from HuggingFace datasets."""
    try:
        from datasets import load_dataset
    except ImportError:
        logger.error("Install 'datasets' package: pip install datasets")
        return []

    pairs = []

    # 1. HC3 — Human ChatGPT Comparison (question/answer pairs)
    logger.info("Loading HC3 dataset...")
    try:
        hc3 = load_dataset("Hello-SimpleAI/HC3", "all", split="train",
                           trust_remote_code=True)
        count = 0
        for item in hc3:
            if count >= max_samples // 3:
                break
            human_answers = item.get("human_answers", [])
            chatgpt_answers = item.get("chatgpt_answers", [])
            if human_answers and chatgpt_answers:
                # Take paired answers
                ai_text = chatgpt_answers[0].strip()
                human_text = human_answers[0].strip()
                if (20 <= len(ai_text.split()) <= 200
                        and 20 <= len(human_text.split()) <= 200):
                    pairs.append((ai_text, human_text))
                    count += 1
        logger.info(f"  HC3: {count} pairs")
    except Exception as e:
        logger.warning(f"  HC3 failed: {e}")

    # 2. GPT-Wiki-Intro — Wikipedia intros vs GPT rewrites
    logger.info("Loading GPT-Wiki-Intro dataset...")
    try:
        wiki = load_dataset("aadityaubhat/GPT-wiki-intro", split="train",
                            trust_remote_code=True)
        count = 0
        for item in wiki:
            if count >= max_samples // 3:
                break
            ai_text = item.get("generated_intro", "").strip()
            human_text = item.get("wiki_intro", "").strip()
            if (20 <= len(ai_text.split()) <= 200
                    and 20 <= len(human_text.split()) <= 200):
                pairs.append((ai_text, human_text))
                count += 1
        logger.info(f"  GPT-Wiki-Intro: {count} pairs")
    except Exception as e:
        logger.warning(f"  GPT-Wiki-Intro failed: {e}")

    # 3. dmitva — AI vs Human generated text
    logger.info("Loading dmitva dataset...")
    try:
        dmitva = load_dataset("dmitva/human_ai_generated_text", split="train",
                              trust_remote_code=True)
        ai_texts = []
        human_texts = []
        for item in dmitva:
            text = item.get("text", "").strip()
            label = item.get("label", -1)
            if 20 <= len(text.split()) <= 200:
                if label == 1:  # AI
                    ai_texts.append(text)
                elif label == 0:  # Human
                    human_texts.append(text)
        # Pair them up (not true pairs, but similar-length texts)
        ai_texts.sort(key=lambda x: len(x.split()))
        human_texts.sort(key=lambda x: len(x.split()))
        min_len = min(len(ai_texts), len(human_texts), max_samples // 3)
        for i in range(min_len):
            pairs.append((ai_texts[i], human_texts[i]))
        logger.info(f"  dmitva: {min_len} pairs")
    except Exception as e:
        logger.warning(f"  dmitva failed: {e}")

    logger.info(f"Total HuggingFace pairs: {len(pairs)}")
    return pairs


def split_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [s.strip() for s in parts if s.strip()]


# ── Training ──

def train(
    model: T5ForConditionalGeneration,
    tokenizer,
    train_pairs: list[tuple[str, str]],
    val_pairs: list[tuple[str, str]],
    epochs: int = 3,
    batch_size: int = 2,
    learning_rate: float = 5e-5,
    warmup_steps: int = 100,
    save_every: int = 500,
    grad_accum_steps: int = 4,
    max_grad_norm: float = 1.0,
    resume_from: str | None = None,
):
    """Fine-tune T5 on AI→Human text pairs."""

    device = next(model.parameters()).device
    train_dataset = HumanizerDataset(train_pairs, tokenizer)
    val_dataset = HumanizerDataset(val_pairs, tokenizer) if val_pairs else None

    train_loader = DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True,
        num_workers=0, pin_memory=True,
    )

    total_steps = (len(train_loader) // grad_accum_steps) * epochs

    # Optimizer — AdamW with weight decay on non-bias, non-LayerNorm params
    no_decay = ["bias", "LayerNorm.weight", "layer_norm.weight"]
    param_groups = [
        {
            "params": [p for n, p in model.named_parameters()
                       if not any(nd in n for nd in no_decay) and p.requires_grad],
            "weight_decay": 0.01,
        },
        {
            "params": [p for n, p in model.named_parameters()
                       if any(nd in n for nd in no_decay) and p.requires_grad],
            "weight_decay": 0.0,
        },
    ]
    optimizer = torch.optim.AdamW(param_groups, lr=learning_rate)
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps,
    )

    global_step = 0
    start_epoch = 0

    # Resume from checkpoint
    if resume_from and os.path.exists(resume_from):
        logger.info(f"Resuming from checkpoint: {resume_from}")
        ckpt = torch.load(os.path.join(resume_from, "trainer_state.pt"), map_location=device)
        optimizer.load_state_dict(ckpt["optimizer"])
        scheduler.load_state_dict(ckpt["scheduler"])
        global_step = ckpt["global_step"]
        start_epoch = ckpt["epoch"]
        model = T5ForConditionalGeneration.from_pretrained(resume_from).to(device)
        logger.info(f"  Resumed at epoch {start_epoch}, step {global_step}")

    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    logger.info(f"Training config:")
    logger.info(f"  Pairs: {len(train_pairs)} train, {len(val_pairs) if val_pairs else 0} val")
    logger.info(f"  Epochs: {epochs}, Batch: {batch_size}, Grad accum: {grad_accum_steps}")
    logger.info(f"  Effective batch: {batch_size * grad_accum_steps}")
    logger.info(f"  LR: {learning_rate}, Warmup: {warmup_steps}, Total steps: {total_steps}")
    logger.info(f"  Device: {device}")

    model.train()
    best_val_loss = float("inf")

    for epoch in range(start_epoch, epochs):
        epoch_loss = 0.0
        num_batches = 0
        optimizer.zero_grad()

        progress = tqdm(train_loader, desc=f"Epoch {epoch + 1}/{epochs}", unit="batch")
        for step, batch in enumerate(progress):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels,
            )
            loss = outputs.loss / grad_accum_steps
            loss.backward()

            epoch_loss += outputs.loss.item()
            num_batches += 1

            if (step + 1) % grad_accum_steps == 0:
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad()
                global_step += 1

                progress.set_postfix(
                    loss=f"{outputs.loss.item():.4f}",
                    lr=f"{scheduler.get_last_lr()[0]:.2e}",
                    step=global_step,
                )

                # Save checkpoint
                if save_every > 0 and global_step % save_every == 0:
                    save_checkpoint(model, tokenizer, optimizer, scheduler,
                                    epoch, global_step)

        avg_loss = epoch_loss / max(num_batches, 1)
        logger.info(f"Epoch {epoch + 1}/{epochs} — avg train loss: {avg_loss:.4f}")

        # Validation
        if val_dataset:
            val_loss = evaluate(model, val_dataset, batch_size, device)
            logger.info(f"  Validation loss: {val_loss:.4f}")

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                save_checkpoint(model, tokenizer, optimizer, scheduler,
                                epoch, global_step, tag="best")
                logger.info(f"  New best model saved (val_loss={val_loss:.4f})")

    # Save final model
    save_final_model(model, tokenizer)
    return model


def evaluate(model, val_dataset, batch_size, device) -> float:
    """Evaluate model on validation set."""
    model.eval()
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    total_loss = 0.0
    num_batches = 0

    with torch.no_grad():
        for batch in val_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels,
            )
            total_loss += outputs.loss.item()
            num_batches += 1

    model.train()
    return total_loss / max(num_batches, 1)


def save_checkpoint(model, tokenizer, optimizer, scheduler, epoch, step, tag=None):
    """Save a training checkpoint."""
    ckpt_name = f"checkpoint-{tag}" if tag else f"checkpoint-{step}"
    ckpt_path = os.path.join(CHECKPOINT_DIR, ckpt_name)
    os.makedirs(ckpt_path, exist_ok=True)

    model.save_pretrained(ckpt_path)
    tokenizer.save_pretrained(ckpt_path)
    torch.save({
        "optimizer": optimizer.state_dict(),
        "scheduler": scheduler.state_dict(),
        "epoch": epoch,
        "global_step": step,
    }, os.path.join(ckpt_path, "trainer_state.pt"))

    logger.info(f"  Checkpoint saved: {ckpt_path}")


def save_final_model(model, tokenizer):
    """Save the final fine-tuned model."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    logger.info(f"Final model saved to: {OUTPUT_DIR}/")


# ── Quick Test ──

def test_model(model, tokenizer, device, test_texts: list[str] | None = None):
    """Generate a few test outputs to see quality."""
    model.eval()
    if test_texts is None:
        test_texts = [
            "Artificial intelligence has fundamentally transformed the landscape of modern technology.",
            "Furthermore, the implications of these advances extend far beyond the technical realm.",
            "It is important to note that current detection mechanisms remain insufficient.",
            "The integration of machine learning algorithms has revolutionized data analysis.",
            "Moreover, stakeholders across academia and industry must collaborate effectively.",
        ]

    logger.info("\n── Test Outputs ──")
    for text in test_texts:
        inputs = tokenizer(text, return_tensors="pt", max_length=256,
                           truncation=True).to(device)
        with torch.no_grad():
            outputs = model.generate(
                **inputs, max_new_tokens=128, num_beams=4, do_sample=False,
                no_repeat_ngram_size=3, early_stopping=True,
                repetition_penalty=1.2,
            )
        result = tokenizer.decode(outputs[0], skip_special_tokens=True)
        logger.info(f"  IN:  {text}")
        logger.info(f"  OUT: {result}")
        logger.info("")


# ── Main ──

def main():
    parser = argparse.ArgumentParser(description="Fine-tune Oxygen T5 for humanization")
    parser.add_argument("--local", action="store_true",
                        help="Use local data/train/ pairs")
    parser.add_argument("--huggingface", action="store_true",
                        help="Download and use HuggingFace datasets")
    parser.add_argument("--hf-max", type=int, default=10000,
                        help="Max samples from HuggingFace (default: 10000)")
    parser.add_argument("--epochs", type=int, default=3,
                        help="Training epochs (default: 3)")
    parser.add_argument("--batch-size", type=int, default=2,
                        help="Batch size (default: 2, increase if you have GPU)")
    parser.add_argument("--lr", type=float, default=5e-5,
                        help="Learning rate (default: 5e-5)")
    parser.add_argument("--grad-accum", type=int, default=4,
                        help="Gradient accumulation steps (default: 4)")
    parser.add_argument("--warmup", type=int, default=100,
                        help="Warmup steps (default: 100)")
    parser.add_argument("--save-every", type=int, default=500,
                        help="Save checkpoint every N steps (default: 500)")
    parser.add_argument("--resume", type=str, default=None,
                        help="Resume from checkpoint directory")
    parser.add_argument("--test-only", action="store_true",
                        help="Only run test generation (no training)")
    parser.add_argument("--val-split", type=float, default=0.1,
                        help="Validation split ratio (default: 0.1)")
    args = parser.parse_args()

    if not args.local and not args.huggingface and not args.test_only:
        parser.print_help()
        print("\nError: Specify at least --local or --huggingface (or --test-only)")
        sys.exit(1)

    # Load model
    logger.info(f"Loading base model from {MODEL_DIR}/...")
    device = "cuda" if torch.cuda.is_available() else "cpu"

    if args.resume:
        model_path = args.resume
        logger.info(f"Loading from checkpoint: {model_path}")
    else:
        model_path = MODEL_DIR

    tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
    model = T5ForConditionalGeneration.from_pretrained(
        model_path, local_files_only=True, torch_dtype=torch.float32,
    ).to(device)

    n_params = sum(p.numel() for p in model.parameters())
    n_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logger.info(f"Model: {n_params:,} params ({n_trainable:,} trainable) on {device}")

    if args.test_only:
        test_model(model, tokenizer, device)
        return

    # Collect training data
    all_pairs = []
    if args.local:
        all_pairs.extend(load_local_pairs())
    if args.huggingface:
        all_pairs.extend(load_huggingface_pairs(max_samples=args.hf_max))

    if not all_pairs:
        logger.error("No training data found! Add pairs to data/train/ or use --huggingface")
        sys.exit(1)

    # Shuffle and split
    import random
    random.shuffle(all_pairs)

    val_size = max(1, int(len(all_pairs) * args.val_split))
    val_pairs = all_pairs[:val_size]
    train_pairs = all_pairs[val_size:]

    logger.info(f"Dataset: {len(train_pairs)} train, {len(val_pairs)} val")

    # Train
    model = train(
        model=model,
        tokenizer=tokenizer,
        train_pairs=train_pairs,
        val_pairs=val_pairs,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_steps=args.warmup,
        save_every=args.save_every,
        grad_accum_steps=args.grad_accum,
        resume_from=args.resume,
    )

    # Test the fine-tuned model
    test_model(model, tokenizer, device)

    logger.info("\n── Done! ──")
    logger.info(f"Fine-tuned model saved to: {OUTPUT_DIR}/")
    logger.info(f"To use it, update oxygen_server.py MODEL_DIR to '{OUTPUT_DIR}'")
    logger.info(f"Or copy {OUTPUT_DIR}/* → {MODEL_DIR}/ to replace the base model")


if __name__ == "__main__":
    main()
