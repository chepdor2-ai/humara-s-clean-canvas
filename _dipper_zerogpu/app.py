"""
DIPPER Paraphraser — ZeroGPU accelerated (free H200 GPU)
Model: SamSJackson/paraphrase-dipper-no-ctx (1B params, MIT license)

Speed: ~6s/sentence on CPU → <0.5s/sentence on ZeroGPU H200
"""
import spaces
import torch
import gradio as gr
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MODEL_ID = "SamSJackson/paraphrase-dipper-no-ctx"
TOKENIZER_ID = "google/t5-efficient-large-nl32"

# Load on CPU at startup — ZeroGPU moves to GPU when @spaces.GPU runs
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_ID)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID, torch_dtype=torch.float16)
model.eval()


@spaces.GPU(duration=120)
def paraphrase(input_text: str, lex_diversity: int = 60, order_diversity: int = 0) -> str:
    """
    Paraphrase text using the DIPPER model on GPU.

    Args:
        input_text: Text to paraphrase
        lex_diversity: Lexical diversity 0-100 (higher = more word changes)
        order_diversity: Order diversity 0-100 (higher = more structural changes)

    Returns:
        Paraphrased text
    """
    if not input_text or not input_text.strip():
        return ""

    lex = max(0, min(100, int(round(lex_diversity / 20) * 20)))
    order = max(0, min(100, int(round(order_diversity / 20) * 20)))

    # Split into paragraphs
    paragraphs = [p.strip() for p in input_text.split("\n") if p.strip()]

    # Split paragraphs into sentences for batched processing
    all_sentences = []
    para_map = []  # (para_idx, sent_idx) for reassembly
    for pi, para in enumerate(paragraphs):
        sents = [s.strip() for s in para.replace(". ", ".\n").split("\n") if s.strip()]
        for si, sent in enumerate(sents):
            all_sentences.append(sent)
            para_map.append((pi, si))

    if not all_sentences:
        return ""

    # ── BATCHED inference: process ALL sentences at once on GPU ──
    prompts = [f"lexical = {lex}, order = {order} {s}" for s in all_sentences]

    inputs = tokenizer(
        prompts,
        return_tensors="pt",
        padding=True,
        max_length=512,
        truncation=True,
    ).to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            top_p=0.75,
            do_sample=True,
            max_new_tokens=256,
            num_beams=1,
        )

    decoded = tokenizer.batch_decode(outputs, skip_special_tokens=True)

    # Reassemble into paragraphs
    para_results: dict[int, list[str]] = {}
    for (pi, si), text in zip(para_map, decoded):
        if pi not in para_results:
            para_results[pi] = []
        para_results[pi].append(text.strip())

    result_paragraphs = []
    for pi in sorted(para_results.keys()):
        result_paragraphs.append(" ".join(para_results[pi]))

    return "\n\n".join(result_paragraphs)


# Gradio interface
demo = gr.Interface(
    fn=paraphrase,
    inputs=[
        gr.Textbox(label="Input Text", lines=8, placeholder="Enter text to paraphrase..."),
        gr.Slider(0, 100, value=60, step=20, label="Lexical Diversity (word changes)"),
        gr.Slider(0, 100, value=0, step=20, label="Order Diversity (structural changes)"),
    ],
    outputs=gr.Textbox(label="Paraphrased Text", lines=8),
    title="DIPPER Paraphraser (ZeroGPU)",
    description="1B parameter DIPPER model with free H200 GPU acceleration. MIT License.",
    api_name="paraphrase",
)

if __name__ == "__main__":
    demo.launch()
