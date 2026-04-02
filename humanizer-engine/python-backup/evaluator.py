"""
Comprehensive Evaluator for Humanizer Engine
Measures effectiveness on academic/essay content with multiple metrics
"""
import os
import csv
import json
from datetime import datetime
import textstat
from nltk.tokenize import sent_tokenize, word_tokenize
from collections import Counter
import numpy as np

class HumanizerEvaluator:
    """Multi-dimensional evaluation of humanized text"""
    
    def __init__(self, log_dir="evaluation_logs"):
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        
    def calculate_burstiness(self, text):
        """
        Sentence length variance (higher = more human-like)
        AI text: uniform sentences ~20 words each
        Human text: 5-40 word variance
        """
        sentences = sent_tokenize(text)
        if len(sentences) < 2:
            return 0
        
        lengths = [len(s.split()) for s in sentences]
        variance = np.var(lengths) if lengths else 0
        return float(variance)
    
    def calculate_readability(self, text):
        """
        Flesch Reading Ease score
        0-30: College/Graduate (academic)
        60-100: High school/Easy
        Target for academic: 40-60 (accessible scholarship)
        """
        return float(textstat.flesch_reading_ease(text))
    
    def calculate_vocabulary_diversity(self, text):
        """
        Type-Token Ratio (unique words / total words)
        AI: 0.45-0.55 (repetitive)
        Human: 0.55-0.75 (varied)
        """
        words = word_tokenize(text.lower())
        if not words:
            return 0
        unique = len(set(words))
        return float(unique / len(words))
    
    def calculate_transition_patterns(self, text):
        """
        Detect AI transition word frequency
        Academic AI often overuses: furthermore, additionally, moreover, consequently
        Good human academic: more conversational, internal transitions
        """
        ai_transitions = [
            "furthermore", "moreover", "additionally", "consequently",
            "in conclusion", "it is important", "in fact", "to summarize",
            "on the other hand", "nevertheless", "however,"
        ]
        
        text_lower = text.lower()
        count = sum(1 for trans in ai_transitions if trans in text_lower)
        total_words = len(text.split())
        
        # % of text that are AI transitions
        ratio = (count / max(total_words, 1)) * 100
        return float(ratio)
    
    def calculate_sentence_structure_variety(self, text):
        """
        Measure sentence starting patterns
        AI: often starts with "The", "This", "It"
        Human: more varied (I, we, verbs, pronouns, particles)
        """
        sentences = sent_tokenize(text)
        if not sentences:
            return 0
        
        starters = []
        for sent in sentences:
            words = sent.split()
            if words:
                starters.append(words[0].lower())
        
        unique_starters = len(set(starters))
        # Higher diversity score = more human-like
        diversity = unique_starters / max(len(starters), 1)
        return float(diversity)
    
    def calculate_repetition_density(self, text):
        """
        Detect repeated n-grams (AI patterns)
        Bigrams appearing 3+ times = potential AI pattern
        """
        words = text.lower().split()
        if len(words) < 2:
            return 0
        
        bigrams = [' '.join(words[i:i+2]) for i in range(len(words)-1)]
        bigram_counts = Counter(bigrams)
        
        # Find bigrams appearing 3+ times
        repetitive = sum(1 for count in bigram_counts.values() if count >= 3)
        total_bigrams = len(set(bigrams))
        
        density = repetitive / max(total_bigrams, 1)
        return float(density * 100)  # as percentage
    
    def calculate_academic_tone(self, text):
        """
        Academic tone score for essays
        Measures: passive voice, formal vocabulary, balanced length
        """
        sentences = sent_tokenize(text)
        avg_sent_length = np.mean([len(s.split()) for s in sentences]) if sentences else 0
        
        # Academic typically 15-25 words/sentence
        tone_score = 1.0 if 15 <= avg_sent_length <= 25 else 0.5
        
        # Bonus for diverse vocabulary
        diversity = self.calculate_vocabulary_diversity(text)
        tone_score *= (0.5 + diversity)  # 0.5-1.5x multiplier
        
        return float(min(tone_score, 1.0))
    
    def evaluate_pair(self, original_text, humanized_text, reference_text=None):
        """
        Full evaluation comparing original -> humanized
        Optional reference_text for style matching
        Includes NEW: Semantic meaning preservation via embeddings
        """
        # NEW: Import semantic guard (optional, graceful fallback)
        try:
            from semantic_guard import semantic_similarity
            has_semantic = True
        except ImportError:
            has_semantic = False
            semantic_similarity = lambda a, b: 1.0  # Fallback
        
        metrics = {
            'timestamp': datetime.now().isoformat(),
            'original_length': len(original_text.split()),
            'humanized_length': len(humanized_text.split()),
            
            # Burstiness (higher = better for human mimicry)
            'original_burstiness': self.calculate_burstiness(original_text),
            'humanized_burstiness': self.calculate_burstiness(humanized_text),
            'burstiness_improvement': 0,
            
            # Readability
            'original_readability': self.calculate_readability(original_text),
            'humanized_readability': self.calculate_readability(humanized_text),
            
            # Vocabulary diversity
            'original_diversity': self.calculate_vocabulary_diversity(original_text),
            'humanized_diversity': self.calculate_vocabulary_diversity(humanized_text),
            'diversity_improvement': 0,
            
            # AI patterns (lower = better)
            'original_ai_transitions': self.calculate_transition_patterns(original_text),
            'humanized_ai_transitions': self.calculate_transition_patterns(humanized_text),
            'transition_reduction': 0,
            
            # Sentence structure
            'original_structure_variety': self.calculate_sentence_structure_variety(original_text),
            'humanized_structure_variety': self.calculate_sentence_structure_variety(humanized_text),
            
            # Repetition (lower = better)
            'original_repetition': self.calculate_repetition_density(original_text),
            'humanized_repetition': self.calculate_repetition_density(humanized_text),
            
            # Academic tone (for essays)
            'humanized_academic_tone': self.calculate_academic_tone(humanized_text),
            
            # NEW: Semantic meaning preservation (0-1, higher = better)
            'semantic_similarity': semantic_similarity(original_text, humanized_text) if has_semantic else 1.0,
            'meaning_preserved': semantic_similarity(original_text, humanized_text) >= 0.88 if has_semantic else True,
        }
        
        # Calculate improvements
        metrics['burstiness_improvement'] = metrics['humanized_burstiness'] - metrics['original_burstiness']
        metrics['diversity_improvement'] = metrics['humanized_diversity'] - metrics['original_diversity']
        metrics['transition_reduction'] = metrics['original_ai_transitions'] - metrics['humanized_ai_transitions']
        
        return metrics
    
    def calculate_overall_score(self, metrics):
        """
        Composite score: 0-100
        Weights: 
        - Burstiness (20%), diversity (15%), transitions (20%), tone (15%), 
        - Repetition (10%), semantic preservation (20%)
        """
        score = 0
        
        # Burstiness: improvements > 0 = good
        burst_contrib = min(abs(metrics['burstiness_improvement']), 20) / 20 * 20
        
        # Diversity: improvements > 0.05 = good
        div_contrib = min(metrics['diversity_improvement'] * 10, 20) / 20 * 15
        
        # AI Transition reduction: reduction > 0 = good
        trans_contrib = min(metrics['transition_reduction'], 2) / 2 * 20
        
        # Academic tone: 0-1 scale
        tone_contrib = metrics['humanized_academic_tone'] * 15
        
        # Repetition: lower is better (-reduce)
        rep_contrib = max(0, 10 - metrics['humanized_repetition'])
        
        # NEW: Semantic similarity - critical for safety (20% weight)
        # 0.88+ = full score, <0.88 heavily penalized
        semantic_sim = metrics.get('semantic_similarity', 1.0)
        if semantic_sim >= 0.88:
            semantic_contrib = 20
        elif semantic_sim >= 0.85:
            semantic_contrib = 15
        elif semantic_sim >= 0.80:
            semantic_contrib = 8
        else:
            semantic_contrib = max(0, 5 - (0.80 - semantic_sim) * 100)
        
        score = burst_contrib + div_contrib + trans_contrib + tone_contrib + rep_contrib + semantic_contrib
        return float(min(score, 100))
    
    def evaluate_batch(self, pairs_dir="data/train"):
        """
        Evaluate all AI/human pairs in directory
        Expects: sample_001_ai.txt and sample_001_human.txt
        """
        results = []
        
        if not os.path.exists(pairs_dir):
            print(f"✗ Directory not found: {pairs_dir}")
            return results
        
        # Find all AI samples
        ai_files = [f for f in os.listdir(pairs_dir) if f.endswith('_ai.txt')]
        
        if not ai_files:
            print(f"✗ No AI text files found in {pairs_dir}")
            return results
        
        print(f"\nEvaluating {len(ai_files)} text pairs from {pairs_dir}...")
        
        for ai_file in ai_files:
            base_name = ai_file.replace('_ai.txt', '')
            human_file = f"{base_name}_human.txt"
            human_path = os.path.join(pairs_dir, human_file)
            
            if not os.path.exists(human_path):
                print(f"⚠ Missing reference: {human_file}")
                continue
            
            try:
                with open(os.path.join(pairs_dir, ai_file), 'r', encoding='utf-8') as f:
                    original = f.read().strip()
                with open(human_path, 'r', encoding='utf-8') as f:
                    reference = f.read().strip()
                
                # Also evaluate the humanized version if using trainer.py
                metrics = self.evaluate_pair(original, reference)
                metrics['sample_id'] = base_name
                metrics['overall_score'] = self.calculate_overall_score(metrics)
                
                results.append(metrics)
                
            except Exception as e:
                print(f"✗ Error processing {ai_file}: {e}")
        
        return results
    
    def save_results(self, results, filename=None):
        """Save evaluation results to CSV"""
        if not results:
            print("No results to save")
            return
        
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = os.path.join(self.log_dir, f"evaluation_{timestamp}.csv")
        
        try:
            with open(filename, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=results[0].keys())
                writer.writeheader()
                writer.writerows(results)
            
            print(f"✓ Results saved to {filename}")
            return filename
        except Exception as e:
            print(f"✗ Error saving results: {e}")
    
    def print_summary(self, results):
        """Print human-readable summary of results"""
        if not results:
            print("No results to summarize")
            return
        
        print("\n" + "="*70)
        print("EVALUATION SUMMARY - ACADEMIC ESSAY CONTENT")
        print("="*70)
        
        overall_scores = [r['overall_score'] for r in results]
        
        print(f"\nTotal samples evaluated: {len(results)}")
        print(f"Average overall score: {np.mean(overall_scores):.1f}/100")
        print(f"Min score: {np.min(overall_scores):.1f}")
        print(f"Max score: {np.max(overall_scores):.1f}")
        print(f"Std dev: {np.std(overall_scores):.1f}")
        
        # Metric averages
        print(f"\n--- AVERAGE IMPROVEMENTS ---")
        print(f"Burstiness improvement: {np.mean([r['burstiness_improvement'] for r in results]):.2f}")
        print(f"Vocabulary diversity gain: {np.mean([r['diversity_improvement'] for r in results]):.4f}")
        print(f"AI transition reduction: {np.mean([r['transition_reduction'] for r in results]):.2f}%")
        
        print(f"\n--- AI SIGNATURE INDICATORS (lower is better) ---")
        print(f"Avg AI transitions per text: {np.mean([r['humanized_ai_transitions'] for r in results]):.2f}%")
        print(f"Avg repetition density: {np.mean([r['humanized_repetition'] for r in results]):.2f}%")
        
        print(f"\n--- ACADEMIC TONE (0-1 scale) ---")
        print(f"Average academic tone score: {np.mean([r['humanized_academic_tone'] for r in results]):.3f}")
        
        print(f"\n--- SEMANTIC MEANING PRESERVATION (0-1, higher = safer) ---")
        if 'semantic_similarity' in results[0]:
            sem_sims = [r['semantic_similarity'] for r in results]
            preserved_count = sum(1 for r in results if r.get('meaning_preserved', True))
            print(f"Average semantic similarity: {np.mean(sem_sims):.3f}")
            print(f"Meaning preserved (≥0.88): {preserved_count}/{len(results)} ({preserved_count/len(results)*100:.1f}%)")
            print(f"Min semantic similarity: {np.min(sem_sims):.3f}")
            print(f"Max semantic similarity: {np.max(sem_sims):.3f}")
        else:
            print("(Semantic guard not available - install sentence-transformers)")
        
        # Find best/worst
        best_idx = np.argmax(overall_scores)
        worst_idx = np.argmin(overall_scores)
        
        print(f"\n--- EXTREMES ---")
        print(f"Best sample: {results[best_idx]['sample_id']} ({results[best_idx]['overall_score']:.1f})")
        print(f"Worst sample: {results[worst_idx]['sample_id']} ({results[worst_idx]['overall_score']:.1f})")
        
        print("="*70 + "\n")


if __name__ == "__main__":
    evaluator = HumanizerEvaluator()
    
    # Example: evaluate all training samples
    results = evaluator.evaluate_batch("data/train")
    
    if results:
        evaluator.print_summary(results)
        evaluator.save_results(results)
