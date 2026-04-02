"""
Dataset loader for Human vs AI generated text detection
Downloads and manages the dataset from Hugging Face
"""
import os
from datasets import load_dataset
import pandas as pd

DATASET_ID = "dmitva/human_ai_generated_text"
CACHE_DIR = ".cache/huggingface"

class DatasetManager:
    """Manages loading and processing of the AI detection dataset"""
    
    def __init__(self, cache_dir=CACHE_DIR):
        self.cache_dir = cache_dir
        self.dataset = None
        self.df = None
        
    def load(self):
        """Load dataset from Hugging Face"""
        print(f"Loading dataset: {DATASET_ID}")
        self.dataset = load_dataset(DATASET_ID, cache_dir=self.cache_dir)
        print(f"✓ Dataset loaded successfully")
        print(f"  - Total rows: {len(self.dataset['train'])}")
        
        # Convert to pandas for easier manipulation
        self.df = self.dataset['train'].to_pandas()
        return self.df
    
    def get_stats(self):
        """Print dataset statistics"""
        if self.df is None:
            print("Dataset not loaded. Call load() first.")
            return
        
        stats = {
            'total_samples': len(self.df),
            'ai_samples': (self.df['generated'] == 1).sum(),
            'human_samples': (self.df['generated'] == 0).sum(),
            'ai_percentage': round((self.df['generated'] == 1).sum() / len(self.df) * 100, 2),
            'human_percentage': round((self.df['generated'] == 0).sum() / len(self.df) * 100, 2),
        }
        
        print("\n" + "="*50)
        print("DATASET STATISTICS")
        print("="*50)
        print(f"Total rows: {stats['total_samples']}")
        print(f"AI samples: {stats['ai_samples']} (~{stats['ai_percentage']}%)")
        print(f"Human samples: {stats['human_samples']} (~{stats['human_percentage']}%)")
        print(f"\nAverage text length:")
        print(f"  AI texts: {self.df[self.df['generated']==1]['text'].str.len().mean():.0f} chars")
        print(f"  Human texts: {self.df[self.df['generated']==0]['text'].str.len().mean():.0f} chars")
        print("="*50 + "\n")
        
        return stats
    
    def save_splits(self, train_size=0.8, val_size=0.1):
        """
        Save train/val/test splits
        train_size: proportion for training (default 0.8)
        val_size: proportion for validation (default 0.1)
        test_size: automatically 1 - train_size - val_size
        """
        if self.df is None:
            print("Dataset not loaded. Call load() first.")
            return
        
        test_size = 1 - train_size - val_size
        
        # Split maintaining class balance
        from sklearn.model_selection import train_test_split
        
        train, test = train_test_split(
            self.df, 
            test_size=(val_size + test_size),
            stratify=self.df['generated'],
            random_state=42
        )
        
        val, test = train_test_split(
            test,
            test_size=test_size / (val_size + test_size),
            stratify=test['generated'],
            random_state=42
        )
        
        # Save to CSV
        os.makedirs('data', exist_ok=True)
        train.to_csv('data/train.csv', index=False)
        val.to_csv('data/val.csv', index=False)
        test.to_csv('data/test.csv', index=False)
        
        print(f"✓ Splits saved:")
        print(f"  - data/train.csv ({len(train)} samples)")
        print(f"  - data/val.csv ({len(val)} samples)")
        print(f"  - data/test.csv ({len(test)} samples)")


if __name__ == "__main__":
    # Example usage
    manager = DatasetManager()
    manager.load()
    manager.get_stats()
    manager.save_splits()
