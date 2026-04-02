"""
Integration of AI detector with humanizer API
Extends main.py with detection and quality metrics
"""
from fastapi import FastAPI
from pydantic import BaseModel
from humanizer import humanize
from ai_detector import AITextDetector
import os

# These functions extend your existing FastAPI app

class AnalysisRequest(BaseModel):
    text: str
    detect_ai: bool = True
    strength: str = "medium"

class AnalysisResponse(BaseModel):
    original_text: str
    humanized_text: str
    word_count: int
    is_ai_generated: bool = None
    ai_confidence: float = None
    recommendation: str = None

# Initialize detector
detector = None
detector_path = 'models/ai_detector.pkl'

def load_detector():
    """Load AI detector if model exists"""
    global detector
    if os.path.exists(detector_path):
        detector = AITextDetector()
        detector.load(detector_path)
        return True
    return False

def get_quality_recommendation(original_is_ai, humanized_is_ai, confidence):
    """
    Provide recommendation based on detection results
    """
    if not original_is_ai:
        return "✓ Original text is human-written (good baseline)"
    
    if humanized_is_ai and humanized_is_ai > confidence * 0.8:
        return "⚠ Humanization may not be sufficient; consider 'strong' strength"
    
    if not humanized_is_ai:
        return "✓ Successfully humanized; text now appears human-written"
    
    return "→ Neutral AI signature; apply stronger humanization"


# Add this endpoint to your main.py FastAPI app
def setup_detector_routes(app: FastAPI):
    """
    Call this function in main.py: setup_detector_routes(app)
    """
    
    @app.post("/analyze", response_model=AnalysisResponse)
    async def analyze_endpoint(request: AnalysisRequest):
        """
        Analyze text for AI detection and humanization
        """
        humanized = humanize(request.text, request.strength)
        
        original_is_ai = None
        humanized_is_ai = None
        ai_confidence = None
        recommendation = None
        
        if request.detect_ai and detector:
            # Detect original
            original_pred = detector.predict(request.text)
            original_is_ai = original_pred['is_ai']
            
            # Detect humanized
            humanized_pred = detector.predict(humanized)
            humanized_is_ai = humanized_pred['is_ai']
            ai_confidence = humanized_pred['confidence']
            
            recommendation = get_quality_recommendation(
                original_is_ai,
                humanized_is_ai,
                ai_confidence
            )
        
        return AnalysisResponse(
            original_text=request.text[:200] + "..." if len(request.text) > 200 else request.text,
            humanized_text=humanized,
            word_count=len(humanized.split()),
            is_ai_generated=humanized_is_ai,
            ai_confidence=ai_confidence,
            recommendation=recommendation
        )
    
    @app.get("/detector-status")
    async def detector_status():
        """Check if AI detector is available"""
        if detector:
            return {
                "status": "ready",
                "model_path": detector_path,
                "message": "AI detection available"
            }
        else:
            return {
                "status": "not_loaded",
                "model_path": detector_path,
                "message": f"Detector model not found at {detector_path}. Train first with ai_detector.py"
            }


if __name__ == "__main__":
    # Quick test
    print("Integration module for AI detector + humanizer")
    print(f"Detector model path: {detector_path}")
    if load_detector():
        print("✓ Detector loaded successfully")
    else:
        print("✗ Detector model not found (run ai_detector.py to train)")
