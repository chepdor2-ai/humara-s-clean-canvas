"""Test the FULL pipeline: Next.js route.ts (Python T5 → TypeScript post-processing)."""
import requests, json, time

TEXT = """Artificial intelligence has significantly transformed modern healthcare systems. Moreover, these technological advancements have facilitated the development of comprehensive diagnostic tools that utilize machine learning algorithms. Furthermore, the implementation of AI-driven solutions has enhanced patient outcomes across a wide range of medical disciplines. It is important to note that the integration of these innovative technologies requires a holistic approach to ensure seamless adoption.

The emergence of natural language processing has revolutionized patient-doctor communication. Additionally, predictive analytics powered by artificial intelligence enables healthcare providers to identify potential health risks before they manifest. These sophisticated systems demonstrate the transformative potential of technology in addressing complex medical challenges. Consequently, healthcare institutions are increasingly investing in AI infrastructure to improve operational efficiency."""

print("=" * 70)
print("FULL PIPELINE TEST: Next.js → Python T5 → TypeScript Post-Processing")
print("=" * 70)
print(f"\nInput ({len(TEXT.split())} words):")
print(TEXT[:300] + "...\n")

start = time.time()
resp = requests.post("http://localhost:3000/api/humanize", json={
    "text": TEXT,
    "engine": "oxygen",
    "strength": "medium",
    "oxygen_mode": "quality",
    "oxygen_sentence_by_sentence": True,
    "oxygen_min_change_ratio": 0.40,
    "oxygen_max_retries": 5,
})
elapsed = time.time() - start

if resp.status_code != 200:
    print(f"ERROR {resp.status_code}: {resp.text[:500]}")
else:
    data = resp.json()
    h = data.get("humanized", "")
    print(f"Output ({len(h.split())} words, {elapsed:.1f}s):")
    print(h)
    print()
    
    # Detection scores
    out_det = data.get("output_detector_results", {})
    in_det = data.get("input_detector_results", {})
    print(f"Input AI Score: {in_det.get('overall', '?')}%")
    print(f"Output AI Score: {out_det.get('overall', '?')}%")
    print()
    
    if "detectors" in out_det:
        print("Per-detector breakdown:")
        for d in out_det["detectors"]:
            print(f"  {d['detector']}: AI={d['ai_score']}% Human={d['human_score']}%")
    
    print(f"\nMeaning preserved: {data.get('meaning_preserved')} ({data.get('meaning_similarity', '?')})")
    print(f"Input words: {data.get('input_word_count')}, Output words: {data.get('word_count')}")
    
    # Check signals
    signals = out_det.get("signals", {})
    if signals:
        print(f"\nSignal scores:")
        for k, v in signals.items():
            if isinstance(v, (int, float)):
                print(f"  {k}: {v}")
