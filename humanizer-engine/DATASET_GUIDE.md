# AI Text Detection & Humanization Guide

## Overview
This project integrates the **Human vs AI Generated Text Dataset** from Hugging Face with your humanizer engine to:
- Detect AI-generated text
- Evaluate humanization effectiveness
- Provide quality metrics and recommendations

## Dataset Information

**Source:** https://huggingface.co/datasets/dmitva/human_ai_generated_text

**Statistics:**
- **Total samples:** 1,460
- **AI generated:** 85 samples (~6%)
- **Human written:** 1,375 samples (~94%)
- **Columns:**
  - `text` (str): Full passage
  - `generated` (int): 1 = AI-created, 0 = human-written

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Download & Explore Dataset
```bash
python dataset_loader.py
```

This will:
- Download the dataset from Hugging Face
- Display statistics
- Create CSV splits: `data/train.csv`, `data/val.csv`, `data/test.csv`

**Output:**
```
Loading dataset: dmitva/human_ai_generated_text
✓ Dataset loaded successfully
  - Total rows: 1460

==================================================
DATASET STATISTICS
==================================================
Total rows: 1460
AI samples: 85 (~5.82%)
Human samples: 1375 (~94.18%)

Average text length:
  AI texts: 256 chars
  Human texts: 289 chars
==================================================
```

### 3. Train AI Detector Model
```bash
python ai_detector.py
```

This will:
- Load training data
- Train a TF-IDF + LogisticRegression model
- Evaluate on test set
- Save model to `models/ai_detector.pkl`

**Key Approach:**
- **TF-IDF Vectorization:** Captures word importance patterns
- **Class Weights:** Handles 6%/94% imbalance
- **Logistic Regression:** Fast, interpretable baseline

**Output Metrics:**
```
==================================================
EVALUATION RESULTS
==================================================
AUC Score: 0.8456

Human Text Detection:
  Precision: 0.9234 | Recall: 0.9456 | F1: 0.9344

AI Text Detection (Minority Class):
  Precision: 0.7123 | Recall: 0.6234 | F1: 0.6645
==================================================
```

## Extending Your API

### Option 1: Add Detection Endpoint

In `main.py`, add:
```python
from detector_integration import setup_detector_routes, load_detector

# After FastAPI initialization
load_detector()
setup_detector_routes(app)
```

### Option 2: Use Detector Directly

```python
from ai_detector import AITextDetector

detector = AITextDetector()
detector.load('models/ai_detector.pkl')

result = detector.predict("Your text here")
# Returns: {'is_ai': False, 'confidence': 0.23, 'text_preview': '...'}
```

## New API Endpoints

### POST `/analyze`
Humanize text and detect AI signatures

**Request:**
```json
{
  "text": "Your AI text here...",
  "strength": "medium",
  "detect_ai": true
}
```

**Response:**
```json
{
  "original_text": "Your AI text here...",
  "humanized_text": "Adjusted version...",
  "word_count": 42,
  "is_ai_generated": false,
  "ai_confidence": 0.32,
  "recommendation": "✓ Successfully humanized; text now appears human-written"
}
```

### GET `/detector-status`
Check if detector is loaded

**Response:**
```json
{
  "status": "ready",
  "model_path": "models/ai_detector.pkl",
  "message": "AI detection available"
}
```

## Advanced Techniques to Consider

Based on the dataset challenge, here are improvements you can experiment with:

### 1. Handle Class Imbalance
- **SMOTE:** Synthetic oversampling of AI samples (6% → balanced)
- **Focal Loss:** Penalize easy negatives
- **Stratified K-Fold:** Maintain class ratio in validation

### 2. Linguistic Features
Extract hand-crafted features:
```
- Flesch Reading Ease (complexity)
- Average sentence length
- Type-Token Ratio (vocabulary diversity)
- Punctuation patterns
- Entropy of word frequencies
```

### 3. Fine-tuned Transformers
Replace TF-IDF with:
- DistilBERT (lightweight)
- RoBERTa (robust)
- Fine-tune on your dataset

### 4. Interpretability
Understand why text is flagged as AI:
- **LIME:** Local explanations per prediction
- **SHAP:** Feature importance scores
- **Top coefficients:** Which n-grams matter most

## Project Structure
```
humanizer-engine/
├── humanizer.py              (Your existing humanizer)
├── main.py                   (FastAPI app)
├── dataset_loader.py         (Load & split dataset)
├── ai_detector.py            (Detection model)
├── detector_integration.py   (API integration)
├── data/                     (CSV splits)
│   ├── train.csv
│   ├── val.csv
│   └── test.csv
└── models/                   (Saved models)
    └── ai_detector.pkl
```

## Troubleshooting

**Issue:** Dataset not downloading
- Check internet connection
- Verify HuggingFace token if needed: `huggingface-cli login`

**Issue:** Poor AI detection F1 score
- Dataset is severely imbalanced (6% AI)
- Try SMOTE oversampling in `ai_detector.py`
- Add more linguistic features via `extract_linguistic_features()`

**Issue:** Model too slow for production
- Use `max_features=2000` in TF-IDF (trades recall for speed)
- Consider lightweight transformer (DistilBERT)

## Performance Targets

Based on dataset characteristics:
- **Human detection:** Easy (94% baseline) → Target F1 > 0.90
- **AI detection:** Hard (6% minority) → Target F1 > 0.65-0.70

## References

- Dataset: https://huggingface.co/datasets/dmitva/human_ai_generated_text
- Hugging Face Datasets: https://huggingface.co/docs/datasets/
- Scikit-learn: https://scikit-learn.org/
- NLTK: https://www.nltk.org/
