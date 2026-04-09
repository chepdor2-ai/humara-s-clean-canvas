import requests, json

text = (
    "The researchers utilized advanced algorithms and demonstrated that their approach "
    "significantly enhanced patient outcomes. This technology has fundamentally transformed "
    "healthcare delivery, providing personalized experiences that improved diagnostic accuracy. "
    "These developments influenced how practitioners addressed complex medical challenges "
    "and established new standards of care."
)

r = requests.post("http://127.0.0.1:5001/humanize", json={
    "text": text,
    "mode": "quality",
    "min_change_ratio": 0.35,
    "sentence_by_sentence": True,
})
d = r.json()
print("OUTPUT:")
print(d["humanized"])
print()
s = d["stats"]
print(f"Avg change: {s['avg_change_ratio']} | Met: {s['met_threshold']}/{s['total_sentences']}")
for i, ss in enumerate(s["sentence_stats"]):
    print(f"  Sentence {i+1}: change={ss['change_ratio']:.1%}, attempts={ss['attempts']}")
