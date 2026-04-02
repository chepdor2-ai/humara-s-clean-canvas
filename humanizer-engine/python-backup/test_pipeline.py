"""Quick test for LLM pipeline non-LLM phases."""
import llm_pipeline as lp
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

print("=== PHASE 1: CHUNKING ===")
chunks = lp.phase1_parse_and_chunk(sample)
print(f"Chunks: {len(chunks)}")
for i, c in enumerate(chunks):
    sents = [t for typ, t in c if typ != "[PARA_BREAK]"]
    wc = sum(len(s.split()) for s in sents)
    print(f"  Chunk {i+1}: {len(sents)} sents, {wc} words")

print("\n=== PHASE 2: VOCABULARY PURGE ===")
purged = lp.phase2_vocabulary_purge(chunks)
for c in purged:
    for typ, txt in c:
        if typ == "SENT":
            print(f"  {txt[:130]}")

print("\n=== PHASE 7: BOUNDARY ENFORCER ===")
short_test = (
    "Too short. This sentence is perfectly fine and contains enough words "
    "to pass the minimum threshold easily for testing purposes right now."
)
result7 = lp.phase7_enforce_boundaries(short_test)
for s in sent_tokenize(result7):
    print(f"  [{len(s.split())}w] {s}")

long_test = (
    "This is a very long sentence that contains way more than fifty words "
    "and should definitely be split at some natural break point because "
    "the boundary enforcer needs to handle these cases properly and "
    "ensure that both halves of the split remain coherent while also "
    "containing at least ten words each for the minimum requirement "
    "to be satisfied correctly."
)
print("\nLong sentence test:")
result7b = lp.phase7_enforce_boundaries(long_test)
for s in sent_tokenize(result7b):
    print(f"  [{len(s.split())}w] {s}")

print("\n=== PHASE 8: FORMAT SCRUB ===")
dash_test = "This text has em-dashes \u2014 and semicolons; plus it needs cleaning. Furthermore, it should be scrubbed."
r8 = lp.phase8_format_scrub(dash_test, no_contractions=True)
print(f"  Input:  {dash_test}")
print(f"  Output: {r8}")
