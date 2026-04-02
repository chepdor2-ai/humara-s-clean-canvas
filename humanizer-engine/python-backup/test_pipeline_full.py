"""Full 8-phase pipeline test with LLM phases."""
import asyncio
import time
from llm_pipeline import run_pipeline_async
from nltk.tokenize import sent_tokenize

sample = (
    "Artificial intelligence has fundamentally transformed the landscape "
    "of modern technology, creating unprecedented opportunities for innovation "
    "across virtually every sector of the global economy. The rapid advancement "
    "of machine learning algorithms has enabled organizations to process vast "
    "amounts of data with remarkable efficiency and accuracy. Furthermore, "
    "the integration of AI systems into healthcare has demonstrated significant "
    "potential for improving diagnostic outcomes and patient care. Additionally, "
    "the educational sector has witnessed a paradigm shift as AI-powered tools "
    "facilitate personalized learning experiences that adapt to individual "
    "student needs. Moreover, the financial industry has leveraged AI "
    "capabilities to enhance risk assessment, fraud detection, and automated "
    "trading strategies. It is important to note that these developments have "
    "also raised critical ethical considerations regarding privacy, bias, and "
    "the displacement of human workers. Consequently, policymakers and industry "
    "leaders must collaborate to establish comprehensive frameworks that "
    "balance technological progress with social responsibility. The future of "
    "artificial intelligence holds immense promise, but it requires careful "
    "stewardship to ensure that its benefits are distributed equitably across "
    "all segments of society."
)


async def main():
    print("=" * 70)
    print("FULL 8-PHASE PIPELINE TEST")
    print("=" * 70)
    print()
    print(f"INPUT ({len(sample.split())} words):")
    print(sample[:200] + "...")
    print()

    start = time.time()
    result = await run_pipeline_async(sample, no_contractions=True)
    elapsed = time.time() - start

    print()
    print(f"OUTPUT ({len(result.split())} words):")
    print(result)
    print()

    # Analyze output
    sents = sent_tokenize(result)
    lengths = [len(s.split()) for s in sents]
    print(f"Sentences: {len(sents)}")
    print(f"Lengths: {lengths}")
    print(f"Min: {min(lengths)}, Max: {max(lengths)}, Avg: {sum(lengths)/len(lengths):.1f}")

    violations = [l for l in lengths if l < 10 or l > 50]
    print(f"Violations (<10 or >50): {violations if violations else 'None'}")

    # Distribution
    buckets = {(10, 15): 0, (16, 25): 0, (26, 35): 0, (36, 45): 0, (46, 50): 0}
    for l in lengths:
        for (lo, hi) in buckets:
            if lo <= l <= hi:
                buckets[(lo, hi)] += 1
                break
    total = len(lengths)
    print("\nDistribution:")
    for (lo, hi), count in sorted(buckets.items()):
        pct = (count / total * 100) if total else 0
        target = {(10,15): 6, (16,25): 13, (26,35): 28, (36,45): 31, (46,50): 22}[(lo,hi)]
        print(f"  {lo}-{hi} words: {count} ({pct:.0f}%) [target: {target}%]")

    # Check for em-dashes
    has_emdash = "\u2014" in result or "\u2013" in result
    has_semicolon = ";" in result
    print(f"\nEm-dashes: {'FOUND (BAD)' if has_emdash else 'None (GOOD)'}")
    print(f"Semicolons: {'FOUND (BAD)' if has_semicolon else 'None (GOOD)'}")
    print(f"\nTotal time: {elapsed:.1f}s")


asyncio.run(main())
