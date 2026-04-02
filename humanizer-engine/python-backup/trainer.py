"""
Automated Trainer for Humanizer Engine
Iterative optimization: test -> analyze -> update rules -> re-test
"""
import os
import sys
import json
import copy
from datetime import datetime
from evaluator import HumanizerEvaluator
import rules
import re

class TrainerConfig:
    """Configuration for training iterations"""
    def __init__(self):
        self.max_iterations = 10
        self.batch_size = 20  # test per iteration
        self.test_samples_dir = "data/train"
        self.threshold_score = 75  # target overall score
        self.log_dir = "training_logs"
        os.makedirs(self.log_dir, exist_ok=True)


class RuleOptimizer:
    """Intelligently adjusts rules based on evaluation results"""
    
    def __init__(self):
        self.iteration = 0
        self.history = []
        
    def suggest_adjustments(self, metrics_batch, current_score):
        """
        Analyze batch metrics and suggest rule adjustments
        Returns: dict of recommended parameter changes
        """
        import numpy as np
        
        avg_ai_transitions = np.mean([m['humanized_ai_transitions'] for m in metrics_batch])
        avg_burstiness = np.mean([m['burstiness_improvement'] for m in metrics_batch])
        avg_repetition = np.mean([m['humanized_repetition'] for m in metrics_batch])
        avg_diversity = np.mean([m['diversity_improvement'] for m in metrics_batch])
        
        adjustments = {}
        reasons = []
        
        # Rule 1: Still too many AI transitions?
        if avg_ai_transitions > 1.5:
            adjustments['TRANSITION_RATE'] = max(0.1, rules.TRANSITION_RATE - 0.05)
            reasons.append(f"↓ TRANSITION_RATE: AI transitions still {avg_ai_transitions:.2f}%")
        
        # Rule 2: Not enough burstiness?
        if avg_burstiness < 2.0:
            adjustments['BURSTINESS_TARGET'] = min(1.0, rules.BURSTINESS_TARGET + 0.1)
            reasons.append(f"↑ BURSTINESS_TARGET: improvement only {avg_burstiness:.2f}")
        
        # Rule 3: High repetition density?
        if avg_repetition > 5.0:
            adjustments['SHORTEN_RATE'] = min(0.6, rules.SHORTEN_RATE + 0.05)
            reasons.append(f"↑ SHORTEN_RATE: repetition density {avg_repetition:.2f}%")
        
        # Rule 4: Poor vocabulary diversity?
        if avg_diversity < 0.01:
            adjustments['CONTRACTION_RATE'] = min(0.5, rules.CONTRACTION_RATE + 0.05)
            reasons.append(f"↑ CONTRACTION_RATE: diversity gain only {avg_diversity:.4f}")
        
        # Rule 5: Score still low? Increase variation
        if current_score < 60:
            adjustments['SHORTEN_RATE'] = min(0.7, rules.SHORTEN_RATE + 0.1)
            adjustments['TRANSITION_RATE'] = min(0.4, rules.TRANSITION_RATE + 0.05)
            reasons.append(f"⚠ Low score ({current_score:.1f}): Increasing variation")
        
        return adjustments, reasons
    
    def apply_adjustments(self, adjustments):
        """Apply suggested adjustments to rules module"""
        for param, new_value in adjustments.items():
            old_value = getattr(rules, param)
            setattr(rules, param, new_value)
            print(f"  → {param}: {old_value:.3f} → {new_value:.3f}")
    
    def save_checkpoint(self, iteration, score, config):
        """Save rule snapshot at each iteration"""
        checkpoint = {
            'iteration': iteration,
            'score': score,
            'timestamp': datetime.now().isoformat(),
            'rules': {
                'BURSTINESS_TARGET': rules.BURSTINESS_TARGET,
                'CONTRACTION_RATE': rules.CONTRACTION_RATE,
                'TRANSITION_RATE': rules.TRANSITION_RATE,
                'SHORTEN_RATE': rules.SHORTEN_RATE,
            }
        }
        return checkpoint


class Trainer:
    """Main training orchestrator"""
    
    def __init__(self, config=None):
        self.config = config or TrainerConfig()
        self.evaluator = HumanizerEvaluator(log_dir=self.config.log_dir)
        self.optimizer = RuleOptimizer()
        self.checkpoints = []
        
    def run_training_loop(self, num_iterations=None):
        """Execute full training with iterative optimization"""
        num_iterations = num_iterations or self.config.max_iterations
        
        print("\n" + "="*70)
        print("HUMANIZER TRAINING LOOP - ACADEMIC ESSAYS")
        print("="*70)
        print(f"Target overall score: {self.config.threshold_score}/100")
        print(f"Max iterations: {num_iterations}")
        print(f"Test directory: {self.config.test_samples_dir}\n")
        
        best_score = 0
        best_checkpoint = None
        
        for iteration in range(1, num_iterations + 1):
            print(f"\n{'='*70}")
            print(f"ITERATION {iteration}/{num_iterations}")
            print(f"{'='*70}")
            
            # Show current rules
            print(f"\nCurrent rules:")
            print(f"  BURSTINESS_TARGET: {rules.BURSTINESS_TARGET:.2f}")
            print(f"  CONTRACTION_RATE: {rules.CONTRACTION_RATE:.2f}")
            print(f"  TRANSITION_RATE: {rules.TRANSITION_RATE:.2f}")
            print(f"  SHORTEN_RATE: {rules.SHORTEN_RATE:.2f}")
            
            # Evaluate current batch
            print(f"\nEvaluating {self.config.batch_size} sample pairs...")
            results = self.evaluator.evaluate_batch(self.config.test_samples_dir)
            
            if not results:
                print("✗ No samples to evaluate. Exiting.")
                break
            
            # Limit to batch size
            results = results[:self.config.batch_size]
            
            # Calculate average score
            import numpy as np
            scores = [r['overall_score'] for r in results]
            avg_score = np.mean(scores)
            
            print(f"\n✓ Batch evaluation complete:")
            print(f"  Average Score: {avg_score:.1f}/100")
            print(f"  Min: {np.min(scores):.1f} | Max: {np.max(scores):.1f}")
            
            # Save checkpoint
            checkpoint = self.optimizer.save_checkpoint(iteration, avg_score, self.config)
            self.checkpoints.append(checkpoint)
            
            # Track best
            if avg_score > best_score:
                best_score = avg_score
                best_checkpoint = checkpoint
                print(f"  🏆 NEW BEST SCORE!")
            
            # Print detailed summary
            self.evaluator.print_summary(results)
            
            # Check if threshold reached
            if avg_score >= self.config.threshold_score:
                print(f"\n✓ THRESHOLD REACHED! Score {avg_score:.1f} >= {self.config.threshold_score}")
                print(f"Training converged at iteration {iteration}.")
                break
            
            # Suggest and apply optimizations
            print(f"\nAnalyzing failure patterns...\n")
            adjustments, reasons = self.optimizer.suggest_adjustments(results, avg_score)
            
            if adjustments:
                print(f"Recommended adjustments:")
                for reason in reasons:
                    print(f"  {reason}")
                
                print(f"\nApplying adjustments:")
                self.optimizer.apply_adjustments(adjustments)
            else:
                print("No specific adjustments recommended. Consider manual review.")
            
            # Save evaluation results
            filename = os.path.join(
                self.config.log_dir,
                f"iteration_{iteration:02d}_score_{avg_score:.1f}.csv"
            )
            self.evaluator.save_results(results, filename)
        
        # Training complete
        print("\n" + "="*70)
        print("TRAINING COMPLETE")
        print("="*70)
        print(f"\nBest score achieved: {best_score:.1f}/100")
        print(f"In iteration: {best_checkpoint['iteration']}")
        
        if best_checkpoint:
            print(f"\nBest rule configuration:")
            for param, value in best_checkpoint['rules'].items():
                print(f"  {param} = {value:.3f}")
        
        # Save training report
        self.save_training_report(best_checkpoint)
        
        return best_checkpoint
    
    def save_training_report(self, best_checkpoint):
        """Generate training summary report"""
        report_path = os.path.join(self.config.log_dir, "training_report.json")
        
        report = {
            'timestamp': datetime.now().isoformat(),
            'total_iterations': len(self.checkpoints),
            'best_score': best_checkpoint['score'],
            'best_iteration': best_checkpoint['iteration'],
            'best_rules': best_checkpoint['rules'],
            'all_checkpoints': self.checkpoints,
            'config': {
                'max_iterations': self.config.max_iterations,
                'threshold_score': self.config.threshold_score,
                'test_samples_dir': self.config.test_samples_dir,
            }
        }
        
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"✓ Training report saved to {report_path}")
    
    def load_best_checkpoint(self, checkpoint):
        """
        Apply best rules from training to current rules.py
        """
        if checkpoint:
            print(f"\nLoading best rules from iteration {checkpoint['iteration']}:")
            for param, value in checkpoint['rules'].items():
                setattr(rules, param, value)
                print(f"  {param} = {value:.3f}")
            return checkpoint['rules']


def quick_eval():
    """Quick evaluation without training loop"""
    print("Running quick evaluation...")
    evaluator = HumanizerEvaluator()
    results = evaluator.evaluate_batch("data/train")
    
    if results:
        evaluator.print_summary(results)
        evaluator.save_results(results)


def interactive_train():
    """Interactive training session with prompts"""
    print("\n" + "="*70)
    print("INTERACTIVE TRAINER MENU")
    print("="*70)
    print("1. Quick evaluation (test current rules)")
    print("2. Full training loop (automatic optimization)")
    print("3. Evaluate and show details")
    print("4. Exit")
    
    choice = input("\nSelect option (1-4): ").strip()
    
    if choice == "1":
        quick_eval()
    elif choice == "2":
        trainer = Trainer()
        trainer.run_training_loop()
    elif choice == "3":
        evaluator = HumanizerEvaluator()
        results = evaluator.evaluate_batch("data/train")
        if results:
            evaluator.print_summary(results)
            # Show top 3 best and worst
            import numpy as np
            scores = np.array([r['overall_score'] for r in results])
            top_3 = np.argsort(scores)[-3:]
            bottom_3 = np.argsort(scores)[:3]
            
            print("\n--- TOP 3 BEST SAMPLES ---")
            for idx in reversed(top_3):
                print(f"{results[idx]['sample_id']}: {results[idx]['overall_score']:.1f}")
            
            print("\n--- TOP 3 WORST SAMPLES ---")
            for idx in bottom_3:
                print(f"{results[idx]['sample_id']}: {results[idx]['overall_score']:.1f}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "quick":
            quick_eval()
        elif sys.argv[1] == "train":
            trainer = Trainer()
            trainer.run_training_loop()
        else:
            print("Usage: python trainer.py [quick|train]")
    else:
        interactive_train()
