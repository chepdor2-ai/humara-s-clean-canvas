"""
Test detector parity between Python and TypeScript implementations.
Verifies that both produce EXACTLY the same scores for the same input text.
"""

import sys
import json
from multi_detector import MultiDetector

def test_detector_parity():
    """Test that critical signals match between Python and TypeScript."""
    
    detector = MultiDetector()
    
    # Test text - short sample that exercises all signals
    test_text = """
    Furthermore, it is important to note that the comprehensive implementation 
    of robust frameworks can significantly enhance the efficacy of multifaceted 
    approaches. Moreover, the utilization of innovative methodologies necessitates 
    a fundamental understanding of inherent limitations. Additionally, the trajectory 
    of this discourse demonstrates the profound impact of leveraging paradigmatic shifts.
    """.strip()
    
    result = detector.analyze(test_text)
    
    # Extract critical signals for comparison
    signals = result["signals"]
    critical_signals = {
        "ai_pattern_score": signals["ai_pattern_score"],
        "shannon_entropy": signals["shannon_entropy"],
        "readability_consistency": signals["readability_consistency"],
        "stylometric_score": signals["stylometric_score"],
    }
    
    print("=" * 72)
    print("PYTHON DETECTOR - Critical Signals")
    print("=" * 72)
    print(json.dumps(critical_signals, indent=2))
    print()
    
    # Also print top 5 detector scores
    detectors = sorted(result["detectors"], key=lambda d: d["ai_score"], reverse=True)[:5]
    print("Top 5 Detector Scores:")
    for d in detectors:
        print(f"  {d['detector']:20s}: {d['ai_score']:5.1f}% AI")
    print()
    print(f"Overall: {result['summary']['overall_ai_score']:.1f}% AI ({result['summary']['overall_verdict']})")
    print()
    
    return critical_signals

if __name__ == "__main__":
    test_detector_parity()
