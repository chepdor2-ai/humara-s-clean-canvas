"""Test the Ghost Mini and Ghost Pro redesign."""
import time
from humanizer import humanize, _get_full_analysis, _check_detector_targets, TOP_5_DETECTORS

test_text = (
    "The growth of secondary education in Kenya has undergone significant "
    "transformation over the decades. Various policy frameworks, community "
    "initiatives, and international support have contributed to a steady and "
    "rapid expansion of the education sector. Enrolment rates increased significantly, "
    "and more schools were established across the country. One of the most influential "
    "factors has been the deliberate government policies that have prioritized "
    "education as a key component of national development strategies. This commitment "
    "is reflected in policy frameworks aimed at improving access and quality of "
    "education. Furthermore, communities and private investors also stepped in to "
    "support the expansion process, particularly in rural and underserved areas. "
    "This reflects a strong tradition of community participation and collective "
    "responsibility in education. International organizations and development "
    "partners have also played a vital role by providing financial and technical "
    "assistance. However, challenges such as overcrowding, limited resources, and "
    "teacher shortages persist. Continued investment and effective policy "
    "implementation are therefore necessary to sustain progress and improve "
    "the quality of secondary education in Kenya."
)

def show_top5(analysis, label):
    print(f"\n=== {label} ===")
    top5_names = ["gptzero", "turnitin", "originality", "winston", "copyleaks"]
    for d in analysis.get("detectors", []):
        ai = round(100 - d["human_score"], 1)
        name_lower = d["detector"].lower()
        is_top5 = any(t in name_lower for t in top5_names)
        marker = " [TOP5]" if is_top5 else ""
        if is_top5:
            print(f"  {d['detector']:20s} AI={ai:5.1f}%{marker}")
    overall = round(100 - analysis["summary"]["overall_human_score"], 1)
    print(f"  {'Overall':20s} AI={overall:5.1f}%")

# Input analysis
inp = _get_full_analysis(test_text)
show_top5(inp, "INPUT SCORES")

# Show key signals
print("\n=== INPUT SIGNALS ===")
signals = inp.get("signals", {})
important = ["perplexity", "burstiness", "vocabulary_richness", "sentence_uniformity",
             "ai_pattern_score", "starter_diversity", "token_predictability",
             "per_sentence_ai_ratio", "ngram_repetition"]
for sig in important:
    val = signals.get(sig, 0)
    print(f"  {sig:28s} = {val:5.1f}")

# Ghost Mini
print("\n" + "="*60)
print("RUNNING GHOST MINI...")
print("="*60)
t0 = time.time()
result_mini = humanize(test_text, strength="medium", mode="ghost_mini")
elapsed = time.time() - t0
print(f"Done in {elapsed:.1f}s")

out_mini = _get_full_analysis(result_mini)
show_top5(out_mini, "GHOST MINI OUTPUT SCORES")
passed, worst, max_ai, scores = _check_detector_targets(out_mini, "ghost_mini")
print(f"\n  Target met: {passed} (worst: {worst} at {max_ai}%)")

print("\n=== GHOST MINI OUTPUT TEXT ===")
print(result_mini[:600])
print("..." if len(result_mini) > 600 else "")

# Ghost Pro
print("\n" + "="*60)
print("RUNNING GHOST PRO...")
print("="*60)
t0 = time.time()
result_pro = humanize(test_text, strength="medium", mode="ghost_pro")
elapsed = time.time() - t0
print(f"Done in {elapsed:.1f}s")

out_pro = _get_full_analysis(result_pro)
show_top5(out_pro, "GHOST PRO OUTPUT SCORES")
passed_pro, worst_pro, max_ai_pro, scores_pro = _check_detector_targets(out_pro, "ghost_pro")

# Show ALL detectors for Ghost Pro
print("\n=== GHOST PRO ALL 22 DETECTORS ===")
for d in out_pro.get("detectors", []):
    ai = round(100 - d["human_score"], 1)
    flag = " *** OVER 5%" if ai > 5.0 else " OK"
    print(f"  {d['detector']:25s} AI={ai:5.1f}%{flag}")
print(f"\n  Target met: {passed_pro} (worst: {worst_pro} at {max_ai_pro}%)")

print("\n=== GHOST PRO OUTPUT TEXT ===")
print(result_pro[:600])
print("..." if len(result_pro) > 600 else "")
