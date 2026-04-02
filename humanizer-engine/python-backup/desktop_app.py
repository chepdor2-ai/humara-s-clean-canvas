"""
Desktop Humanizer App - No server needed
Run with: python desktop_app.py
"""
import tkinter as tk
from tkinter import scrolledtext, ttk, messagebox
import threading
from humanizer import humanize
from multi_detector import get_detector

class HumanizerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Ghost Humanizer - Desktop Edition")
        self.root.geometry("1000x700")
        
        self.detector = get_detector()
        self.processing = False
        
        # Top controls
        control_frame = ttk.Frame(root, padding="10")
        control_frame.pack(fill=tk.X)
        
        ttk.Label(control_frame, text="Engine:").pack(side=tk.LEFT, padx=5)
        self.engine_var = tk.StringVar(value="ghost_mini")
        engine_combo = ttk.Combobox(control_frame, textvariable=self.engine_var, 
                                     values=["ghost_mini", "ghost_pro"], state="readonly", width=12)
        engine_combo.pack(side=tk.LEFT, padx=5)
        
        ttk.Label(control_frame, text="Strength:").pack(side=tk.LEFT, padx=5)
        self.strength_var = tk.StringVar(value="medium")
        strength_combo = ttk.Combobox(control_frame, textvariable=self.strength_var,
                                       values=["light", "medium", "strong"], state="readonly", width=10)
        strength_combo.pack(side=tk.LEFT, padx=5)
        
        self.process_btn = ttk.Button(control_frame, text="Humanize", command=self.process_text)
        self.process_btn.pack(side=tk.LEFT, padx=20)
        
        self.status_label = ttk.Label(control_frame, text="Ready", foreground="green")
        self.status_label.pack(side=tk.LEFT, padx=5)
        
        # Input area
        input_frame = ttk.LabelFrame(root, text="Input (AI Text)", padding="10")
        input_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        self.input_text = scrolledtext.ScrolledText(input_frame, wrap=tk.WORD, height=12)
        self.input_text.pack(fill=tk.BOTH, expand=True)
        self.input_text.insert(1.0, "Paste your AI-generated text here...")
        
        # Output area
        output_frame = ttk.LabelFrame(root, text="Output (Humanized)", padding="10")
        output_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        self.output_text = scrolledtext.ScrolledText(output_frame, wrap=tk.WORD, height=12)
        self.output_text.pack(fill=tk.BOTH, expand=True)
        
        # Stats area
        stats_frame = ttk.LabelFrame(root, text="Detection Scores", padding="10")
        stats_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.stats_text = tk.Text(stats_frame, height=4, wrap=tk.WORD)
        self.stats_text.pack(fill=tk.X)
        
    def process_text(self):
        if self.processing:
            return
            
        input_content = self.input_text.get(1.0, tk.END).strip()
        if not input_content or input_content == "Paste your AI-generated text here...":
            messagebox.showwarning("No Input", "Please enter some text to humanize")
            return
            
        self.processing = True
        self.process_btn.config(state="disabled")
        self.status_label.config(text="Processing...", foreground="orange")
        self.output_text.delete(1.0, tk.END)
        self.stats_text.delete(1.0, tk.END)
        
        # Run in thread to keep UI responsive
        thread = threading.Thread(target=self._process_worker, args=(input_content,))
        thread.daemon = True
        thread.start()
        
    def _process_worker(self, text):
        try:
            # Humanize
            mode = self.engine_var.get()
            strength = self.strength_var.get()
            
            result = humanize(text, mode=mode, strength=strength)
            
            # Detect scores
            detection = self.detector.analyze(result)
            avg_score = 100 - detection['summary']['overall_human_score']
            
            # Get top 5 scores
            top5_names = ['gptzero', 'turnitin', 'originality_ai', 'winston_ai', 'copyleaks']
            scores = {}
            for det in detection.get('detectors', []):
                name = det.get('detector', '').lower().replace(' ', '_')
                ai_score = 100 - det.get('human_score', 50)
                scores[name] = ai_score
            
            # Update UI
            self.root.after(0, self._update_results, result, avg_score, scores)
            
        except Exception as e:
            self.root.after(0, self._show_error, str(e))
        finally:
            self.root.after(0, self._finish_processing)
            
    def _update_results(self, result, avg_score, scores):
        self.output_text.delete(1.0, tk.END)
        self.output_text.insert(1.0, result)
        
        stats = f"Overall AI Score: {avg_score:.1f}%\n"
        stats += f"Word Count: {len(result.split())} words\n\n"
        stats += "Top 5 Detectors:\n"
        for name in ['gptzero', 'turnitin', 'originality_ai', 'winston_ai', 'copyleaks']:
            score = scores.get(name, 0)
            status = "✓" if score < 20 else "✗"
            stats += f"  {status} {name.title()}: {score:.1f}%\n"
        
        self.stats_text.delete(1.0, tk.END)
        self.stats_text.insert(1.0, stats)
        
    def _show_error(self, error):
        messagebox.showerror("Processing Error", f"Error: {error}")
        
    def _finish_processing(self):
        self.processing = False
        self.process_btn.config(state="normal")
        self.status_label.config(text="Complete", foreground="green")

if __name__ == "__main__":
    print("Starting Desktop Humanizer App...")
    print("Note: This runs without a web server - pure desktop GUI")
    
    root = tk.Tk()
    app = HumanizerApp(root)
    root.mainloop()
