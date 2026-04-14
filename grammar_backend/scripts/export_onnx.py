"""Export the GEC model to ONNX format for faster inference."""

import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Export GEC model to ONNX")
    parser.add_argument("--model", default="gotutiyan/gector-roberta-base-5k", help="HF model name")
    parser.add_argument("--output", default="app/models/gec_model/model.onnx", help="Output path")
    args = parser.parse_args()

    try:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
        import torch
    except ImportError:
        print("Install transformers and torch first: pip install transformers torch")
        return

    print(f"Loading model: {args.model}")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model)
    model.eval()

    dummy = tokenizer("The cat are happy.", return_tensors="pt")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Exporting to: {output_path}")
    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        str(output_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"},
        },
        opset_version=14,
    )
    print("Done!")


if __name__ == "__main__":
    main()
