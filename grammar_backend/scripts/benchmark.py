"""Benchmark the grammar pipeline on sample inputs."""

import asyncio
import time

from app.schemas.request import CheckRequest
from app.services.pipeline import GrammarPipeline

SAMPLES = [
    "The Court ' s decision are important.",
    "Hello  world.This is  a test ,sentence.",
    "As noted (Smith, 2020) the results is clear.  The data shows that..  significant progress has been made.",
    "§1 is important  because it establishes the framework for future decisions.  The precedent set by District of Columbia v. Heller remains relevant.",
    "The quick brown fox jumps over the lazy dog.",
]


async def main():
    pipeline = GrammarPipeline()
    # No ML for benchmark by default

    print(f"Benchmarking {len(SAMPLES)} samples...\n")
    times = []

    for text in SAMPLES:
        req = CheckRequest(text=text, domain="general")
        t0 = time.perf_counter()
        result = await pipeline.run(req)
        elapsed = (time.perf_counter() - t0) * 1000
        times.append(elapsed)
        print(f"  [{elapsed:6.1f}ms] {len(result.sentences)} sentences, {result.total_edits} edits")
        print(f"    IN:  {text[:80]}")
        print(f"    OUT: {result.corrected_text[:80]}\n")

    print(f"Average: {sum(times)/len(times):.1f}ms  |  Total: {sum(times):.1f}ms")


if __name__ == "__main__":
    asyncio.run(main())
