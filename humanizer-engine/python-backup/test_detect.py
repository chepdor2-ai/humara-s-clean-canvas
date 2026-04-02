import requests, json

r = requests.post('http://127.0.0.1:8080/api/detect', json={
    'text': 'Artificial intelligence has significantly transformed numerous aspects of modern society. The integration of machine learning algorithms into various industries has led to unprecedented levels of efficiency and productivity. Furthermore, the development of natural language processing capabilities has enabled more sophisticated human-computer interactions. It is important to note that these technological advancements continue to evolve at a rapid pace, reshaping the landscape of innovation and progress across multiple domains.'
})

data = r.json()
print("=== SUMMARY ===")
print(json.dumps(data['summary'], indent=2))
print("\n=== ALL DETECTORS ===")
for d in sorted(data['detectors'], key=lambda x: -x['ai_score']):
    print(f"  {d['detector']:25s}  AI:{d['ai_score']:5.1f}%  {d['verdict']:12s}  [{d['category']}]")
print("\n=== SIGNALS ===")
for k, v in data['signals'].items():
    print(f"  {k:30s}: {v}")
