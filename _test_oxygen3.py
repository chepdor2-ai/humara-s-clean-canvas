import requests, time

text = (
    "The development of artificial intelligence has been one of the most significant "
    "technological achievements of the twenty-first century. Machine learning algorithms "
    "have enabled computers to perform tasks that were previously thought to require "
    "human intelligence. Natural language processing allows machines to understand and "
    "generate human language with increasing accuracy. Deep learning neural networks "
    "have revolutionized image recognition and computer vision applications. These systems "
    "can now identify objects in photographs with accuracy that rivals or exceeds human "
    "performance. Medical imaging applications have particularly benefited from these "
    "advances. The integration of AI into business processes has created new opportunities "
    "for efficiency and innovation. Companies across all sectors are adopting AI-powered "
    "tools to automate routine tasks and gain insights from data. This transformation is "
    "reshaping how organizations operate and compete in the global marketplace."
)

t0 = time.time()
r = requests.post("http://localhost:7860/humanize", json={"text": text, "mode": "fast"})
t1 = time.time()
d = r.json()
s = d["stats"]
print(f"Time: {t1-t0:.2f}s | Sentences: {s['total_sentences']} | WPS: {s['words_per_second']}")
print()
print("OUTPUT:")
print(d["humanized"])
