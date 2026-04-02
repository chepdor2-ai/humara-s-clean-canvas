"""Quick test of both Ghost Mini and Ghost Pro modes."""
import re
import statistics
from humanizer import humanize

test_text = (
    "Artificial intelligence has fundamentally transformed numerous sectors of modern society. "
    "Machine learning algorithms process vast quantities of data to identify patterns that would "
    "be impossible for humans to detect manually. These technological advancements have created "
    "unprecedented opportunities for innovation across healthcare, education, and financial services. "
    "Furthermore, the integration of AI systems into daily operations has significantly improved "
    "efficiency and reduced operational costs for organizations worldwide. The implications of these "
    "developments extend far beyond mere technological progress, reshaping how individuals interact "
    "with information and make decisions in their personal and professional lives."
)

def analyze(text, label):
    print("=" * 70)
    print(label)
    print("=" * 70)
    print()
    print(text)
    print()
    sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    lens = [len(s.split()) for s in sents]
    print(f"Sentence count: {len(sents)}")
    print(f"Lengths: {lens}")
    if len(lens) >= 2:
        print(f"Min: {min(lens)}, Max: {max(lens)}, Std: {statistics.stdev(lens):.1f}")
    violations = [l for l in lens if l < 10 or l > 50]
    if violations:
        print(f"VIOLATIONS (outside 10-50): {violations}")
    else:
        print("All sentences within 10-50 words")
    print()

# Test Ghost Mini
result_mini = humanize(test_text, mode="ghost_mini")
analyze(result_mini, "GHOST MINI")

# Test Ghost Pro
result_pro = humanize(test_text, mode="ghost_pro")
analyze(result_pro, "GHOST PRO")
