"""
DIPPER Paraphraser — Lightweight 1B version
Based on SamSJackson/paraphrase-dipper-no-ctx (MIT license)
Deployed as a Gradio API for HumaraGPT humanization engine.
"""
import torch
import gradio as gr
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MODEL_ID = "SamSJackson/paraphrase-dipper-no-ctx"
TOKENIZER_ID = "google/t5-efficient-large-nl32"

# Load on CPU at startup
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_ID)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID, torch_dtype=torch.float32)
model.eval()

device = torch.device("cpu")


def paraphrase(input_text: str, lex_diversity: int = 60, order_diversity: int = 0) -> str:
    """
    Paraphrase text using the DIPPER model.
    
    Args:
        input_text: Text to paraphrase
        lex_diversity: Lexical diversity 0-100 (higher = more word changes). Use multiples of 20.
        order_diversity: Order diversity 0-100 (higher = more structural changes). Use multiples of 20.
    
    Returns:
        Paraphrased text
    """
    if not input_text or not input_text.strip():
        return ""
    
    # Clamp to valid range and round to nearest 20
    lex = max(0, min(100, int(round(lex_diversity / 20) * 20)))
    order = max(0, min(100, int(round(order_diversity / 20) * 20)))
    
    # Split into paragraphs to handle longer text
    paragraphs = [p.strip() for p in input_text.split("\n") if p.strip()]
    results = []
    
    for para in paragraphs:
        # DIPPER prompt format
        prompt = f"lexical = {lex}, order = {order} {para}"
        
        input_ids = tokenizer(
            prompt,
            return_tensors="pt",
            padding="longest",
            max_length=1000,
            truncation=True,
        ).to(device)
        
        with torch.no_grad():
            outputs = model.generate(
                **input_ids,
                top_p=0.75,
                do_sample=True,
                max_new_tokens=500,
                num_beams=1,
            )
        
        decoded = tokenizer.batch_decode(outputs, skip_special_tokens=True)
        results.append(" ".join(decoded))
    
    return "\n\n".join(results)


# Gradio interface
demo = gr.Interface(
    fn=paraphrase,
    inputs=[
        gr.Textbox(label="Input Text", lines=8, placeholder="Enter text to paraphrase..."),
        gr.Slider(0, 100, value=60, step=20, label="Lexical Diversity (word changes)"),
        gr.Slider(0, 100, value=0, step=20, label="Order Diversity (structural changes)"),
    ],
    outputs=gr.Textbox(label="Paraphrased Text", lines=8),
    title="DIPPER Paraphraser (Lightweight)",
    description="1B parameter DIPPER model for AI-detection-evading paraphrasing. MIT License.",
    api_name="paraphrase",
)

if __name__ == "__main__":
    demo.launch()
