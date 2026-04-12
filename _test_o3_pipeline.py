#!/usr/bin/env python3
"""Quick local test of Oxygen 3.0 pipeline — bypasses HTTP, tests directly."""
import sys, os, time
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Import the server module directly
import oxygen3_server as o3

# Load model
print("Loading Oxygen 3.0 model...")
o3.load_model()
print(f"Model loaded on {o3.device}\n")

# Full test text from user
test_full = """Descriptive statistics serve as a foundational element in data analysis, offering a structured approach to summarizing and interpreting datasets. By employing measures of central tendency, dispersion, and distribution shape, researchers and analysts can distill complex data into meaningful insights. These statistical tools are essential across a wide range of disciplines, including economics, psychology, healthcare, education, and the social sciences, where data-driven decision-making is paramount.

Central tendency measures, including the mean, median, and mode, provide a snapshot of the typical value within a dataset. The mean is calculated as the sum of all values divided by the number of observations, making it highly sensitive to outliers. The median, which represents the middle value in an ordered dataset, offers greater resistance to extreme values and is often preferred in skewed distributions. The mode identifies the most frequently occurring value and is particularly useful for categorical data."""

print("=" * 60)
print(f"INPUT ({len(test_full.split())} words):")
print(test_full[:200] + "...")
print("=" * 60)

# Test with FAST mode
print("\n--- Testing FAST mode (max_retries=3) ---")
t0 = time.time()
result, stats = o3.humanize_text(test_full, mode="fast", min_change_ratio=0.30, max_retries=3)
elapsed = time.time() - t0
print(f"\nOUTPUT ({elapsed:.1f}s):")
print(result)
print(f"\nWord count: {len(result.split())} (original: {len(test_full.split())})")
print(f"Change ratio: {stats['avg_change_ratio']}")
print(f"Sentences: {stats['total_sentences']}, met threshold: {stats['met_threshold']}")
print(f"Validation: {stats.get('validation', {}).get('validation_passed', 'N/A')}")
print(f"Words/sec: {stats.get('words_per_second', 'N/A')}")

print("\n" + "=" * 60)
orig_wc = len(test_full.split())
out_wc = len(result.split())
ratio = out_wc / orig_wc
print(f"Length preservation: {ratio:.1%} ({out_wc}/{orig_wc} words)")
print("PASS" if ratio >= 0.85 else "FAIL: Output too short!")
print("DONE." if stats['met_threshold'] >= stats['total_sentences'] * 0.5 else "WARNING: Low change ratio!")
