import httpx, json

payload = {
    "text": "The Court ' s decision are important.",
    "domain": "legal",
    "strict_minimal_edits": True,
    "preserve_citations": True,
    "preserve_quotes": True,
    "max_sentence_change_ratio": 0.15,
}
r = httpx.post("http://127.0.0.1:8100/check", json=payload, timeout=5)
print(json.dumps(r.json(), indent=2))
