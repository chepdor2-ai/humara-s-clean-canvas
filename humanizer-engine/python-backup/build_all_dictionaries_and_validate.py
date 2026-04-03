"""
Automate building all dictionaries and validate minimum entry counts for Humanizer Engine.
- Phrase Dictionary: 2M+ entries (en_thesaurus.jsonl)
- Transformation Rules: 10k+ entries (transformation_rules.jsonl)
- Corpus: 50M+ words (corpus_sample.txt)
"""
import subprocess
import sys
import os
import json
from pathlib import Path

def run_script(script_name):
    print(f"[RUN] {script_name}")
    result = subprocess.run([sys.executable, script_name], cwd=os.path.dirname(__file__), capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        raise RuntimeError(f"Script {script_name} failed.")

def count_thesaurus_entries(path):
    count = 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                count += 1
    return count

def count_transformation_rules(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
        return len(data)

def count_corpus_words(path):
    count = 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            count += len(line.split())
    return count

def main():
    base = Path(__file__).parent.parent / "dictionaries"
    # Build dictionaries
    run_script("build_dictionaries.py")
    run_script("build_mega_dictionary.py")
    # Validate
    phrase_dict = base / "en_thesaurus.jsonl"
    rules_file = base / "transformation_rules.jsonl"
    corpus_file = base / "corpus_sample.txt"
    print("[VALIDATE] Checking dictionary sizes...")
    phrase_count = count_thesaurus_entries(phrase_dict)
    print(f"  Phrase Dictionary: {phrase_count} entries")
    if phrase_count < 2_000_000:
        raise ValueError("Phrase dictionary too small (need 2M+ entries)")
    if not rules_file.exists():
        raise FileNotFoundError("transformation_rules.jsonl not found")
    rules_count = count_transformation_rules(rules_file)
    print(f"  Transformation Rules: {rules_count} entries")
    if rules_count < 10_000:
        raise ValueError("Transformation rules too few (need 10k+)")
    if not corpus_file.exists():
        raise FileNotFoundError("corpus_sample.txt not found")
    corpus_words = count_corpus_words(corpus_file)
    print(f"  Corpus: {corpus_words} words")
    if corpus_words < 50_000_000:
        raise ValueError("Corpus too small (need 50M+ words)")
    print("[SUCCESS] All minimum requirements met!")

if __name__ == "__main__":
    main()
