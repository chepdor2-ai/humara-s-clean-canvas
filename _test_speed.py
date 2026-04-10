import requests, time, json

url = "https://maguna956-humarin-paraphraser.hf.space/humanize"
headers = {"Authorization": "Bearer hm_r9oLifeDgK5PpZBhMUAHIYWtydaSk3wTO1mzbv7q6cJsXQCl", "Content-Type": "application/json"}

# Short text first
short = "Machine learning algorithms now help doctors diagnose diseases more accurately."
text = "Artificial intelligence has transformed many industries in recent years. Machine learning algorithms now help doctors diagnose diseases more accurately. Natural language processing tools allow computers to understand and generate human text. These technologies continue to evolve at a rapid pace."

# Warm up with turbo on 1 sentence
print("=== Warm-up (turbo, 1 sentence) ===")
start = time.time()
r = requests.post(url, headers=headers, json={"text": short, "mode": "turbo", "sentence_by_sentence": True}, timeout=300)
elapsed = time.time() - start
data = r.json()
print(f"turbo/1-sent: {elapsed:.1f}s | {data.get('humanized', 'ERROR')[:120]}")
print()

# Now test all modes on 4 sentences
for mode in ["turbo", "fast", "quality"]:
    start = time.time()
    r = requests.post(url, headers=headers, json={"text": text, "mode": mode, "sentence_by_sentence": True}, timeout=300)
    elapsed = time.time() - start
    data = r.json()
    hum = data.get("humanized", "ERROR")
    stats = data.get("stats", {})
    avg = stats.get("avg_change_ratio", 0)
    print(f"{mode}: {elapsed:.1f}s | change={avg} | {hum[:150]}...")
    print()
