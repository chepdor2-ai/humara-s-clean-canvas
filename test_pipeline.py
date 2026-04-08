"""Quick test of the Oxygen v2 pipeline."""
import requests, json, time

TEXT = """Artificial intelligence has significantly transformed modern healthcare systems. Moreover, these technological advancements have facilitated the development of comprehensive diagnostic tools that utilize machine learning algorithms. Furthermore, the implementation of AI-driven solutions has enhanced patient outcomes across a wide range of medical disciplines. It is important to note that the integration of these innovative technologies requires a holistic approach to ensure seamless adoption."""

print("Testing Oxygen v2 pipeline...")
print(f"Input ({len(TEXT.split())} words):")
print(TEXT[:200] + "...")
print()

start = time.time()
resp = requests.post("http://127.0.0.1:5001/humanize", json={
    "text": TEXT,
    "strength": "medium",
    "mode": "quality",
    "min_change_ratio": 0.40,
    "max_retries": 5,
    "sentence_by_sentence": True,
})
elapsed = time.time() - start

if resp.status_code != 200:
    print(f"ERROR {resp.status_code}: {resp.text}")
else:
    data = resp.json()
    h = data["humanized"]
    stats = data.get("stats", {})
    print(f"Output ({len(h.split())} words, {elapsed:.1f}s):")
    print(h)
    print()
    print(f"Mode: {stats.get('mode')}")
    print(f"Avg change: {stats.get('avg_change_ratio', 0)*100:.1f}%")
    print(f"Met threshold: {stats.get('met_threshold')}/{stats.get('total_sentences')}")
    print(f"Per-sentence stats:")
    for i, s in enumerate(stats.get("sentence_stats", [])):
        print(f"  Sent {i+1}: change={s.get('change_ratio',0)*100:.1f}%, met={s.get('met_threshold')}, attempts={s.get('attempts')}")
