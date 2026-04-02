"""
AI Text Detector Model
Trains and evaluates models to detect AI-generated vs human-written text
"""
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support, confusion_matrix, roc_auc_score
from sklearn.utils.class_weight import compute_class_weight
import textstat
from nltk.tokenize import sent_tokenize
import pickle
import os

class AITextDetector:
    """Detects AI-generated text using feature engineering and ML"""
    
    def __init__(self):
        self.vectorizer = None
        self.model = None
        self.feature_names = []
        
    def extract_linguistic_features(self, texts):
        """
        Extract linguistic features from texts
        Returns: DataFrame with features
        """
        features = []
        for text in texts:
            feat = {
                'flesch_reading_ease': textstat.flesch_reading_ease(text),
                'flesch_kincaid_grade': textstat.flesch_kincaid_grade(text),
                'avg_sentence_length': len(text.split()) / max(len(sent_tokenize(text)), 1),
                'avg_word_length': np.mean([len(w) for w in text.split()]) if text.split() else 0,
                'type_token_ratio': len(set(text.lower().split())) / max(len(text.split()), 1),
                'punctuation_ratio': sum(1 for c in text if c in '!?.;:,') / max(len(text), 1),
            }
            features.append(feat)
        
        return pd.DataFrame(features)
    
    def train(self, texts, labels, class_weight='balanced'):
        """
        Train detector on texts and labels
        texts: list of text strings
        labels: list of 0 (human) or 1 (AI)
        class_weight: 'balanced' to handle class imbalance
        """
        print("Training AI Text Detector...")
        print(f"Training samples: {len(texts)}")
        print(f"  - Human texts: {sum(l==0 for l in labels)}")
        print(f"  - AI texts: {sum(l==1 for l in labels)}")
        
        # TF-IDF vectorization (baseline approach)
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),
            min_df=2,
            max_df=0.8
        )
        X_tfidf = self.vectorizer.fit_transform(texts)
        
        # Train logistic regression with class weights
        self.model = LogisticRegression(
            max_iter=1000,
            class_weight=class_weight,
            random_state=42
        )
        self.model.fit(X_tfidf, labels)
        print("✓ Model trained successfully")
    
    def evaluate(self, texts, labels):
        """
        Evaluate detector on test data
        Returns evaluation metrics
        """
        X_tfidf = self.vectorizer.transform(texts)
        predictions = self.model.predict(X_tfidf)
        probabilities = self.model.predict_proba(X_tfidf)[:, 1]
        
        # Metrics
        precision, recall, f1, support = precision_recall_fscore_support(
            labels, predictions, average=None
        )
        
        auc_score = roc_auc_score(labels, probabilities)
        
        metrics = {
            'precision_human': precision[0],
            'precision_ai': precision[1],
            'recall_human': recall[0],
            'recall_ai': recall[1],
            'f1_human': f1[0],
            'f1_ai': f1[1],
            'auc': auc_score,
            'confusion_matrix': confusion_matrix(labels, predictions)
        }
        
        print("\n" + "="*50)
        print("EVALUATION RESULTS")
        print("="*50)
        print(f"AUC Score: {auc_score:.4f}")
        print("\nHuman Text Detection:")
        print(f"  Precision: {precision[0]:.4f} | Recall: {recall[0]:.4f} | F1: {f1[0]:.4f}")
        print("\nAI Text Detection (Minority Class):")
        print(f"  Precision: {precision[1]:.4f} | Recall: {recall[1]:.4f} | F1: {f1[1]:.4f}")
        print("\nConfusion Matrix:")
        print(f"  TN: {metrics['confusion_matrix'][0,0]} | FP: {metrics['confusion_matrix'][0,1]}")
        print(f"  FN: {metrics['confusion_matrix'][1,0]} | TP: {metrics['confusion_matrix'][1,1]}")
        print("="*50 + "\n")
        
        return metrics
    
    def predict(self, text):
        """
        Predict if text is AI-generated
        Returns: {'is_ai': bool, 'confidence': float}
        """
        if self.model is None or self.vectorizer is None:
            raise ValueError("Model not trained. Call train() first.")
        
        X = self.vectorizer.transform([text])
        prediction = self.model.predict(X)[0]
        confidence = self.model.predict_proba(X)[0, 1]
        
        return {
            'is_ai': bool(prediction),
            'confidence': float(confidence),
            'text_preview': text[:100] + "..." if len(text) > 100 else text
        }
    
    def save(self, model_path='models/ai_detector.pkl'):
        """Save trained model and vectorizer"""
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        with open(model_path, 'wb') as f:
            pickle.dump({'model': self.model, 'vectorizer': self.vectorizer}, f)
        print(f"✓ Model saved to {model_path}")
    
    def load(self, model_path='models/ai_detector.pkl'):
        """Load pre-trained model"""
        with open(model_path, 'rb') as f:
            data = pickle.load(f)
            self.model = data['model']
            self.vectorizer = data['vectorizer']
        print(f"✓ Model loaded from {model_path}")


def demo():
    """Demonstration of detector usage"""
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    
    from dataset_loader import DatasetManager
    
    # Load dataset
    manager = DatasetManager()
    df = manager.load()
    manager.get_stats()
    
    # Split data
    from sklearn.model_selection import train_test_split
    train_df, test_df = train_test_split(df, test_size=0.2, stratify=df['generated'], random_state=42)
    
    # Train detector
    detector = AITextDetector()
    detector.train(train_df['text'].tolist(), train_df['generated'].tolist())
    
    # Evaluate
    metrics = detector.evaluate(test_df['text'].tolist(), test_df['generated'].tolist())
    
    # Save model
    detector.save()
    
    # Test predictions
    print("\nSample Predictions:")
    sample_ai = df[df['generated']==1]['text'].iloc[0]
    sample_human = df[df['generated']==0]['text'].iloc[0]
    
    print(f"\nAI Sample: {detector.predict(sample_ai)}")
    print(f"Human Sample: {detector.predict(sample_human)}")


if __name__ == "__main__":
    demo()
